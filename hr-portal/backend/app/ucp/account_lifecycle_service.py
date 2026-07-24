"""Configuration-driven external account lifecycle rules and delayed jobs."""
from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ucp.adapters import get_adapter
from app.ucp.credential_service import decrypt_credential_secrets
from app.ucp.external_account_service import (
    ACTION_CREATE,
    ACTION_DELETE,
    ACTION_DISABLE,
    ACTION_REACTIVATE,
    ACTION_UPDATE,
    STATUS_ACTIVE,
    STATUS_DELETED,
    STATUS_DISABLED,
)
from app.ucp.masking import mask_dict
from app.ucp.models import (
    ExternalAccount,
    UcpAccountLifecycleJob,
    UcpAccountLifecycleRule,
    UcpEvent,
    UcpSystemConfig,
)

logger = logging.getLogger("ucp.account_lifecycle")

ACTIONS = {ACTION_CREATE, ACTION_UPDATE, ACTION_DISABLE, ACTION_REACTIVATE, ACTION_DELETE}
JOB_PENDING = "PENDING"
JOB_RUNNING = "RUNNING"
JOB_WAITING_APPROVAL = "WAITING_APPROVAL"
JOB_SUCCESS = "SUCCESS"
JOB_FAILED = "FAILED"
JOB_CANCELLED = "CANCELLED"
JOB_STATUSES = {JOB_PENDING, JOB_RUNNING, JOB_WAITING_APPROVAL, JOB_SUCCESS, JOB_FAILED, JOB_CANCELLED}


class LifecycleError(ValueError):
    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_path(payload: dict[str, Any], path: str) -> Any:
    if not path:
        return None
    value: Any = payload
    normalized = path[2:] if path.startswith("$.") else path
    for part in normalized.split("."):
        if not part:
            continue
        if isinstance(value, dict):
            value = value.get(part)
        else:
            return None
    return value


def _matches_filter(payload: dict[str, Any], rule: dict[str, Any] | None) -> bool:
    if not rule:
        return True
    path = str(rule.get("path") or "")
    op = str(rule.get("op") or "eq").lower()
    expected = rule.get("value")
    actual = _resolve_path(payload, path)
    if op == "eq":
        return actual == expected
    if op == "ne":
        return actual != expected
    if op == "in":
        return actual in (expected or [])
    if op == "exists":
        return actual is not None
    if op == "contains":
        return isinstance(actual, (str, list, tuple)) and expected in actual
    return False


