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
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.deps import current_user, require_op
from app.data.ddl import (
    DDLValidationError,
    add_source_column,
    alter_source_column_type,
    column_exists,
    drop_source_column,
    postgres_type,
    quote_ident,
    validate_column_name,
    validate_table_name,
)
from app.data.dynamic_loader import register_source_table_model
from app.data.models import DATA_TABLES, TableColumn
from app.datasets.metadata import table_options
from app.users.models import User


router = APIRouter(prefix="/table-columns", tags=["table-columns"])


def _ddl_http_error(exc: Exception) -> HTTPException:
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc))


def _ensure_known_table(table: str) -> str:
    try:
        table_name = validate_table_name(table)
    except DDLValidationError as exc:
        raise _ddl_http_error(exc) from exc
    if table_name not in DATA_TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="未知数据表")
    return table_name


def _validate_payload_column_code(column_code: str) -> str:
    try:
        return validate_column_name(column_code)
    except DDLValidationError as exc:
        raise _ddl_http_error(exc) from exc


def _ensure_entity_model(Model, table: str) -> None:
    model_table = getattr(Model, "__table__", None)
    if model_table is not None and "raw" in model_table.columns:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"业务表 {table} 不是实体列结构，请先重建为实体列业务表",
        )


def _type_change_using_expr(column_code: str, data_type: str) -> str:
    col = quote_ident(column_code)
    key = (data_type or "string").strip().lower()
    if key in {"string", "text", "enum"}:
        return f"{col}::text"
    if key == "number":
        return f"NULLIF({col}::text, '')::numeric"
    if key == "integer":
        return f"NULLIF({col}::text, '')::integer"
    if key == "date":
        return f"NULLIF({col}::text, '')::date"
    if key == "datetime":
        return f"NULLIF({col}::text, '')::timestamptz"
    if key in {"boolean", "bool"}:
        return f"NULLIF({col}::text, '')::boolean"
    postgres_type(data_type)
    return f"{col}::text"


async def _source_column_has_values(
    db: AsyncSession,
    table_name: str,
    column_code: str,
) -> bool:
    if not await column_exists(db, table_name, column_code):
        return False
    result = await db.execute(
        text(
            "SELECT EXISTS ("
            f"SELECT 1 FROM {quote_ident(table_name, kind='table')} "
            f"WHERE {quote_ident(column_code)} IS NOT NULL LIMIT 1"
            ")"
        )
    )
    return bool(result.scalar_one())


async def _get_columns(table_name: str, db: AsyncSession) -> list[TableColumn]:
    return (
        await db.execute(
            select(TableColumn)
            .where(TableColumn.table_name == table_name)
            .order_by(TableColumn.display_order, TableColumn.id)
        )
    ).scalars().all()


async def _alter_type_if_needed(
    db: AsyncSession,
    table_name: str,
    col: TableColumn,
    next_data_type: str,
    *,
    confirm_type_change: bool = False,
) -> bool:
    if (next_data_type or "string") == col.data_type:
        return False
    try:
        postgres_type(next_data_type)
        validate_column_name(col.column_code)
    except DDLValidationError as exc:
        raise _ddl_http_error(exc) from exc

    if not await column_exists(db, table_name, col.column_code):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=(
                f"字段「{col.column_label}」的物理列不存在，"
                "请先完成实体表重建或重新同步补列"
            ),
        )
    if await _source_column_has_values(db, table_name, col.column_code) and not confirm_type_change:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"字段「{col.column_label}」已有数据，修改字段类型需要确认",
        )
    try:
        await alter_source_column_type(
            db,
            table_name,
            col.column_code,
            next_data_type,
            using_expr=_type_change_using_expr(col.column_code, next_data_type),
        )
    except DDLValidationError as exc:
        raise _ddl_http_error(exc) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=f"字段「{col.column_label}」类型转换失败，请检查已有数据是否符合目标类型",
        ) from exc
    return True


def _json_refs_column(value: Any, column_code: str, qualified_codes: set[str]) -> bool:
    if isinstance(value, str):
        return value == column_code or value in qualified_codes
    if isinstance(value, dict):
        return any(_json_refs_column(v, column_code, qualified_codes) for v in value.values())
    if isinstance(value, (list, tuple, set)):
        return any(_json_refs_column(v, column_code, qualified_codes) for v in value)
    return False


