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
from sqlalchemy import desc, func, select
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
    visibility: str = "private"
    scope_strategy: str | None = None
    acl: list[ReportAclIn] = Field(default_factory=list)


class PushTargetSummary(BaseModel):
    id: int
    name: str
    push_type: str
    is_active: bool


class ReportPushResult(BaseModel):
    target_id: int
    target_name: str
    ok: bool
    rows: int = 0
    message: str = ""


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
    visibility: str
    is_published: bool
    scope_strategy: str | None
    last_run_at: datetime | None
    run_count: int
    created_at: datetime
    updated_at: datetime
    acl: list[ReportAclOut] = Field(default_factory=list)
    can_edit: bool = True
    push_target_count: int = 0
    active_push_target_count: int = 0


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


VISIBILITY_VALUES = {"private", "scoped", "public"}


async def _report_dataset_can_access(user: User, r: Report, db: AsyncSession) -> bool:
    """报表访问者是否拥有该报表所绑数据集的权限（复用数据集授权口径）。"""
    from app.datasets.models import DataSet
    from app.datasets.router import _can_access as dataset_can_access

    if r.dataset_id is None:
        return False
    ds = await db.get(DataSet, r.dataset_id)
    if ds is None:
        return False
    return await dataset_can_access(user, ds, db)


async def _dataset_authorized_principals(
    dataset_id: int, db: AsyncSession
) -> tuple[set[int], set[int]]:
    """返回对该数据集有权的 (角色 id 集, 用户 id 集)。

    与 datasets._can_access 同口径：
    - 有权角色 = 超级管理员角色 ∪ dataset_acl.role_id
    - 有权用户 = dataset.created_by ∪ dataset_acl.user_id ∪ 有权角色的成员
    """
    from app.datasets.models import DataSet, DataSetAcl

    role_ids: set[int] = set()
    user_ids: set[int] = set()

    ds = await db.get(DataSet, dataset_id)
    if ds and ds.created_by:
        user_ids.add(ds.created_by)

    super_role_ids = (
        await db.execute(
            select(Role.id).where(Role.name == "超级管理员", Role.is_active.is_(True))
        )
    ).scalars().all()
    role_ids.update(super_role_ids)

    acls = (
        await db.execute(select(DataSetAcl).where(DataSetAcl.dataset_id == dataset_id))
    ).scalars().all()
    for a in acls:
        if a.role_id is not None:
            role_ids.add(a.role_id)
        if a.user_id is not None:
            user_ids.add(a.user_id)

    if role_ids:
        members = (
            await db.execute(
                select(UserRole.user_id).where(UserRole.role_id.in_(role_ids))
            )
        ).scalars().all()
        user_ids.update(members)

    return role_ids, user_ids


async def _can_access(user: User, r: Report, db: AsyncSession) -> bool:
    if r.owner_id == user.id:
        return True
    from app.permissions.scope_filter import _is_super_admin

    if await _is_super_admin(user, db):
        return True

    vis = r.visibility or "private"
    if vis == "private":
        # 私密：仅创建者 + 超管，不查 ACL
        return False

    # scoped / public 共用前置闸：访问者须拥有该数据集权限
    if not await _report_dataset_can_access(user, r, db):
        return False

    if vis == "public":
        return True

    # scoped：再要报表 ACL 命中
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


async def _validate_acl_principals(
    dataset_id: int, items: list[ReportAclIn], db: AsyncSession
) -> None:
    """保存报表 ACL 时强校验：被授权角色/用户必须本就拥有该数据集权限。"""
    role_ids, user_ids = await _dataset_authorized_principals(dataset_id, db)
    for item in items:
        if item.role_id is not None and item.role_id not in role_ids:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="只能授权给拥有该数据集权限的角色",
            )
        if item.user_id is not None and item.user_id not in user_ids:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="只能授权给拥有该数据集权限的用户",
            )


async def _to_out(r: Report, db: AsyncSession, user: User | None = None) -> ReportOut:
    from app.datasets.models import DataSet
    from app.push.models import PushTarget

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

    source_table = f"report:{r.id}"
    push_total = (await db.execute(
        select(func.count()).select_from(PushTarget).where(PushTarget.source_table == source_table)
    )).scalar_one()
    push_active = (await db.execute(
        select(func.count()).select_from(PushTarget).where(
            PushTarget.source_table == source_table,
            PushTarget.is_active.is_(True),
        )
    )).scalar_one()

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
        visibility=r.visibility or "private",
        is_published=(r.visibility or "private") == "public",
        scope_strategy=r.scope_strategy,
        last_run_at=r.last_run_at,
        run_count=r.run_count,
        created_at=r.created_at,
        updated_at=r.updated_at,
        acl=[ReportAclOut(id=a.id, role_id=a.role_id, user_id=a.user_id) for a in acls],
        can_edit=(await _can_edit(user, r, db)) if user else True,
        push_target_count=push_total,
        active_push_target_count=push_active,
    )


