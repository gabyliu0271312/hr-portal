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

from sqlalchemy import String, and_, false, inspect, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.sql import ColumnElement, cast

from app.data.models import CostCenterNode, DATA_TABLES, OrgNode, TableColumn
from app.scopes.models import (
    ScopeTag,
    ScopeTagFilter,
    ScopeTagSelection,
    UserScopeTag,
)
from app.users.models import User
from app.permissions.strategy import (
    DEFAULT_SCOPE_STRATEGY,
    SCOPE_STRATEGY_CC_FIRST,
    SCOPE_STRATEGY_CROSS_FILTER,
    SCOPE_STRATEGY_PERSON_FIRST,
    normalize_scope_strategy,
    strategy_scope_roles,
)


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


def _table_name(model) -> str:
    return getattr(model, "__tablename__", getattr(model.__table__, "name", "unknown"))


def _entity_text(model, col_code: str) -> ColumnElement:
    """实体列文本表达式，用于保持权限筛选按字符串值匹配的原语义。"""
    table_name = _table_name(model)
    if "raw" in model.__table__.columns:
        raise RuntimeError(
            f"业务表 {table_name} 不是实体列结构，请先重建为实体列业务表"
        )
    if col_code not in model.__table__.columns:
        raise RuntimeError(f"业务表 {table_name} 缺少权限实体列: {col_code}")
    return cast(inspect(model).selectable.c[col_code], String)


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
    return _entity_text(Model, role_cols[col_key]).in_(codes)


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
    expr = _entity_text(Model, col_code).in_(vals)
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


async def _build_tag_clause(
    tag: ScopeTag,
    sels: list[ScopeTagSelection],
    filters: list[ScopeTagFilter],
    Model,
    role_cols: dict[str, str],
    db: AsyncSession,
) -> ColumnElement:
    """单个标签在给定 Model/role_cols 下的子句（org_part AND person_part）。

    解析不到任何约束列 → false()（fail-closed，不授予可见性）。
    """
    org_part = await _build_org_clause(tag, sels, Model, role_cols, db)
    person_part = await _build_person_clause(tag, filters, Model, role_cols)
    parts = [p for p in (org_part, person_part) if p is not None]
    if not parts:
        return false()
    return and_(*parts)


def _filter_tags_by_strategy(
    tags: list[tuple[ScopeTag, list[ScopeTagSelection], list[ScopeTagFilter]]],
    strategy: str | None,
) -> list[tuple[ScopeTag, list[ScopeTagSelection], list[ScopeTagFilter]]]:
    """按场景策略激活标签；cross_filter 保持旧行为（全部标签 OR）。"""
    strategy = normalize_scope_strategy(strategy)
    if strategy == SCOPE_STRATEGY_PERSON_FIRST:
        return [row for row in tags if row[0].dimension == "org"]
    if strategy == SCOPE_STRATEGY_CC_FIRST:
        return [row for row in tags if row[0].dimension == "cost_center"]
    return tags


ROSTER_TABLE = "emp_realtime_roster"
ROSTER_EMP_COL = "employee_no"


async def _get_roster_join_col(table: str, db: AsyncSession) -> str | None:
    """该表声明的「关联花名册 employee_no 的列名」（G3 穿透），未声明返回 None。"""
    from app.data.models import RegisteredTable

    row = (
        await db.execute(
            select(RegisteredTable.roster_join_col).where(
                RegisteredTable.table_name == table
            )
        )
    ).first()
    return row[0] if row and row[0] else None


def _has_strategy_roles(role_cols: dict[str, str], strategy: str | None) -> bool:
    return bool(set(role_cols) & strategy_scope_roles(strategy))


async def can_resolve_scope_strategy(
    table: str, strategy: str | None, db: AsyncSession
) -> bool:
    """当前表或其花名册穿透域能否解析该策略的核心维度。"""
    if table not in DATA_TABLES:
        return False
    strategy = normalize_scope_strategy(strategy)
    if strategy == SCOPE_STRATEGY_CROSS_FILTER:
        return True

    role_cols = await _get_role_columns(table, db)
    if _has_strategy_roles(role_cols, strategy):
        return True

    roster_join_col = await _get_roster_join_col(table, db)
    if not roster_join_col or ROSTER_TABLE not in DATA_TABLES:
        return False
    Model = DATA_TABLES[table]
    if roster_join_col not in Model.__table__.columns:
        return False
    roster_cols = await _get_role_columns(ROSTER_TABLE, db)
    return _has_strategy_roles(roster_cols, strategy)


