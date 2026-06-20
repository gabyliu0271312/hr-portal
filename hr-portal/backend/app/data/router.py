"""5 张业务数据表的查询路由（C1 动态列）

- GET /data/{table}/columns  返回字段元信息（按 display_order）
- GET /data/{table}          分页查询；items 中每行是 {col_code: value, ...} 的字典

字段映射：业务字段来自实体列，column_code 必须对应真实数据库列
"""
import json
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import String, case, cast, desc, func, literal, null, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data.formula import eval_formula
from app.data.models import DATA_TABLES, TableColumn
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


def _ensure_entity_model(Model, table: str) -> None:
    """数据视图只允许读取实体列业务表。"""
    if "raw" in Model.__table__.columns:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"业务表 {table} 不是实体列结构，请先重建为实体列业务表",
        )


def _entity_column(Model, table: str, column_code: str):
    if column_code not in Model.__table__.columns:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"业务表 {table} 缺少实体列: {column_code}",
        )
    return Model.__table__.c[column_code]


def _entity_text_expr(Model, table: str, column_code: str):
    return cast(_entity_column(Model, table, column_code), String)


def _normalize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return value


def _row_value(row: Any, code: str) -> Any:
    if not hasattr(row, code):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"数据行缺少实体列: {code}",
        )
    return _normalize_value(getattr(row, code))


def _row_to_item(row: Any, col_codes: list[str], hidden_cols: set[str]) -> dict[str, Any]:
    item: dict[str, Any] = {
        "_id": row.id,
        "_synced_at": row.synced_at.isoformat() if row.synced_at else None,
    }
    for code in col_codes:
        if code in hidden_cols:
            continue
        item[code] = _row_value(row, code)
    return item


def _row_values(row: Any, col_codes: list[str]) -> dict[str, Any]:
    return {code: _row_value(row, code) for code in col_codes}


MASK = "******"


def _scoped_projection(
    Model, table: str, col_codes: list[str], hidden_cols: set[str], masked_cols: set[str]
):
    """显式列投影：隐藏列不进 SELECT；脱敏列在 SQL 内用 CASE 占位为 ******（真值不出库，保留 NULL）。"""
    proj = [Model.id.label("id"), Model.synced_at.label("synced_at")]
    for code in col_codes:
        if code in hidden_cols:
            continue
        ent = _entity_column(Model, table, code)
        if code in masked_cols:
            proj.append(case((ent.is_(None), null()), else_=literal(MASK)).label(code))
        else:
            proj.append(ent.label(code))
    return proj


def _set_row_value(row: Any, code: str, value: Any) -> None:
    if not hasattr(row, code):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"数据行缺少实体列: {code}",
        )
    setattr(row, code, value)


async def _source_column_map(table: str, db: AsyncSession) -> dict[str, TableColumn]:
    return {
        c.column_code: c
        for c in await _get_columns(table, db)
    }


def _coerce_manual_value(value: Any, data_type: str) -> Any:
    """手工录入值按字段类型转为实体列可写值；无法转换时写 NULL。"""
    if value in (None, ""):
        return None
    key = (data_type or "string").strip().lower()
    if key in {"string", "text", "enum"}:
        if isinstance(value, (dict, list)):
            return json.dumps(value, ensure_ascii=False)
        return str(value)
    if key == "number":
        try:
            return Decimal(str(value).replace(",", "").strip())
        except Exception:
            return None
    if key == "integer":
        try:
            return int(Decimal(str(value).replace(",", "").strip()))
        except Exception:
            return None
    if key == "date":
        if isinstance(value, date) and not isinstance(value, datetime):
            return value
        text = str(value).strip().replace("/", "-")
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None
    if key == "datetime":
        if isinstance(value, datetime):
            return value
        text = str(value).strip().replace("/", "-").replace("T", " ")
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                width = 19 if " " in fmt else 10
                return datetime.strptime(text[:width], fmt).replace(tzinfo=UTC)
            except ValueError:
                pass
        return None
    if key in {"boolean", "bool"}:
        if isinstance(value, bool):
            return value
        text = str(value).strip().lower()
        if text in {"1", "true", "t", "yes", "y", "是", "启用"}:
            return True
        if text in {"0", "false", "f", "no", "n", "否", "停用"}:
            return False
        return None
    return value


