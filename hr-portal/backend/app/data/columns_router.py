"""字段元数据管理路由

管理员可以：
- 查看某张表的所有字段
- 改字段中文名 / 类型 / 主键 / 敏感 / 显示开关 / 顺序
- 手动新增字段（不走自动发现）
- 删除自动发现但实际不需要的字段

所有操作都按 (table_name, column_code) 定位。
"""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data.models import DATA_TABLES, TableColumn
from app.users.models import User


router = APIRouter(prefix="/table-columns", tags=["table-columns"])


async def _validate_formula(
    table: str, column_code: str, formula_expr: str | None, db: AsyncSession
) -> None:
    """计算字段校验：公式必填、引用列须存在于本表、不可自引用。"""
    from app.data.formula import extract_refs

    expr = (formula_expr or "").strip()
    if not expr:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="计算字段必须填写公式"
        )
    refs = extract_refs(expr)
    if not refs:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="公式里至少引用一个字段，格式如 [字段编码] + [字段编码]",
        )
    if column_code in refs:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="计算字段不能引用自身"
        )
    existing = {
        c for (c,) in (
            await db.execute(
                select(TableColumn.column_code).where(
                    TableColumn.table_name == table
                )
            )
        ).all()
    }
    missing = [r for r in refs if r not in existing]
    if missing:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"公式引用了不存在的字段：{missing}",
        )


class ColumnIn(BaseModel):
    column_code: str = Field(min_length=1, max_length=128)
    column_label: str = Field(min_length=1, max_length=128)
    data_type: str = "string"
    is_pk_part: bool = False
    is_sensitive: bool = False
    is_visible: bool = True
    display_order: int = 999
    description: str | None = None
    scope_role: str | None = None
    copy_from_last_month: bool = False
    enum_options: list[str] | None = None
    agg_role: str = "dimension"
    is_computed: bool = False
    formula_expr: str | None = None


class ColumnOut(BaseModel):
    id: int
    table_name: str
    column_code: str
    column_label: str
    data_type: str
    is_pk_part: bool
    is_sensitive: bool
    is_visible: bool
    display_order: int
    auto_discovered: bool
    description: str | None
    scope_role: str | None
    copy_from_last_month: bool
    enum_options: list[str] | None
    agg_role: str
    is_computed: bool
    formula_expr: str | None
    global_field_id: int | None
    created_at: datetime
    updated_at: datetime


class BulkUpdateIn(BaseModel):
    columns: list[dict[str, Any]]


