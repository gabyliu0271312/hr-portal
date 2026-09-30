"""Performance metric field management."""
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, require_performance_permission
from app.performance.models import PerformanceAuditEvent, PerformanceMetricField, PerformanceMetricType

router = APIRouter(prefix="/performance/metric-fields", tags=["performance-metric-fields"])


class MetricFieldCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=128)
    field_type: Literal["text", "number", "percentage"] = "text"


class MetricFieldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_id: int
    name: str
    field_type: Literal["text", "number", "percentage", "person"]
    is_system: bool
    in_use: bool = False
    updated_by: str
    updated_at: datetime


class MetricFieldList(BaseModel):
    items: list[MetricFieldResponse]
    total: int
    offset: int
    limit: int


def _response(row, in_use=False):
    return MetricFieldResponse.model_validate(row).model_copy(update={"in_use": in_use})


async def _in_use(db, field_id):
    return bool((await db.execute(select(select(PerformanceMetricType.id).where(
        PerformanceMetricType.field_ids.contains([field_id])
    ).exists()))).scalar_one())


async def _get_field(db, field_id, lock=False):
    query = select(PerformanceMetricField).where(PerformanceMetricField.id == field_id)
    if lock:
        query = query.with_for_update()
    row = (await db.execute(query)).scalar_one_or_none()
    if row is None:
        raise HTTPException(404, detail={"code": "PERFORMANCE_METRIC_FIELD_NOT_FOUND", "message": "指标字段不存在"})
    return row


def _require_custom(row):
    if row.is_system:
        raise HTTPException(403, detail={"code": "PERFORMANCE_METRIC_FIELD_SYSTEM_PROTECTED", "message": "系统预置字段，不允许修改或删除"})


def _audit(db, context, event_type, row, before=None, after=None):
    db.add(PerformanceAuditEvent(
        event_type=event_type, actor_type=context.subject_type, actor_ref=str(context.subject_id),
        subject_type="PERFORMANCE_METRIC_FIELD", subject_ref=str(row.id),
        before_state=before or {}, after_state=after or {},
    ))


async def _duplicate_or_raise(db, exc):
    await db.rollback()
    if "uq_performance_metric_fields_name" not in str(exc.orig):
        raise exc
    raise HTTPException(409, detail={"code": "PERFORMANCE_METRIC_FIELD_NAME_DUPLICATE", "message": "该字段名称已存在，请重新输入"}) from exc


@router.get("", response_model=MetricFieldList)
async def list_metric_fields(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    keyword: str = Query(default="", max_length=128),
    _: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
):
    filters = []
    if keyword.strip():
        filters.append(PerformanceMetricField.name.icontains(keyword.strip(), autoescape=True))
    total = (await db.execute(select(func.count()).select_from(PerformanceMetricField).where(*filters))).scalar_one()
    usage = select(PerformanceMetricType.id).where(
        PerformanceMetricType.field_ids.contains(func.jsonb_build_array(PerformanceMetricField.id))
    ).exists()
    result = (await db.execute(select(PerformanceMetricField, usage).where(*filters)
                              .order_by(PerformanceMetricField.display_id.asc()).offset(offset).limit(limit))).all()
    return MetricFieldList(items=[_response(row, used) for row, used in result], total=total, offset=offset, limit=limit)


@router.get("/{field_id}", response_model=MetricFieldResponse)
async def get_metric_field(
    field_id: Annotated[int, Path(gt=0)],
    _: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
):
    row = await _get_field(db, field_id)
    return _response(row, await _in_use(db, field_id))


@router.post("", response_model=MetricFieldResponse, status_code=status.HTTP_201_CREATED)
async def create_metric_field(
    payload: MetricFieldCreate,
    context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
):
    row = PerformanceMetricField(name=payload.name, field_type=payload.field_type, is_system=False,
                                 created_by_type=context.subject_type, created_by_ref=str(context.subject_id), updated_by=context.display_name)
    db.add(row)
    try:
        await db.flush()
        await db.refresh(row)
        response = _response(row)
        _audit(db, context, "PERFORMANCE_METRIC_FIELD_CREATED", row, after=response.model_dump(mode="json"))
        await db.commit()
    except IntegrityError as exc:
        await _duplicate_or_raise(db, exc)
    return response


@router.patch("/{field_id}", response_model=MetricFieldResponse)
async def update_metric_field(
    field_id: Annotated[int, Path(gt=0)],
    payload: MetricFieldCreate,
    context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
):
    row = await _get_field(db, field_id, lock=True)
    _require_custom(row)
    used = await _in_use(db, field_id)
    if used and row.field_type != payload.field_type:
        raise HTTPException(409, detail={"code": "PERFORMANCE_METRIC_FIELD_IN_USE", "message": "该字段已被指标类型使用，不允许修改类型"})
    before = _response(row, used).model_dump(mode="json")
    row.name, row.field_type, row.updated_by = payload.name, payload.field_type, context.display_name
    try:
        await db.flush()
        await db.refresh(row)
        response = _response(row, used)
        _audit(db, context, "PERFORMANCE_METRIC_FIELD_UPDATED", row, before, response.model_dump(mode="json"))
        await db.commit()
    except IntegrityError as exc:
        await _duplicate_or_raise(db, exc)
    return response


@router.delete("/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_metric_field(
    field_id: Annotated[int, Path(gt=0)],
    context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
):
    row = await _get_field(db, field_id, lock=True)
    _require_custom(row)
    if await _in_use(db, field_id):
        raise HTTPException(409, detail={"code": "PERFORMANCE_METRIC_FIELD_IN_USE", "message": "该字段已被指标类型使用，不允许删除"})
    before = _response(row).model_dump(mode="json")
    _audit(db, context, "PERFORMANCE_METRIC_FIELD_DELETED", row, before, {"deleted": True, "display_id": row.display_id})
    await db.delete(row)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
