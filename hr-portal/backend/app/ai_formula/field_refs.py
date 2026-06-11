from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import TableColumn, RegisteredTable
from app.datasets.models import DataSet, DataSetTable
from app.permissions.masker import get_sensitive_columns
from app.users.models import User


FIELD_CALL_RE = re.compile(r'FIELD\(\s*["\']([^"\']+)["\']\s*\)', re.IGNORECASE)
DISPLAY_REF_RE = re.compile(r"\[([^\[\]]+)\]")


@dataclass(frozen=True)
class FieldMeta:
    code: str
    label: str
    data_type: str
    is_sensitive: bool
    agg_role: str
    alias: str
    column_code: str
    sensitivity_level: str = "internal"
    display_label: str | None = None


async def dataset_field_meta(dataset_id: int, db: AsyncSession) -> tuple[DataSet, list[FieldMeta]]:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise ValueError("dataset not found")
    tables = (
        await db.execute(
            select(DataSetTable).where(DataSetTable.dataset_id == dataset_id).order_by(DataSetTable.id)
        )
    ).scalars().all()

    table_names = [t.table_name for t in tables]
    reg_rows = (
        await db.execute(
            select(RegisteredTable.table_name, RegisteredTable.table_label).where(
                RegisteredTable.table_name.in_(table_names)
            )
        )
    ).all()
    table_label_by_name = {r.table_name: r.table_label for r in reg_rows if r.table_label}

    fields: list[FieldMeta] = []
    for table in tables:
        from app.field_category.models import FieldCategory, FieldCategoryAssignment

        sensitive_from_category = {
            row[0]
            for row in (
                await db.execute(
                    select(FieldCategoryAssignment.column_name)
                    .join(FieldCategory, FieldCategory.id == FieldCategoryAssignment.category_id)
                    .where(
                        FieldCategoryAssignment.table_name == table.table_name,
                        FieldCategory.is_sensitive.is_(True),
                    )
                )
            ).all()
        }
        cols = (
            await db.execute(
                select(TableColumn)
                .where(TableColumn.table_name == table.table_name)
                .order_by(TableColumn.display_order, TableColumn.id)
            )
        ).scalars().all()
        cn_table = table_label_by_name.get(table.table_name)
        for col in cols:
            fields.append(
                FieldMeta(
                    code=f"{table.alias}.{col.column_code}",
                    label=f"{table.alias}.{col.column_label}",
                    display_label=f"{cn_table}.{col.column_label}" if cn_table else None,
                    data_type=col.data_type,
                    is_sensitive=col.is_sensitive or col.column_code in sensitive_from_category,
                    agg_role=col.agg_role,
                    alias=table.alias,
                    column_code=col.column_code,
                    sensitivity_level=(
                        "sensitive"
                        if col.is_sensitive or col.column_code in sensitive_from_category
                        else "internal"
                    ),
                )
            )
    return ds, fields


async def dataset_field_meta_for_ai(
    dataset_id: int,
    user: User,
    db: AsyncSession,
) -> tuple[DataSet, list[FieldMeta], dict[str, Any]]:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise ValueError("dataset not found")
    tables = (
        await db.execute(
            select(DataSetTable).where(DataSetTable.dataset_id == dataset_id).order_by(DataSetTable.id)
        )
    ).scalars().all()
    fields: list[FieldMeta] = []
    filtered_sensitive: list[str] = []
    total_fields = 0
    for table in tables:
        masked = await get_sensitive_columns(user, table.table_name, db)
        _, table_fields = await _dataset_table_field_meta(dataset_id, table, db)
        for field in table_fields:
            total_fields += 1
            if field.column_code in masked:
                filtered_sensitive.append(field.code)
                continue
            fields.append(field)
    return ds, fields, {
        "total_fields": total_fields,
        "visible_fields": len(fields),
        "filtered_sensitive_fields": filtered_sensitive,
        "context_policy": "authorized_metadata_only",
    }


