"""成本分摊方案路由

GET    /allocation/schemes              方案列表
POST   /allocation/schemes              新建方案
GET    /allocation/schemes/{id}         方案详情
PUT    /allocation/schemes/{id}         更新方案
DELETE /allocation/schemes/{id}         删除方案
POST   /allocation/schemes/{id}/run     执行存档（选月份）
GET    /allocation/schemes/{id}/runs    执行历史
GET    /allocation/result-tables        可选结果表列表
"""
from __future__ import annotations

from datetime import datetime, UTC
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.allocation.models import AllocationScheme, AllocationRun
from app.datasources.sync_service import PERIOD_TABLES, _dynamic_upsert
from app.reports.router import ReportConfig
from app.users.models import User

router = APIRouter(prefix="/allocation", tags=["allocation"])

# 可选结果表：从 PERIOD_TABLES 里取，排除纯源端表（只保留结果类）
RESULT_TABLE_LABELS = {
    "emp_monthly_cost_result": "员工月度成本分摊结果",
}


def _strip_archive_prefix(key: str) -> str:
    return key.split(".", 1)[1] if "." in key else key


def _archive_label_map(columns_meta: list[dict[str, Any]]) -> dict[str, str]:
    labels: dict[str, str] = {}
    for col in columns_meta:
        code = str(col.get("code") or "")
        label = str(col.get("label") or "")
        if not code or not label:
            continue
        labels.setdefault(code, label)
        labels.setdefault(_strip_archive_prefix(code), label)
    return labels


# ===== Schemas =====

class SchemeIn(BaseModel):
    name: str
    description: str | None = None
    table_name: str = ""
    dataset_id: int
    result_table: str = "emp_monthly_cost_result"
    config: dict = {}
    is_active: bool = True


class SchemeOut(BaseModel):
    id: int
    name: str
    description: str | None
    table_name: str
    dataset_id: int | None
    dataset_name: str | None
    result_table: str
    result_table_label: str
    config: dict
    is_active: bool
    created_by: int | None
    created_at: str
    updated_at: str
    last_run: dict | None  # 最近一次执行摘要


class RunIn(BaseModel):
    extra_filters: list[dict] = []  # 计算页面额外填写的筛选，同列名时覆盖方案配置


class RunOut(BaseModel):
    id: int
    scheme_id: int
    period_ym: str
    status: str
    rows_written: int
    error_message: str | None
    triggered_by: int | None
    started_at: str
    finished_at: str | None
    warnings: list[str] = []


class ResultTableItem(BaseModel):
    table_name: str
    label: str


# ===== helpers =====

async def _scheme_out(s: AllocationScheme, db: AsyncSession) -> SchemeOut:
    dataset_name: str | None = None
    if s.dataset_id:
        from app.datasets.models import DataSet
        ds = await db.get(DataSet, s.dataset_id)
        dataset_name = ds.name if ds else None

    last_run_row = (
        await db.execute(
            select(AllocationRun)
            .where(AllocationRun.scheme_id == s.id)
            .order_by(desc(AllocationRun.started_at))
            .limit(1)
        )
    ).scalar_one_or_none()

    last_run = None
    if last_run_row:
        last_run = {
            "period_ym": last_run_row.period_ym,
            "status": last_run_row.status,
            "rows_written": last_run_row.rows_written,
            "started_at": last_run_row.started_at.isoformat(),
        }

    return SchemeOut(
        id=s.id,
        name=s.name,
        description=s.description,
        table_name=s.table_name,
        dataset_id=s.dataset_id,
        dataset_name=dataset_name,
        result_table=s.result_table,
        result_table_label=RESULT_TABLE_LABELS.get(s.result_table, s.result_table),
        config=s.config or {},
        is_active=s.is_active,
        created_by=s.created_by,
        created_at=s.created_at.isoformat(),
        updated_at=s.updated_at.isoformat(),
        last_run=last_run,
    )


def _run_out(r: AllocationRun, warnings: list[str] | None = None) -> RunOut:
    return RunOut(
        id=r.id,
        scheme_id=r.scheme_id,
        period_ym=r.period_ym,
        status=r.status,
        rows_written=r.rows_written,
        error_message=r.error_message,
        triggered_by=r.triggered_by,
        started_at=r.started_at.isoformat(),
        finished_at=r.finished_at.isoformat() if r.finished_at else None,
        warnings=warnings or [],
    )


def _merge_filters_for_run(cfg: ReportConfig, extra_filters: list[dict]) -> ReportConfig:
    """Merge runtime allocation filters while preserving saved report config."""
    base_filters = [f.model_dump() for f in cfg.filters]
    extra_by_col = {f["column"]: f for f in extra_filters if f.get("column")}
    merged_filters = [
        extra_by_col.pop(f["column"], f) for f in base_filters
    ] + list(extra_by_col.values())

    data = cfg.model_dump()
    data["filters"] = merged_filters
    return ReportConfig(**data)


# ===== 结果表列表 =====

@router.get("/result-tables", response_model=list[ResultTableItem])
async def list_result_tables(_: User = Depends(current_user)) -> list[ResultTableItem]:
    return [
        ResultTableItem(table_name=k, label=v)
        for k, v in RESULT_TABLE_LABELS.items()
    ]


# ===== 方案 CRUD =====