async def _column_dependency_reasons(
    db: AsyncSession,
    table_name: str,
    col: TableColumn,
) -> list[str]:
    reasons: list[str] = []
    column_code = col.column_code
    if col.is_pk_part:
        reasons.append("该字段参与业务主键")
    if col.scope_role:
        reasons.append("该字段被标记为数据权限角色")
    if reasons:
        return reasons

    from app.data.formula import extract_refs

    formula_rows = (
        await db.execute(
            select(TableColumn.column_code, TableColumn.column_label, TableColumn.formula_expr)
            .where(
                TableColumn.table_name == table_name,
                TableColumn.is_computed.is_(True),
                TableColumn.id != col.id,
            )
        )
    ).all()
    for code, label, expr in formula_rows:
        if expr and column_code in extract_refs(expr):
            reasons.append(f"被本表计算字段「{label or code}」引用")

    from app.datasets.models import DataSetRelation, DataSetTable, DatasetCalculatedField

    ds_tables = (
        await db.execute(select(DataSetTable).where(DataSetTable.table_name == table_name))
    ).scalars().all()
    aliases_by_dataset: dict[int, set[str]] = {}
    for row in ds_tables:
        aliases_by_dataset.setdefault(row.dataset_id, set()).add(row.alias)
    ds_ids = list(aliases_by_dataset)
    qualified_codes = {
        f"{alias}.{column_code}"
        for aliases in aliases_by_dataset.values()
        for alias in aliases
    }

    if ds_ids:
        rels = (
            await db.execute(
                select(DataSetRelation).where(DataSetRelation.dataset_id.in_(ds_ids))
            )
        ).scalars().all()
        for rel in rels:
            aliases = aliases_by_dataset.get(rel.dataset_id, set())
            for key in rel.keys or []:
                if rel.left_alias in aliases and key.get("left") == column_code:
                    reasons.append("被数据集关联关系引用")
                    break
                if rel.right_alias in aliases and key.get("right") == column_code:
                    reasons.append("被数据集关联关系引用")
                    break

        calc_fields = (
            await db.execute(
                select(DatasetCalculatedField).where(
                    DatasetCalculatedField.dataset_id.in_(ds_ids),
                    DatasetCalculatedField.is_active.is_(True),
                )
            )
        ).scalars().all()
        for field in calc_fields:
            if _json_refs_column(field.depends_on or [], column_code, qualified_codes):
                reasons.append(f"被数据集计算字段「{field.label or field.code}」引用")

    from app.reports.models import Report

    report_stmt = select(Report)
    if ds_ids:
        report_stmt = report_stmt.where(
            (Report.table_name == table_name) | (Report.dataset_id.in_(ds_ids))
        )
    else:
        report_stmt = report_stmt.where(Report.table_name == table_name)
    reports = (await db.execute(report_stmt)).scalars().all()
    for report in reports:
        if _json_refs_column(report.config or {}, column_code, qualified_codes):
            reasons.append(f"被报表「{report.name}」引用")

    from app.allocation.models import AllocationScheme

    allocation_stmt = select(AllocationScheme)
    if ds_ids:
        allocation_stmt = allocation_stmt.where(
            (AllocationScheme.table_name == table_name)
            | (AllocationScheme.result_table == table_name)
            | (AllocationScheme.dataset_id.in_(ds_ids))
        )
    else:
        allocation_stmt = allocation_stmt.where(
            (AllocationScheme.table_name == table_name)
            | (AllocationScheme.result_table == table_name)
        )
    schemes = (await db.execute(allocation_stmt)).scalars().all()
    for scheme in schemes:
        if _json_refs_column(scheme.config or {}, column_code, qualified_codes):
            reasons.append(f"被成本分摊方案「{scheme.name}」引用")

    from app.push.models import PushTarget

    push_targets = (
        await db.execute(select(PushTarget).where(PushTarget.source_table == table_name))
    ).scalars().all()
    for target in push_targets:
        if _json_refs_column(target.field_mappings or [], column_code, {column_code}):
            reasons.append(f"被推送目标「{target.name}」字段映射引用")

    return sorted(set(reasons))


def _row_value(row: Any, code: str) -> Any:
    if hasattr(row, code):
        return getattr(row, code)
    raise HTTPException(
        status.HTTP_409_CONFLICT,
        detail=f"数据行缺少实体列: {code}",
    )