async def _dataset_table_field_meta(
    dataset_id: int,
    table: DataSetTable,
    db: AsyncSession,
) -> tuple[DataSet, list[FieldMeta]]:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise ValueError("dataset not found")
    from app.field_category.models import FieldCategory, FieldCategoryAssignment

    sensitive_from_category = {
        row[0]
        for row in (
            await db.execute(
                select(FieldCategoryAssignment.column_name)
                .join(FieldCategory, FieldCategory.id == FieldCategoryAssignment.category_id)
                .where(
                    FieldCategoryAssignment.table_name == table.table_name,
                    FieldCategory.is_sensitive.is_(True),
                )
            )
        ).all()
    }
    cols = (
        await db.execute(
            select(TableColumn)
            .where(TableColumn.table_name == table.table_name)
            .order_by(TableColumn.display_order, TableColumn.id)
        )
    ).scalars().all()
    fields: list[FieldMeta] = []
    for col in cols:
        is_sensitive = col.is_sensitive or col.column_code in sensitive_from_category
        fields.append(
            FieldMeta(
                code=f"{table.alias}.{col.column_code}",
                label=f"{table.alias}.{col.column_label}",
                data_type=col.data_type,
                is_sensitive=is_sensitive,
                agg_role=col.agg_role,
                alias=table.alias,
                column_code=col.column_code,
                sensitivity_level="sensitive" if is_sensitive else "internal",
            )
        )
    return ds, fields


def extract_field_refs(formula: str) -> list[str]:
    seen: list[str] = []
    for raw in FIELD_CALL_RE.findall(formula or ""):
        code = raw.strip()
        if code and code not in seen:
            seen.append(code)
    return seen


def _normalize_brackets(text: str) -> str:
    return text.replace('（', '(').replace('）', ')')


def display_to_internal(formula: str, fields: list[FieldMeta]) -> str:
    by_label = {f.label: f.code for f in fields}
    by_code = {f.code: f.code for f in fields}
    lookup = {**by_label, **by_code}
    for f in fields:
        if f.display_label:
            lookup.setdefault(f.display_label, f.code)
        # 同时注册半角括号版本，兼容用户手动输入半角
        for key in [f.label, f.display_label]:
            if key:
                half = _normalize_brackets(key)
                if half != key:
                    lookup.setdefault(half, f.code)
    by_tail_label: dict[str, str] = {}
    for f in fields:
        tail = f.label.split(".", 1)[-1]
        if tail not in by_tail_label:
            by_tail_label[tail] = f.code
        lookup.setdefault(tail, f.code)

    def repl(match: re.Match[str]) -> str:
        raw = match.group(1).strip()
        code = by_label.get(raw) or by_code.get(raw) or by_tail_label.get(raw)
        return f'FIELD("{code}")' if code else match.group(0)

    out = _replace_formula_text(formula or "", DISPLAY_REF_RE, repl)
    for raw in sorted(lookup, key=len, reverse=True):
        code = lookup[raw]
        pattern = re.compile(rf'(?<!["\w.]){re.escape(raw)}(?!["\w.])(?!\s*\()')
        out = _replace_formula_text(out, pattern, f'FIELD("{code}")')
    return out if out.startswith("=") else f"={out}"


def internal_to_display(formula: str, fields: list[FieldMeta]) -> str:
    by_code = {f.code: f.label for f in fields}

    def repl(match: re.Match[str]) -> str:
        code = match.group(1).strip()
        return by_code.get(code, code)

    return FIELD_CALL_RE.sub(repl, formula or "")


def _replace_formula_text(text: str, pattern: re.Pattern[str], replacement: str) -> str:
    chunks: list[str] = []
    outside: list[str] = []
    pos = 0
    quote = ""
    while pos < len(text):
        ch = text[pos]
        if quote:
            chunks.append(ch)
            if ch == quote:
                if pos + 1 < len(text) and text[pos + 1] == quote:
                    chunks.append(text[pos + 1])
                    pos += 2
                    continue
                quote = ""
            pos += 1
            continue
        if ch in {"'", '"'}:
            if outside:
                chunks.append(pattern.sub(replacement, "".join(outside)))
                outside = []
            chunks.append(ch)
            quote = ch
        else:
            outside.append(ch)
        pos += 1
    if outside:
        chunks.append(pattern.sub(replacement, "".join(outside)))
    return "".join(chunks)


def row_field_resolver(row: dict[str, Any]):
    def resolve(code: str) -> Any:
        return row.get(code)

    return resolve
