"""薪资结果页查询逻辑（与 router 分离，便于复用与测试）。

- GET /payroll-result/fields : 薪资结果表单绑定字段（驱动列渲染，普通人员页只读）
- GET /payroll-result/rows   : 工资表行（人员 D 过滤 + 字段脱敏 + 组织投影回填列）

主数据一致性：
- 员工编号/姓名语义 = 花名册（工作信息分组权威源，在职+离职都算）
- 组织编码/名称语义 = 组织树（组织信息分组权威源）
- 工资表行由资产写入（WarehouseAssetSink）落库时已完成权威校验与 org_level_1..4_code 投影回填
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import String, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import DATA_TABLES
from app.permissions.masker import get_hidden_columns, get_sensitive_columns
from app.permissions.scope_filter import build_scope_filter, is_unrestricted

SOURCE_TABLE = "emp_monthly_salary"

MASK = "******"


def _masked(value: Any) -> Any:
    return MASK if value is not None else None


async def list_payroll_rows(
    db: AsyncSession,
    user: Any,
    page: int = 1,
    page_size: int = 20,
    keyword: str | None = None,
) -> dict[str, Any]:
    """工资表行查询：人员 D 范围过滤 + 字段脱敏。

    返回 {items, total, page, page_size, hidden_columns}。
    """
    if SOURCE_TABLE not in DATA_TABLES:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "hidden_columns": []}
    Model = DATA_TABLES[SOURCE_TABLE]

    scope_clause = await build_scope_filter(user, SOURCE_TABLE, db, strategy="person_first")

    stmt = select(Model)
    count_stmt = select(func.count()).select_from(Model)
    if not is_unrestricted(scope_clause):
        stmt = stmt.where(scope_clause)
        count_stmt = count_stmt.where(scope_clause)

    hidden_cols = await get_hidden_columns(user, SOURCE_TABLE, db, tool_key=None)
    masked_cols = await get_sensitive_columns(user, SOURCE_TABLE, db)

    if keyword:
        visible_codes = [
            c.name for c in Model.__table__.columns
            if c.name not in hidden_cols and c.name not in masked_cols
            and c.name not in {"id", "pk_hash", "raw"}
        ]
        if visible_codes:
            conds = [cast(Model.__table__.c[code], String).ilike(f"%{keyword}%") for code in visible_codes]
            stmt = stmt.where(or_(*conds))

    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        stmt.order_by(desc(Model.synced_at), desc(Model.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).all()

    items: list[dict[str, Any]] = []
    for row in rows:
        items.append(_build_item(row, hidden_cols, masked_cols))

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "hidden_columns": sorted(hidden_cols),
    }


def _build_item(row: Any, hidden_cols: set[str], masked_cols: set[str]) -> dict[str, Any]:
    """单行组装：脱敏 + 透出组织投影回填列（纯函数，便于测试）。"""
    item: dict[str, Any] = {"_id": getattr(row, "id", None)}
    synced = getattr(row, "synced_at", None)
    item["_synced_at"] = synced.isoformat() if synced else None

    mapping = getattr(row, "_mapping", None)
    if mapping is None:
        return item
    for name, value in mapping.items():
        if name in {"id", "pk_hash", "raw"}:
            continue
        if name in hidden_cols:
            continue
        if name in masked_cols:
            item[name] = _masked(value)
        else:
            item[name] = value
    return item