@router.get(
    "",
    response_model=list[ReportOut],
    dependencies=[Depends(require_op("report.list", "V"))],
)
async def list_reports(
    dataset_id: int | None = None,
    keyword: str | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ReportOut]:
    from app.datasets.models import DataSet
    from app.push.models import PushTarget
    from app.permissions.scope_filter import _is_super_admin

    stmt = select(Report).order_by(desc(Report.updated_at))
    if dataset_id:
        stmt = stmt.where(Report.dataset_id == dataset_id)
    if keyword:
        stmt = stmt.where(Report.name.ilike(f"%{keyword}%"))
    rows = (await db.execute(stmt)).scalars().all()

    # 权限过滤（逻辑不变，但把超管判断提前一次，避免每行重复查）
    is_super = await _is_super_admin(user, db)
    user_role_ids: set[int] = {
        row[0]
        for row in (
            await db.execute(select(UserRole.role_id).where(UserRole.user_id == user.id))
        ).all()
    }

    # 批量预加载：owner、dataset、ACL、push count
    report_ids = [r.id for r in rows]
    owner_ids = {r.owner_id for r in rows if r.owner_id}
    ds_ids = {r.dataset_id for r in rows if r.dataset_id}

    owners: dict[int, User] = {}
    if owner_ids:
        for u in (await db.execute(select(User).where(User.id.in_(owner_ids)))).scalars().all():
            owners[u.id] = u

    datasets: dict[int, DataSet] = {}
    if ds_ids:
        for ds in (await db.execute(select(DataSet).where(DataSet.id.in_(ds_ids)))).scalars().all():
            datasets[ds.id] = ds

    # 批量查 ACL（scoped 权限过滤 + 响应组装都要用）
    acls_by_report: dict[int, list[ReportAcl]] = {rid: [] for rid in report_ids}
    if report_ids:
        for a in (await db.execute(select(ReportAcl).where(ReportAcl.report_id.in_(report_ids)))).scalars().all():
            acls_by_report[a.report_id].append(a)

    # 批量查数据集 ACL（用于 _report_dataset_can_access）
    from app.datasets.models import DataSetAcl
    ds_acls_by_ds: dict[int, list[DataSetAcl]] = {}
    if ds_ids:
        for da in (await db.execute(select(DataSetAcl).where(DataSetAcl.dataset_id.in_(ds_ids)))).scalars().all():
            ds_acls_by_ds.setdefault(da.dataset_id, []).append(da)

    # 批量查 push count（source_table = "report:{id}"）
    source_tables = [f"report:{rid}" for rid in report_ids]
    push_total_map: dict[str, int] = {}
    push_active_map: dict[str, int] = {}
    if source_tables:
        for st, cnt in (await db.execute(
            select(PushTarget.source_table, func.count())
            .where(PushTarget.source_table.in_(source_tables))
            .group_by(PushTarget.source_table)
        )).all():
            push_total_map[st] = cnt
        for st, cnt in (await db.execute(
            select(PushTarget.source_table, func.count())
            .where(PushTarget.source_table.in_(source_tables), PushTarget.is_active.is_(True))
            .group_by(PushTarget.source_table)
        )).all():
            push_active_map[st] = cnt

    def _can_access_fast(r: Report) -> bool:
        if r.owner_id == user.id or is_super:
            return True
        vis = r.visibility or "private"
        if vis == "private":
            return False
        # 数据集权限前置闸（复用批量查到的 ds_acls）
        if r.dataset_id:
            ds = datasets.get(r.dataset_id)
            if ds is None:
                return False
            ds_acls = ds_acls_by_ds.get(r.dataset_id, [])
            if ds_acls:
                has_ds = any(
                    da.user_id == user.id or (da.role_id is not None and da.role_id in user_role_ids)
                    for da in ds_acls
                )
            else:
                # 无 ACL 行 = 仅创建者可访问
                has_ds = (ds.created_by == user.id)
            if not has_ds:
                return False
        if vis == "public":
            return True
        # scoped
        acls = acls_by_report.get(r.id, [])
        if not acls:
            return False
        return any(
            a.user_id == user.id or (a.role_id is not None and a.role_id in user_role_ids)
            for a in acls
        )

    visible = [r for r in rows if _can_access_fast(r)]

    result: list[ReportOut] = []
    for r in visible:
        owner = owners.get(r.owner_id) if r.owner_id else None
        ds = datasets.get(r.dataset_id) if r.dataset_id else None
        st = f"report:{r.id}"
        result.append(ReportOut(
            id=r.id,
            name=r.name,
            description=r.description,
            table_name=r.table_name,
            table_label=_TABLE_LABELS.get(r.table_name, r.table_name) if r.table_name else None,
            dataset_id=r.dataset_id,
            dataset_name=ds.name if ds else None,
            config=ReportConfig(**(r.config or {})),
            owner_id=r.owner_id,
            owner_name=owner.display_name if owner else None,
            visibility=r.visibility or "private",
            is_published=(r.visibility or "private") == "public",
            scope_strategy=r.scope_strategy,
            last_run_at=r.last_run_at,
            run_count=r.run_count,
            created_at=r.created_at,
            updated_at=r.updated_at,
            acl=[ReportAclOut(id=a.id, role_id=a.role_id, user_id=a.user_id) for a in acls_by_report.get(r.id, [])],
            can_edit=(r.owner_id == user.id or is_super),
            push_target_count=push_total_map.get(st, 0),
            active_push_target_count=push_active_map.get(st, 0),
        ))
    return result


