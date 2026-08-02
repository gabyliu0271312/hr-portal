"""Resource-object webhook ingress and unified pipeline-trigger APIs."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.ucp.credential_service import decrypt_credential_secrets
from app.ucp.event_bus import DuplicateEventError, match_triggers, process_event_pipeline, receive_event
from app.ucp.feishu_webhook import normalize_feishu_event, verify_feishu_signature
from app.ucp.webhook_ingress import (
    extract_payload_path,
    verify_timestamped_hmac,
)
from app.ucp.models import UcpConnectorPackage, UcpEventDefinition, UcpEventTrigger, UcpPipelineConfig, UcpPipelineTemplate, UcpResource, UcpResourceDataObject, UcpSystem, UcpWebhookIngressAttempt, UcpWebhookIngressReceipt
from app.ucp.rate_limiter import RateLimitError, acquire as acquire_rate_limit
from app.ucp.warehouse_ingest_service import (
    IngestBatchConflictError,
    get_ingest_batch_for_event,
    reserve_ingest_batch,
)

router = APIRouter()
OBJECT_TYPES = {"REPORT", "TABLE", "API_OBJECT", "EVENT_TYPE"}
TRIGGER_TYPES = {"MANUAL", "SCHEDULE", "WEBHOOK", "PLATFORM_EVENT"}
DEFINITION_STATUSES = {"DRAFT", "PUBLISHED", "DEPRECATED"}


def _resource_ingress_enabled() -> bool:
    return os.getenv("UCP_WEBHOOK_RESOURCE_INGRESS_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}


def _payload_checksum(payload: dict) -> str:
    encoded = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


async def _warehouse_target_asset(db: AsyncSession, event) -> str | None:
    targets: set[str] = set()
    for trigger in await match_triggers(db, event):
        pipeline = await db.scalar(
            select(UcpPipelineConfig).where(
                UcpPipelineConfig.pipeline_code == trigger.pipeline_code,
                UcpPipelineConfig.status == 1,
            )
        )
        steps = pipeline.steps if pipeline is not None else None
        if steps is None:
            template = await db.scalar(
                select(UcpPipelineTemplate).where(
                    UcpPipelineTemplate.template_code == trigger.pipeline_code,
                )
            )
            steps = template.nodes_json if template is not None else []
        targets.update(
            str(step.get("target_asset") or (step.get("config") or {}).get("target_asset"))
            for step in (steps or [])
            if step.get("type") == "WAREHOUSE_ASSET_SINK" and (step.get("target_asset") or (step.get("config") or {}).get("target_asset"))
        )
    if len(targets) > 1:
        raise ValueError("Webhook event maps to multiple warehouse assets")
    return next(iter(targets), None)


async def _read_webhook_body(request: Request, maximum: int) -> bytes:
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > maximum:
                raise ValueError("BODY_TOO_LARGE")
        except ValueError as exc:
            if str(exc) == "BODY_TOO_LARGE":
                raise
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > maximum:
            raise ValueError("BODY_TOO_LARGE")
        chunks.append(chunk)
    return b"".join(chunks)


def _webhook_response(
    external_event_id: str,
    *,
    status: str,
    trace_id: str | None,
    deduplicated: bool = False,
) -> dict[str, Any]:
    response: dict[str, Any] = {
        "accepted": True,
        "event_id": external_event_id,
        "status": status,
        "trace_id": trace_id,
    }
    if deduplicated:
        response["deduplicated"] = True
    return response


async def _record_ingress_attempt(
    db: AsyncSession,
    *,
    resource_code: str,
    resource_id: int | None,
    outcome: str,
    reason_code: str | None = None,
    event_id: str | None = None,
) -> None:
    db.add(UcpWebhookIngressAttempt(
        resource_code=resource_code,
        resource_id=resource_id,
        outcome=outcome,
        reason_code=reason_code,
        event_id=event_id,
    ))
    await db.flush()


async def _reject_webhook(
    db: AsyncSession,
    *,
    resource_code: str,
    resource_id: int | None,
    reason_code: str,
    status_code: int,
    detail: str,
    headers: dict[str, str] | None = None,
) -> None:
    await _record_ingress_attempt(
        db,
        resource_code=resource_code,
        resource_id=resource_id,
        outcome="REJECTED",
        reason_code=reason_code,
    )
    await db.commit()
    raise HTTPException(status_code, detail, headers=headers)


class EventDefinitionRequest(BaseModel):
    event_code: str = Field(min_length=3, max_length=128)
    event_name: str = Field(min_length=1, max_length=128)
    source_system_type: str = Field(min_length=1, max_length=64)
    payload_schema: dict[str, Any] = Field(default_factory=dict)
    normalization_schema: dict[str, Any] = Field(default_factory=dict)
    verification_strategy: str = "NONE"
    version: str = "1.0.0"
    status: Literal["DRAFT", "PUBLISHED", "DEPRECATED"] = "DRAFT"
    risk_level: str = "read_low"


class ResourceObjectRequest(BaseModel):
    object_code: str = Field(min_length=1, max_length=64)
    object_name: str = Field(min_length=1, max_length=128)
    object_type: Literal["REPORT", "TABLE", "API_OBJECT", "EVENT_TYPE"] = "REPORT"
    event_definition_id: int | None = None
    event_config: dict[str, Any] = Field(default_factory=dict)
    object_config: dict[str, Any] = Field(default_factory=dict)
    field_mapping: dict[str, Any] = Field(default_factory=dict)
    incremental_config: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True

    @model_validator(mode="after")
    def validate_event_reference(self):
        if self.object_type == "EVENT_TYPE" and self.event_definition_id is None:
            raise ValueError("EVENT_TYPE requires event_definition_id")
        if self.object_type != "EVENT_TYPE" and self.event_definition_id is not None:
            raise ValueError("event_definition_id is only allowed for EVENT_TYPE")
        if any("secret" in key.lower() or "token" in key.lower() for key in self.event_config):
            raise ValueError("event_config must reference credentials and cannot contain secrets")
        return self


class PipelineTriggerRequest(BaseModel):
    trigger_code: str = Field(min_length=3, max_length=64)
    trigger_name: str = Field(min_length=1, max_length=128)
    pipeline_template_code: str = Field(min_length=1, max_length=64)
    trigger_type: Literal["MANUAL", "SCHEDULE", "WEBHOOK", "PLATFORM_EVENT"]
    platform_event_type: str | None = Field(default=None, max_length=128)
    source_resource_object_id: int | None = None
    filter_rule: dict[str, Any] = Field(default_factory=dict)
    schedule_config: dict[str, Any] = Field(default_factory=dict)
    input_schema: dict[str, Any] = Field(default_factory=dict)
    idempotency_expression: str | None = Field(default=None, max_length=256)
    failure_policy: Literal["RETRY", "DEAD_LETTER", "STOP"] = "RETRY"
    run_as_type: str = "SERVICE_ACCOUNT"
    service_account_code: str | None = None
    is_active: bool = False

    @model_validator(mode="after")
    def validate_source(self):
        if self.trigger_type == "WEBHOOK" and self.source_resource_object_id is None:
            raise ValueError("WEBHOOK requires source_resource_object_id")
        if self.trigger_type == "SCHEDULE":
            if self.source_resource_object_id is not None:
                raise ValueError("SCHEDULE cannot use source_resource_object_id")
            if not self.schedule_config.get("cron") or not self.schedule_config.get("timezone"):
                raise ValueError("SCHEDULE requires schedule_config.cron and timezone")
        if self.trigger_type == "PLATFORM_EVENT":
            from app.ucp.platform_event_catalog import get_platform_event, validate_platform_filter

            item = get_platform_event(self.platform_event_type)
            if item is None or not item["enabled"]:
                raise ValueError("PLATFORM_EVENT requires an available platform_event_type")
            if self.source_resource_object_id is not None:
                raise ValueError("PLATFORM_EVENT cannot use source_resource_object_id")
            validate_platform_filter(self.platform_event_type or "", self.filter_rule)
        return self


class PipelineTriggerTestRequest(BaseModel):
    sample_payload: dict[str, Any] = Field(default_factory=dict)
    dry_run: bool = True


def _serialize_definition(item: UcpEventDefinition) -> dict[str, Any]:
    return {key: getattr(item, key) for key in (
        "id", "event_code", "event_name", "source_system_type", "payload_schema",
        "normalization_schema", "verification_strategy", "version", "status", "risk_level",
    )}


def _serialize_object(item: UcpResourceDataObject, definition: UcpEventDefinition | None = None) -> dict[str, Any]:
    return {
        "id": item.id, "resource_id": item.resource_id, "connector_type": item.connector_type,
        "object_code": item.object_code, "object_name": item.object_name, "object_type": item.object_type,
        "event_definition_id": item.event_definition_id, "event_definition": _serialize_definition(definition) if definition else None,
        "event_config": item.event_config or {}, "object_config": item.object_config or {},
        "field_mapping": item.field_mapping or {}, "incremental_config": item.incremental_config or {},
        "verification_status": item.verification_status, "last_verified_at": item.last_verified_at,
        "schema_version": item.schema_version, "is_active": bool(item.is_active),
    }


def _serialize_trigger(item: UcpEventTrigger) -> dict[str, Any]:
    return {
        "id": item.id, "trigger_code": item.trigger_code, "trigger_name": item.trigger_name,
        "pipeline_template_code": item.pipeline_code, "trigger_type": item.trigger_type,
        "platform_event_type": item.event_types if item.trigger_type == "PLATFORM_EVENT" else None,
        "source_resource_object_id": item.source_resource_object_id, "source_resource_id": item.source_resource_id, "filter_rule": item.filter_rule or {},
        "schedule_config": item.schedule_config or {}, "input_schema": item.input_schema or {},
        "idempotency_expression": item.idempotency_expression, "failure_policy": item.failure_policy,
        "run_as_type": item.run_as_type, "service_account_code": item.service_account_code,
        "is_active": bool(item.is_active), "migration_status": item.migration_status,
        "legacy_webhook_path": item.legacy_webhook_path,
    }


async def _get_resource(db: AsyncSession, resource_id: int) -> UcpResource:
    item = await db.get(UcpResource, resource_id)
    if item is None:
        raise HTTPException(404, "Resource not found")
    return item


async def _resource_object_template(db: AsyncSession, resource: UcpResource) -> dict[str, Any]:
    template_id = getattr(resource, "source_template_id", None)
    template_code = getattr(resource, "source_template_code", None)
    template = await db.get(UcpConnectorPackage, template_id) if template_id else None
    if template is None and template_code:
        template = await db.scalar(select(UcpConnectorPackage).where(UcpConnectorPackage.package_code == template_code))
    return ((template.system_schema or {}).get("object_template") or {}) if template else {}


async def _validate_resource_object_template(
    db: AsyncSession,
    resource: UcpResource,
    payload: ResourceObjectRequest,
    definition: UcpEventDefinition | None,
    *,
    existing_object_id: int | None = None,
) -> None:
    object_template = await _resource_object_template(db, resource)
    expected_type = object_template.get("object_type")
    if expected_type and payload.object_type != expected_type:
        raise HTTPException(422, "RESOURCE_TEMPLATE_OBJECT_TYPE_MISMATCH")
    if payload.object_type == "EVENT_TYPE" and definition is not None:
        expected_source = object_template.get("event_definition_source_system_type")
        allowed_codes = set(object_template.get("event_definition_codes") or [])
        if expected_source and definition.source_system_type != expected_source:
            raise HTTPException(422, "RESOURCE_TEMPLATE_EVENT_SOURCE_MISMATCH")
        if allowed_codes and definition.event_code not in allowed_codes:
            raise HTTPException(422, "RESOURCE_TEMPLATE_EVENT_NOT_ALLOWED")
    if object_template.get("multiple") is False:
        existing = await db.scalar(select(UcpResourceDataObject.id).where(UcpResourceDataObject.resource_id == resource.id, UcpResourceDataObject.id != existing_object_id if existing_object_id else True))
        if existing is not None:
            raise HTTPException(409, "RESOURCE_TEMPLATE_SINGLE_OBJECT_ONLY")

async def _event_definition(db: AsyncSession, definition_id: int, *, published: bool = False) -> UcpEventDefinition:
    item = await db.get(UcpEventDefinition, definition_id)
    if item is None or (published and item.status != "PUBLISHED"):
        raise HTTPException(422, "Event definition is unavailable")
    return item


async def _validate_event_object(db: AsyncSession, object_id: int, *, require_verified: bool) -> UcpResourceDataObject:
    item = await db.get(UcpResourceDataObject, object_id)
    if item is None or item.object_type != "EVENT_TYPE" or not item.is_active:
        raise HTTPException(409, "Source event object is unavailable")
    if require_verified and item.verification_status != "VERIFIED":
        raise HTTPException(409, "Source event object must be verified")
    await _event_definition(db, item.event_definition_id or 0, published=True)
    return item


@router.get("/event-definitions")
async def list_event_definitions(source_system_type: str | None = None, status: str | None = "PUBLISHED", db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.events", "V"))):
    stmt = select(UcpEventDefinition)
    if source_system_type:
        stmt = stmt.where(UcpEventDefinition.source_system_type == source_system_type)
    if status:
        stmt = stmt.where(UcpEventDefinition.status == status)
    return {"items": [_serialize_definition(item) for item in (await db.execute(stmt.order_by(UcpEventDefinition.event_code))).scalars()]}


@router.post("/event-definitions", status_code=201)
async def create_event_definition(payload: EventDefinitionRequest, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.systems", "C"))):
    existing = (await db.execute(select(UcpEventDefinition).where(UcpEventDefinition.event_code == payload.event_code, UcpEventDefinition.version == payload.version))).scalar_one_or_none()
    if existing:
        raise HTTPException(409, "Event definition version already exists")
    item = UcpEventDefinition(**payload.model_dump())
    db.add(item)
    await db.commit(); await db.refresh(item)
    return _serialize_definition(item)


@router.patch("/event-definitions/{definition_id}")
async def update_event_definition(definition_id: int, payload: EventDefinitionRequest, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.systems", "U"))):
    item = await _event_definition(db, definition_id)
    if item.status == "PUBLISHED" and (payload.event_code != item.event_code or payload.payload_schema != item.payload_schema or payload.version != item.version):
        raise HTTPException(409, "Published event definitions require a new version for breaking changes")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    await db.commit(); await db.refresh(item)
    return _serialize_definition(item)


@router.get("/resources/{resource_id}/objects")
async def list_resource_objects(resource_id: int, object_type: str | None = None, is_active: bool | None = None, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.resources", "V"))):
    await _get_resource(db, resource_id)
    stmt = select(UcpResourceDataObject).where(UcpResourceDataObject.resource_id == resource_id)
    if object_type:
        if object_type not in OBJECT_TYPES: raise HTTPException(422, "Invalid object_type")
        stmt = stmt.where(UcpResourceDataObject.object_type == object_type)
    if is_active is not None: stmt = stmt.where(UcpResourceDataObject.is_active == int(is_active))
    items = list((await db.execute(stmt.order_by(UcpResourceDataObject.object_code))).scalars())
    definitions = {item.id: item for item in (await db.execute(select(UcpEventDefinition).where(UcpEventDefinition.id.in_([obj.event_definition_id for obj in items if obj.event_definition_id])))).scalars()} if any(obj.event_definition_id for obj in items) else {}
    return {"total": len(items), "items": [_serialize_object(item, definitions.get(item.event_definition_id)) for item in items]}


@router.post("/resources/{resource_id}/objects", status_code=201)
async def create_resource_object(resource_id: int, payload: ResourceObjectRequest, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.resources", "C"))):
    resource = await _get_resource(db, resource_id)
    definition = await _event_definition(db, payload.event_definition_id, published=True) if payload.event_definition_id else None
    item = UcpResourceDataObject(resource_id=resource.id, connector_type=resource.connector_type or "webhook_ingress", **payload.model_dump(), verification_status="PENDING" if payload.object_type == "EVENT_TYPE" else "NOT_REQUIRED", schema_version=definition.version if definition else None)
    db.add(item)
    try: await db.commit()
    except Exception as error:
        await db.rollback(); raise HTTPException(409, "Object code already exists") from error
    await db.refresh(item)
    return _serialize_object(item, definition)


@router.patch("/resources/{resource_id}/objects/{object_id}")
async def update_resource_object(resource_id: int, object_id: int, payload: ResourceObjectRequest, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.resources", "U"))):
    await _get_resource(db, resource_id)
    item = await db.get(UcpResourceDataObject, object_id)
    if item is None or item.resource_id != resource_id: raise HTTPException(404, "Resource object not found")
    definition = await _event_definition(db, payload.event_definition_id, published=True) if payload.event_definition_id else None
    for key, value in payload.model_dump().items(): setattr(item, key, value)
    item.schema_version = definition.version if definition else None
    if item.object_type == "EVENT_TYPE": item.verification_status = "PENDING"
    await db.commit(); await db.refresh(item)
    return _serialize_object(item, definition)


@router.delete("/resources/{resource_id}/objects/{object_id}")
async def delete_resource_object(resource_id: int, object_id: int, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.resources", "D"))):
    item = await db.get(UcpResourceDataObject, object_id)
    if item is None or item.resource_id != resource_id: raise HTTPException(404, "Resource object not found")
    triggers = list((await db.execute(select(UcpEventTrigger.trigger_code).where(UcpEventTrigger.source_resource_object_id == object_id, UcpEventTrigger.is_active == 1))).scalars())
    if triggers: raise HTTPException(409, {"message": "Object is used by active triggers", "impact": triggers})
    await db.delete(item); await db.commit()
    return {"deleted": object_id, "impact": []}


@router.post("/resources/{resource_id}/verify")
async def verify_webhook_resource(resource_id: int, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.resources", "U"))):
    resource = await _get_resource(db, resource_id)
    ingress = (resource.protocol or {}).get("ingress", {})
    if (resource.connector_type or "").lower() not in {"webhook_ingress", "webhook"} and not ingress:
        raise HTTPException(409, "Resource is not a webhook ingress")
    if not resource.credential_id and ingress.get("verification_strategy") not in {None, "NONE"}:
        raise HTTPException(409, "Webhook resource requires a credential reference")
    resource.test_status = "VERIFIED"; resource.test_time = datetime.now(timezone.utc); resource.test_result = {"verified": True, "credential_reference": bool(resource.credential_id)}
    await db.commit()
    return {"resource_id": resource.id, "status": resource.test_status, "credential_reference": bool(resource.credential_id)}


@router.post("/resources/{resource_id}/objects/{object_id}/verify")
async def verify_resource_object(resource_id: int, object_id: int, sample_event: dict[str, Any] | None = None, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.resources", "U"))):
    resource = await _get_resource(db, resource_id)
    if resource.test_status != "VERIFIED":
        raise HTTPException(409, "Webhook resource must be verified before its event objects")
    item = await _validate_event_object(db, object_id, require_verified=False)
    if item.resource_id != resource.id: raise HTTPException(404, "Resource object not found")
    definition = await _event_definition(db, item.event_definition_id or 0, published=True)
    if sample_event is not None:
        required = (definition.payload_schema or {}).get("required", [])
        missing = [key for key in required if key not in sample_event]
        if missing: raise HTTPException(422, {"message": "Schema validation failed", "missing": missing})
    item.verification_status = "VERIFIED"; item.last_verified_at = datetime.now(timezone.utc)
    await db.commit(); await db.refresh(item)
    return {"object": _serialize_object(item, definition), "schema_matched": True}


@router.get("/platform-event-catalog")
async def list_platform_event_catalog(_events=Depends(require_op("ucp.events", "V"))):
    from app.ucp.platform_event_catalog import list_platform_events

    return {"items": list_platform_events()}


@router.get("/pipeline-triggers")
async def list_pipeline_triggers(pipeline_template_code: str | None = None, trigger_type: str | None = None, source_resource_id: int | None = None, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.events", "V"))):
    stmt = select(UcpEventTrigger)
    if pipeline_template_code: stmt = stmt.where(UcpEventTrigger.pipeline_code == pipeline_template_code)
    if trigger_type: stmt = stmt.where(UcpEventTrigger.trigger_type == trigger_type)
    if source_resource_id: stmt = stmt.where(UcpEventTrigger.source_resource_id == source_resource_id)
    return {"items": [_serialize_trigger(item) for item in (await db.execute(stmt.order_by(UcpEventTrigger.id.desc()))).scalars()]}


@router.get("/trigger-migration/status")
async def trigger_migration_status(db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.events", "V"))):
    triggers = list((await db.execute(select(UcpEventTrigger))).scalars())
    objects = list((await db.execute(select(UcpResourceDataObject).where(UcpResourceDataObject.object_type == "EVENT_TYPE"))).scalars())
    legacy = [item for item in triggers if item.migration_status == "PENDING_MIGRATION"]
    resource_bound = [item for item in triggers if item.source_resource_object_id is not None]
    return {
        "resource_ingress_enabled": _resource_ingress_enabled(),
        "legacy_trigger_count": len(legacy),
        "resource_bound_trigger_count": len(resource_bound),
        "verified_event_object_count": sum(item.verification_status == "VERIFIED" for item in objects),
        "legacy_triggers": [{"trigger_code": item.trigger_code, "webhook_path": item.webhook_path, "is_active": bool(item.is_active), "migration_status": item.migration_status} for item in legacy],
    }


class TriggerMigrationRequest(BaseModel):
    source_resource_object_id: int


@router.post("/trigger-migration/{trigger_code}")
async def migrate_legacy_trigger(trigger_code: str, payload: TriggerMigrationRequest, db: AsyncSession = Depends(get_session), _events=Depends(require_op("ucp.events", "U")), _pipelines=Depends(require_op("ucp.pipelines", "U"))):
    item = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == trigger_code))).scalar_one_or_none()
    if item is None or item.migration_status != "PENDING_MIGRATION" or not item.webhook_path:
        raise HTTPException(409, "Trigger is not pending migration")
    source = await _validate_event_object(db, payload.source_resource_object_id, require_verified=True)
    definition = await _event_definition(db, source.event_definition_id or 0, published=True)
    item.legacy_webhook_path = item.webhook_path
    item.webhook_path = None
    item.source_resource_object_id = source.id
    item.source_resource_id = source.resource_id
    item.event_source = "WEBHOOK"
    item.event_types = definition.event_code
    item.migration_status = "MIGRATED"
    await db.commit(); await db.refresh(item)
    return _serialize_trigger(item)


@router.post("/trigger-migration/{trigger_code}/rollback")
async def rollback_legacy_trigger_migration(trigger_code: str, db: AsyncSession = Depends(get_session), _events=Depends(require_op("ucp.events", "U")), _pipelines=Depends(require_op("ucp.pipelines", "U"))):
    item = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == trigger_code))).scalar_one_or_none()
    if item is None or item.migration_status != "MIGRATED" or not item.legacy_webhook_path:
        raise HTTPException(409, "Trigger migration cannot be rolled back")
    collision = (await db.execute(select(UcpEventTrigger.id).where(UcpEventTrigger.webhook_path == item.legacy_webhook_path, UcpEventTrigger.id != item.id))).scalar_one_or_none()
    if collision is not None:
        raise HTTPException(409, "Legacy webhook path is already in use")
    item.webhook_path = item.legacy_webhook_path
    item.source_resource_object_id = None
    item.source_resource_id = None
    item.migration_status = "PENDING_MIGRATION"
    await db.commit(); await db.refresh(item)
    return _serialize_trigger(item)


async def _write_trigger(db: AsyncSession, payload: PipelineTriggerRequest, item: UcpEventTrigger | None = None) -> UcpEventTrigger:
    source = await _validate_event_object(db, payload.source_resource_object_id, require_verified=payload.is_active) if payload.source_resource_object_id else None
    if item is None:
        item = UcpEventTrigger(trigger_code=payload.trigger_code, trigger_name=payload.trigger_name, event_source="UCP", event_types="", pipeline_code=payload.pipeline_template_code)
        db.add(item)
    values = payload.model_dump()
    item.trigger_name = values["trigger_name"]; item.pipeline_code = values["pipeline_template_code"]; item.trigger_type = values["trigger_type"]
    item.source_resource_object_id = values["source_resource_object_id"]; item.source_resource_id = source.resource_id if source else None
    if source:
        item.event_source = "WEBHOOK"
        item.event_types = (await _event_definition(db, source.event_definition_id or 0, published=True)).event_code
    elif payload.trigger_type == "PLATFORM_EVENT":
        item.event_source = "INTERNAL"
        item.event_types = payload.platform_event_type or ""
    else:
        item.event_source = "UCP"
        item.event_types = ""
    item.filter_rule = values["filter_rule"]; item.schedule_config = values["schedule_config"]; item.input_schema = values["input_schema"]
    item.idempotency_expression = values["idempotency_expression"]; item.failure_policy = values["failure_policy"]
    item.run_as_type = values["run_as_type"]; item.service_account_code = values["service_account_code"]; item.is_active = int(values["is_active"])
    await db.flush()
    from app.scheduler.service import upsert_job
    cron = item.schedule_config.get("cron", "0 0 * * *") if item.trigger_type == "SCHEDULE" else "0 0 * * *"
    job = await upsert_job(db, "ucp_pipeline_trigger", item.id, cron, {"trigger_code": item.trigger_code}, enabled=bool(item.is_active and item.trigger_type == "SCHEDULE"))
    await db.commit(); await db.refresh(item)
    try:
        from app.scheduler.engine import get_engine
        await get_engine().reload_job(job.id)
    except RuntimeError:
        pass
    return item


@router.post("/pipeline-triggers", status_code=201)
async def create_pipeline_trigger(payload: PipelineTriggerRequest, db: AsyncSession = Depends(get_session), _events=Depends(require_op("ucp.events", "C")), _pipelines=Depends(require_op("ucp.pipelines", "U"))):
    existing = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == payload.trigger_code))).scalar_one_or_none()
    if existing: raise HTTPException(409, "Trigger code already exists")
    return _serialize_trigger(await _write_trigger(db, payload))


@router.patch("/pipeline-triggers/{trigger_code}")
async def update_pipeline_trigger(trigger_code: str, payload: PipelineTriggerRequest, db: AsyncSession = Depends(get_session), _events=Depends(require_op("ucp.events", "U")), _pipelines=Depends(require_op("ucp.pipelines", "U"))):
    item = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == trigger_code))).scalar_one_or_none()
    if item is None: raise HTTPException(404, "Pipeline trigger not found")
    if payload.trigger_code != trigger_code: raise HTTPException(422, "trigger_code is immutable")
    return _serialize_trigger(await _write_trigger(db, payload, item))


@router.post("/pipeline-triggers/{trigger_code}/enable")
async def enable_pipeline_trigger(trigger_code: str, enabled: bool, db: AsyncSession = Depends(get_session), _user=Depends(require_op("ucp.events", "U"))):
    item = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == trigger_code))).scalar_one_or_none()
    if item is None: raise HTTPException(404, "Pipeline trigger not found")
    if enabled and item.trigger_type == "WEBHOOK": await _validate_event_object(db, item.source_resource_object_id or 0, require_verified=True)
    item.is_active = int(enabled)
    if item.trigger_type == "SCHEDULE":
        from app.scheduler.service import upsert_job
        job = await upsert_job(db, "ucp_pipeline_trigger", item.id, item.schedule_config.get("cron", "0 0 * * *"), {"trigger_code": item.trigger_code}, enabled=enabled)
    else:
        job = None
    await db.commit(); await db.refresh(item)
    if job is not None:
        try:
            from app.scheduler.engine import get_engine
            await get_engine().reload_job(job.id)
        except RuntimeError:
            pass
    return _serialize_trigger(item)


@router.post("/pipeline-triggers/{trigger_code}/test")
async def test_pipeline_trigger(trigger_code: str, payload: PipelineTriggerTestRequest, db: AsyncSession = Depends(get_session), _events=Depends(require_op("ucp.events", "V")), _pipelines=Depends(require_op("ucp.pipelines", "V"))):
    item = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == trigger_code))).scalar_one_or_none()
    if item is None:
        raise HTTPException(404, "Pipeline trigger not found")
    if not payload.dry_run:
        raise HTTPException(422, "Only dry-run trigger tests are allowed")
    if item.trigger_type == "WEBHOOK":
        source = await _validate_event_object(db, item.source_resource_object_id or 0, require_verified=True)
        definition = await _event_definition(db, source.event_definition_id or 0, published=True)
        required = (definition.payload_schema or {}).get("required", [])
        missing = [key for key in required if key not in payload.sample_payload]
        if missing:
            raise HTTPException(422, {"message": "Schema validation failed", "missing": missing})
    return {"trigger": _serialize_trigger(item), "dry_run": True, "matched": True, "pipeline_started": False}


@router.delete("/pipeline-triggers/{trigger_code}")
async def delete_pipeline_trigger(trigger_code: str, db: AsyncSession = Depends(get_session), _events=Depends(require_op("ucp.events", "D")), _pipelines=Depends(require_op("ucp.pipelines", "U"))):
    item = (await db.execute(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == trigger_code))).scalar_one_or_none()
    if item is None:
        raise HTTPException(404, "Pipeline trigger not found")
    if item.is_active:
        raise HTTPException(409, "Disable the pipeline trigger before deletion")
    await db.delete(item)
    await db.commit()
    return {"deleted": trigger_code}


@router.post("/webhooks/resources/{resource_code}")
async def receive_resource_webhook(resource_code: str, request: Request, db: AsyncSession = Depends(get_session)):
    if not _resource_ingress_enabled():
        await _reject_webhook(db, resource_code=resource_code, resource_id=None, reason_code="INGRESS_DISABLED", status_code=503, detail="Resource webhook ingress is disabled during compatibility rollout")
    resources = list((await db.execute(select(UcpResource).where(UcpResource.resource_code == resource_code).limit(2))).scalars())
    if not resources:
        await _reject_webhook(db, resource_code=resource_code, resource_id=None, reason_code="RESOURCE_NOT_FOUND", status_code=404, detail="Webhook resource not found")
    if len(resources) > 1:
        raise HTTPException(409, "Webhook resource code is ambiguous across systems")
    resource = resources[0]
    system = await db.get(UcpSystem, resource.system_id)
    if resource.status != 1 or resource.connector_type != "webhook_ingress" or resource.test_status != "VERIFIED" or system is None or system.is_active != 1:
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="RESOURCE_UNAVAILABLE", status_code=403, detail="Webhook resource is unavailable")
    ingress = (resource.protocol or {}).get("ingress", {})
    content_type = request.headers.get("content-type", "")
    if content_type.split(";", 1)[0].strip().lower() != "application/json":
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="CONTENT_TYPE_INVALID", status_code=400, detail="Webhook Content-Type must be application/json")
    try:
        acquire_rate_limit(
            f"webhook:{resource.id}",
            {"enabled": True, "qps": ingress.get("rate_limit_per_minute", 120) / 60, "burst": ingress.get("rate_limit_burst", 10)},
        )
    except RateLimitError as error:
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="RATE_LIMITED", status_code=429, detail=error.message, headers={"Retry-After": str(max(1, int(error.retry_after_seconds)))})
    try:
        raw = await _read_webhook_body(request, int(ingress.get("max_body_bytes", 1048576)))
    except ValueError as exc:
        if str(exc) == "BODY_TOO_LARGE":
            await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="BODY_TOO_LARGE", status_code=413, detail="Webhook body exceeds limit")
        raise
    try:
        body = json.loads(raw or b"{}")
    except json.JSONDecodeError:
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="INVALID_JSON", status_code=400, detail="Webhook body must be JSON")
    if not isinstance(body, dict):
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="INVALID_BODY", status_code=400, detail="Webhook body must be an object")
    strategy = ingress.get("verification_strategy", "NONE")
    if strategy == "HMAC_SHA256":
        secrets = await decrypt_credential_secrets(db, resource.credential_id) if resource.credential_id else {}
        secret = secrets.get("signing_secret") or secrets.get("webhook_secret")
        header = ingress.get("signature_header", "X-Signature")
        provided = request.headers.get(header, "")
        expected = hmac.new(str(secret or "").encode(), raw, hashlib.sha256).hexdigest()
        if not secret or not hmac.compare_digest(provided, expected):
            await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="SIGNATURE_INVALID", status_code=401, detail="Webhook signature verification failed")
    if strategy == "HMAC_SHA256_TIMESTAMPED":
        secrets = await decrypt_credential_secrets(db, resource.credential_id) if resource.credential_id else {}
        secret = secrets.get("signing_secret") or secrets.get("webhook_secret")
        verified, reason_code = verify_timestamped_hmac(
            ingress=ingress,
            headers=request.headers,
            raw_body=raw,
            payload=body,
            secret=str(secret or ""),
        )
        if not verified:
            status_code = 403 if reason_code == "TIMESTAMP_EXPIRED" else 401
            await _reject_webhook(
                db,
                resource_code=resource_code,
                resource_id=resource.id,
                reason_code=reason_code,
                status_code=status_code,
                detail="Webhook signature verification failed",
            )
    if strategy == "FEISHU_ENCRYPTED_EVENT":
        secrets = await decrypt_credential_secrets(db, resource.credential_id) if resource.credential_id else {}
        encrypt_key = secrets.get("encrypt_key") or secrets.get("feishu_encrypt_key")
        timestamp = request.headers.get("X-Lark-Request-Timestamp", "")
        nonce = request.headers.get("X-Lark-Request-Nonce", "")
        signature = request.headers.get("X-Lark-Signature", "")
        if signature and not verify_feishu_signature(timestamp, nonce, raw, signature, str(encrypt_key or "")):
            await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="SIGNATURE_INVALID", status_code=401, detail="Feishu webhook signature verification failed")
        try:
            normalized = normalize_feishu_event(body, encrypt_key=encrypt_key, verification_token=secrets.get("verification_token"))
        except Exception:
            await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="FEISHU_PAYLOAD_INVALID", status_code=400, detail="Feishu webhook payload verification failed")
        body = {"event_id": normalized["event_id"], "event_type": normalized["event_type"], "event": normalized["payload"]}
    integration_header = ingress.get("integration_id_header")
    if integration_header and not hmac.compare_digest(str(request.headers.get(integration_header, "")), str(ingress.get("integration_id", ""))):
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="INTEGRATION_ID_INVALID", status_code=401, detail="Webhook integration identity verification failed")
    if "challenge" in body:
        await _record_ingress_attempt(db, resource_code=resource_code, resource_id=resource.id, outcome="ACCEPTED", reason_code="CHALLENGE")
        await db.commit()
        return {"challenge": body["challenge"]}
    event_type_path = ingress.get("event_type_path", "event_type")
    event_id_path = ingress.get("event_id_path", "event_id")
    payload_path = ingress.get("payload_path", "")
    batch_id_path = ingress.get("batch_id_path", "batch_id")
    event_code_value = extract_payload_path(body, event_type_path)
    event_code = str(event_code_value or "")
    if not event_code:
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="EVENT_TYPE_MISSING", status_code=422, detail="Webhook event type is missing")
    event_payload = extract_payload_path(body, payload_path)
    if not isinstance(event_payload, dict):
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="EVENT_PAYLOAD_INVALID", status_code=422, detail="Webhook event payload must be an object")
    objects = list((await db.execute(select(UcpResourceDataObject).where(UcpResourceDataObject.resource_id == resource.id, UcpResourceDataObject.object_type == "EVENT_TYPE", UcpResourceDataObject.is_active == 1, UcpResourceDataObject.verification_status == "VERIFIED"))).scalars())
    definitions = {definition.id: definition for definition in (await db.execute(select(UcpEventDefinition).where(UcpEventDefinition.id.in_([item.event_definition_id for item in objects])))).scalars()} if objects else {}
    obj = next((item for item in objects if definitions.get(item.event_definition_id) and definitions[item.event_definition_id].event_code == event_code), None)
    if obj is None:
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="EVENT_OBJECT_UNAVAILABLE", status_code=404, detail="No verified event object accepts this webhook event")
    event_id_value = extract_payload_path(body, event_id_path)
    external_event_id = str(event_id_value or "").strip()
    if not external_event_id:
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="EVENT_ID_MISSING", status_code=422, detail="Webhook event ID is missing")
    event_id = f"webhook:{resource.id}:{external_event_id}"
    payload_checksum = _payload_checksum(event_payload)
    target_asset = await _warehouse_target_asset(
        db,
        SimpleNamespace(
            source="WEBHOOK",
            event_type=event_code,
            payload=event_payload,
            resource_id=resource.id,
            resource_object_id=obj.id,
            system_code=str(resource.system_id),
        ),
    )
    batch_id = ""
    records: list[dict] | None = None
    if target_asset is not None:
        batch_id = str(extract_payload_path(body, batch_id_path) or "").strip()
        candidate_records = event_payload.get("records")
        if not batch_id:
            await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="BATCH_ID_MISSING", status_code=422, detail="Webhook batch ID is missing")
        if not isinstance(candidate_records, list):
            await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="RECORDS_INVALID", status_code=422, detail="Webhook records must be an array")
        records = candidate_records
    nonce = request.headers.get(ingress.get("nonce_header", ""), "") if strategy == "HMAC_SHA256_TIMESTAMPED" else None
    target_asset = await _warehouse_target_asset(
        db,
        SimpleNamespace(
            resource_id=resource.id,
            resource_object_id=obj.id,
            system_code=str(resource.system_id),
            event_type=event_code,
            source="WEBHOOK",
            payload=event_payload,
        ),
    )
    batch_id = str(extract_payload_path(body, batch_id_path) or "").strip()
    records = event_payload.get("records") if target_asset is not None else None
    if target_asset is not None and not batch_id:
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="BATCH_ID_MISSING", status_code=422, detail="Webhook batch ID is missing")
    if target_asset is not None and not isinstance(records, list):
        await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="RECORDS_INVALID", status_code=422, detail="Webhook records must be an array")
    receipt_values = {
        "resource_id": resource.id,
        "nonce_hash": hashlib.sha256(nonce.encode("utf-8")).hexdigest() if nonce else None,
        "external_event_id_hash": hashlib.sha256(external_event_id.encode("utf-8")).hexdigest(),
        "expires_at": datetime.now(timezone.utc) + timedelta(seconds=int(ingress.get("max_timestamp_diff_seconds", 3600))),
    }
    receipt_result = await db.execute(
        pg_insert(UcpWebhookIngressReceipt).values(**receipt_values).on_conflict_do_nothing().returning(UcpWebhookIngressReceipt.id)
    )
    if receipt_result.scalar_one_or_none() is None:
        existing_batch = await get_ingest_batch_for_event(
            db, resource_id=resource.id, event_id=event_id
        )
        if existing_batch is not None and existing_batch.payload_checksum != payload_checksum:
            await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="INGEST_BATCH_CONFLICT", status_code=409, detail="同一请求标识的数据摘要不一致")
        await _record_ingress_attempt(db, resource_code=resource_code, resource_id=resource.id, outcome="DEDUPLICATED", event_id=external_event_id)
        await db.commit()
        return _webhook_response(
            external_event_id,
            status=existing_batch.status if existing_batch is not None else "RECEIVED",
            trace_id=existing_batch.trace_id if existing_batch is not None else None,
            deduplicated=True,
        )
    try:
        event = await receive_event(
            db,
            event_id=event_id,
            external_event_id=external_event_id,
            event_type=event_code,
            source="WEBHOOK",
            payload=event_payload,
            metadata={"resource_code": resource.resource_code},
            is_dedup=True,
            resource_id=resource.id,
            system_code=str(resource.system_id),
            resource_object_id=obj.id,
            event_definition_id=obj.event_definition_id,
        )
    except DuplicateEventError:
        existing_batch = await get_ingest_batch_for_event(
            db, resource_id=resource.id, event_id=event_id
        )
        if existing_batch is not None and existing_batch.payload_checksum != payload_checksum:
            await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="INGEST_BATCH_CONFLICT", status_code=409, detail="同一请求标识的数据摘要不一致")
        await _record_ingress_attempt(db, resource_code=resource_code, resource_id=resource.id, outcome="DEDUPLICATED", event_id=external_event_id)
        await db.commit()
        return _webhook_response(
            external_event_id,
            status=existing_batch.status if existing_batch is not None else "RECEIVED",
            trace_id=existing_batch.trace_id if existing_batch is not None else None,
            deduplicated=True,
        )

    if target_asset is not None:
        checksum = payload_checksum
        try:
            batch, created = await reserve_ingest_batch(
                db,
                resource_id=resource.id,
                target_asset=target_asset,
                event_id=event_id,
                batch_id=batch_id,
                period_value=None,
                payload_checksum=checksum,
                received_rows=len(records),
                trace_id=event.trace_id,
            )
        except IngestBatchConflictError as exc:
            await _reject_webhook(db, resource_code=resource_code, resource_id=resource.id, reason_code="INGEST_BATCH_CONFLICT", status_code=409, detail=str(exc))
        if not created:
            await _record_ingress_attempt(db, resource_code=resource_code, resource_id=resource.id, outcome="DEDUPLICATED", event_id=event_id)
            await db.commit()
            return _webhook_response(
                external_event_id,
                status=batch.status,
                trace_id=batch.trace_id,
                deduplicated=True,
            )
        metadata = dict(event.metadata_ or {})
        metadata["warehouse_ingest"] = {
            "batch_id": batch.batch_id,
            "payload_checksum": batch.payload_checksum,
            "received_rows": batch.received_rows,
            "target_asset": batch.target_asset,
        }
        event.metadata_ = metadata
    await process_event_pipeline(db, event)
    await _record_ingress_attempt(db, resource_code=resource_code, resource_id=resource.id, outcome="ACCEPTED", event_id=event.event_id)
    await db.commit()
    from app.ucp.event_bus import start_pending_event_deliveries
    await start_pending_event_deliveries(event.id)
    return _webhook_response(
        external_event_id,
        status="RECEIVED",
        trace_id=event.trace_id,
    )
