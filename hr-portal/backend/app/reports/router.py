"""报表中台路由（Phase 5 单表起步）

- GET    /reports                     列表（按 owner / table 过滤）
- POST   /reports                     新建
- GET    /reports/{id}                取详情
- PUT    /reports/{id}                更新（含 config）
- DELETE /reports/{id}                删除
- POST   /reports/{id}/run            按 config 跑一次，返回分页结果
- GET    /reports/{id}/export.csv     CSV 导出（不分页，含权限脱敏）

config 形态参考 [models.Report.__doc__]
"""
from __future__ import annotations

import csv
import io
import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data.models import DATA_TABLES, TableColumn
from app.reports.filter_logic import build_filter_clause
from app.reports.models import Report
from app.users.models import User


router = APIRouter(prefix="/reports", tags=["reports"])


# ===== Schemas =====

class FilterCond(BaseModel):
    column: str
    op: str = "eq"  # eq / neq / contains / gt / gte / lt / lte / between / in / is_null / is_not_null
    value: Any = None
    visible: bool = True
    locked: bool = False


class SortCond(BaseModel):
    column: str
    order: str = "asc"  # asc / desc


class ReportConfig(BaseModel):
    """报表配置

    单表模式：column 形如 "工号"
    数据集模式：column 形如 "<alias>.<column_code>"，如 "roster.工号"
    两种模式不能混用（同一报表内列名要么全单表要么全带 alias）
    """
    columns: list[str] = Field(default_factory=list)
    filters: list[FilterCond] = Field(default_factory=list)
    sorts: list[SortCond] = Field(default_factory=list)
    # 数值拆分规则（仅数据集模式）：[{"target":"alias.col","factor":"alias.col"}]
    # 出值时 target 列显示 round(num(target) × num(factor), 2)，非数值/空 → 空
    value_rules: list[dict] = Field(default_factory=list)
    # 字段级展示/计算配置：{"col": {"display_name": "...", "hidden": true,
    # "aggregation": "sum", "split_mode": "default|none|custom", "split_factor": "..."}}
    column_settings: dict[str, dict] = Field(default_factory=dict)
    # 默认数值拆分规则，前端保存时会同步展开为 value_rules，保留该字段用于编辑回显
    default_split_rule: dict = Field(default_factory=dict)
    # 聚合：开启后按维度列 GROUP BY、对度量列按 aggregations 指定方式汇总
    aggregate: bool = False
    # 默认度量聚合方式：字段未单独覆盖时使用；前端保存时会展开为 aggregations
    default_aggregation: str = "sum"
    # 度量聚合方式：{"alias.col": "sum|avg|min|max|count"}，缺省 sum
    aggregations: dict[str, str] = Field(default_factory=dict)
    # 转置/重映射（仅数据集模式）：把源度量从原维度组合搬到新维度组合，保留其余记录
    # {"enabled": bool, "drop_zero_measures": bool,
    #  "rules": [{"source_col": "a.col",
    #             "dim_updates": {"a.dimcol": "新值", ...},
    #             "target_cols": ["a.col", ...]}]}
    transpose: dict = Field(default_factory=dict)
    # 余差收口：聚合后按指定维度分组，确保各组合计严格等于原始值乘系数
    # [{"group_by": "alias.col", "target_cols": ["alias.col", ...]}]
    rounding_corrections: list[dict] = Field(default_factory=list)
    # 复杂筛选逻辑预留：旧 filters 仍按 AND 兼容
    filter_logic: dict | None = None


class ReportIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    # 单表模式：仅设置 table_name；数据集模式：仅设置 dataset_id（table_name 留空字符串）
    table_name: str = ""
    dataset_id: int | None = None
    config: ReportConfig = Field(default_factory=ReportConfig)
    is_published: bool = False


class ReportOut(BaseModel):
    id: int
    name: str
    description: str | None
    table_name: str
    table_label: str | None
    dataset_id: int | None
    dataset_name: str | None
    config: ReportConfig
    owner_id: int | None
    owner_name: str | None
    is_published: bool
    last_run_at: datetime | None
    run_count: int
    created_at: datetime
    updated_at: datetime


class RunResult(BaseModel):
    columns: list[dict[str, Any]]
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int


class RunOverrides(BaseModel):
    filters: list[dict[str, Any]] = Field(default_factory=list)