@router.get(
    "/_acl-options",
    response_model=AclOptionsOut,
    dependencies=[Depends(require_any_op(("report.list", "C"), ("report.list", "U")))],
)
async def report_acl_options(
    dataset_id: int,
    db: AsyncSession = Depends(get_session),
) -> AclOptionsOut:
    # 只返回对该数据集有权的角色/用户，作为报表授权候选
    allowed_role_ids, allowed_user_ids = await _dataset_authorized_principals(
        dataset_id, db
    )
    roles = (
        (
            await db.execute(
                select(Role)
                .where(Role.is_active.is_(True), Role.id.in_(allowed_role_ids or {-1}))
                .order_by(Role.id)
            )
        )
        .scalars()
        .all()
    )
    users = (
        (
            await db.execute(
                select(User)
                .where(User.is_active.is_(True), User.id.in_(allowed_user_ids or {-1}))
                .order_by(User.id)
            )
        )
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

    visibility = payload.visibility or "private"
    if visibility not in VISIBILITY_VALUES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="无效的可见性")
    acl_items = payload.acl if visibility == "scoped" else []
    if acl_items:
        await _validate_acl_principals(payload.dataset_id, acl_items, db)

    report = Report(
        name=payload.name,
        description=payload.description,
        table_name="",
        dataset_id=payload.dataset_id,
        config=payload.config.model_dump(),
        owner_id=user.id,
        visibility=visibility,
        is_published=(visibility == "public"),
        scope_strategy=scope_strategy,
    )
    db.add(report)
    await db.flush()
    _log_list_lookup_filters("report.create", report, report.config.get("list_lookup"))
    await _replace_report_acl(db, report.id, acl_items)
    await db.commit()
    await db.refresh(report)
    return await _to_out(report, db, user)


@router.get(
    "/{report_id}",
    response_model=ReportOut,
    dependencies=[Depends(require_op("report.list", "V"))],
)
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

    visibility = payload.visibility or "private"
    if visibility not in VISIBILITY_VALUES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="无效的可见性")
    acl_items = payload.acl if visibility == "scoped" else []
    if acl_items:
        await _validate_acl_principals(payload.dataset_id, acl_items, db)

    report.name = payload.name
    report.description = payload.description
    report.table_name = ""
    report.dataset_id = payload.dataset_id
    report.config = payload.config.model_dump()
    report.visibility = visibility
    report.is_published = (visibility == "public")
    _log_list_lookup_filters("report.update", report, report.config.get("list_lookup"))
    try:
        report.scope_strategy = ensure_scope_strategy(payload.scope_strategy)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="无效的数据范围策略") from exc
    await _replace_report_acl(db, report.id, acl_items)
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


