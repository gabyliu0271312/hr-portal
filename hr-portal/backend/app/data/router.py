"""5 张业务数据表的查询路由（C1 动态列）

- GET /data/{table}/columns  返回字段元信息（按 display_order）
- GET /data/{table}          分页查询；items 中每行是 {col_code: value, ...} 的字典

字段映射：物理表只有 raw JSONB，按 column_code 从 raw 提取值
"""
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data.models import DATA_TABLES, TableColumn
from app.data.formula import eval_formula
from app.datasets.metadata import effective_column_label_map
from app.users.models import User


router = APIRouter(prefix="/data", tags=["data"])


class DataPage(BaseModel):
    items: list[dict[str, Any]]
    total: int
    page: int
    page_size: int
    hidden_columns: list[str] = []


class ColumnInfo(BaseModel):
    code: str
    label: str
    data_type: str = "string"
    is_pk_part: bool = False
    is_sensitive: bool = False
    is_visible: bool = True
    display_order: int = 999
    auto_discovered: bool = True
    enum_options: list[str] | None = None
    agg_role: str = "dimension"
    is_computed: bool = False


async def _get_columns(table: str, db: AsyncSession, only_visible: bool = False) -> list[TableColumn]:
    stmt = select(TableColumn).where(TableColumn.table_name == table)
    if only_visible:
        stmt = stmt.where(TableColumn.is_visible.is_(True))
    stmt = stmt.order_by(TableColumn.display_order, TableColumn.id)
    return (await db.execute(stmt)).scalars().all()


async def _check_field_categories_sensitive(table: str, db: AsyncSession) -> set[str]:
    """从 field_categories 拉取标记为敏感的字段（与 table_columns 的 is_sensitive 合并）"""
    from app.field_category.models import FieldCategory, FieldCategoryAssignment
    sens_stmt = (
        select(FieldCategoryAssignment.column_name)
        .join(FieldCategory, FieldCategory.id == FieldCategoryAssignment.category_id)
        .where(
            FieldCategoryAssignment.table_name == table,
            FieldCategory.is_sensitive.is_(True),
        )
    )
    return {row[0] for row in (await db.execute(sens_stmt)).all()}


@router.get("/{table}/columns", response_model=list[ColumnInfo])
async def get_columns(
    table: str,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ColumnInfo]:
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")

    cols = await _get_columns(table, db)
    sens_from_cat = await _check_field_categories_sensitive(table, db)
    # 通用视图：隐藏当前用户无权的敏感列（不出现列头）
    from app.permissions.masker import get_hidden_columns
    hidden = await get_hidden_columns(user, table, db, tool_key=None)
    cols = [c for c in cols if c.column_code not in hidden]
    label_by_code = await effective_column_label_map(cols, db)

    return [
        ColumnInfo(
            code=c.column_code,
            label=label_by_code.get(c.column_code, c.column_label or c.column_code),
            data_type=c.data_type,
            is_pk_part=c.is_pk_part,
            is_sensitive=c.is_sensitive or (c.column_code in sens_from_cat),
            is_visible=c.is_visible,
            display_order=c.display_order,
            auto_discovered=c.auto_discovered,
            enum_options=c.enum_options,
            agg_role=c.agg_role,
            is_computed=c.is_computed,
        )
        for c in cols
    ]


