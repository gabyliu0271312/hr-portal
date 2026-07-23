"""Lifecycle rule and job management APIs."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.users.models import User
from app.ucp.account_lifecycle_service import (
    LifecycleError,
    create_rule,
    dry_run_rule,
    list_jobs,
    list_rules,
    retry_job,
    set_rule_status,
    update_rule,
)

router = APIRouter(tags=["ucp-account-lifecycle"])


def _http_error(exc: LifecycleError) -> HTTPException:
    code = status.HTTP_404_NOT_FOUND if exc.code.endswith("NOT_FOUND") else status.HTTP_409_CONFLICT if exc.code in {"RULE_CODE_EXISTS", "JOB_NOT_RETRYABLE"} else status.HTTP_422_UNPROCESSABLE_ENTITY
    return HTTPException(code, detail={"code": exc.code, "message": exc.message})


@router.get("/account-lifecycle-rules", dependencies=[Depends(require_op("ucp.external_accounts", "V"))])
async def get_rules(
    status_value: int | None = Query(None, alias="status"),
    source_system_code: str | None = None,
    target_system_code: str | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    items = await list_rules(db, status=status_value, source_system_code=source_system_code, target_system_code=target_system_code)
    return {"total": len(items), "items": items}


@router.post("/account-lifecycle-rules", status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_op("ucp.external_accounts", "C"))])
async def post_rule(payload: dict, db: AsyncSession = Depends(get_session), user: User = Depends(current_user)) -> dict:
    try:
        return await create_rule(db, payload, operator=str(user.id))
    except LifecycleError as exc:
        raise _http_error(exc) from exc


@router.get("/account-lifecycle-rules/{rule_code}", dependencies=[Depends(require_op("ucp.external_accounts", "V"))])
async def get_rule(rule_code: str, db: AsyncSession = Depends(get_session), _user: User = Depends(current_user)) -> dict:
    items = await list_rules(db)
    for item in items:
        if item["rule_code"] == rule_code:
            return item
    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Lifecycle rule not found")


@router.put("/account-lifecycle-rules/{rule_code}", dependencies=[Depends(require_op("ucp.external_accounts", "U"))])
async def put_rule(rule_code: str, payload: dict, db: AsyncSession = Depends(get_session), user: User = Depends(current_user)) -> dict:
    try:
        return await update_rule(db, rule_code, payload, operator=str(user.id))
    except LifecycleError as exc:
        raise _http_error(exc) from exc


@router.post("/account-lifecycle-rules/{rule_code}/enable", dependencies=[Depends(require_op("ucp.external_accounts", "U"))])
async def enable_rule(rule_code: str, db: AsyncSession = Depends(get_session), user: User = Depends(current_user)) -> dict:
    try:
        return await set_rule_status(db, rule_code, True, operator=str(user.id))
    except LifecycleError as exc:
        raise _http_error(exc) from exc


@router.post("/account-lifecycle-rules/{rule_code}/disable", dependencies=[Depends(require_op("ucp.external_accounts", "U"))])
async def disable_rule(rule_code: str, db: AsyncSession = Depends(get_session), user: User = Depends(current_user)) -> dict:
    try:
        return await set_rule_status(db, rule_code, False, operator=str(user.id))
    except LifecycleError as exc:
        raise _http_error(exc) from exc


@router.post("/account-lifecycle-rules/{rule_code}/dry-run", dependencies=[Depends(require_op("ucp.external_accounts", "V"))])
async def dry_run(rule_code: str, payload: dict, db: AsyncSession = Depends(get_session), _user: User = Depends(current_user)) -> dict:
    try:
        event_payload = payload.get("event") if isinstance(payload.get("event"), dict) else payload
        return await dry_run_rule(db, rule_code, event_payload)
    except LifecycleError as exc:
        raise _http_error(exc) from exc


@router.get("/account-lifecycle-jobs", dependencies=[Depends(require_op("ucp.external_accounts", "V"))])
async def get_jobs(
    status_value: str | None = Query(None, alias="status"),
    rule_code: str | None = None,
    db: AsyncSession = Depends(get_session),
    _user: User = Depends(current_user),
) -> dict:
    items = await list_jobs(db, status=status_value, rule_code=rule_code)
    return {"total": len(items), "items": items}


@router.post("/account-lifecycle-jobs/{job_code}/retry", dependencies=[Depends(require_op("ucp.external_accounts", "U"))])
async def post_retry(job_code: str, db: AsyncSession = Depends(get_session), _user: User = Depends(current_user)) -> dict:
    try:
        return await retry_job(db, job_code)
    except LifecycleError as exc:
        raise _http_error(exc) from exc


@router.get("/account-lifecycle-readiness", dependencies=[Depends(require_op("ucp.external_accounts", "V"))])
async def lifecycle_readiness(db: AsyncSession = Depends(get_session), _user: User = Depends(current_user)) -> dict:
    from sqlalchemy import select, func
    from app.ucp.models import UcpAccountLifecycleRule, UcpAccountLifecycleJob, UcpCredential, UcpSystemConfig
    checks = []
    resource = (await db.execute(select(UcpSystemConfig).where(UcpSystemConfig.system_code == "DIDI_ACCOUNT"))).scalar_one_or_none()
    checks.append({"key": "didi_resource", "ok": bool(resource and resource.adapter_code == "DIDI_ACCOUNT_PUSH_ADAPTER"), "message": "DIDI_ACCOUNT resource must use DIDI_ACCOUNT_PUSH_ADAPTER"})
    credential_ok = bool(resource and resource.credential_id and (await db.get(UcpCredential, resource.credential_id)) and (await db.get(UcpCredential, resource.credential_id)).is_active)
    checks.append({"key": "credential", "ok": credential_ok, "message": "An active production credential must be bound to DIDI_ACCOUNT"})
    endpoint_ok = bool(resource and isinstance(resource.protocol, dict) and (resource.protocol or {}).get("endpoints"))
    checks.append({"key": "endpoint_contract", "ok": endpoint_ok, "message": "Didi endpoint contract must be configured before real execution"})
    enabled = (await db.execute(select(func.count()).select_from(UcpAccountLifecycleRule).where(UcpAccountLifecycleRule.status == 1))).scalar_one()
    checks.append({"key": "gray_rule", "ok": enabled > 0, "message": "At least one enabled lifecycle rule is required for gray rollout", "count": enabled})
    failed = (await db.execute(select(func.count()).select_from(UcpAccountLifecycleJob).where(UcpAccountLifecycleJob.status == "FAILED"))).scalar_one()
    checks.append({"key": "failed_jobs", "ok": failed == 0, "message": "Failed lifecycle jobs must be cleared before rollout", "count": failed})
    return {"ready": all(item["ok"] for item in checks), "checks": checks}
