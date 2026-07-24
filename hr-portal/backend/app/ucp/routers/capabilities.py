"""Business-facing standard SaaS capability discovery endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.db import get_session
from app.core.deps import require_op
from app.ucp.capability_discovery import (
    list_capability_test_runs,
    list_standard_packages,
    list_system_capabilities,
    set_system_capability,
    test_system_capability,
)
from app.ucp.models import UcpSystemCapability, UcpOperationDefinition, UcpSystem

router = APIRouter()


@router.get("/capabilities/catalog")
async def route_verified_capability_catalog(
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "V")),
):
    rows = (await db.execute(
        select(UcpSystemCapability, UcpOperationDefinition, UcpSystem)
        .join(UcpOperationDefinition, UcpOperationDefinition.id == UcpSystemCapability.operation_id)
        .join(UcpSystem, UcpSystem.id == UcpSystemCapability.system_id)
        .where(UcpSystemCapability.enabled.is_(True), UcpSystemCapability.verification_status == "VERIFIED")
        .order_by(UcpSystem.system_name, UcpOperationDefinition.object_code, UcpOperationDefinition.operation_name)
    )).all()
    return {"items": [{"capability_id": capability.id, "system_id": system.id, "system_name": system.system_name, "object_code": operation.object_code, "operation_name": operation.operation_name, "operation_id": operation.id, "output_schema": operation.output_schema or {}} for capability, operation, system in rows]}


@router.get("/standard-packages")
async def route_list_standard_packages(
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "V")),
):
    return {"items": await list_standard_packages(db)}


@router.get("/systems/{system_id}/capabilities")
async def route_list_system_capabilities(
    system_id: int,
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "V")),
):
    items = await list_system_capabilities(db, system_id)
    if items is None:
        raise HTTPException(404, "系统不存在")
    return {"items": items}


@router.put("/systems/{system_id}/capabilities/{operation_id}")
async def route_set_system_capability(
    system_id: int,
    operation_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "U")),
):
    try:
        item = await set_system_capability(
            db,
            system_id=system_id,
            operation_id=operation_id,
            credential_id=payload.get("credential_id"),
            enabled=bool(payload.get("enabled", False)),
        )
    except ValueError as error:
        raise HTTPException(404, str(error)) from error
    if item is None:
        raise HTTPException(404, "系统不存在")
    return item


@router.post("/systems/{system_id}/capabilities/{operation_id}/test")
async def route_test_system_capability(
    system_id: int,
    operation_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "U")),
):
    try:
        return await test_system_capability(db, system_id=system_id, operation_id=operation_id, parameters=payload.get("parameters") or {})
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


@router.get("/systems/{system_id}/capabilities/{operation_id}/test-runs")
async def route_list_capability_test_runs(
    system_id: int,
    operation_id: int,
    limit: int = 20,
    db: AsyncSession = Depends(get_session),
    _user=Depends(require_op("ucp.systems", "V")),
):
    items = await list_capability_test_runs(
        db,
        system_id=system_id,
        operation_id=operation_id,
        limit=limit,
    )
    if items is None:
        raise HTTPException(404, "业务能力尚未启用")
    return {"items": items}
