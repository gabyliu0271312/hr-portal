from __future__ import annotations

import csv
import io
import json
import logging
import os
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_any_op, require_op
from app.permissions.strategy import ensure_scope_strategy
from app.reports.models import Report, ReportAcl
from app.users.models import Role, User, UserRole

router = APIRouter(prefix="/reports", tags=["reports"])
logger = logging.getLogger(__name__)
LIST_LOOKUP_DEBUG = os.getenv("REPORT_LIST_LOOKUP_DEBUG", "").lower() in {"1", "true", "yes"}


class FilterCond(BaseModel):
    column: str
    op: str = "eq"
    value: Any = None
    visible: bool = True
    locked: bool = False


class SortCond(BaseModel):
    column: str
    order: str = "asc"


class ReportConfig(BaseModel):
    columns: list[str] = Field(default_factory=list)
    filters: list[FilterCond] = Field(default_factory=list)
    sorts: list[SortCond] = Field(default_factory=list)
    value_rules: list[dict] = Field(default_factory=list)
    column_settings: dict[str, dict] = Field(default_factory=dict)
    default_split_rule: dict = Field(default_factory=dict)
    aggregate: bool = False
    default_aggregation: str = "sum"
    aggregations: dict[str, str] = Field(default_factory=dict)
    transpose: dict = Field(default_factory=dict)
    rounding_corrections: list[dict] = Field(default_factory=list)
    filter_logic: dict | None = None
    list_lookup: dict = Field(default_factory=dict)


class ReportAclIn(BaseModel):
    role_id: int | None = None
    user_id: int | None = None


class ReportAclOut(ReportAclIn):
    id: int


class AclRoleOption(BaseModel):
    id: int
    name: str


class AclUserOption(BaseModel):
    id: int
    login_name: str
    display_name: str


class AclOptionsOut(BaseModel):
    roles: list[AclRoleOption]
    users: list[AclUserOption]


class ReportIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None
    table_name: str = ""
    dataset_id: int
    config: ReportConfig = Field(default_factory=ReportConfig)
    is_published: bool = False
    scope_strategy: str | None = None
    acl: list[ReportAclIn] = Field(default_factory=list)


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
    scope_strategy: str | None
    last_run_at: datetime | None
    run_count: int
    created_at: datetime
    updated_at: datetime
    acl: list[ReportAclOut] = Field(default_factory=list)
    can_edit: bool = True


class RunResult(BaseModel):
    columns: list[dict[str, Any]]
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int
    warnings: list[str] = []


class RunOverrides(BaseModel):
    filters: list[dict[str, Any]] = Field(default_factory=list)


_TABLE_LABELS = {
    "emp_realtime_roster": "员工实时花名册",
    "emp_monthly_roster": "员工月度花名册",
    "emp_monthly_salary": "员工月度工资表",
    "emp_monthly_allocation": "员工月度成本分摊表",
    "cost_center_monthly": "成本中心月度维护表",
    "emp_monthly_cost_class": "员工月度成本归集分类表",
}