@router.get("/{table}", response_model=DataPage)
async def query_table(
    table: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    keyword: str | None = None,
    filters: str | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> DataPage:
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")

    Model = DATA_TABLES[table]
    visible_cols = await _get_columns(table, db, only_visible=True)
    col_codes = [c.column_code for c in visible_cols]

    # 拼接 raw JSON 查询
    stmt = select(Model)
    count_stmt = select(func.count()).select_from(Model)

    # 注入数据范围权限过滤
    from app.permissions.scope_filter import build_scope_filter, is_unrestricted
    scope_clause = await build_scope_filter(user, table, db)
    if not is_unrestricted(scope_clause):
        stmt = stmt.where(scope_clause)
        count_stmt = count_stmt.where(scope_clause)

    # 精确筛选：filters 是 JSON 对象 {列编码: 值}，按 raw->>列 = 值 等值过滤
    if filters:
        import json as _json
        from sqlalchemy import cast
        from sqlalchemy.dialects.postgresql import JSONB
        try:
            fmap = _json.loads(filters)
        except (ValueError, TypeError):
            fmap = {}
        for code, val in (fmap.items() if isinstance(fmap, dict) else []):
            if val in (None, "") or code not in col_codes:
                continue
            cond = cast(Model.raw, JSONB)[code].astext == str(val)
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

    if keyword and col_codes:
        # 关键字搜索：在所有可见列上做 ILIKE
        # raw 是通用 JSON，需 cast 到 JSONB 才能用 ->> 文本访问
        from sqlalchemy import or_, cast
        from sqlalchemy.dialects.postgresql import JSONB
        conds = []
        for code in col_codes:
            conds.append(
                cast(Model.raw, JSONB)[code].astext.ilike(f"%{keyword}%")
            )
        if conds:
            stmt = stmt.where(or_(*conds))
            count_stmt = count_stmt.where(or_(*conds))

    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        stmt.order_by(desc(Model.synced_at), desc(Model.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).scalars().all()

    # 字段分类脱敏 + 隐藏（U5 / FR-MODEL-003 / SC-008 / Phase D 统一裁决）
    from app.permissions.masker import apply_mask, get_sensitive_columns, get_hidden_columns
    sensitive_cols = await get_sensitive_columns(user, table, db)
    # 通用数据视图（tool_key=None）：无权敏感字段直接隐藏，不出现在结果中
    hidden_cols = await get_hidden_columns(user, table, db, tool_key=None)

    # 把 raw 按可见列展开成扁平 dict
    items = []
    for r in rows:
        raw = r.raw or {}
        item: dict[str, Any] = {"_id": r.id, "_synced_at": r.synced_at.isoformat() if r.synced_at else None}
        for code in col_codes:
            if code in hidden_cols:
                continue
            v = raw.get(code)
            if isinstance(v, datetime):
                v = v.isoformat()
            item[code] = v
        items.append(apply_mask(item, sensitive_cols))

    return DataPage(items=items, total=total, page=page, page_size=page_size, hidden_columns=sorted(hidden_cols))


class DistinctOption(BaseModel):
    value: str
    extra: str | None = None


@router.get("/{table}/export.csv", dependencies=[Depends(require_op("data.view", "E"))])
async def export_csv(
    table: str,
    keyword: str | None = None,
    filters: str | None = None,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
):
    """导出数据视图为 CSV（带权限脱敏，全量不分页）"""
    import csv, io
    from fastapi.responses import StreamingResponse
    from sqlalchemy import or_, cast
    from sqlalchemy.dialects.postgresql import JSONB
    from app.permissions.scope_filter import build_scope_filter, is_unrestricted
    from app.permissions.masker import apply_mask, get_sensitive_columns, get_hidden_columns

    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")

    Model = DATA_TABLES[table]
    visible_cols = await _get_columns(table, db, only_visible=True)
    hidden_export = await get_hidden_columns(user, table, db, tool_key=None)
    visible_cols = [c for c in visible_cols if c.column_code not in hidden_export]
    label_by_code = await effective_column_label_map(visible_cols, db)
    col_codes = [c.column_code for c in visible_cols]

    stmt = select(Model)
    scope_clause = await build_scope_filter(user, table, db)
    if not is_unrestricted(scope_clause):
        stmt = stmt.where(scope_clause)

    if filters:
        import json as _json
        try:
            fmap = _json.loads(filters) if isinstance(filters, str) else filters
        except (ValueError, TypeError):
            fmap = {}
        for code, val in (fmap.items() if isinstance(fmap, dict) else []):
            if val not in (None, "") and code in col_codes:
                stmt = stmt.where(cast(Model.raw, JSONB)[code].astext == str(val))

    if keyword and col_codes:
        conds = [cast(Model.raw, JSONB)[code].astext.ilike(f"%{keyword}%") for code in col_codes]
        stmt = stmt.where(or_(*conds))

    rows = (await db.execute(stmt.order_by(desc(Model.synced_at), desc(Model.id)))).scalars().all()
    sensitive_cols = await get_sensitive_columns(user, table, db)
    sens_from_cat = await _check_field_categories_sensitive(table, db)
    all_sensitive = sensitive_cols | sens_from_cat

    buf = io.StringIO()
    writer = csv.writer(buf)
    headers = [label_by_code.get(c.column_code, c.column_label or c.column_code) for c in visible_cols]
    writer.writerow(headers)
    for r in rows:
        raw = r.raw or {}
        item = {c.column_code: raw.get(c.column_code) for c in visible_cols}
        item = apply_mask(item, all_sensitive)
        writer.writerow([
            "******" if (c.is_sensitive or c.column_code in all_sensitive) and item.get(c.column_code) not in (None, "")
            else ("" if item.get(c.column_code) is None else str(item.get(c.column_code)))
            for c in visible_cols
        ])

    buf.seek(0)
    filename = f"{table}.csv"
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8-sig")]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{table}/distinct", response_model=list[DistinctOption])
async def distinct_values(
    table: str,
    column: str = Query(..., min_length=1),
    label_extra: str | None = None,
    limit: int = Query(500, ge=1, le=5000),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[DistinctOption]:
    """取某表某列在数据里出现过的 distinct 值（用于报表筛选下拉）。

    - 可选 label_extra：同行带出另一列的代表值（如「维度值」带出「编码」做后缀显示）
    - 注入数据范围权限，避免越权看到无权数据的取值
    """
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")

    from sqlalchemy import cast
    from sqlalchemy.dialects.postgresql import JSONB

    valid = {c.column_code for c in await _get_columns(table, db)}
    if column not in valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="未知字段")
    extra_col = label_extra if (label_extra and label_extra in valid) else None

    Model = DATA_TABLES[table]
    val_expr = cast(Model.raw, JSONB)[column].astext

    sel = [val_expr.label("value")]
    if extra_col:
        sel.append(func.max(cast(Model.raw, JSONB)[extra_col].astext).label("extra"))
    stmt = select(*sel).where(val_expr.isnot(None), val_expr != "")

    # 数据范围权限过滤
    from app.permissions.scope_filter import build_scope_filter, is_unrestricted
    scope_clause = await build_scope_filter(user, table, db)
    if not is_unrestricted(scope_clause):
        stmt = stmt.where(scope_clause)

    stmt = stmt.group_by(val_expr).order_by(val_expr).limit(limit)
    rows = (await db.execute(stmt)).all()

    out: list[DistinctOption] = []
    for r in rows:
        m = r._mapping
        out.append(DistinctOption(value=m["value"], extra=m.get("extra") if extra_col else None))
    return out


class RowUpdateIn(BaseModel):
    values: dict[str, Any]


class BulkRowUpdateIn(BaseModel):
    row_ids: list[int]
    values: dict[str, Any]


class BulkRowDeleteIn(BaseModel):
    row_ids: list[int]


class RowCreateIn(BaseModel):
    values: dict[str, Any]


@router.post("/{table}")
async def create_row(
    table: str,
    payload: RowCreateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """手工新增一行（用于无接口、手工维护的表）。

    - 只允许填手工字段（auto_discovered=false 且非计算字段）
    - pk_hash 按业务主键列计算；同主键已存在则拒绝
    - 计算字段在写入时一并算好
    """
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")
    await require_op("data.view", "C")(user=user, db=db)

    manual = await _manual_codes(table, db)
    bad = [k for k in payload.values if k not in manual]
    if bad:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"字段 {bad} 不是手工字段，不允许手工录入",
        )

    from app.datasources.sync_service import _calc_pk_hash, _get_pk_columns

    new_raw: dict[str, Any] = dict(payload.values)
    for code, expr in await _computed_cols(table, db):
        new_raw[code] = eval_formula(expr, new_raw)

    pk_columns = await _get_pk_columns(table, db)
    pk_hash = _calc_pk_hash(new_raw, pk_columns)

    Model = DATA_TABLES[table]
    dup = (
        await db.execute(select(Model.id).where(Model.pk_hash == pk_hash))
    ).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="相同业务主键的行已存在"
        )

    row = Model(pk_hash=pk_hash, raw=new_raw)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"ok": True, "id": row.id}


