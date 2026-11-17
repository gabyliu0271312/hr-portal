"""分摊结果页查询逻辑（与 router 分离，便于复用与测试）。"""
from __future__ import annotations

from typing import Any

from sqlalchemy import String, cast, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import CostCenterNode, DATA_TABLES
from app.permissions.masker import get_hidden_columns, get_sensitive_columns
from app.permissions.scope_filter import build_scope_filter, is_unrestricted

SOURCE_TABLE = "emp_monthly_allocation"
ROSTER_TABLE = "emp_realtime_roster"

MASK = "******"

# hidden 列完全不出现在结果；sensitive 列以 ****** 占位（真值不出库）


def _masked(value: Any) -> Any:
    return MASK if value is not None else None


async def list_allocation_rows(
    db: AsyncSession,
    user: Any,
    page: int = 1,
    page_size: int = 20,
    keyword: str | None = None,
) -> dict[str, Any]:
    """分摊表行查询：人员 D 范围过滤 + 字段脱敏 + 成本中心树编码校验。

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

    cc_codes = {r[0] for r in (await db.execute(select(CostCenterNode.code))).all()}
    cc_name_map = dict((await db.execute(select(CostCenterNode.code, CostCenterNode.name))).all())

    roster_model = DATA_TABLES.get(ROSTER_TABLE)
    roster_name_map: dict[str, str] = {}
    if roster_model is not None:
        roster_name_map = dict(
            (await db.execute(select(roster_model.employee_no, roster_model.full_name))).all()
        )

    items: list[dict[str, Any]] = []
    for row in rows:
        items.append(_build_item(row, cc_codes, cc_name_map, roster_name_map, hidden_cols, masked_cols))

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "hidden_columns": sorted(hidden_cols),
    }


def _build_item(
    row: Any,
    cc_codes: set[str],
    cc_name_map: dict[str, str],
    roster_name_map: dict[str, str],
    hidden_cols: set[str],
    masked_cols: set[str],
) -> dict[str, Any]:
    """单行组装：主数据一致性与脱敏（纯函数，便于测试）。"""
    item: dict[str, Any] = {"_id": getattr(row, "id", None)}
    synced = getattr(row, "synced_at", None)
    item["_synced_at"] = synced.isoformat() if synced else None

    cost_period = getattr(row, "cost_period", None)
    employee_no = getattr(row, "employee_no", None)
    code = getattr(row, "code", None)
    headcount = getattr(row, "headcount", None)
    employee_snapshot = getattr(row, "employee", None)

    if "cost_period" not in hidden_cols:
        item["cost_period"] = _masked(cost_period) if "cost_period" in masked_cols else cost_period
    if "employee_no" not in hidden_cols:
        item["employee_no"] = _masked(employee_no) if "employee_no" in masked_cols else employee_no
    if "code" not in hidden_cols:
        item["code"] = _masked(code) if "code" in masked_cols else code
    roster_name = roster_name_map.get(employee_no)
    item["employee_name"] = (
        _masked(roster_name) if roster_name and "employee_no" in masked_cols
        else roster_name if roster_name
        else _masked(employee_snapshot) if "employee_no" in masked_cols and employee_snapshot is not None
        else employee_snapshot
    )
    item["_employee_name_source"] = "roster" if roster_name else "snapshot"
    item["cc_name"] = _masked(cc_name_map.get(code)) if "code" in masked_cols else cc_name_map.get(code)
    item["_cc_valid"] = code is None or code in cc_codes
    item["headcount"] = _masked(headcount) if "headcount" in masked_cols else headcount
    item["allocation_percentage"] = item["headcount"]
    return item