def _set_row_value(row: Any, code: str, value: Any) -> None:
    if hasattr(row, code):
        setattr(row, code, value)
        return
    raise HTTPException(
        status.HTTP_409_CONFLICT,
        detail=f"数据行缺少实体列: {code}",
    )


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
    confirm_type_change: bool = False


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
        created_at=c.created_at,
        updated_at=c.updated_at,
    )


@router.get("/tables")
async def list_tables(
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[dict[str, str]]:
    """返回所有支持的业务表清单"""
    return await table_options(db)


@router.get("/{table}", response_model=list[ColumnOut])
async def list_columns(
    table: str,
    _: User = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> list[ColumnOut]:
    table = _ensure_known_table(table)
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
    table = _ensure_known_table(table)
    column_code = _validate_payload_column_code(payload.column_code)
    # 防重
    exists = (
        await db.execute(
            select(TableColumn).where(
                TableColumn.table_name == table,
                TableColumn.column_code == column_code,
            )
        )
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="该字段已存在")

    if payload.is_computed:
        await _validate_formula(table, column_code, payload.formula_expr, db)

    try:
        await add_source_column(db, table, column_code, payload.data_type)
    except DDLValidationError as exc:
        raise _ddl_http_error(exc) from exc

    col = TableColumn(
        table_name=table,
        column_code=column_code,
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
    await db.flush()
    await register_source_table_model(db, table, force=True)
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
    table = _ensure_known_table(table)

    updated = 0
    ddl_changed = False
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
        if "data_type" in item:
            ddl_changed = await _alter_type_if_needed(
                db,
                table,
                col,
                item.get("data_type") or "string",
                confirm_type_change=bool(item.get("confirm_type_change")),
            ) or ddl_changed
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
        ):
            if k in item:
                setattr(col, k, item[k])
        if not col.is_computed:
            col.formula_expr = None
        updated += 1

    if ddl_changed:
        await db.flush()
        await register_source_table_model(db, table, force=True)
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
    table = _ensure_known_table(table)
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
    ddl_changed = await _alter_type_if_needed(
        db,
        table,
        col,
        payload.data_type,
        confirm_type_change=payload.confirm_type_change,
    )
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
    if ddl_changed:
        await db.flush()
        await register_source_table_model(db, table, force=True)
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
    """重算该表的自动字段：计算字段（公式）+ 跨表查找字段（只填空），写回实体列。

    新建公式/查找规则后立即回填，免等下次同步。
    """
    table = _ensure_known_table(table)

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
    _ensure_entity_model(Model, table)
    rows = (await db.execute(select(Model))).scalars().all()
    table_columns = await _get_columns(table, db)
    updated = 0
    for row in rows:
        row_values = {
            c.column_code: _row_value(row, c.column_code)
            for c in table_columns
        }
        apply_lookups_to_row(row_values, lookup_maps)
        for code, expr in computed:
            row_values[code] = eval_formula(expr, row_values)
        for code, value in row_values.items():
            _set_row_value(row, code, value)
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
    table = _ensure_known_table(table)
    col = await db.get(TableColumn, column_id)
    if col is None or col.table_name != table:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="字段不存在")

    column_code = col.column_code
    reasons = await _column_dependency_reasons(db, table, col)
    if reasons:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"字段「{col.column_label}」存在依赖，不能删除：" + "；".join(reasons),
        )

    # 1) 删物理列
    try:
        await drop_source_column(db, table, column_code)
    except DDLValidationError as exc:
        raise _ddl_http_error(exc) from exc

    # 2) 删字段元数据
    await db.delete(col)
    await db.flush()
    await register_source_table_model(db, table, force=True)

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
    """扫描物理表结构，删除已经没有实体列的孤儿字段元数据。

    用途：源端字段重命名 / 删除 / 数据源切换后，table_columns 残留旧字段。
    安全保护：
    - 跳过 is_pk_part=true（防止误删主键定义）
    - 跳过 auto_discovered=false（管理员手动建的字段保留）
    - 不删物理列，只删已无物理列对应的元数据
    """
    table = _ensure_known_table(table)

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

    # 2) 找出无物理列的孤儿元数据
    deleted: list[str] = []
    for c in cols:
        if c.is_pk_part:
            continue
        if not c.auto_discovered:
            continue
        if await column_exists(db, table, c.column_code):
            continue
        deleted.append(c.column_code)
        await db.delete(c)

    await db.commit()
    return {
        "ok": True,
        "deleted_count": len(deleted),
        "deleted_codes": deleted,
        "total_rows_scanned": 0,
        "total_columns_before": len(cols),
    }