def _map_fields(payload: dict[str, Any], mapping: dict[str, Any]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for target, source in (mapping or {}).items():
        if isinstance(source, str):
            result[target] = _resolve_path(payload, source)
        elif isinstance(source, dict):
            path = source.get("path") or source.get("source")
            default = source.get("default")
            result[target] = _resolve_path(payload, str(path)) if path else default
        else:
            result[target] = source
    return result


def _serialize_rule(rule: UcpAccountLifecycleRule) -> dict[str, Any]:
    return {
        "id": rule.id,
        "rule_code": rule.rule_code,
        "rule_name": rule.rule_name,
        "description": rule.description,
        "source_system_code": rule.source_system_code,
        "feishu_event_type": rule.feishu_event_type,
        "internal_event_type": rule.internal_event_type,
        "target_system_code": rule.target_system_code,
        "target_resource_code": rule.target_resource_code,
        "lifecycle_action": rule.lifecycle_action,
        "filter_rule": rule.filter_rule or {},
        "field_mapping": rule.field_mapping or {},
        "account_match_strategy": rule.account_match_strategy,
        "approval_required": bool(rule.approval_required),
        "retention_days": rule.retention_days,
        "failure_policy": rule.failure_policy,
        "notification_config": rule.notification_config or {},
        "status": rule.status,
        "created_at": rule.created_at.isoformat() if rule.created_at else None,
        "updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
    }


def _serialize_job(job: UcpAccountLifecycleJob) -> dict[str, Any]:
    return {
        "id": job.id,
        "job_code": job.job_code,
        "rule_id": job.rule_id,
        "account_id": job.account_id,
        "event_id": job.event_id,
        "action": job.action,
        "status": job.status,
        "scheduled_at": job.scheduled_at.isoformat() if job.scheduled_at else None,
        "executed_at": job.executed_at.isoformat() if job.executed_at else None,
        "retry_count": job.retry_count,
        "last_error_code": job.last_error_code,
        "last_error_message": job.last_error_message,
        "payload_snapshot": job.payload_snapshot or {},
    }


async def _get_rule(db: AsyncSession, rule_code: str) -> UcpAccountLifecycleRule:
    rule = (await db.execute(select(UcpAccountLifecycleRule).where(UcpAccountLifecycleRule.rule_code == rule_code))).scalar_one_or_none()
    if not rule:
        raise LifecycleError("RULE_NOT_FOUND", f"Lifecycle rule '{rule_code}' does not exist")
    return rule


async def _validate_rule(db: AsyncSession, rule: UcpAccountLifecycleRule) -> None:
    if rule.lifecycle_action not in ACTIONS:
        raise LifecycleError("INVALID_ACTION", "Unsupported lifecycle action")
    if rule.account_match_strategy != "EMPLOYEE_ID":
        raise LifecycleError("UNSUPPORTED_MATCH_STRATEGY", "Only EMPLOYEE_ID is supported")
    if not isinstance(rule.field_mapping, dict) or not rule.field_mapping.get("employee_id"):
        raise LifecycleError("EMPLOYEE_ID_MAPPING_REQUIRED", "field_mapping.employee_id is required")
    if rule.retention_days < 0:
        raise LifecycleError("INVALID_RETENTION_DAYS", "retention_days cannot be negative")
    if rule.lifecycle_action == ACTION_DELETE and not rule.approval_required and rule.retention_days <= 0:
        raise LifecycleError("DELETE_GUARD_REQUIRED", "DELETE requires approval or a positive retention period")
    config = (await db.execute(select(UcpSystemConfig).where(UcpSystemConfig.system_code == rule.target_resource_code))).scalar_one_or_none()
    if not config:
        raise LifecycleError("RESOURCE_NOT_FOUND", f"Resource '{rule.target_resource_code}' does not exist")
    if not config.adapter_code:
        raise LifecycleError("RESOURCE_ADAPTER_REQUIRED", "Target resource has no adapter")


async def list_rules(db: AsyncSession, *, status: int | None = None, source_system_code: str | None = None, target_system_code: str | None = None) -> list[dict[str, Any]]:
    stmt = select(UcpAccountLifecycleRule).order_by(UcpAccountLifecycleRule.updated_at.desc())
    if status is not None:
        stmt = stmt.where(UcpAccountLifecycleRule.status == status)
    if source_system_code:
        stmt = stmt.where(UcpAccountLifecycleRule.source_system_code == source_system_code)
    if target_system_code:
        stmt = stmt.where(UcpAccountLifecycleRule.target_system_code == target_system_code)
    return [_serialize_rule(row) for row in (await db.execute(stmt)).scalars().all()]


async def create_rule(db: AsyncSession, payload: dict[str, Any], operator: str | None = None) -> dict[str, Any]:
    code = str(payload.get("rule_code") or "").strip().upper()
    if not code:
        raise LifecycleError("RULE_CODE_REQUIRED", "rule_code is required")
    exists = (await db.execute(select(UcpAccountLifecycleRule.id).where(UcpAccountLifecycleRule.rule_code == code))).scalar_one_or_none()
    if exists:
        raise LifecycleError("RULE_CODE_EXISTS", f"rule_code '{code}' already exists")
    rule = UcpAccountLifecycleRule(
        rule_code=code,
        rule_name=str(payload.get("rule_name") or "").strip(),
        description=payload.get("description"),
        source_system_code=str(payload.get("source_system_code") or "FEISHU").upper(),
        feishu_event_type=payload.get("feishu_event_type"),
        internal_event_type=str(payload.get("internal_event_type") or "").strip(),
        target_system_code=str(payload.get("target_system_code") or "").upper(),
        target_resource_code=str(payload.get("target_resource_code") or "").upper(),
        lifecycle_action=str(payload.get("lifecycle_action") or "").upper(),
        filter_rule=payload.get("filter_rule") or {},
        field_mapping=payload.get("field_mapping") or {},
        account_match_strategy=str(payload.get("account_match_strategy") or "EMPLOYEE_ID").upper(),
        approval_required=1 if payload.get("approval_required") else 0,
        retention_days=int(payload.get("retention_days") or 0),
        failure_policy=str(payload.get("failure_policy") or "RETRY_AND_ALERT").upper(),
        notification_config=payload.get("notification_config") or {},
        status=1 if payload.get("status") else 0,
        created_by=operator,
        updated_by=operator,
    )
    if not rule.rule_name or not rule.internal_event_type or not rule.target_system_code or not rule.target_resource_code:
        raise LifecycleError("REQUIRED_FIELD_MISSING", "rule_name, internal_event_type, target_system_code and target_resource_code are required")
    await _validate_rule(db, rule)
    db.add(rule)
    await db.flush()
    return _serialize_rule(rule)


async def update_rule(db: AsyncSession, rule_code: str, payload: dict[str, Any], operator: str | None = None) -> dict[str, Any]:
    rule = await _get_rule(db, rule_code)
    immutable = {"rule_code", "id", "created_at", "created_by"}
    for field in (
        "rule_name", "description", "source_system_code", "feishu_event_type", "internal_event_type",
        "target_system_code", "target_resource_code", "lifecycle_action", "filter_rule", "field_mapping",
        "account_match_strategy", "approval_required", "retention_days", "failure_policy", "notification_config", "status",
    ):
        if field not in payload or field in immutable:
            continue
        value = payload[field]
        if field in {"source_system_code", "target_system_code", "target_resource_code", "lifecycle_action", "account_match_strategy", "failure_policy"} and value is not None:
            value = str(value).upper()
        if field == "approval_required":
            value = 1 if value else 0
        if field == "retention_days":
            value = int(value or 0)
        if field == "status":
            value = 1 if value else 0
        setattr(rule, field, value)
    rule.updated_by = operator
    await _validate_rule(db, rule)
    await db.flush()
    return _serialize_rule(rule)


async def set_rule_status(db: AsyncSession, rule_code: str, enabled: bool, operator: str | None = None) -> dict[str, Any]:
    rule = await _get_rule(db, rule_code)
    if enabled:
        await _validate_rule(db, rule)
    rule.status = 1 if enabled else 0
    rule.updated_by = operator
    await db.flush()
    return _serialize_rule(rule)


async def dry_run_rule(db: AsyncSession, rule_code: str, event_payload: dict[str, Any]) -> dict[str, Any]:
    rule = await _get_rule(db, rule_code)
    mapped = _map_fields(event_payload, rule.field_mapping or {})
    employee_id = str(mapped.get("employee_id") or "").strip()
    account = None
    if employee_id:
        account = (await db.execute(select(ExternalAccount).where(ExternalAccount.system_code == rule.target_system_code, ExternalAccount.employee_id == employee_id).order_by(ExternalAccount.updated_at.desc()))).scalars().first()
    return {
        "matched": _matches_filter(event_payload, rule.filter_rule),
        "rule_code": rule.rule_code,
        "action": rule.lifecycle_action,
        "mapped_fields": mask_dict(mapped),
        "account": {"id": account.id, "status": account.status, "external_user_id": account.external_user_id} if account else None,
        "will_schedule": bool(rule.approval_required or rule.retention_days > 0),
    }


async def _execute_action(db: AsyncSession, rule: UcpAccountLifecycleRule, values: dict[str, Any], event: UcpEvent | None = None) -> tuple[bool, str | None, str | None, int | None]:
    employee_id = str(values.get("employee_id") or "").strip()
    if not employee_id:
        return False, "MISSING_EMPLOYEE_ID", "employee_id is required", None
    account = (await db.execute(select(ExternalAccount).where(ExternalAccount.system_code == rule.target_system_code, ExternalAccount.employee_id == employee_id).order_by(ExternalAccount.updated_at.desc()))).scalars().first()
    if rule.lifecycle_action in {ACTION_DISABLE, ACTION_DELETE, ACTION_UPDATE, ACTION_REACTIVATE} and not account:
        return False, "ACCOUNT_NOT_FOUND", f"No {rule.target_system_code} account for employee_id={employee_id}", None
    if account and rule.lifecycle_action == ACTION_DISABLE and account.status in {STATUS_DISABLED, STATUS_DELETED}:
        return True, None, None, account.id
    if account and rule.lifecycle_action == ACTION_DELETE and account.status == STATUS_DELETED:
        return True, None, None, account.id
    config = (await db.execute(select(UcpSystemConfig).where(UcpSystemConfig.system_code == rule.target_resource_code))).scalar_one_or_none()
    if not config or not config.adapter_code:
        return False, "RESOURCE_NOT_FOUND", f"Resource '{rule.target_resource_code}' is not executable", account.id if account else None
    secrets = await decrypt_credential_secrets(db, config.credential_id) if config.credential_id else {}
    params = dict(config.protocol or {})
    params.update({key: value for key, value in values.items() if value is not None})
    params["action"] = rule.lifecycle_action
    if account:
        params["external_user_id"] = account.external_user_id
    if event:
        params["event_id"] = event.event_id
    result = await get_adapter(config.adapter_code)(params, secrets, db)
    if result.status != "success":
        return False, result.error_code or "ADAPTER_FAILED", result.error_message or "External account action failed", account.id if account else None
    account_id = (result.extra or {}).get("account_id") if result.extra else None
    return True, None, None, account_id or (account.id if account else None)


async def _create_job(db: AsyncSession, rule: UcpAccountLifecycleRule, event: UcpEvent, account_id: int | None, values: dict[str, Any]) -> UcpAccountLifecycleJob:
    effective_date = event.event_timestamp.date().isoformat() if event.event_timestamp else _utcnow().date().isoformat()
    key = f"{rule.rule_code}:{account_id or values.get('employee_id')}:{rule.lifecycle_action}:{effective_date}"
    existing = (await db.execute(select(UcpAccountLifecycleJob).where(UcpAccountLifecycleJob.idempotency_key == key))).scalar_one_or_none()
    if existing:
        return existing
    status = JOB_WAITING_APPROVAL if rule.approval_required else JOB_PENDING
    job = UcpAccountLifecycleJob(
        job_code=f"lifecycle_{uuid.uuid4().hex[:16]}",
        rule_id=rule.id,
        account_id=account_id,
        event_id=event.id,
        action=rule.lifecycle_action,
        status=status,
        scheduled_at=_utcnow() + timedelta(days=rule.retention_days),
        idempotency_key=key,
        payload_snapshot=mask_dict({
            **values,
            "_event_id": event.event_id,
            "_trace_id": event.trace_id,
            "_rule_code": rule.rule_code,
            "_rule_updated_at": rule.updated_at.isoformat() if rule.updated_at else None,
        }),
    )
    db.add(job)
    await db.flush()
    return job


async def dispatch_event(db: AsyncSession, event: UcpEvent) -> list[dict[str, Any]]:
    rules = (await db.execute(select(UcpAccountLifecycleRule).where(UcpAccountLifecycleRule.status == 1, UcpAccountLifecycleRule.source_system_code == event.source, UcpAccountLifecycleRule.internal_event_type == event.event_type))).scalars().all()
    results: list[dict[str, Any]] = []
    for rule in rules:
        payload = event.payload or {}
        if rule.feishu_event_type:
            actual = str((event.metadata_ or {}).get("feishu_event_type") or "")
            if actual and actual != rule.feishu_event_type:
                continue
        if not _matches_filter(payload, rule.filter_rule):
            continue
        values = _map_fields(payload, rule.field_mapping or {})
        if rule.approval_required or rule.retention_days > 0:
            employee_id = str(values.get("employee_id") or "")
            account = (await db.execute(select(ExternalAccount).where(ExternalAccount.system_code == rule.target_system_code, ExternalAccount.employee_id == employee_id).order_by(ExternalAccount.updated_at.desc()))).scalars().first() if employee_id else None
            job = await _create_job(db, rule, event, account.id if account else None, values)
            results.append({"rule_code": rule.rule_code, "job_code": job.job_code, "status": job.status})
            continue
        ok, code, message, account_id = await _execute_action(db, rule, values, event)
        results.append({"rule_code": rule.rule_code, "success": ok, "account_id": account_id, "error_code": code, "error_message": message})
    return results


async def list_jobs(db: AsyncSession, *, status: str | None = None, rule_code: str | None = None) -> list[dict[str, Any]]:
    stmt = select(UcpAccountLifecycleJob).order_by(UcpAccountLifecycleJob.scheduled_at.desc())
    if status:
        stmt = stmt.where(UcpAccountLifecycleJob.status == status)
    if rule_code:
        stmt = stmt.join(UcpAccountLifecycleRule).where(UcpAccountLifecycleRule.rule_code == rule_code)
    return [_serialize_job(row) for row in (await db.execute(stmt)).scalars().all()]


async def retry_job(db: AsyncSession, job_code: str) -> dict[str, Any]:
    job = (await db.execute(select(UcpAccountLifecycleJob).where(UcpAccountLifecycleJob.job_code == job_code))).scalar_one_or_none()
    if not job:
        raise LifecycleError("JOB_NOT_FOUND", "Lifecycle job does not exist")
    if job.status not in {JOB_FAILED, JOB_CANCELLED}:
        raise LifecycleError("JOB_NOT_RETRYABLE", "Only failed or cancelled jobs can be retried")
    job.status = JOB_PENDING
    job.scheduled_at = _utcnow()
    job.last_error_code = None
    job.last_error_message = None
    await db.flush()
    return _serialize_job(job)


async def process_due_jobs(db: AsyncSession, *, limit: int = 50) -> int:
    jobs = (await db.execute(select(UcpAccountLifecycleJob).where(UcpAccountLifecycleJob.status == JOB_PENDING, UcpAccountLifecycleJob.scheduled_at <= _utcnow()).order_by(UcpAccountLifecycleJob.scheduled_at).limit(limit))).scalars().all()
    processed = 0
    for job in jobs:
        job.status = JOB_RUNNING
        await db.flush()
        rule = (await db.execute(select(UcpAccountLifecycleRule).where(UcpAccountLifecycleRule.id == job.rule_id))).scalar_one_or_none()
        event = (await db.execute(select(UcpEvent).where(UcpEvent.id == job.event_id))).scalar_one_or_none() if job.event_id else None
        if not rule:
            job.status, job.last_error_code, job.last_error_message = JOB_FAILED, "RULE_NOT_FOUND", "Lifecycle rule was deleted"
        elif job.status == JOB_WAITING_APPROVAL:
            continue
        else:
            values = dict(job.payload_snapshot or {})
            if job.account_id:
                account = (await db.execute(select(ExternalAccount).where(ExternalAccount.id == job.account_id))).scalar_one_or_none()
                if account:
                    values["employee_id"] = account.employee_id
            ok, code, message, _ = await _execute_action(db, rule, values, event)
            if ok:
                job.status = JOB_SUCCESS
                job.executed_at = _utcnow()
            else:
                job.status = JOB_FAILED
                job.retry_count += 1
                job.last_error_code = code
                job.last_error_message = message
        processed += 1
    await db.flush()
    return processed
