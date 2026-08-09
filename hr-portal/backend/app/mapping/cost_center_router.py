"""成本中心 Mapping 周期 API；页面只做薄包装，规则编辑仍使用公共 MappingWorkspace。"""
from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import require_op
from app.mapping.cost_center_service import CostCenterMappingService
from app.mapping.errors import MappingException

router = APIRouter(prefix="/cost-center-mappings", tags=["成本中心映射"])


class PeriodSnapshotRequest(BaseModel):
    model_config = {"extra": "forbid"}
    source_snapshot: dict[str, dict[str, Any]] = Field(default_factory=dict)
    actor: str | None = None


class CopyPeriodRequest(PeriodSnapshotRequest):
    expected_version: int = Field(..., ge=0)


class ExceptionRequest(BaseModel):
    model_config = {"extra": "forbid"}
    source_code: str = Field(..., min_length=1, max_length=128)
    target_code: str = Field(..., min_length=1, max_length=128)
    expected_version: int = Field(..., ge=0)
    attributes: dict[str, Any] = Field(default_factory=dict)
    actor: str | None = None


class ConfirmDiffRequest(BaseModel):
    model_config = {"extra": "forbid"}
    diff_id: int = Field(..., gt=0)
    expected_version: int = Field(..., ge=0)
    actor: str = Field(..., min_length=1, max_length=128)


class PublishPeriodRequest(BaseModel):
    model_config = {"extra": "forbid"}
    expected_version: int = Field(..., ge=0)
    actor: str | None = None


class RebuildResultRequest(BaseModel):
    model_config = {"extra": "forbid"}
    success: bool
    error: str | None = Field(None, max_length=500)


class NotificationResultRequest(BaseModel):
    model_config = {"extra": "forbid"}
    success: bool
    error: str | None = Field(None, max_length=500)


def _handle(exc: MappingException) -> HTTPException:
    return HTTPException(status_code=exc.http_status, detail=exc.to_dict())


@router.post("/{period}/initialize", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def initialize_period(period: str, payload: PeriodSnapshotRequest, db: AsyncSession = Depends(get_session)):
    try:
        result = await CostCenterMappingService(db).initialize_period(period=period, source_snapshot=payload.source_snapshot, actor=payload.actor or "system")
        await db.commit()
        return result
    except MappingException as exc:
        await db.rollback()
        raise _handle(exc) from exc


@router.post("/{period}/copy-previous", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def copy_previous_period(period: str, payload: CopyPeriodRequest, db: AsyncSession = Depends(get_session)):
    try:
        result = await CostCenterMappingService(db).copy_previous_period(period=period, expected_version=payload.expected_version, source_snapshot=payload.source_snapshot, actor=payload.actor or "system")
        await db.commit()
        return result
    except MappingException as exc:
        await db.rollback()
        raise _handle(exc) from exc


@router.get("/{period}", dependencies=[Depends(require_op("warehouse.modeling", "V"))])
async def get_period(period: str, db: AsyncSession = Depends(get_session)):
    try:
        return await CostCenterMappingService(db).get_period(period=period)
    except MappingException as exc:
        raise _handle(exc) from exc


@router.put("/{period}/exceptions", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def update_exception(period: str, payload: ExceptionRequest, db: AsyncSession = Depends(get_session)):
    try:
        result = await CostCenterMappingService(db).update_exception(period=period, source_code=payload.source_code, target_code=payload.target_code, expected_version=payload.expected_version, attributes=payload.attributes, actor=payload.actor or "system")
        await db.commit()
        return result
    except MappingException as exc:
        await db.rollback()
        raise _handle(exc) from exc


@router.post("/{period}/diffs/confirm", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def confirm_diff(period: str, payload: ConfirmDiffRequest, db: AsyncSession = Depends(get_session)):
    try:
        result = await CostCenterMappingService(db).confirm_diff(period=period, diff_id=payload.diff_id, expected_version=payload.expected_version, actor=payload.actor)
        await db.commit()
        return result
    except MappingException as exc:
        await db.rollback()
        raise _handle(exc) from exc


@router.post("/{period}/publish", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def publish_period(period: str, payload: PublishPeriodRequest, db: AsyncSession = Depends(get_session)):
    try:
        result = await CostCenterMappingService(db).publish_period(period=period, expected_version=payload.expected_version, actor=payload.actor or "system")
        await db.commit()
        return result
    except MappingException as exc:
        await db.rollback()
        raise _handle(exc) from exc


@router.get("/{period}/dwd-gate", dependencies=[Depends(require_op("warehouse.modeling", "V"))])
async def dwd_gate(period: str, db: AsyncSession = Depends(get_session)):
    try:
        return await CostCenterMappingService(db).ensure_dwd_allowed(period=period)
    except MappingException as exc:
        raise _handle(exc) from exc


@router.post("/{period}/rebuild-result", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def mark_rebuild_result(period: str, payload: RebuildResultRequest, db: AsyncSession = Depends(get_session)):
    try:
        result = await CostCenterMappingService(db).mark_rebuild_result(period=period, success=payload.success, error=payload.error)
        await db.commit()
        return result
    except MappingException as exc:
        await db.rollback()
        raise _handle(exc) from exc


@router.post("/{period}/notifications", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def ensure_notification(period: str, notification_key: str = Query(..., min_length=1, max_length=256), event_id: str | None = Query(None), db: AsyncSession = Depends(get_session)):
    try:
        result = await CostCenterMappingService(db).ensure_notification(period=period, notification_key=notification_key, event_id=event_id)
        await db.commit()
        return result
    except MappingException as exc:
        await db.rollback()
        raise _handle(exc) from exc


@router.post("/{period}/notifications/{notification_id}/result", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def mark_notification_result(period: str, notification_id: int, payload: NotificationResultRequest, db: AsyncSession = Depends(get_session)):
    try:
        service = CostCenterMappingService(db)
        result = (
            await service.mark_notification_sent(period=period, notification_id=notification_id)
            if payload.success
            else await service.mark_notification_failed(period=period, notification_id=notification_id, error=payload.error or "cost_center_notification_failed")
        )
        await db.commit()
        return result
    except MappingException as exc:
        await db.rollback()
        raise _handle(exc) from exc


@router.post("/{period}/notifications/{notification_id}/retry", dependencies=[Depends(require_op("warehouse.modeling", "U"))])
async def retry_notification(period: str, notification_id: int, db: AsyncSession = Depends(get_session)):
    try:
        result = await CostCenterMappingService(db).retry_notification(period=period, notification_id=notification_id)
        await db.commit()
        return result
    except MappingException as exc:
        await db.rollback()
        raise _handle(exc) from exc
