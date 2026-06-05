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

    判定规则：column 被打了至少一个敏感分类，且用户没获得该分类的可见权
    超级管理员：返回空集（不脱敏）
    """
    if await _is_super_admin(user, db):
        return set()

    # 查所有 sensitive 分类 + 该表的字段映射
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
    if not rows:
        return set()

    allowed = await _user_allowed_categories(user, db)

    sensitive: set[str] = set()
    by_col: dict[str, set[int]] = {}
    for col_name, cat_id in rows:
        by_col.setdefault(col_name, set()).add(cat_id)
    for col, cats in by_col.items():
        # 该列所有打了敏感分类的 cat_id
        if not cats.issubset(allowed):
            # 用户没获得"该列所有敏感分类"的可见权 → 脱敏
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
