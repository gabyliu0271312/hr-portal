"""Performance metric type creation and listing."""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.performance.auth_context import PerformanceAccessContext, require_performance_permission
from app.performance.models import PerformanceAuditEvent, PerformanceMetricField, PerformanceMetricType

router = APIRouter(prefix="/performance/metric-types", tags=["performance-metric-types"])


class MetricTypePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=1, max_length=128)
    field_ids: list[int] = Field(min_length=1, max_length=100)

    @field_validator("field_ids")
    @classmethod
    def validate_field_ids(cls, value: list[int]) -> list[int]:
        if any(field_id <= 0 for field_id in value) or len(set(value)) != len(value):
            raise ValueError("field_ids must contain unique positive IDs")
        return value


class MetricTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    field_ids: list[int]
    fields: str
    updated_by: str
    updated_at: datetime


class MetricTypeList(BaseModel):
    items: list[MetricTypeResponse]
    total: int
    offset: int
    limit: int


async def _field_names(db: AsyncSession, field_ids: list[int]) -> str:
    if not field_ids:
        return ""
    rows = (await db.execute(select(PerformanceMetricField).where(PerformanceMetricField.id.in_(field_ids)))).scalars().all()
    names = {field.id: field.name for field in rows}
    return "、".join(names[field_id] for field_id in field_ids if field_id in names)


async def _validate_fields(db: AsyncSession, field_ids: list[int]) -> None:
    ids = (await db.execute(select(PerformanceMetricField.id)
                            .where(PerformanceMetricField.id.in_(field_ids))
                            .order_by(PerformanceMetricField.id)
                            .with_for_update(read=True, key_share=True))).scalars().all()
    if len(ids) != len(field_ids):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail={"code": "PERFORMANCE_METRIC_TYPE_FIELD_NOT_FOUND", "message": "指标类型包含不存在的指标字段"})


async def _response(db: AsyncSession, row: PerformanceMetricType) -> MetricTypeResponse:
    return MetricTypeResponse(
        id=row.id,
        name=row.name,
        field_ids=list(row.field_ids or []),
        fields=await _field_names(db, list(row.field_ids or [])),
        updated_by=row.updated_by,
        updated_at=row.updated_at,
    )


@router.get("", response_model=MetricTypeList)
async def list_metric_types(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=10, ge=1, le=100),
    keyword: str = Query(default="", max_length=128),
    _: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
):
    query = select(PerformanceMetricType)
    if keyword.strip():
        query = query.where(PerformanceMetricType.name.icontains(keyword.strip(), autoescape=True))
    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar_one()
    rows = (await db.execute(query.order_by(PerformanceMetricType.id.desc()).offset(offset).limit(limit))).scalars().all()
    return MetricTypeList(items=[await _response(db, row) for row in rows], total=total, offset=offset, limit=limit)


@router.post("", response_model=MetricTypeResponse, status_code=status.HTTP_201_CREATED)
async def create_metric_type(
    payload: MetricTypePayload,
    context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
):
    await _validate_fields(db, payload.field_ids)
    row = PerformanceMetricType(
        name=payload.name,
        field_ids=payload.field_ids,
        created_by_type=context.subject_type,
        created_by_ref=str(context.subject_id),
        updated_by=context.display_name,
    )
    db.add(row)
    try:
        await db.flush()
        response = await _response(db, row)
        db.add(PerformanceAuditEvent(
            event_type="PERFORMANCE_METRIC_TYPE_CREATED",
            actor_type=context.subject_type,
            actor_ref=str(context.subject_id),
            subject_type="PERFORMANCE_METRIC_TYPE",
            subject_ref=str(row.id),
            after_state=response.model_dump(mode="json"),
        ))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_performance_metric_types_name" not in str(exc.orig):
            raise
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "PERFORMANCE_METRIC_TYPE_NAME_DUPLICATE", "message": "该指标类型名称已存在，请重新输入"}) from exc
    return response


@router.patch("/{type_id}", response_model=MetricTypeResponse)
async def update_metric_type(
    payload: MetricTypePayload,
    type_id: Annotated[int, Path(gt=0)],
    context: PerformanceAccessContext = Depends(require_performance_permission("performance.configuration.manage")),
    db: AsyncSession = Depends(get_session),
):
    row = await db.get(PerformanceMetricType, type_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="指标类型不存在")
    await _validate_fields(db, payload.field_ids)
    before = {"id": row.id, "name": row.name, "field_ids": list(row.field_ids or [])}
    row.name = payload.name
    row.field_ids = payload.field_ids
    row.updated_by = context.display_name
    try:
        await db.flush()
        await db.refresh(row)
        response = await _response(db, row)
        db.add(PerformanceAuditEvent(
            event_type="PERFORMANCE_METRIC_TYPE_UPDATED",
            actor_type=context.subject_type,
            actor_ref=str(context.subject_id),
            subject_type="PERFORMANCE_METRIC_TYPE",
            subject_ref=str(row.id),
            before_state=before,
            after_state=response.model_dump(mode="json"),
        ))
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        if "uq_performance_metric_types_name" not in str(exc.orig):
            raise
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "PERFORMANCE_METRIC_TYPE_NAME_DUPLICATE", "message": "该指标类型名称已存在，请重新输入"}) from exc
    return response