@router.get("/schemes", response_model=list[SchemeOut])
async def list_schemes(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[SchemeOut]:
    rows = (
        await db.execute(
            select(AllocationScheme).order_by(desc(AllocationScheme.updated_at))
        )
    ).scalars().all()
    return [await _scheme_out(s, db) for s in rows]


@router.post(
    "/schemes",
    response_model=SchemeOut,
    dependencies=[Depends(require_op("tools.cost_allocation", "C"))],
)
async def create_scheme(
    payload: SchemeIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> SchemeOut:
    _validate_source(payload)
    s = AllocationScheme(
        name=payload.name,
        description=payload.description,
        table_name="",
        dataset_id=payload.dataset_id,
        result_table=payload.result_table,
        config=payload.config,
        is_active=payload.is_active,
        created_by=user.id,
    )
    db.add(s)
    await db.commit()
    await db.refresh(s)
    return await _scheme_out(s, db)


@router.get("/schemes/{scheme_id}", response_model=SchemeOut)
async def get_scheme(
    scheme_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> SchemeOut:
    s = await db.get(AllocationScheme, scheme_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="方案不存在")
    return await _scheme_out(s, db)


@router.put(
    "/schemes/{scheme_id}",
    response_model=SchemeOut,
    dependencies=[Depends(require_op("tools.cost_allocation", "U"))],
)
async def update_scheme(
    scheme_id: int,
    payload: SchemeIn,
    db: AsyncSession = Depends(get_session),
) -> SchemeOut:
    s = await db.get(AllocationScheme, scheme_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="方案不存在")
    _validate_source(payload)
    s.name = payload.name
    s.description = payload.description
    s.table_name = ""
    s.dataset_id = payload.dataset_id
    s.result_table = payload.result_table
    s.config = payload.config
    s.is_active = payload.is_active
    await db.commit()
    await db.refresh(s)
    return await _scheme_out(s, db)


@router.delete(
    "/schemes/{scheme_id}",
    dependencies=[Depends(require_op("tools.cost_allocation", "D"))],
)
async def delete_scheme(
    scheme_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    s = await db.get(AllocationScheme, scheme_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="方案不存在")
    await db.delete(s)
    await db.commit()
    return {"ok": True}


# ===== 执行存档 =====

@router.post(
    "/schemes/{scheme_id}/run",
    response_model=RunOut,
    dependencies=[Depends(require_op("tools.cost_allocation", "C"))],
)
async def run_scheme(
    scheme_id: int,
    payload: RunIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> RunOut:
    s = await db.get(AllocationScheme, scheme_id)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="方案不存在")
    if s.result_table not in RESULT_TABLE_LABELS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"结果表 {s.result_table} 不在允许列表")

    dataset_id_ref = s.dataset_id
    result_table_ref = s.result_table
    if dataset_id_ref is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="成本分摊方案必须绑定数据集")

    # 合并 filters：方案配置为基础，extra_filters 同列名时覆盖
    cfg = ReportConfig(**(s.config or {}))
    merged_cfg = _merge_filters_for_run(cfg, payload.extra_filters)
    merged_filters = [f.model_dump() for f in merged_cfg.filters]

    # 从合并后的 filters 推导 period_ym（取月份类 eq 字段的值）
    period_ym = ""
    for f in merged_filters:
        col = f.get("column", "")
        if f.get("op") == "eq" and ("月份" in col or "month" in col.lower() or "ym" in col.lower()):
            period_ym = str(f.get("value", ""))
            break
    if not period_ym:
        from datetime import date
        today = date.today()
        period_ym = f"{today.year}{today.month:02d}"

    run = AllocationRun(
        scheme_id=s.id,
        period_ym=period_ym,
        status="pending",
        triggered_by=user.id,
        started_at=datetime.now(UTC),
    )
    db.add(run)
    await db.flush()

    try:
        from app.reports.sql_builder import run_dataset_query
        run_warnings: list[str] = []
        cols_meta, items, _ = await run_dataset_query(
            dataset_id=dataset_id_ref,
            columns=merged_cfg.columns,
            filters=merged_filters,
            filter_logic=merged_cfg.filter_logic,
            sorts=[sc.model_dump() for sc in merged_cfg.sorts],
            value_rules=merged_cfg.value_rules,
            aggregate=merged_cfg.aggregate,
            aggregations=merged_cfg.aggregations,
            column_settings=merged_cfg.column_settings,
            transpose=merged_cfg.transpose,
            rounding_corrections=merged_cfg.rounding_corrections,
            list_lookup=merged_cfg.list_lookup,
            page=1,
            page_size=0,
            user=user,
            db=db,
            warnings_sink=run_warnings,
        )

        if not items:
            raise ValueError("报表无数据，存档中止（空批次保护）")

        # 存档字段：去掉 alias. 前缀，只保留字段名
        rows = [
            {_strip_archive_prefix(k): v for k, v in item.items() if not k.startswith("_")}
            for item in items
        ]
        column_labels = _archive_label_map(cols_meta)

        written = await _dynamic_upsert(
            result_table_ref,
            rows,
            db,
            period_ym=period_ym,
            column_labels=column_labels,
        )

        run.status = "success"
        run.rows_written = written
        run.finished_at = datetime.now(UTC)

    except Exception as e:
        run.status = "failed"
        run.error_message = str(e)
        run.finished_at = datetime.now(UTC)
        await db.commit()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    await db.commit()
    await db.refresh(run)
    return _run_out(run, run_warnings)


# ===== 执行历史 =====

@router.get("/schemes/{scheme_id}/runs", response_model=list[RunOut])
async def list_runs(
    scheme_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[RunOut]:
    rows = (
        await db.execute(
            select(AllocationRun)
            .where(AllocationRun.scheme_id == scheme_id)
            .order_by(desc(AllocationRun.started_at))
            .limit(50)
        )
    ).scalars().all()
    return [_run_out(r) for r in rows]


# ===== 校验 =====

def _validate_source(payload: SchemeIn) -> None:
    if not payload.dataset_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="必须指定 dataset_id",
        )