@router.post(
    "/{report_id}/run",
    response_model=RunResult,
    dependencies=[Depends(require_op("report.list", "V"))],
)
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

    from app.automation.events import AutomationEvent, publish_event
    from app.core.db import get_session_factory
    from app.reports.sql_builder import run_dataset_query

    warnings: list[str] = []
    status = "success"
    error_message = ""
    try:
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
    except Exception as e:
        status = "failed"
        error_message = str(e)[:500]
        logger.exception("[report_run] report_id=%d 运行失败: %s", report_id, error_message)
        # 发布报表运行失败事件（使用独立session，避免事务边界问题）
        try:
            async with get_session_factory()() as new_db:
                await publish_event(
                    AutomationEvent(
                        trigger_type="report_run_failed",
                        biz_type="report",
                        biz_id=str(report.id),
                        payload={
                            "report_id": report.id,
                            "report_name": report.name,
                            "status": "failed",
                            "error_message": error_message,
                            "triggered_by": "manual",
                        },
                    ),
                    new_db,
                )
        except Exception:
            logger.warning("[report_run] 发布失败事件异常 report_id=%d", report.id)
        raise

    report.last_run_at = datetime.utcnow()
    report.run_count = (report.run_count or 0) + 1
    await db.commit()

    # 发布报表运行成功事件（使用独立session，避免事务边界问题）
    try:
        async with get_session_factory()() as new_db:
            await publish_event(
                AutomationEvent(
                    trigger_type="report_run_success",
                    biz_type="report",
                    biz_id=str(report.id),
                    payload={
                        "report_id": report.id,
                        "report_name": report.name,
                        "dataset_id": report.dataset_id,
                        "status": "success",
                        "total_rows": total,
                        "run_time": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
                        "triggered_by": "manual",
                    },
                ),
                new_db,
            )
    except Exception:
        logger.warning("[report_run] 发布成功事件异常 report_id=%d", report.id)

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
    # 数字型字段空值导出为 0（与页面显示一致）；脱敏列不转，避免污染占位
    numeric_zero_codes = {
        column["code"]
        for column in columns_meta
        if not column.get("is_sensitive")
        and column.get("data_type") in ("number", "integer")
    }

    def _export_value(item: dict[str, Any], code: str) -> Any:
        v = item.get(code, "")
        if code in numeric_zero_codes and v in (None, ""):
            return 0
        return v

    rows = [[_export_value(item, code) for code in codes] for item in items]
    return labels, rows, codes



async def collect_report_push_rows(
    report: Report,
    db: AsyncSession,
    runtime_filters: list[dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], dict[str, str]]:
    """Collect report output rows for push targets using the report owner's data scope."""
    if report.owner_id is None:
        raise RuntimeError("报表缺少创建人，无法按报表权限范围推送")
    owner = await db.get(User, report.owner_id)
    if owner is None:
        raise RuntimeError("报表创建人不存在，无法执行报表推送")
    labels, matrix, codes = await _collect_export_rows(report, owner, db, runtime_filters)
    rows = [dict(zip(codes, row, strict=False)) for row in matrix]
    return rows, dict(zip(codes, labels, strict=False))


async def get_report_push_columns(report: Report, db: AsyncSession) -> list[dict[str, Any]]:
    if report.dataset_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="报表必须绑定数据集")
    owner = await db.get(User, report.owner_id) if report.owner_id else None
    if owner is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="报表创建人不存在")
    cfg = ReportConfig(**(report.config or {}))
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
        page_size=1,
        user=owner,
        db=db,
        scope_strategy=report.scope_strategy,
    )
    columns_meta, _ = _project_report_output(columns_meta, items, cfg)
    return columns_meta


@router.get(
    "/{report_id}/push-columns",
    dependencies=[Depends(require_any_op(("report.list", "C"), ("report.list", "U")))],
)
async def report_push_columns(
    report_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, Any]]:
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    if not await _can_edit(user, report, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="仅报表创建人可配置推送")
    return await get_report_push_columns(report, db)


@router.post(
    "/{report_id}/push",
    response_model=list[ReportPushResult],
    dependencies=[Depends(require_op("report.list", "C"))],
)
async def push_report(
    report_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ReportPushResult]:
    from app.push.models import PushTarget
    from app.push.push_service import execute_push

    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="报表不存在")
    if not await _can_edit(user, report, db):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="仅报表创建人可推送")

    targets = (await db.execute(
        select(PushTarget)
        .where(PushTarget.source_table == f"report:{report_id}", PushTarget.is_active.is_(True))
        .order_by(PushTarget.id)
    )).scalars().all()
    if not targets:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="该报表未配置启用的推送目标")

    results: list[ReportPushResult] = []
    for target in targets:
        try:
            rows, message = await execute_push(target.id, db)
            results.append(ReportPushResult(
                target_id=target.id, target_name=target.name, ok=True, rows=rows, message=message
            ))
        except Exception as exc:
            target.last_push_at = datetime.utcnow()
            target.last_status = "failed"
            target.last_rows = 0
            target.last_message = str(exc)[:1000]
            results.append(ReportPushResult(
                target_id=target.id, target_name=target.name, ok=False, rows=0, message=str(exc)
            ))
    await db.commit()
    return results


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
