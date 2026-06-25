from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai_formula.field_refs import dataset_field_meta, display_to_internal, internal_to_display
from app.ai_formula.validator import validate_dataset_formula
from app.codegen.rules import normalize_code
from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.datasets.models import DataSet, DatasetCalculatedField
from app.datasets.router import _can_access
from app.users.models import User


router = APIRouter(prefix="/datasets", tags=["datasets"])


class CalculatedFieldIn(BaseModel):
    code: str | None = Field(default=None, max_length=64)
    label: str = Field(min_length=1, max_length=128)
    description: str | None = None
    formula: str = Field(min_length=1)
    formula_display: str | None = None
    data_type: str = "number"
    agg_role: str = Field(default="measure", pattern="^(dimension|measure)$")
    is_sensitive: bool = False
    is_active: bool = True


class CalculatedFieldOut(BaseModel):
    id: int
    dataset_id: int
    code: str
    label: str
    description: str | None
    formula: str
    formula_display: str | None
    data_type: str
    agg_role: str
    depends_on: list[str]
    used_functions: list[str]
    is_sensitive: bool
    is_active: bool
    created_by: int | None
    created_at: datetime
    updated_at: datetime


def calc_qual(code: str) -> str:
    return f"calc.{code}"


def _out(row: DatasetCalculatedField) -> CalculatedFieldOut:
    return CalculatedFieldOut(
        id=row.id,
        dataset_id=row.dataset_id,
        code=row.code,
        label=row.label,
        description=row.description,
        formula=row.formula,
        formula_display=row.formula_display,
        data_type=row.data_type,
        agg_role=row.agg_role,
        depends_on=list(row.depends_on or []),
        used_functions=list(row.used_functions or []),
        is_sensitive=row.is_sensitive,
        is_active=row.is_active,
        created_by=row.created_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


async def active_calculated_fields(dataset_id: int, db: AsyncSession) -> list[DatasetCalculatedField]:
    return (
        await db.execute(
            select(DatasetCalculatedField)
            .where(
                DatasetCalculatedField.dataset_id == dataset_id,
                DatasetCalculatedField.is_active.is_(True),
            )
            .order_by(DatasetCalculatedField.id)
        )
    ).scalars().all()


async def _ensure_dataset_access(dataset_id: int, user: User, db: AsyncSession) -> DataSet:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据集不存在")
    if not await _can_access(user, ds, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该数据集")
    return ds


async def _normalize_payload(dataset_id: int, payload: CalculatedFieldIn, db: AsyncSession) -> dict[str, Any]:
    _, fields = await dataset_field_meta(dataset_id, db)
    formula = display_to_internal(payload.formula, fields)
    validation = await validate_dataset_formula(dataset_id, formula, db)
    if not validation["valid"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="；".join(validation["errors"]))
    return {
        "formula": validation["formula"],
        "formula_display": internal_to_display(validation["formula"], fields),
        "depends_on": validation["depends_on"],
        "used_functions": validation["used_functions"],
        "is_sensitive": bool(payload.is_sensitive),
    }


@router.get("/{ds_id}/calculated-fields", response_model=list[CalculatedFieldOut])
async def list_calculated_fields(
    ds_id: int,
    active_only: bool = True,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[CalculatedFieldOut]:
    await _ensure_dataset_access(ds_id, user, db)
    stmt = (
        select(DatasetCalculatedField)
        .where(DatasetCalculatedField.dataset_id == ds_id)
        .order_by(DatasetCalculatedField.id)
    )
    if active_only:
        stmt = stmt.where(DatasetCalculatedField.is_active.is_(True))
    rows = (await db.execute(stmt)).scalars().all()
    return [_out(row) for row in rows]


@router.post(
    "/{ds_id}/calculated-fields",
    response_model=CalculatedFieldOut,
    dependencies=[Depends(require_op("datasource.datasets", "C"))],
)
async def create_calculated_field(
    ds_id: int,
    payload: CalculatedFieldIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> CalculatedFieldOut:
    await _ensure_dataset_access(ds_id, user, db)
    code = normalize_code(payload.code or payload.label)
    if not code:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="字段编码不能为空")
    exists = (
        await db.execute(
            select(DatasetCalculatedField).where(
                DatasetCalculatedField.dataset_id == ds_id,
                DatasetCalculatedField.code == code,
            )
        )
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="计算字段编码已存在")
    normalized = await _normalize_payload(ds_id, payload, db)
    row = DatasetCalculatedField(
        dataset_id=ds_id,
        code=code,
        label=payload.label,
        description=payload.description,
        data_type=payload.data_type,
        agg_role=payload.agg_role,
        is_active=payload.is_active,
        created_by=user.id,
        **normalized,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _out(row)


@router.put(
    "/{ds_id}/calculated-fields/{field_id}",
    response_model=CalculatedFieldOut,
    dependencies=[Depends(require_op("datasource.datasets", "U"))],
)
async def update_calculated_field(
    ds_id: int,
    field_id: int,
    payload: CalculatedFieldIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> CalculatedFieldOut:
    await _ensure_dataset_access(ds_id, user, db)
    row = await db.get(DatasetCalculatedField, field_id)
    if row is None or row.dataset_id != ds_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="计算字段不存在")
    normalized = await _normalize_payload(ds_id, payload, db)
    row.label = payload.label
    row.description = payload.description
    row.data_type = payload.data_type
    row.agg_role = payload.agg_role
    row.is_active = payload.is_active
    row.formula = normalized["formula"]
    row.formula_display = normalized["formula_display"]
    row.depends_on = normalized["depends_on"]
    row.used_functions = normalized["used_functions"]
    row.is_sensitive = normalized["is_sensitive"]
    await db.commit()
    await db.refresh(row)
    return _out(row)


@router.delete(
    "/{ds_id}/calculated-fields/{field_id}",
    dependencies=[Depends(require_op("datasource.datasets", "D"))],
)
async def delete_calculated_field(
    ds_id: int,
    field_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    await _ensure_dataset_access(ds_id, user, db)
    row = await db.get(DatasetCalculatedField, field_id)
    if row is None or row.dataset_id != ds_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="计算字段不存在")

    reasons = await _calc_field_reference_reasons(ds_id, row, db)
    if reasons:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"计算字段「{row.label or row.code}」正被以下使用，无法删除，请先移除引用："
            + "；".join(reasons),
        )

    row.is_active = False
    await db.commit()
    return {"ok": True}


async def _calc_field_reference_reasons(
    ds_id: int,
    field: DatasetCalculatedField,
    db: AsyncSession,
) -> list[str]:
    """检查计算字段是否仍被报表 / 成本分摊方案 / 其它计算字段引用。"""
    from app.data.columns_router import _json_refs_column

    qual = calc_qual(field.code)
    quals = {qual}
    reasons: list[str] = []

    from app.reports.models import Report

    reports = (
        await db.execute(select(Report).where(Report.dataset_id == ds_id))
    ).scalars().all()
    for report in reports:
        if _json_refs_column(report.config or {}, qual, quals):
            reasons.append(f"报表「{report.name}」")

    from app.allocation.models import AllocationScheme

    schemes = (
        await db.execute(select(AllocationScheme).where(AllocationScheme.dataset_id == ds_id))
    ).scalars().all()
    for scheme in schemes:
        if _json_refs_column(scheme.config or {}, qual, quals):
            reasons.append(f"成本分摊方案「{scheme.name}」")

    other_fields = (
        await db.execute(
            select(DatasetCalculatedField).where(
                DatasetCalculatedField.dataset_id == ds_id,
                DatasetCalculatedField.is_active.is_(True),
                DatasetCalculatedField.id != field.id,
            )
        )
    ).scalars().all()
    for cf in other_fields:
        if _json_refs_column(cf.depends_on or [], qual, quals):
            reasons.append(f"计算字段「{cf.label or cf.code}」")

    return reasons