def _list_lookup_filter_snapshot(config: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Return a compact, log-friendly view of list lookup source filters."""
    if not isinstance(config, dict) or not config.get("enabled"):
        return []
    snapshot: list[dict[str, Any]] = []
    for index, source in enumerate(config.get("sources") or [], start=1):
        if not isinstance(source, dict):
            continue
        filters: list[dict[str, Any]] = []
        for item in source.get("filters") or []:
            if not isinstance(item, dict):
                continue
            filters.append(
                {
                    "column": item.get("column"),
                    "op": item.get("op"),
                    "value": item.get("value"),
                }
            )
        snapshot.append(
            {
                "index": index,
                "name": source.get("name"),
                "type": source.get("type"),
                "return_field": source.get("return_field"),
                "source_field": source.get("source_field"),
                "filters": filters,
            }
        )
    return snapshot


def _log_list_lookup_filters(event: str, report: Report, config: dict[str, Any] | None) -> None:
    if not LIST_LOOKUP_DEBUG:
        return
    logger.info(
        "[%s] report_id=%s name=%s list_lookup_filters=%s",
        event,
        report.id,
        report.name,
        json.dumps(
            _list_lookup_filter_snapshot(config),
            ensure_ascii=False,
        ),
    )


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
    visible_items = [{code: item.get(code) for code in visible_codes} for item in items]
    return visible_columns, visible_items


async def _can_access(user: User, r: Report, db: AsyncSession) -> bool:
    if r.owner_id == user.id:
        return True
    from app.permissions.scope_filter import _is_super_admin

    if await _is_super_admin(user, db):
        return True
    if r.is_published:
        return True

    acls = (
        (await db.execute(select(ReportAcl).where(ReportAcl.report_id == r.id)))
        .scalars()
        .all()
    )
    if not acls:
        return False

    user_role_ids = {
        row[0]
        for row in (
            await db.execute(select(UserRole.role_id).where(UserRole.user_id == user.id))
        ).all()
    }
    return any(
        a.user_id == user.id or (a.role_id is not None and a.role_id in user_role_ids)
        for a in acls
    )


async def _can_edit(user: User, r: Report, db: AsyncSession) -> bool:
    if r.owner_id == user.id:
        return True
    from app.permissions.scope_filter import _is_super_admin

    return await _is_super_admin(user, db)


async def _replace_report_acl(
    db: AsyncSession, report_id: int, items: list[ReportAclIn]
) -> None:
    from sqlalchemy import delete as sa_delete

    await db.execute(sa_delete(ReportAcl).where(ReportAcl.report_id == report_id))
    for item in items:
        if item.role_id is None and item.user_id is None:
            continue
        db.add(ReportAcl(report_id=report_id, role_id=item.role_id, user_id=item.user_id))


async def _to_out(r: Report, db: AsyncSession, user: User | None = None) -> ReportOut:
    from app.datasets.models import DataSet

    owner_name: str | None = None
    if r.owner_id:
        owner = await db.get(User, r.owner_id)
        owner_name = owner.display_name if owner else None

    dataset_name: str | None = None
    if r.dataset_id:
        dataset = await db.get(DataSet, r.dataset_id)
        dataset_name = dataset.name if dataset else None

    acls = (
        (await db.execute(select(ReportAcl).where(ReportAcl.report_id == r.id)))
        .scalars()
        .all()
    )

    return ReportOut(
        id=r.id,
        name=r.name,
        description=r.description,
        table_name=r.table_name,
        table_label=_TABLE_LABELS.get(r.table_name, r.table_name) if r.table_name else None,
        dataset_id=r.dataset_id,
        dataset_name=dataset_name,
        config=ReportConfig(**(r.config or {})),
        owner_id=r.owner_id,
        owner_name=owner_name,
        is_published=r.is_published,
        scope_strategy=r.scope_strategy,
        last_run_at=r.last_run_at,
        run_count=r.run_count,
        created_at=r.created_at,
        updated_at=r.updated_at,
        acl=[ReportAclOut(id=a.id, role_id=a.role_id, user_id=a.user_id) for a in acls],
        can_edit=(await _can_edit(user, r, db)) if user else True,
    )


@router.get("", response_model=list[ReportOut])
async def list_reports(
    dataset_id: int | None = None,
    keyword: str | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ReportOut]:
    stmt = select(Report).order_by(desc(Report.updated_at))
    if dataset_id:
        stmt = stmt.where(Report.dataset_id == dataset_id)
    if keyword:
        stmt = stmt.where(Report.name.ilike(f"%{keyword}%"))
    rows = (await db.execute(stmt)).scalars().all()
    visible = [row for row in rows if await _can_access(user, row, db)]
    return [await _to_out(row, db, user) for row in visible]


@router.get(
    "/_acl-options",
    response_model=AclOptionsOut,
    dependencies=[Depends(require_any_op(("report.list", "C"), ("report.list", "U")))],
)
async def report_acl_options(db: AsyncSession = Depends(get_session)) -> AclOptionsOut:
    roles = (
        (await db.execute(select(Role).where(Role.is_active.is_(True)).order_by(Role.id)))
        .scalars()
        .all()
    )
    users = (
        (await db.execute(select(User).where(User.is_active.is_(True)).order_by(User.id)))
        .scalars()
        .all()
    )
    return AclOptionsOut(
        roles=[AclRoleOption(id=role.id, name=role.name) for role in roles],
        users=[
            AclUserOption(
                id=user.id,
                login_name=user.login_name,
                display_name=user.display_name,
            )
            for user in users
        ],
    )


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

    dataset = await db.get(DataSet, payload.dataset_id)
    if dataset is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="数据集不存在")

    try:
        scope_strategy = ensure_scope_strategy(payload.scope_strategy)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="无效的数据范围策略") from exc

    report = Report(
        name=payload.name,
        description=payload.description,
        table_name="",
        dataset_id=payload.dataset_id,
        config=payload.config.model_dump(),
        owner_id=user.id,
        is_published=payload.is_published,
        scope_strategy=scope_strategy,
    )
    db.add(report)
    await db.flush()
    _log_list_lookup_filters("report.create", report, report.config.get("list_lookup"))
    await _replace_report_acl(db, report.id, payload.acl)
    await db.commit()
    await db.refresh(report)
    return await _to_out(report, db, user)


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(
    report_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ReportOut:
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    if not await _can_access(user, report, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该报表")
    return await _to_out(report, db, user)


@router.put(
    "/{report_id}",
    response_model=ReportOut,
    dependencies=[Depends(require_op("report.list", "U"))],
)
async def update_report(
    report_id: int,
    payload: ReportIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> ReportOut:
    from app.datasets.models import DataSet

    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    if not await _can_edit(user, report, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="仅报表创建者可修改")
    dataset = await db.get(DataSet, payload.dataset_id)
    if dataset is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="数据集不存在")

    report.name = payload.name
    report.description = payload.description
    report.table_name = ""
    report.dataset_id = payload.dataset_id
    report.config = payload.config.model_dump()
    report.is_published = payload.is_published
    _log_list_lookup_filters("report.update", report, report.config.get("list_lookup"))
    try:
        report.scope_strategy = ensure_scope_strategy(payload.scope_strategy)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="无效的数据范围策略") from exc
    await _replace_report_acl(db, report.id, payload.acl)
    await db.commit()
    await db.refresh(report)
    return await _to_out(report, db, user)


@router.delete(
    "/{report_id}",
    dependencies=[Depends(require_op("report.list", "D"))],
)
async def delete_report(
    report_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    if not await _can_edit(user, report, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="仅报表创建者可删除")
    await db.delete(report)
    await db.commit()
    return {"ok": True}


def _normalize_runtime_filters(raw_filters: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in raw_filters or []:
        if not isinstance(item, dict) or not item.get("column"):
            continue
        next_filter = dict(item)
        op = next_filter.get("op") or "eq"
        value = next_filter.get("value")
        if op in {"is_null", "is_not_null"}:
            value = None
        elif op in {"between", "in"} and isinstance(value, str):
            value = [part.strip() for part in value.split(",") if part.strip()]
        next_filter["op"] = op
        next_filter["value"] = value
        normalized.append(next_filter)
    return normalized


def _apply_runtime_overrides(
    cfg: ReportConfig, raw_filters: list[dict[str, Any]] | None
) -> ReportConfig:
    runtime_filters = _normalize_runtime_filters(raw_filters)
    if not runtime_filters:
        return cfg

    base = [item.model_dump() for item in cfg.filters]
    used: set[int] = set()
    for runtime_filter in runtime_filters:
        replaced = False
        raw_index = runtime_filter.get("__index")
        if isinstance(raw_index, int) and 0 <= raw_index < len(base):
            existing = base[raw_index]
            if existing.get("visible", True) and not existing.get("locked", False):
                base[raw_index] = {
                    **existing,
                    "op": runtime_filter.get("op", existing.get("op", "eq")),
                    "value": runtime_filter.get("value"),
                }
                used.add(raw_index)
                replaced = True
        if replaced:
            continue
        for index, existing in enumerate(base):
            if index in used:
                continue
            if existing.get("column") != runtime_filter.get("column"):
                continue
            if not existing.get("visible", True) or existing.get("locked", False):
                continue
            base[index] = {
                **existing,
                "op": runtime_filter.get("op", existing.get("op", "eq")),
                "value": runtime_filter.get("value"),
            }
            used.add(index)
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
    return [item for item in parsed if isinstance(item, dict)]


@router.post("/{report_id}/run", response_model=RunResult)
async def run_report(
    report_id: int,
    overrides: RunOverrides | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> RunResult:
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    if not await _can_access(user, report, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该报表")
    if report.dataset_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="报表必须绑定数据集")

    cfg = _apply_runtime_overrides(
        ReportConfig(**(report.config or {})),
        overrides.filters if overrides else None,
    )
    _log_list_lookup_filters("report.run", report, cfg.list_lookup)

    from app.reports.sql_builder import run_dataset_query

    warnings: list[str] = []
    columns_meta, items, total = await run_dataset_query(
        dataset_id=report.dataset_id,
        columns=cfg.columns,
        filters=[item.model_dump() for item in cfg.filters],
        filter_logic=cfg.filter_logic,
        sorts=[item.model_dump() for item in cfg.sorts],
        value_rules=cfg.value_rules,
        aggregate=cfg.aggregate,
        aggregations=cfg.aggregations,
        column_settings=cfg.column_settings,
        transpose=cfg.transpose,
        rounding_corrections=cfg.rounding_corrections,
        list_lookup=cfg.list_lookup,
        page=page,
        page_size=page_size,
        user=user,
        db=db,
        scope_strategy=report.scope_strategy,
        warnings_sink=warnings,
    )

    report.last_run_at = datetime.utcnow()
    report.run_count = (report.run_count or 0) + 1
    await db.commit()

    out_cols, out_items = _project_report_output(columns_meta, items, cfg)
    return RunResult(
        columns=out_cols, items=out_items, total=total,
        page=page, page_size=page_size, warnings=warnings,
    )


async def _collect_export_rows(
    report: Report,
    user: User,
    db: AsyncSession,
    runtime_filters: list[dict[str, Any]] | None = None,
) -> tuple[list[str], list[list[Any]], list[str]]:
    if report.dataset_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="报表必须绑定数据集")

    cfg = _apply_runtime_overrides(ReportConfig(**(report.config or {})), runtime_filters)

    from app.reports.sql_builder import run_dataset_query

    columns_meta, items, _ = await run_dataset_query(
        dataset_id=report.dataset_id,
        columns=cfg.columns,
        filters=[item.model_dump() for item in cfg.filters],
        filter_logic=cfg.filter_logic,
        sorts=[item.model_dump() for item in cfg.sorts],
        value_rules=cfg.value_rules,
        aggregate=cfg.aggregate,
        aggregations=cfg.aggregations,
        column_settings=cfg.column_settings,
        transpose=cfg.transpose,
        rounding_corrections=cfg.rounding_corrections,
        list_lookup=cfg.list_lookup,
        page=1,
        page_size=0,
        user=user,
        db=db,
        scope_strategy=report.scope_strategy,
    )
    columns_meta, items = _project_report_output(columns_meta, items, cfg)
    codes = [column["code"] for column in columns_meta]
    labels = [column["label"] for column in columns_meta]
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
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    if not await _can_access(user, report, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该报表")

    labels, rows, _codes = await _collect_export_rows(
        report, user, db, _parse_runtime_filters(runtime_filters)
    )

    buf = io.StringIO()
    buf.write("\ufeff")
    writer = csv.writer(buf)
    writer.writerow(labels)
    for row in rows:
        writer.writerow(row)
    buf.seek(0)

    from urllib.parse import quote

    safe_name = report.name.replace("/", "_").replace("\\", "_")
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
    from openpyxl import Workbook

    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    if not await _can_access(user, report, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权访问该报表")

    labels, rows, _codes = await _collect_export_rows(
        report, user, db, _parse_runtime_filters(runtime_filters)
    )

    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = report.name[:30] or "Report"
    worksheet.append(labels)
    for row in rows:
        worksheet.append([("" if value is None else value) for value in row])

    buf = io.BytesIO()
    workbook.save(buf)
    buf.seek(0)

    from urllib.parse import quote

    safe_name = report.name.replace("/", "_").replace("\\", "_")
    filename_encoded = quote(f"{safe_name}.xlsx")
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename_encoded}"},
    )
