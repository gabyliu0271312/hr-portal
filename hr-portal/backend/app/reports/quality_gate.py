"""Report quality gate that only reads persisted quality state."""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import RegisteredTable
from app.datasets.models import DataSetTable
from app.warehouse.models import WarehouseQualityRule, WarehouseQualityStatus


def _filter_value(filters: Iterable[Any], field: str) -> str | None:
    for raw in filters:
        item = raw.model_dump() if hasattr(raw, "model_dump") else raw
        if not isinstance(item, dict) or item.get("column") != field:
            continue
        if str(item.get("op") or "eq").lower() not in {"eq", "is", "="}:
            continue
        value = item.get("value")
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, list) and len(value) == 1 and str(value[0]).strip():
            return str(value[0]).strip()
    return None


async def _governed_period_fields(db: AsyncSession, dataset_id: int) -> tuple[bool, set[str]]:
    rules = (await db.execute(select(WarehouseQualityRule).where(
        WarehouseQualityRule.enabled.is_(True),
        WarehouseQualityRule.rule_type == "relation_cardinality",
    ))).scalars().all()
    governed = any(int((rule.rule_config or {}).get("dataset_id") or 0) == dataset_id for rule in rules)
    if not governed:
        return False, set()

    rows = (await db.execute(
        select(DataSetTable.alias, RegisteredTable.period_col)
        .join(RegisteredTable, RegisteredTable.table_name == DataSetTable.table_name)
        .where(DataSetTable.dataset_id == dataset_id, RegisteredTable.is_period.is_(True))
    )).all()
    return True, {f"{alias}.{period_col}" for alias, period_col in rows}


async def resolve_report_quality_period(
    db: AsyncSession,
    *,
    dataset_id: int,
    config: Any,
    filters: Iterable[Any],
    explicit_period: str | None = None,
) -> tuple[bool, str | None]:
    """Return whether the report is governed and its validated quality period."""
    governed, candidates = await _governed_period_fields(db, dataset_id)
    if not governed:
        return False, None

    configured_field = getattr(config, "quality_period_field", None)
    if configured_field:
        if configured_field not in candidates:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="报表质量期间字段未绑定到当前数据集的已登记期间字段",
            )
        period_field = configured_field
    elif len(candidates) == 1:
        period_field = next(iter(candidates))
    else:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="受质量治理的报表必须配置 quality_period_field，或数据集只能包含一个期间字段",
        )

    period = explicit_period.strip() if isinstance(explicit_period, str) else None
    period = period or _filter_value(filters, period_field)
    if not period:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"报表运行必须通过期间字段 {period_field} 指定检查期间",
        )
    if not period.isdigit() or len(period) != 6:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="质量检查期间必须为 YYYYMM")
    return True, period


async def validate_report_quality_period_field(
    db: AsyncSession,
    *,
    dataset_id: int,
    config: Any,
) -> None:
    """Validate an explicitly configured period field when the dataset is governed."""
    configured_field = getattr(config, "quality_period_field", None)
    if not configured_field:
        return
    governed, candidates = await _governed_period_fields(db, dataset_id)
    if governed and configured_field not in candidates:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid quality period field for the governed dataset",
        )


async def enforce_report_quality(
    db: AsyncSession,
    *,
    report_id: int,
    dataset_id: int,
    config: Any,
    filters: Iterable[Any],
    explicit_period: str | None = None,
) -> None:
    """Fail closed for governed reports when quality period/state is unavailable."""
    try:
        governed, period = await resolve_report_quality_period(
            db,
            dataset_id=dataset_id,
            config=config,
            filters=filters,
            explicit_period=explicit_period,
        )
        if not governed:
            return
        item = (await db.execute(select(WarehouseQualityStatus).where(
            WarehouseQualityStatus.asset_type == "report",
            WarehouseQualityStatus.asset_id == report_id,
            WarehouseQualityStatus.period == period,
        ))).scalar_one_or_none()
    except HTTPException:
        raise
    except SQLAlchemyError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="数据质量状态暂不可用，已阻止报表运行",
        ) from exc

    if item is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="当前期间尚无数据质量结果，已阻止报表运行")
    if item.status == "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="当前期间正在进行数据质量校验，已阻止报表运行")
    if item.status == "failed" and item.severity == "block":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="当前期间数据质量检查未通过，暂不允许运行或导出")