def _apply_entity_values(row: Any, values: dict[str, Any], columns_by_code: dict[str, TableColumn]) -> None:
    for code, value in values.items():
        col = columns_by_code.get(code)
        if col is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"未知字段: {code}")
        _set_row_value(row, code, _coerce_manual_value(value, col.data_type))


def _apply_computed_values(row: Any, computed: list[tuple[str, str]], columns_by_code: dict[str, TableColumn]) -> None:
    if not computed:
        return
    current = _row_values(row, list(columns_by_code))
    for code, expr in computed:
        value = eval_formula(expr, current)
        col = columns_by_code.get(code)
        _set_row_value(
            row,
            code,
            _coerce_manual_value(value, col.data_type if col is not None else "string"),
        )
        current[code] = value


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
    _ensure_entity_model(Model, table)
    visible_cols = await _get_columns(table, db, only_visible=True)
    col_codes = [c.column_code for c in visible_cols]
    for code in col_codes:
        _entity_column(Model, table, code)

    # 字段裁决：隐藏列不进 SELECT，脱敏列在 SQL 内 CASE 占位（真值不出库）
    from app.permissions.masker import get_sensitive_columns, get_hidden_columns
    sensitive_cols = await get_sensitive_columns(user, table, db)
    # 通用数据视图（tool_key=None）：无权敏感字段直接隐藏，不出现在结果中
    hidden_cols = await get_hidden_columns(user, table, db, tool_key=None)
    # 隐藏/脱敏列不可被搜索或筛选命中，避免通过查询反推真值
    blocked = hidden_cols | sensitive_cols

    # 拼接实体列查询（显式投影）
    stmt = select(*_scoped_projection(Model, table, col_codes, hidden_cols, sensitive_cols))
    count_stmt = select(func.count()).select_from(Model)

    # 注入数据范围权限过滤
    from app.permissions.scope_filter import build_scope_filter, is_unrestricted
    scope_clause = await build_scope_filter(user, table, db)
    if not is_unrestricted(scope_clause):
        stmt = stmt.where(scope_clause)
        count_stmt = count_stmt.where(scope_clause)

    # 精确筛选：filters 是 JSON 对象 {列编码: 值}，按真实实体列文本等值过滤
    if filters:
        try:
            fmap = json.loads(filters)
        except (ValueError, TypeError):
            fmap = {}
        for code, val in (fmap.items() if isinstance(fmap, dict) else []):
            if val in (None, "") or code not in col_codes or code in blocked:
                continue
            cond = _entity_text_expr(Model, table, code) == str(val)
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

    if keyword and col_codes:
        # 关键字搜索：在所有可见且非隐藏/非脱敏列上做 ILIKE
        conds = [
            _entity_text_expr(Model, table, code).ilike(f"%{keyword}%")
            for code in col_codes
            if code not in blocked
        ]
        if conds:
            stmt = stmt.where(or_(*conds))
            count_stmt = count_stmt.where(or_(*conds))

    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        stmt.order_by(desc(Model.synced_at), desc(Model.id))
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).all()

    # 投影已完成隐藏/脱敏：隐藏列不在结果、脱敏列已是 ******
    items = [_row_to_item(r, col_codes, hidden_cols) for r in rows]

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
    from app.permissions.scope_filter import build_scope_filter, is_unrestricted
    from app.permissions.masker import get_sensitive_columns, get_hidden_columns

    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")

    Model = DATA_TABLES[table]
    _ensure_entity_model(Model, table)
    visible_cols = await _get_columns(table, db, only_visible=True)
    hidden_export = await get_hidden_columns(user, table, db, tool_key=None)
    visible_cols = [c for c in visible_cols if c.column_code not in hidden_export]
    label_by_code = await effective_column_label_map(visible_cols, db)
    col_codes = [c.column_code for c in visible_cols]
    for code in col_codes:
        _entity_column(Model, table, code)

    # 脱敏列集合（含表级 is_sensitive + 字段分类敏感）；隐藏列已从 visible_cols 排除
    sensitive_cols = await get_sensitive_columns(user, table, db)
    sens_from_cat = await _check_field_categories_sensitive(table, db)
    all_sensitive = sensitive_cols | sens_from_cat | {
        c.column_code for c in visible_cols if c.is_sensitive
    }
    blocked = hidden_export | all_sensitive

    stmt = select(*_scoped_projection(Model, table, col_codes, hidden_export, all_sensitive))
    scope_clause = await build_scope_filter(user, table, db)
    if not is_unrestricted(scope_clause):
        stmt = stmt.where(scope_clause)

    if filters:
        try:
            fmap = json.loads(filters) if isinstance(filters, str) else filters
        except (ValueError, TypeError):
            fmap = {}
        for code, val in (fmap.items() if isinstance(fmap, dict) else []):
            if val not in (None, "") and code in col_codes and code not in blocked:
                stmt = stmt.where(_entity_text_expr(Model, table, code) == str(val))

    if keyword and col_codes:
        conds = [
            _entity_text_expr(Model, table, code).ilike(f"%{keyword}%")
            for code in col_codes
            if code not in blocked
        ]
        if conds:
            stmt = stmt.where(or_(*conds))

    rows = (await db.execute(stmt.order_by(desc(Model.synced_at), desc(Model.id)))).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    headers = [label_by_code.get(c.column_code, c.column_label or c.column_code) for c in visible_cols]
    writer.writerow(headers)
    for r in rows:
        item = _row_values(r, col_codes)
        writer.writerow([
            "" if item.get(c.column_code) is None else str(item.get(c.column_code))
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

    valid = {c.column_code for c in await _get_columns(table, db)}
    if column not in valid:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="未知字段")
    # 隐藏/脱敏列不可取 distinct，避免绕过裁决反推真值
    from app.permissions.masker import get_sensitive_columns, get_hidden_columns
    blocked = (
        await get_hidden_columns(user, table, db, tool_key=None)
    ) | (await get_sensitive_columns(user, table, db))
    if column in blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="无权获取该字段取值")
    extra_col = label_extra if (label_extra and label_extra in valid and label_extra not in blocked) else None

    Model = DATA_TABLES[table]
    _ensure_entity_model(Model, table)
    val_expr = _entity_text_expr(Model, table, column)

    sel = [val_expr.label("value")]
    if extra_col:
        sel.append(func.max(_entity_text_expr(Model, table, extra_col)).label("extra"))
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

    new_values: dict[str, Any] = dict(payload.values)
    for code, expr in await _computed_cols(table, db):
        new_values[code] = eval_formula(expr, new_values)

    pk_columns = await _get_pk_columns(table, db)
    pk_hash = _calc_pk_hash(new_values, pk_columns)

    Model = DATA_TABLES[table]
    _ensure_entity_model(Model, table)
    columns_by_code = await _source_column_map(table, db)
    for code in set(new_values) | set(pk_columns):
        _entity_column(Model, table, code)

    dup = (
        await db.execute(select(Model.id).where(Model.pk_hash == pk_hash))
    ).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="相同业务主键的行已存在"
        )

    row = Model(pk_hash=pk_hash, synced_at=datetime.now(UTC))
    _apply_entity_values(row, new_values, columns_by_code)
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
    _ensure_entity_model(Model, table)
    columns_by_code = await _source_column_map(table, db)
    computed = await _computed_cols(table, db)
    for code in set(payload.values) | {code for code, _ in computed}:
        _entity_column(Model, table, code)
    rows = (
        await db.execute(select(Model).where(Model.id.in_(payload.row_ids)))
    ).scalars().all()
    for row in rows:
        _apply_entity_values(row, payload.values, columns_by_code)
        _apply_computed_values(row, computed, columns_by_code)
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
    """内联编辑：只允许改手工字段（auto_discovered=false）的实体列值。

    接口字段（auto_discovered=true）每次同步会被源端覆盖，不允许手工改。
    """
    if table not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")

    # 需要对数据视图有「更新」权限
    await require_op("data.view", "U")(user=user, db=db)

    Model = DATA_TABLES[table]
    _ensure_entity_model(Model, table)
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

    columns_by_code = await _source_column_map(table, db)
    computed = await _computed_cols(table, db)
    for code in set(payload.values) | {code for code, _ in computed}:
        _entity_column(Model, table, code)
    _apply_entity_values(row, payload.values, columns_by_code)
    _apply_computed_values(row, computed, columns_by_code)
    await db.commit()
    return {"ok": True}