def _project_report_output(
    columns: list[dict[str, Any]],
    items: list[dict[str, Any]],
    config: ReportConfig,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    settings = config.column_settings or {}
    visible_columns: list[dict[str, Any]] = []
    visible_codes: list[str] = []
    for col in columns:
        code = col.get("code")
        setting = settings.get(code, {}) if code else {}
        if setting.get("hidden"):
            continue
        next_col = dict(col)
        display_name = setting.get("display_name")
        if display_name:
            next_col["label"] = display_name
        visible_columns.append(next_col)
        if code:
            visible_codes.append(code)
    visible_items = [
        {code: item.get(code) for code in visible_codes}
        for item in items
    ]
    return visible_columns, visible_items


# ===== 工具：表标签映射 =====

_TABLE_LABELS = {
    "emp_realtime_roster": "员工实时花名册",
    "emp_monthly_roster": "员工月度花名册",
    "emp_monthly_salary": "员工月度工资表",
    "emp_monthly_allocation": "员工月度成本分摊表",
    "cost_center_monthly": "成本中心月度维护表",
    "emp_monthly_cost_class": "员工月度成本归集分类表",
}


async def _to_out(r: Report, db: AsyncSession) -> ReportOut:
    from app.datasets.models import DataSet
    owner_name: str | None = None
    if r.owner_id:
        u = await db.get(User, r.owner_id)
        owner_name = u.display_name if u else None
    cfg = r.config or {}
    dataset_name = None
    if r.dataset_id:
        ds = await db.get(DataSet, r.dataset_id)
        dataset_name = ds.name if ds else None
    return ReportOut(
        id=r.id,
        name=r.name,
        description=r.description,
        table_name=r.table_name,
        table_label=_TABLE_LABELS.get(r.table_name, r.table_name),
        dataset_id=r.dataset_id,
        dataset_name=dataset_name,
        config=ReportConfig(**cfg) if cfg else ReportConfig(),
        owner_id=r.owner_id,
        owner_name=owner_name,
        is_published=r.is_published,
        last_run_at=r.last_run_at,
        run_count=r.run_count,
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


# ===== CRUD =====

@router.get("", response_model=list[ReportOut])
async def list_reports(
    table_name: str | None = None,
    keyword: str | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ReportOut]:
    stmt = select(Report).order_by(desc(Report.updated_at))
    if table_name:
        stmt = stmt.where(Report.table_name == table_name)
    if keyword:
        stmt = stmt.where(Report.name.ilike(f"%{keyword}%"))
    rows = (await db.execute(stmt)).scalars().all()
    return [await _to_out(r, db) for r in rows]


@router.post(
    "",
    response_model=ReportOut,
    dependencies=[Depends(require_op("report.list", "C"))],
)
async def create_report(
    payload: ReportIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ReportOut:
    from app.datasets.models import DataSet
    # 必须二选一：dataset_id 或 table_name
    if payload.dataset_id is None and payload.table_name not in DATA_TABLES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="必须指定 dataset_id 或合法 table_name"
        )
    if payload.dataset_id is not None:
        ds = await db.get(DataSet, payload.dataset_id)
        if ds is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="数据集不存在")
    r = Report(
        name=payload.name,
        description=payload.description,
        table_name=payload.table_name or "",
        dataset_id=payload.dataset_id,
        config=payload.config.model_dump(),
        owner_id=user.id,
        is_published=payload.is_published,
    )
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return await _to_out(r, db)


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(
    report_id: int,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ReportOut:
    r = await db.get(Report, report_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    return await _to_out(r, db)


@router.put(
    "/{report_id}",
    response_model=ReportOut,
    dependencies=[Depends(require_op("report.list", "U"))],
)
async def update_report(
    report_id: int,
    payload: ReportIn,
    db: AsyncSession = Depends(get_session),
) -> ReportOut:
    from app.datasets.models import DataSet
    r = await db.get(Report, report_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    if payload.dataset_id is None and payload.table_name not in DATA_TABLES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="必须指定 dataset_id 或合法 table_name"
        )
    if payload.dataset_id is not None:
        ds = await db.get(DataSet, payload.dataset_id)
        if ds is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="数据集不存在")
    r.name = payload.name
    r.description = payload.description
    r.table_name = payload.table_name or ""
    r.dataset_id = payload.dataset_id
    r.config = payload.config.model_dump()
    r.is_published = payload.is_published
    await db.commit()
    await db.refresh(r)
    return await _to_out(r, db)


@router.delete(
    "/{report_id}",
    dependencies=[Depends(require_op("report.list", "D"))],
)
async def delete_report(
    report_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    r = await db.get(Report, report_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    await db.delete(r)
    await db.commit()
    return {"ok": True}


# ===== 查询执行 =====

def _single_filter_clause(Model, f: dict[str, Any]):
    """把单个 filter 翻译成 SQL where 子句（基于 raw JSONB ->> 文本比较）"""
    from sqlalchemy import String as SAString, cast

    col = f.get("column")
    if not col:
        return None
    op = (f.get("op") or "eq").lower()
    val = f.get("value")
    json_text = cast(func.jsonb_extract_path_text(cast(Model.raw, JSONB), col), SAString)

    if op == "eq":
        return json_text == (str(val) if val is not None else None)
    if op == "neq":
        return json_text != (str(val) if val is not None else None)
    if op == "contains":
        return json_text.ilike(f"%{val}%") if val else None
    if op == "gt":
        return json_text > str(val)
    if op == "gte":
        return json_text >= str(val)
    if op == "lt":
        return json_text < str(val)
    if op == "lte":
        return json_text <= str(val)
    if op == "between" and isinstance(val, (list, tuple)) and len(val) == 2:
        clauses = []
        lo, hi = val
        if lo is not None:
            clauses.append(json_text >= str(lo))
        if hi is not None:
            clauses.append(json_text <= str(hi))
        from sqlalchemy import and_
        return and_(*clauses) if clauses else None
    if op == "in" and isinstance(val, (list, tuple)) and val:
        return json_text.in_([str(x) for x in val])
    if op == "is_null":
        return or_(json_text.is_(None), json_text == "")
    if op == "is_not_null":
        from sqlalchemy import and_
        return and_(json_text.isnot(None), json_text != "")
    return None


def _apply_filters(stmt, Model, filters: list[FilterCond], filter_logic: dict | None = None):
    """把 filters/筛选逻辑翻译成 SQL where。"""
    try:
        clause = build_filter_clause(
            filters,
            lambda f: _single_filter_clause(Model, f),
            filter_logic,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if clause is not None:
        stmt = stmt.where(clause)
    return stmt


def _normalize_runtime_filters(raw_filters: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for f in raw_filters or []:
        if not isinstance(f, dict) or not f.get("column"):
            continue
        next_filter = dict(f)
        op = next_filter.get("op") or "eq"
        value = next_filter.get("value")
        if op in {"is_null", "is_not_null"}:
            value = None
        elif op in {"between", "in"} and isinstance(value, str):
            value = [v.strip() for v in value.split(",") if v.strip()]
        next_filter["op"] = op
        next_filter["value"] = value
        normalized.append(next_filter)
    return normalized


def _apply_runtime_overrides(cfg: ReportConfig, raw_filters: list[dict[str, Any]] | None) -> ReportConfig:
    """Apply temporary view-page filter edits without mutating the stored config."""
    runtime_filters = _normalize_runtime_filters(raw_filters)
    if not runtime_filters:
        return cfg

    base = [f.model_dump() for f in cfg.filters]
    used: set[int] = set()
    for rf in runtime_filters:
        replaced = False
        raw_index = rf.get("__index")
        if isinstance(raw_index, int) and 0 <= raw_index < len(base):
            bf = base[raw_index]
            if bf.get("visible", True) and not bf.get("locked", False):
                base[raw_index] = {
                    **bf,
                    "op": rf.get("op", bf.get("op", "eq")),
                    "value": rf.get("value"),
                }
                used.add(raw_index)
                replaced = True
        if replaced:
            continue
        for i, bf in enumerate(base):
            if i in used:
                continue
            if bf.get("column") != rf.get("column"):
                continue
            if not bf.get("visible", True) or bf.get("locked", False):
                continue
            base[i] = {
                **bf,
                "op": rf.get("op", bf.get("op", "eq")),
                "value": rf.get("value"),
            }
            used.add(i)
            break

    data = cfg.model_dump()
    data["filters"] = base
    return ReportConfig(**data)


def _parse_runtime_filters(raw: str | None) -> list[dict[str, Any]]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="runtime_filters 不是合法 JSON") from exc
    if not isinstance(parsed, list):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="runtime_filters 必须是数组")
    return [f for f in parsed if isinstance(f, dict)]


def _apply_sorts(stmt, Model, sorts: list[SortCond]):
    from sqlalchemy import String as SAString, cast

    for s in sorts:
        json_text = cast(func.jsonb_extract_path_text(cast(Model.raw, JSONB), s.column), SAString)
        if s.order == "desc":
            stmt = stmt.order_by(desc(json_text))
        else:
            stmt = stmt.order_by(json_text)
    return stmt


async def _run_query(
    db: AsyncSession,
    table_name: str,
    config: ReportConfig,
    page: int,
    page_size: int,
    user: User | None = None,
) -> tuple[list[TableColumn], list[dict[str, Any]], int]:
    """执行报表查询，返回 (columns_meta, items, total)

    若传入 user，会自动叠加该用户的数据范围权限过滤（FR-REPORT-004）
    """
    Model = DATA_TABLES[table_name]

    # 1) 取所有字段元数据
    all_cols = (
        await db.execute(
            select(TableColumn)
            .where(TableColumn.table_name == table_name)
            .order_by(TableColumn.display_order, TableColumn.id)
        )
    ).scalars().all()
    col_by_code = {c.column_code: c for c in all_cols}

    # 2) 用户选定的列；空则取全部 visible
    selected_codes = config.columns
    if not selected_codes:
        selected_codes = [c.column_code for c in all_cols if c.is_visible]
    selected_cols = [col_by_code[c] for c in selected_codes if c in col_by_code]

    # 3) 拼 SQL
    stmt = select(Model)
    count_stmt = select(func.count()).select_from(Model)

    stmt = _apply_filters(stmt, Model, config.filters, config.filter_logic)
    count_stmt = _apply_filters(count_stmt, Model, config.filters, config.filter_logic)

    # 注入数据范围权限（FR-REPORT-004）
    if user is not None:
        from app.permissions.scope_filter import build_scope_filter, is_unrestricted
        scope_clause = await build_scope_filter(user, table_name, db)
        if not is_unrestricted(scope_clause):
            stmt = stmt.where(scope_clause)
            count_stmt = count_stmt.where(scope_clause)

    stmt = _apply_sorts(stmt, Model, config.sorts)
    if not config.sorts:
        stmt = stmt.order_by(desc(Model.synced_at), desc(Model.id))

    total = (await db.execute(count_stmt)).scalar_one()

    if page_size > 0:
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    rows = (await db.execute(stmt)).scalars().all()

    # 字段分类脱敏（仅当传入 user 时生效；脱敏中间件路径）
    sensitive_set: set[str] = set()
    if user is not None:
        from app.permissions.masker import get_sensitive_columns
        sensitive_set = await get_sensitive_columns(user, table_name, db)

    items: list[dict[str, Any]] = []
    for r in rows:
        raw = r.raw or {}
        item: dict[str, Any] = {
            "_id": r.id,
            "_synced_at": r.synced_at.isoformat() if r.synced_at else None,
        }
        for c in selected_cols:
            v = raw.get(c.column_code)
            # is_sensitive（列级）+ field_category 敏感分类 任一命中都脱敏
            if (c.is_sensitive or c.column_code in sensitive_set) and v not in (None, ""):
                v = "******"
            elif isinstance(v, datetime):
                v = v.isoformat()
            item[c.column_code] = v
        items.append(item)

    return selected_cols, items, total


def _single_columns_meta(cols: list[TableColumn]) -> list[dict[str, Any]]:
    return [
        {
            "code": c.column_code,
            "label": c.column_label,
            "data_type": c.data_type,
            "is_sensitive": c.is_sensitive,
        }
        for c in cols
    ]


@router.post("/{report_id}/run", response_model=RunResult)
async def run_report(
    report_id: int,
    overrides: RunOverrides | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> RunResult:
    r = await db.get(Report, report_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")

    cfg = _apply_runtime_overrides(ReportConfig(**(r.config or {})), overrides.filters if overrides else None)

    if r.dataset_id is not None:
        # 数据集模式：多表 JOIN
        from app.reports.sql_builder import run_dataset_query
        cols_meta, items, total = await run_dataset_query(
            dataset_id=r.dataset_id,
            columns=cfg.columns,
            filters=[f.model_dump() for f in cfg.filters],
            filter_logic=cfg.filter_logic,
            sorts=[s.model_dump() for s in cfg.sorts],
            value_rules=cfg.value_rules,
            aggregate=cfg.aggregate,
            aggregations=cfg.aggregations,
            transpose=cfg.transpose,
            rounding_corrections=cfg.rounding_corrections,
            page=page,
            page_size=page_size,
            user=user,
            db=db,
        )
        r.last_run_at = datetime.utcnow()
        r.run_count = (r.run_count or 0) + 1
        await db.commit()
        out_cols, out_items = _project_report_output(cols_meta, items, cfg)
        return RunResult(columns=out_cols, items=out_items, total=total, page=page, page_size=page_size)

    # 单表模式（保留向后兼容）
    cols, items, total = await _run_query(db, r.table_name, cfg, page, page_size, user=user)

    # 更新运行统计
    r.last_run_at = datetime.utcnow()
    r.run_count = (r.run_count or 0) + 1
    await db.commit()

    out_cols, out_items = _project_report_output(_single_columns_meta(cols), items, cfg)
    return RunResult(
        columns=out_cols,
        items=out_items,
        total=total,
        page=page,
        page_size=page_size,
    )


async def _collect_export_rows(
    r: Report, user: User, db: AsyncSession, runtime_filters: list[dict[str, Any]] | None = None
) -> tuple[list[str], list[list[Any]], list[str]]:
    """统一收集导出数据：返回 (header_labels, value_rows, codes)
    支持单表与数据集两种模式
    """
    cfg = _apply_runtime_overrides(ReportConfig(**(r.config or {})), runtime_filters)
    if r.dataset_id is not None:
        from app.reports.sql_builder import run_dataset_query
        cols_meta, items, _ = await run_dataset_query(
            dataset_id=r.dataset_id,
            columns=cfg.columns,
            filters=[f.model_dump() for f in cfg.filters],
            filter_logic=cfg.filter_logic,
            sorts=[s.model_dump() for s in cfg.sorts],
            value_rules=cfg.value_rules,
            aggregate=cfg.aggregate,
            aggregations=cfg.aggregations,
            transpose=cfg.transpose,
            rounding_corrections=cfg.rounding_corrections,
            page=1,
            page_size=100000,
            user=user,
            db=db,
        )
        cols_meta, items = _project_report_output(cols_meta, items, cfg)
        codes = [c["code"] for c in cols_meta]
        labels = [c["label"] for c in cols_meta]
        rows = [[item.get(code, "") for code in codes] for item in items]
        return labels, rows, codes

    cols, items, _ = await _run_query(db, r.table_name, cfg, page=1, page_size=100000, user=user)
    cols_meta, items = _project_report_output(_single_columns_meta(cols), items, cfg)
    codes = [c["code"] for c in cols_meta]
    labels = [c["label"] for c in cols_meta]
    rows = [[item.get(code, "") for code in codes] for item in items]
    return labels, rows, codes


@router.get(
    "/{report_id}/export.csv",
    dependencies=[Depends(require_op("report.list", "E"))],
)
async def export_report_csv(
    report_id: int,
    runtime_filters: str | None = Query(None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    r = await db.get(Report, report_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")

    labels, rows, _codes = await _collect_export_rows(
        r, user, db, _parse_runtime_filters(runtime_filters)
    )

    buf = io.StringIO()
    buf.write("﻿")  # UTF-8 BOM，让 Excel 正确识别中文
    writer = csv.writer(buf)
    writer.writerow(labels)
    for row in rows:
        writer.writerow(row)
    buf.seek(0)

    safe_name = r.name.replace("/", "_").replace("\\", "_")
    from urllib.parse import quote
    filename_encoded = quote(f"{safe_name}.csv")
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_encoded}"},
    )


@router.get(
    "/{report_id}/export.xlsx",
    dependencies=[Depends(require_op("report.list", "E"))],
)
async def export_report_xlsx(
    report_id: int,
    runtime_filters: str | None = Query(None),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> StreamingResponse:
    """xlsx 导出（FR-REPORT-006）"""
    from openpyxl import Workbook

    r = await db.get(Report, report_id)
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")

    labels, rows, _codes = await _collect_export_rows(
        r, user, db, _parse_runtime_filters(runtime_filters)
    )

    wb = Workbook()
    ws = wb.active
    ws.title = (r.name[:30] or "Report")
    ws.append(labels)
    for row in rows:
        ws.append([("" if v is None else v) for v in row])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    safe_name = r.name.replace("/", "_").replace("\\", "_")
    from urllib.parse import quote
    filename_encoded = quote(f"{safe_name}.xlsx")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_encoded}"},
    )