def _to_out(c: TableColumn) -> ColumnOut:
    return ColumnOut(
        id=c.id,
        table_name=c.table_name,
        column_code=c.column_code,
        column_label=c.column_label,
        data_type=c.data_type,
        is_pk_part=c.is_pk_part,
        is_sensitive=c.is_sensitive,
        is_visible=c.is_visible,
        display_order=c.display_order,
        auto_discovered=c.auto_discovered,
        description=c.description,
        scope_role=c.scope_role,
        copy_from_last_month=c.copy_from_last_month,
        enum_options=c.enum_options,
        agg_role=c.agg_role,
        is_computed=c.is_computed,
        formula_expr=c.formula_expr,
        global_field_id=c.global_field_id,
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("/tables")
async def list_tables(_: User = Depends(current_user)) -> list[dict[str, str]]:
    """返回所有支持的业务表清单"""
    LABELS = {
        "emp_realtime_roster": "员工实时花名册",
        "emp_monthly_roster": "员工月度花名册",
        "emp_monthly_salary": "员工月度工资表",
        "emp_monthly_allocation": "员工月度成本分摊表",
        "cost_center_monthly": "成本中心月度维护表",
        "emp_monthly_cost_class": "员工月度成本归集分类表",
    }
    return [{"table_name": k, "label": LABELS.get(k, k)} for k in DATA_TABLES.keys()]


@router.get("/{table}", response_model=list[ColumnOut])
async def list_columns(
    table: str,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ColumnOut]:
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")
    rows = (
        (
            await db.execute(
                select(TableColumn)
                .where(TableColumn.table_name == table)
                .order_by(TableColumn.display_order, TableColumn.id)
            )
        )
        .scalars()
        .all()
    )
    return [_to_out(r) for r in rows]


@router.post(
    "/{table}",
    response_model=ColumnOut,
    dependencies=[Depends(require_op("system.field_categories", "C"))],
)
async def create_column(
    table: str,
    payload: ColumnIn,
    db: AsyncSession = Depends(get_session),
) -> ColumnOut:
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")
    # 防重
    exists = (
        await db.execute(
            select(TableColumn).where(
                TableColumn.table_name == table,
                TableColumn.column_code == payload.column_code,
            )
        )
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="该字段已存在")

    if payload.is_computed:
        await _validate_formula(table, payload.column_code, payload.formula_expr, db)

    col = TableColumn(
        table_name=table,
        column_code=payload.column_code,
        column_label=payload.column_label,
        data_type=payload.data_type,
        is_pk_part=payload.is_pk_part,
        is_sensitive=payload.is_sensitive,
        is_visible=payload.is_visible,
        display_order=payload.display_order,
        description=payload.description,
        scope_role=payload.scope_role,
        copy_from_last_month=payload.copy_from_last_month,
        enum_options=payload.enum_options,
        agg_role=payload.agg_role,
        is_computed=payload.is_computed,
        formula_expr=payload.formula_expr if payload.is_computed else None,
        auto_discovered=False,
    )
    db.add(col)
    await db.commit()
    await db.refresh(col)
    return _to_out(col)


@router.put(
    "/{table}/bulk",
    dependencies=[Depends(require_op("system.field_categories", "U"))],
)
async def bulk_update(
    table: str,
    payload: BulkUpdateIn,
    db: AsyncSession = Depends(get_session),
) -> dict[str, int]:
    """批量更新（用于拖拽排序后一次性保存）"""
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")

    updated = 0
    for item in payload.columns:
        cid = item.get("id")
        if not cid:
            continue
        col = await db.get(TableColumn, cid)
        if col is None or col.table_name != table:
            continue
        # 接口字段不允许开启「复制上月」
        if item.get("copy_from_last_month") and col.auto_discovered:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail=f"字段「{col.column_label}」是接口字段，不支持复制上月",
            )
        if item.get("is_computed"):
            if col.auto_discovered:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    detail=f"字段「{col.column_label}」是接口字段，不能设为计算字段",
                )
            await _validate_formula(table, col.column_code, item.get("formula_expr"), db)
        for k in (
            "column_label",
            "data_type",
            "is_pk_part",
            "is_sensitive",
            "is_visible",
            "display_order",
            "description",
            "scope_role",
            "copy_from_last_month",
            "enum_options",
            "agg_role",
            "is_computed",
            "formula_expr",
            "global_field_id",
        ):
            if k in item:
                setattr(col, k, item[k])
        if not col.is_computed:
            col.formula_expr = None
        updated += 1

    await db.commit()
    return {"updated": updated}


@router.put(
    "/{table}/{column_id}",
    response_model=ColumnOut,
    dependencies=[Depends(require_op("system.field_categories", "U"))],
)
async def update_column(
    table: str,
    column_id: int,
    payload: ColumnIn,
    db: AsyncSession = Depends(get_session),
) -> ColumnOut:
    col = await db.get(TableColumn, column_id)
    if col is None or col.table_name != table:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="字段不存在")
    # 接口字段不允许开启「复制上月」
    if payload.copy_from_last_month and col.auto_discovered:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="接口字段不支持复制上月",
        )
    if payload.is_computed:
        if col.auto_discovered:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="接口字段不能设为计算字段",
            )
        await _validate_formula(table, col.column_code, payload.formula_expr, db)
    col.column_label = payload.column_label
    col.data_type = payload.data_type
    col.is_pk_part = payload.is_pk_part
    col.is_sensitive = payload.is_sensitive
    col.is_visible = payload.is_visible
    col.display_order = payload.display_order
    col.description = payload.description
    col.scope_role = payload.scope_role
    col.copy_from_last_month = payload.copy_from_last_month
    col.enum_options = payload.enum_options
    col.agg_role = payload.agg_role
    col.is_computed = payload.is_computed
    col.formula_expr = payload.formula_expr if payload.is_computed else None
    # column_code 不允许改（PK 一致性）
    await db.commit()
    await db.refresh(col)
    return _to_out(col)


