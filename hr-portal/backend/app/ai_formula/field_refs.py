from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import TableColumn
from app.datasets.models import DataSet, DataSetTable


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


async def dataset_field_meta(dataset_id: int, db: AsyncSession) -> tuple[DataSet, list[FieldMeta]]:
    ds = await db.get(DataSet, dataset_id)
    if ds is None:
        raise ValueError("dataset not found")
    tables = (
        await db.execute(
            select(DataSetTable).where(DataSetTable.dataset_id == dataset_id).order_by(DataSetTable.id)
        )
    ).scalars().all()
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
        for col in cols:
            fields.append(
                FieldMeta(
                    code=f"{table.alias}.{col.column_code}",
                    label=f"{table.alias}.{col.column_label}",
                    data_type=col.data_type,
                    is_sensitive=col.is_sensitive or col.column_code in sensitive_from_category,
                    agg_role=col.agg_role,
                    alias=table.alias,
                    column_code=col.column_code,
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


def display_to_internal(formula: str, fields: list[FieldMeta]) -> str:
    by_label = {f.label: f.code for f in fields}
    by_code = {f.code: f.code for f in fields}
    lookup = {**by_label, **by_code}
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
