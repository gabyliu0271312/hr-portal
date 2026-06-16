"""Backfill missing entity columns into source tables stripped of their raw column.

Migration 0033 dropped the `raw` column from all registered source tables.
Migration 0034 was meant to create entity-column tables, but skipped tables that
already existed in the database. This migration fills the gap: for every registered
table that already exists without a `raw` column, it reads the expected columns from
`table_columns` and adds any that are missing via ALTER TABLE ADD COLUMN IF NOT EXISTS.
"""

from __future__ import annotations

import re
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0036_backfill_entity_columns"
down_revision: Union[str, None] = "0035_align_roster_salary_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


POSTGRES_IDENTIFIER_MAX_BYTES = 63
TABLE_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
COLUMN_NAME_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
BASE_COLUMN_NAMES = {"id", "pk_hash", "synced_at", "raw"}

TYPE_MAP = {
    "string": "TEXT",
    "text": "TEXT",
    "number": "NUMERIC",
    "integer": "INTEGER",
    "date": "DATE",
    "datetime": "TIMESTAMPTZ",
    "boolean": "BOOLEAN",
    "bool": "BOOLEAN",
    "enum": "TEXT",
}


def _byte_len(value: str) -> int:
    return len(value.encode("utf-8"))


def _quote_ident(identifier: str) -> str:
    return f'"{identifier.replace(chr(34), chr(34) * 2)}"'


def _postgres_type(data_type: str | None) -> str:
    key = (data_type or "string").strip().lower()
    return TYPE_MAP.get(key, "TEXT")


def _load_registered_tables(bind) -> list[str]:
    rows = bind.execute(
        sa.text("SELECT table_name FROM registered_tables ORDER BY display_order, id")
    ).all()
    result = []
    for row in rows:
        val = str(row[0]).strip()
        if (
            TABLE_NAME_RE.fullmatch(val)
            and _byte_len(val) <= POSTGRES_IDENTIFIER_MAX_BYTES
        ):
            result.append(val)
    return result


def _load_source_columns(bind, table_name: str) -> list[dict[str, Any]]:
    rows = bind.execute(
        sa.text(
            """
            SELECT column_code, data_type
            FROM table_columns
            WHERE table_name = :table_name
            ORDER BY display_order, id
            """
        ),
        {"table_name": table_name},
    ).mappings().all()

    columns: list[dict[str, Any]] = []
    seen = set(BASE_COLUMN_NAMES)
    for row in rows:
        code = str(row["column_code"]).strip()
        if not COLUMN_NAME_RE.fullmatch(code):
            continue
        if _byte_len(code) > POSTGRES_IDENTIFIER_MAX_BYTES:
            continue
        if code in seen:
            continue
        seen.add(code)
        columns.append({"column_code": code, "data_type": row["data_type"]})
    return columns


def _physical_columns(bind, table_name: str) -> set[str]:
    rows = bind.execute(
        sa.text(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = :table
            """
        ),
        {"table": table_name},
    ).all()
    return {str(row[0]) for row in rows}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("registered_tables") or not inspector.has_table("table_columns"):
        return

    for table_name in _load_registered_tables(bind):
        if not inspector.has_table(table_name, schema="public"):
            continue

        existing_cols = _physical_columns(bind, table_name)

        # Skip tables that still have the old raw structure — they need a separate DDL rebuild.
        if "raw" in existing_cols:
            continue

        source_columns = _load_source_columns(bind, table_name)
        table_q = _quote_ident(table_name)

        for col in source_columns:
            code = col["column_code"]
            if code in existing_cols:
                continue
            pg_type = _postgres_type(col["data_type"])
            col_q = _quote_ident(code)
            op.execute(
                f"ALTER TABLE {table_q} ADD COLUMN IF NOT EXISTS {col_q} {pg_type}"
            )


def downgrade() -> None:
    # Entity columns added here are data containers; downgrade is intentionally a no-op.
    pass
