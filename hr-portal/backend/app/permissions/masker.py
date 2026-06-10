"""字段分类脱敏中间件（KD-4 + spec U5）

设计：
- field_category_assignments: (table, column) ↔ category 多对多
- field_categories.is_sensitive：标识"敏感"分类
- user_visible_categories ∪ role_visible_categories：用户能看见的分类集合
- 规则：column 被任一敏感分类标记，且用户没看到该分类的权限 → 脱敏为 ******
- 集成点：data/router.query_table + reports.router._run_query + 导出函数

返回 (sensitive_cols: set[str], allowed_cats: set[int]) 给调用方决定逐字段处理
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.field_category.models import (
    FieldCategory,
    FieldCategoryAssignment,
    RoleVisibleCategory,
    UserVisibleCategory,
)
from app.users.models import User, UserRole


async def _user_allowed_categories(user: User, db: AsyncSession) -> set[int]:
    """返回用户能看到的字段分类 id 集合（user_visible_categories ∪ role_visible_categories）"""
    direct = (
        await db.execute(
            select(UserVisibleCategory.category_id).where(
                UserVisibleCategory.user_id == user.id
            )
        )
    ).all()
    via_role = (
        await db.execute(
            select(RoleVisibleCategory.category_id)
            .join(UserRole, UserRole.role_id == RoleVisibleCategory.role_id)
            .where(UserRole.user_id == user.id)
        )
    ).all()
    return {r[0] for r in direct} | {r[0] for r in via_role}


async def _is_super_admin(user: User, db: AsyncSession) -> bool:
    from app.users.models import Role
    rows = (
        await db.execute(
            select(Role.name)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id, Role.is_active.is_(True))
        )
    ).all()
    return any(r[0] == "超级管理员" for r in rows)


async def get_sensitive_columns(
    user: User, table: str, db: AsyncSession
) -> set[str]:
    """返回该用户对该表"需要脱敏"的字段集合（column_name）

    判定规则：column 被打了至少一个敏感分类（含认领的全局字段所属敏感分类），
    且用户没获得该分类的可见权。
    超级管理员：返回空集（不脱敏）

    说明：本函数保留作脱敏兜底（旧报表残留无权列）。通用场景的"隐藏"用
    get_hidden_columns；两者敏感判定口径一致（都含全局字段继承的分类）。
    """
    if await _is_super_admin(user, db):
        return set()

    by_col = await _table_sensitive_category_map(table, db)
    if not by_col:
        return set()

    allowed = await _user_allowed_categories(user, db)
    sensitive: set[str] = set()
    for col, cats in by_col.items():
        if not cats.issubset(allowed):
            sensitive.add(col)
    return sensitive


MASK = "******"


def apply_mask(item: dict, sensitive_cols: set[str]) -> dict:
    """对一行 dict（业务表查询出的 item）按脱敏字段替换为 ******"""
    if not sensitive_cols:
        return item
    for col in sensitive_cols:
        if col in item and item[col] not in (None, "", "—"):
            item[col] = MASK
    return item


# ===== 统一字段裁决引擎（Phase D：授权工具白名单模型）=====
#
# 裁决规则（已与业务确认）：
#   用户对该字段分类有权限?
#   ├─ 有  → 可见（原值），白名单无关
#   └─ 无  → 当前工具在该分类的「授权工具白名单」里?
#            ├─ 在(补偿金/证明)        → 可见（白名单工具内原值可见，这是授权它的目的）
#            └─ 不在(通用数据集/报表)  → 隐藏（字段完全不可用，连聚合也拒）
#
# 敏感分类来源 = 列级 is_sensitive(物理列自身) ∪ 字段分类(直接 assignment) ∪ 认领的全局字段所属分类。
# tool_key=None 表示通用查询场景（data 视图 / 报表 / 数据集），不命中任何白名单。

VERDICT_VISIBLE = "visible"   # 原值可见
VERDICT_MASK = "mask"          # 脱敏 ****** （兜底，用于旧报表残留无权列）
VERDICT_HIDE = "hide"          # 隐藏：字段不应出现


async def _table_sensitive_category_map(
    table: str, db: AsyncSession
) -> dict[str, set[int]]:
    """该表每个列 → 命中的敏感分类 id 集合。
    合并两条来源：
      1) field_category_assignments 直接给 (table, column) 打的敏感分类
      2) 该列认领的全局字段 global_fields.category_id 是敏感分类
    """
    from app.data.models import TableColumn
    from app.global_fields.models import GlobalField

    by_col: dict[str, set[int]] = {}

    # 来源1：直接 assignment
    rows = (
        await db.execute(
            select(
                FieldCategoryAssignment.column_name, FieldCategoryAssignment.category_id
            )
            .join(FieldCategory, FieldCategory.id == FieldCategoryAssignment.category_id)
            .where(
                FieldCategoryAssignment.table_name == table,
                FieldCategory.is_sensitive.is_(True),
            )
        )
    ).all()
    for col_name, cat_id in rows:
        by_col.setdefault(col_name, set()).add(cat_id)

    # 来源2：认领的全局字段的敏感分类（诉求2，分类随字段继承）
    claim_rows = (
        await db.execute(
            select(TableColumn.column_code, GlobalField.category_id)
            .join(GlobalField, GlobalField.id == TableColumn.global_field_id)
            .join(FieldCategory, FieldCategory.id == GlobalField.category_id)
            .where(
                TableColumn.table_name == table,
                FieldCategory.is_sensitive.is_(True),
            )
        )
    ).all()
    for col_code, cat_id in claim_rows:
        if cat_id is not None:
            by_col.setdefault(col_code, set()).add(cat_id)

    return by_col


async def _whitelisted_tools_for_categories(
    cat_ids: set[int], db: AsyncSession
) -> dict[int, set[str]]:
    """分类 id → 其授权工具白名单 tool_key 集合"""
    from app.global_fields.models import FieldCategoryToolWhitelist

    if not cat_ids:
        return {}
    rows = (
        await db.execute(
            select(
                FieldCategoryToolWhitelist.category_id,
                FieldCategoryToolWhitelist.tool_key,
            ).where(FieldCategoryToolWhitelist.category_id.in_(cat_ids))
        )
    ).all()
    out: dict[int, set[str]] = {}
    for cid, tkey in rows:
        out.setdefault(cid, set()).add(tkey)
    return out


async def resolve_field_access(
    user: User,
    table: str,
    db: AsyncSession,
    tool_key: str | None = None,
) -> dict[str, str]:
    """统一字段裁决：返回 {column_code: VERDICT_*}，只含需要特殊处理（非 visible）的列。

    tool_key:
      - None        → 通用场景（data 视图/报表/数据集）：无权分类字段 → 隐藏
      - 工具标识     → 白名单工具：若该工具在分类白名单内，则无权用户原值可见
    """
    if await _is_super_admin(user, db):
        return {}

    col_cats = await _table_sensitive_category_map(table, db)
    if not col_cats:
        return {}

    allowed = await _user_allowed_categories(user, db)

    # 收集所有涉及的敏感分类，查其白名单
    all_cat_ids: set[int] = set()
    for cats in col_cats.values():
        all_cat_ids |= cats
    wl = await _whitelisted_tools_for_categories(all_cat_ids, db)

    verdicts: dict[str, str] = {}
    for col, cats in col_cats.items():
        # 用户对该列所有敏感分类都有权 → 可见
        if cats.issubset(allowed):
            continue
        # 无权的分类集合
        missing = cats - allowed
        # 只要当前工具在「任一无权分类」的白名单里，就放行可见
        in_whitelist = tool_key is not None and any(
            tool_key in wl.get(cid, set()) for cid in missing
        )
        if in_whitelist:
            continue  # 白名单工具内原值可见
        # 否则：通用场景隐藏；（兜底脱敏由调用方对旧报表残留列单独处理）
        verdicts[col] = VERDICT_HIDE
    return verdicts


async def get_hidden_columns(
    user: User, table: str, db: AsyncSession, tool_key: str | None = None
) -> set[str]:
    """通用场景下应隐藏（不出现）的列集合。"""
    verdicts = await resolve_field_access(user, table, db, tool_key)
    return {c for c, v in verdicts.items() if v == VERDICT_HIDE}