async def _manual_codes(table: str, db: AsyncSession) -> set[str]:
    """可内联编辑的手工字段：auto_discovered=false 且非计算字段。"""
    return {
        c for (c,) in (
            await db.execute(
                select(TableColumn.column_code).where(
                    TableColumn.table_name == table,
                    TableColumn.auto_discovered.is_(False),
                    TableColumn.is_computed.is_(False),
                )
            )
        ).all()
    }


async def _computed_cols(table: str, db: AsyncSession) -> list[tuple[str, str]]:
    """该表的计算字段 [(code, formula), ...]"""
    rows = (
        await db.execute(
            select(TableColumn.column_code, TableColumn.formula_expr).where(
                TableColumn.table_name == table,
                TableColumn.is_computed.is_(True),
            )
        )
    ).all()
    return [(c, f) for c, f in rows if f]


@router.patch("/{table}/bulk")
async def bulk_update_rows(
    table: str,
    payload: BulkRowUpdateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """批量改值：对多行的手工字段统一赋值（如批量启用/停用）。"""
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")
    await require_op("data.view", "U")(user=user, db=db)
    if not payload.row_ids:
        return {"ok": True, "updated": 0}

    manual = await _manual_codes(table, db)
    bad = [k for k in payload.values if k not in manual]
    if bad:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"字段 {bad} 不是手工字段，不允许手工修改",
        )

    Model = DATA_TABLES[table]
    rows = (
        await db.execute(select(Model).where(Model.id.in_(payload.row_ids)))
    ).scalars().all()
    computed = await _computed_cols(table, db)
    for row in rows:
        new_raw = dict(row.raw or {})
        new_raw.update(payload.values)
        for code, expr in computed:
            new_raw[code] = eval_formula(expr, new_raw)
        row.raw = new_raw
    await db.commit()
    return {"ok": True, "updated": len(rows)}