async def _build_tag_clause_with_passthrough(
    tag: ScopeTag,
    sels: list[ScopeTagSelection],
    filters: list[ScopeTagFilter],
    Model,
    role_cols: dict[str, str],
    db: AsyncSession,
    *,
    roster_join_col: str | None,
    roster_role_cols: dict[str, str] | None,
) -> ColumnElement:
    """先用本表能解析的维度；缺的维度通过花名册子查询补齐。"""
    direct_parts: list[ColumnElement] = []
    roster_parts: list[ColumnElement] = []
    # 仅当需要 roster 穿透时才加载花名册模型，避免测试/环境未注册时误判 false
    roster_model = None

    org_part = await _build_org_clause(tag, sels, Model, role_cols, db)
    if org_part is not None:
        direct_parts.append(org_part)
    elif roster_join_col and roster_role_cols is not None:
        if roster_model is None:
            raw = DATA_TABLES.get(ROSTER_TABLE)
            if raw is not None:
                roster_model = aliased(raw, name="scope_roster")
        if roster_model is not None:
            roster_org = await _build_org_clause(tag, sels, roster_model, roster_role_cols, db)
            if roster_org is not None:
                roster_parts.append(roster_org)

    person_part = await _build_person_clause(tag, filters, Model, role_cols)
    if person_part is not None:
        direct_parts.append(person_part)
    elif roster_join_col and roster_role_cols is not None:
        if roster_model is None:
            raw = DATA_TABLES.get(ROSTER_TABLE)
            if raw is not None:
                roster_model = aliased(raw, name="scope_roster")
        if roster_model is not None:
            roster_person = await _build_person_clause(tag, filters, roster_model, roster_role_cols)
            if roster_person is not None:
                roster_parts.append(roster_person)

    if roster_parts and roster_model is not None:
        subq = select(_entity_text(roster_model, ROSTER_EMP_COL)).where(and_(*roster_parts))
        direct_parts.append(_entity_text(Model, roster_join_col).in_(subq))

    if not direct_parts:
        return false()
    return and_(*direct_parts)


# ===== 主入口 =====


async def _build_scope_filter_for_model(
    user: User,
    table: str,
    Model,
    db: AsyncSession,
    strategy: str | None = DEFAULT_SCOPE_STRATEGY,
    table_alias: str | None = None,
) -> ColumnElement:
    """返回拼到查询的 where 表达式

    true()  → 无约束（全表可见）
    false() → 无权限（空集）

    fail-closed 语义（KD-1 安全修复 + 005 收口）：
    - 超管 → 放行
    - 本表无 scope_role 字段且无 roster_join_col → 拒绝（false），杜绝裸奔
    - 用户无标签 → 拒绝
    - 标签维度在解析域（本表或花名册）都不命中约束列 → 该标签贡献 false（不放行）

    G3 穿透：本表无自有 scope_role 列、但声明了 roster_join_col 时，
    人员/组织维度经实时花名册子查询解析：
        本表.<join_col> IN (SELECT 花名册.employee_no FROM 花名册 WHERE <标签子句>)

    table_alias: 当传入时，使用 SQLAlchemy aliased() 生成带别名的列表达式。
    编译后的 SQL 中列引用会带上别名前缀（如 "t_a"."col"），避免在 data_compare
    engine 的 aliased subquery 中出现 "invalid reference to FROM-clause entry"。
    """
    strategy = normalize_scope_strategy(strategy)

    if await _is_super_admin(user, db):
        return true()

    # When called from data_compare with a table alias, use aliased() so that
    # _entity_text() generates alias-prefixed column references (e.g.
    # "t_a"."cost_center_code" instead of bare table.cost_center_code).
    # This avoids fragile regex post-processing in executor.py.
    EffectiveModel = Model
    if table_alias:
        EffectiveModel = aliased(Model, name=table_alias)

    role_cols = await _get_role_columns(table, db)
    roster_join_col = None
    if not role_cols or strategy in {SCOPE_STRATEGY_PERSON_FIRST, SCOPE_STRATEGY_CC_FIRST}:
        roster_join_col = await _get_roster_join_col(table, db)
    if not role_cols and not roster_join_col:
        # 受控表既无 scope_role 字段、也无穿透声明 → fail-closed 拒绝
        return false()

    tags = await _get_user_tags(user.id, db)
    tags = _filter_tags_by_strategy(tags, strategy)
    if not tags:
        # 用户没绑标签 → 看不到任何行
        return false()

    roster_role_cols: dict[str, str] | None = None
    if roster_join_col:
        if roster_join_col not in Model.__table__.columns or ROSTER_TABLE not in DATA_TABLES:
            return false()
        roster_role_cols = await _get_role_columns(ROSTER_TABLE, db)

    tag_clauses: list[ColumnElement] = []
    for tag, sels, filters in tags:
        tag_clauses.append(
            await _build_tag_clause_with_passthrough(
                tag,
                sels,
                filters,
                EffectiveModel,
                role_cols,
                db,
                roster_join_col=roster_join_col,
                roster_role_cols=roster_role_cols,
            )
        )

    if not tag_clauses:
        return false()
    if any(c is true() for c in tag_clauses):
        # 某标签无限制（org_scope_unlimited）→ 看全部（穿透表也含花名册之外的历史行）
        return true()

    return or_(*tag_clauses)


async def build_scope_filter(
    user: User,
    table: str,
    db: AsyncSession,
    strategy: str | None = DEFAULT_SCOPE_STRATEGY,
    table_alias: str | None = None,
) -> ColumnElement:
    """返回拼到查询的 where 表达式。

    table_alias: 指定表别名（如 "t_a"、"v"），编译后列引用会带别名前缀。
    用于 data_compare engine 的 aliased subquery 场景。不传则保留默认行为。
    """
    if table not in DATA_TABLES:
        return false()
    return await _build_scope_filter_for_model(
        user,
        table,
        DATA_TABLES[table],
        db,
        strategy=strategy,
        table_alias=table_alias,
    )


def is_unrestricted(filter_clause) -> bool:
    return filter_clause is true() or filter_clause is None