@router.post(
    "/{table}/recompute",
    dependencies=[Depends(require_op("system.field_categories", "U"))],
)
async def recompute_computed_columns(
    table: str,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """重算该表的自动字段：计算字段（公式）+ 跨表查找字段（只填空），写回 raw。

    新建公式/查找规则后立即回填，免等下次同步。
    """
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")

    from app.data.formula import eval_formula
    from app.datasources.sync_service import apply_lookups_to_row, build_lookup_maps

    computed = (
        await db.execute(
            select(TableColumn.column_code, TableColumn.formula_expr).where(
                TableColumn.table_name == table,
                TableColumn.is_computed.is_(True),
            )
        )
    ).all()
    computed = [(c, f) for c, f in computed if f]
    lookup_maps = await build_lookup_maps(table, db)
    if not computed and not lookup_maps:
        return {"ok": True, "updated_rows": 0, "computed_columns": 0, "lookup_fields": 0}

    Model = DATA_TABLES[table]
    rows = (await db.execute(select(Model))).scalars().all()
    updated = 0
    for row in rows:
        new_raw = dict(row.raw or {})
        apply_lookups_to_row(new_raw, lookup_maps)
        for code, expr in computed:
            new_raw[code] = eval_formula(expr, new_raw)
        row.raw = new_raw
        updated += 1
    await db.commit()
    return {
        "ok": True,
        "updated_rows": updated,
        "computed_columns": len(computed),
        "lookup_fields": len(lookup_maps),
    }


@router.delete(
    "/{table}/{column_id}",
    dependencies=[Depends(require_op("system.field_categories", "D"))],
)
async def delete_column(
    table: str,
    column_id: int,
    db: AsyncSession = Depends(get_session),
) -> dict[str, bool]:
    from sqlalchemy import text

    col = await db.get(TableColumn, column_id)
    if col is None or col.table_name != table:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="字段不存在")

    column_code = col.column_code

    # 1) 删字段元数据
    await db.delete(col)
    await db.flush()

    # 2) 从所有行的 raw JSON 里硬删除该字段 key（PostgreSQL JSONB - 操作符）
    if table in DATA_TABLES:
        await db.execute(
            text(f'UPDATE "{table}" SET raw = raw::jsonb - :key WHERE raw::jsonb ? :key'),
            {"key": column_code},
        )

    await db.commit()
    return {"ok": True}


@router.post(
    "/{table}/clean-orphans",
    dependencies=[Depends(require_op("system.field_categories", "D"))],
)
async def clean_orphan_columns(
    table: str,
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """扫描业务表所有 raw 数据，删除"在所有行中都不存在"的字段元数据。

    用途：源端字段重命名 / 删除 / 数据源切换后，table_columns 残留旧字段。
    安全保护：
    - 跳过 is_pk_part=true（防止误删主键定义）
    - 跳过 auto_discovered=false（管理员手动建的字段保留）
    - 不删 raw 数据，只删元数据
    """
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")

    Model = DATA_TABLES[table]

    # 1) 取所有字段元数据
    cols = (
        (
            await db.execute(
                select(TableColumn).where(TableColumn.table_name == table)
            )
        )
        .scalars()
        .all()
    )

    # 2) 扫描所有 raw 数据，收集出现过的 key
    seen_keys: set[str] = set()
    rows = (await db.execute(select(Model.raw))).all()
    for (raw,) in rows:
        if isinstance(raw, dict):
            seen_keys.update(raw.keys())

    # 3) 找出孤儿
    deleted: list[str] = []
    for c in cols:
        if c.is_pk_part:
            continue
        if not c.auto_discovered:
            continue
        if c.column_code in seen_keys:
            continue
        deleted.append(c.column_code)
        await db.delete(c)

    await db.commit()
    return {
        "ok": True,
        "deleted_count": len(deleted),
        "deleted_codes": deleted,
        "total_rows_scanned": len(rows),
        "total_columns_before": len(cols),
    }