@router.delete("/{table}/bulk")
async def bulk_delete_rows(
    table: str,
    payload: BulkRowDeleteIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """批量删除行，需要 data.view D 权限。"""
    from sqlalchemy import delete as sql_delete

    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")
    await require_op("data.view", "D")(user=user, db=db)
    if not payload.row_ids:
        return {"ok": True, "deleted": 0}
    Model = DATA_TABLES[table]
    result = await db.execute(sql_delete(Model).where(Model.id.in_(payload.row_ids)))
    await db.commit()
    return {"ok": True, "deleted": result.rowcount}


@router.patch("/{table}/{row_id}")
async def update_row(
    table: str,
    row_id: int,
    payload: RowUpdateIn,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """内联编辑：只允许改手工字段（auto_discovered=false）的值，写回 raw。

    接口字段（auto_discovered=true）每次同步会被源端覆盖，不允许手工改。
    """
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")

    # 需要对数据视图有「更新」权限
    await require_op("data.view", "U")(user=user, db=db)

    Model = DATA_TABLES[table]
    row = await db.get(Model, row_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="数据行不存在")

    # 手工字段集合
    manual_codes = await _manual_codes(table, db)
    bad = [k for k in payload.values if k not in manual_codes]
    if bad:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"字段 {bad} 不是手工字段，不允许手工修改",
        )

    new_raw = dict(row.raw or {})
    new_raw.update(payload.values)
    for code, expr in await _computed_cols(table, db):
        new_raw[code] = eval_formula(expr, new_raw)
    row.raw = new_raw
    await db.commit()
    return {"ok": True}
