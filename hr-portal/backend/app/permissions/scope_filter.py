"""数据范围权限合并引擎（KD-1，新版语义）

每个标签 = 「管理组织范围」+「管理人员范围」
- 单标签内：org_part AND person_part（部分启用就只参与启用的部分）
- 多标签间：OR

最终：tag1_clause OR tag2_clause OR ... → 跟其他系统约束 AND

集成点：
- /data/{table} 列表查询入口
- /reports/{id}/run 报表执行入口
- /reports/{id}/export.csv 导出入口

边界（spec 边界用例）：
- 用户没任何标签 → false（看不到任何行）
- 标签 org_scope_unlimited=True 且 person_scope 未启用 → 该标签贡献 true
- 节点已被树删除 → 该 selection 自动失效
"""
from __future__ import annotations

from sqlalchemy import and_, false, func, or_, select, true
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement, cast

from app.data.models import CostCenterNode, DATA_TABLES, OrgNode, TableColumn
from app.scopes.models import (
    ScopeTag,
    ScopeTagFilter,
    ScopeTagSelection,
    UserScopeTag,
)
from app.users.models import User


# ===== 工具：取标签关联数据 =====


async def _get_user_tags(
    user_id: int, db: AsyncSession
) -> list[tuple[ScopeTag, list[ScopeTagSelection], list[ScopeTagFilter]]]:
    tag_rows = (
        await db.execute(
            select(ScopeTag)
            .join(UserScopeTag, UserScopeTag.tag_id == ScopeTag.id)
            .where(UserScopeTag.user_id == user_id)
        )
    ).scalars().all()

    out: list[tuple[ScopeTag, list[ScopeTagSelection], list[ScopeTagFilter]]] = []
    for tag in tag_rows:
        sels = (
            (
                await db.execute(
                    select(ScopeTagSelection).where(
                        ScopeTagSelection.tag_id == tag.id,
                        ScopeTagSelection.node_id.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        filters = (
            (
                await db.execute(
                    select(ScopeTagFilter)
                    .where(ScopeTagFilter.tag_id == tag.id)
                    .order_by(ScopeTagFilter.order_index, ScopeTagFilter.id)
                )
            )
            .scalars()
            .all()
        )
        out.append((tag, sels, filters))
    return out


async def _get_role_columns(table: str, db: AsyncSession) -> dict[str, str]:
    """取该表所有 scope_role 不为空的字段 → {role: column_code}"""
    rows = (
        (
            await db.execute(
                select(TableColumn).where(
                    TableColumn.table_name == table,
                    TableColumn.scope_role.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    return {r.scope_role: r.column_code for r in rows}


def _raw_text(model, col_code: str) -> ColumnElement:
    """raw->>'col_code' 等价表达，兼容 JSON/JSONB 两种存储类型"""
    return func.jsonb_extract_path_text(cast(model.raw, JSONB), col_code)


async def _is_super_admin(user: User, db: AsyncSession) -> bool:
    from app.users.models import Role, UserRole

    rows = (
        await db.execute(
            select(Role.name)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id, Role.is_active.is_(True))
        )
    ).all()
    return any(r[0] == "超级管理员" for r in rows)


# ===== 单标签子句构造 =====


async def _build_org_clause(
    tag: ScopeTag,
    sels: list[ScopeTagSelection],
    Model,
    role_cols: dict[str, str],
    db: AsyncSession,
) -> ColumnElement | None:
    """组织范围子句

    返回值：
    - true()：org_scope_unlimited=True，本标签组织范围放行
    - 具体 ColumnElement：节点 IN 查询
    - false()：启用了组织范围但勾的节点对此表不命中
    - None：本表没有该维度的字段（不参与约束）
    """
    if not tag.org_scope_enabled:
        return None
    if tag.org_scope_unlimited:
        return true()

    if tag.dimension == "cost_center":
        col_key = "cc_code"
        NodeModel = CostCenterNode
    elif tag.dimension == "org":
        col_key = "org_node_code"
        NodeModel = OrgNode
    else:
        return None

    if col_key not in role_cols:
        return None

    codes: set[str] = set()
    for s in sels:
        if s.node_id is None:
            continue
        node = await db.get(NodeModel, s.node_id)
        if node is None:
            continue
        if s.include_descendants and node.path:
            descendants = (
                await db.execute(
                    select(NodeModel.code).where(NodeModel.path.like(f"{node.path}%"))
                )
            ).all()
            codes.update(r[0] for r in descendants)
        else:
            codes.add(node.code)

    if not codes:
        return false()
    return _raw_text(Model, role_cols[col_key]).in_(codes)


def _build_filter_clause(
    f: ScopeTagFilter, Model, role_cols: dict[str, str]
) -> ColumnElement | None:
    """单个 filter 子句"""
    col_code = role_cols.get(f.field_code)
    if not col_code:
        # 表没有对应字段 → 该筛选条件对此表不生效（不参与约束）
        return None
    vals = [v for v in (f.values or []) if v]
    if not vals:
        return false()
    expr = _raw_text(Model, col_code).in_(vals)
    return expr if f.operator == "eq" else ~expr


async def _build_person_clause(
    tag: ScopeTag,
    filters: list[ScopeTagFilter],
    Model,
    role_cols: dict[str, str],
) -> ColumnElement | None:
    """人员范围子句：多个 filter AND"""
    if not tag.person_scope_enabled:
        return None
    if not filters:
        # 启用了但没条件（数据异常）→ 视为 false
        return false()

    parts: list[ColumnElement] = []
    for f in filters:
        c = _build_filter_clause(f, Model, role_cols)
        if c is None:
            # 该字段对此表不存在：不参与约束
            continue
        parts.append(c)

    if not parts:
        # 全部 filter 对此表都不命中字段 → 该标签的人员范围对此表无约束
        return None
    return and_(*parts)


# ===== 主入口 =====


async def _is_scope_exempt(table: str, db: AsyncSession) -> bool:
    """该表是否被显式声明为「数据范围免控」"""
    from app.data.models import RegisteredTable

    row = (
        await db.execute(
            select(RegisteredTable.scope_exempt).where(
                RegisteredTable.table_name == table
            )
        )
    ).first()
    return bool(row[0]) if row else False


async def build_scope_filter(
    user: User, table: str, db: AsyncSession
) -> ColumnElement:
    """返回拼到查询的 where 表达式

    true()  → 无约束（全表可见）
    false() → 无权限（空集）

    fail-closed 语义（KD-1 安全修复）：
    - 超管 → 放行
    - 表显式声明 scope_exempt=True → 放行（无需按树管控）
    - 表未声明免控、却没有任何 scope_role 字段 → 拒绝（false），杜绝裸奔
    - 用户无标签 → 拒绝
    - 标签维度与表字段不匹配（解析不到约束列）→ 该标签贡献 false（不再放行）
    """
    if table not in DATA_TABLES:
        return false()
    Model = DATA_TABLES[table]

    if await _is_super_admin(user, db):
        return true()

    # 显式免控白名单：声明该表无需数据范围控制
    if await _is_scope_exempt(table, db):
        return true()

    role_cols = await _get_role_columns(table, db)
    if not role_cols:
        # 受控表却没标任何 scope_role 字段 → fail-closed 拒绝（旧逻辑此处放行=漏洞）
        return false()

    tags = await _get_user_tags(user.id, db)
    if not tags:
        # 用户没绑标签 → 看不到任何行
        return false()

    tag_clauses: list[ColumnElement] = []
    for tag, sels, filters in tags:
        org_part = await _build_org_clause(tag, sels, Model, role_cols, db)
        person_part = await _build_person_clause(tag, filters, Model, role_cols)

        parts = [p for p in (org_part, person_part) if p is not None]
        if not parts:
            # 该标签的维度在此表解析不到约束列 → fail-closed:该标签不授予可见性
            # （旧逻辑此处 append(true()) 会导致维度不匹配时越权看全表）
            tag_clauses.append(false())
        else:
            tag_clauses.append(and_(*parts))

    if not tag_clauses:
        return false()
    return or_(*tag_clauses)


def is_unrestricted(filter_clause) -> bool:
    return filter_clause is true() or filter_clause is None
