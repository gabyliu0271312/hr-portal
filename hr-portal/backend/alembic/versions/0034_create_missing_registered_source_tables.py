"""Create missing registered source tables as entity-column tables."""

from __future__ import annotations

import hashlib
import re
from typing import Any, Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0034_create_missing_registered_source_tables"
down_revision: Union[str, None] = "0033_drop_tree_raw_columns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


POSTGRES_IDENTIFIER_MAX_BYTES = 63
TABLE_NAME_RE = re.compile(r"^[a-z][a-z0-9_]*$")
COLUMN_NAME_RE = re.compile(r"^[a-z_][a-z0-9_]*$")
BASE_COLUMN_NAMES = {"id", "pk_hash", "synced_at"}
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


def _validate_table_name(table_name: str) -> str:
    value = (table_name or "").strip()
    if not TABLE_NAME_RE.fullmatch(value):
        raise ValueError(f"invalid registered source table name: {table_name!r}")
    if _byte_len(value) > POSTGRES_IDENTIFIER_MAX_BYTES:
        raise ValueError(f"registered source table name is too long: {table_name!r}")
    return value


def _validate_column_name(column_code: str) -> str:
    value = (column_code or "").strip()
    if not COLUMN_NAME_RE.fullmatch(value):
        raise ValueError(f"invalid source column name: {column_code!r}")
    if _byte_len(value) > POSTGRES_IDENTIFIER_MAX_BYTES:
        raise ValueError(f"source column name is too long: {column_code!r}")
    if value in BASE_COLUMN_NAMES:
        raise ValueError(f"source column conflicts with base column: {column_code!r}")
    return value


def _quote_ident(identifier: str) -> str:
    return f'"{identifier.replace(chr(34), chr(34) * 2)}"'


def _postgres_type(data_type: str | None) -> str:
    key = (data_type or "string").strip().lower()
    try:
        return TYPE_MAP[key]
    except KeyError as exc:
        raise ValueError(f"unsupported source column type: {data_type!r}") from exc


def _make_identifier(prefix: str, table_name: str, suffix: str = "") -> str:
    raw = f"{prefix}{table_name}{suffix}"
    if _byte_len(raw) <= POSTGRES_IDENTIFIER_MAX_BYTES and COLUMN_NAME_RE.fullmatch(raw):
        return raw

    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]
    affix = f"_{digest}"
    max_prefix = POSTGRES_IDENTIFIER_MAX_BYTES - _byte_len(affix)
    shortened = raw.encode("utf-8")[:max_prefix].decode("utf-8", errors="ignore").rstrip("_")
    return f"{shortened}{affix}"


def _load_registered_tables(bind) -> list[str]:
    rows = bind.execute(
        sa.text("SELECT table_name FROM registered_tables ORDER BY display_order, id")
    ).all()
    return [_validate_table_name(row[0]) for row in rows]


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
        code = _validate_column_name(str(row["column_code"]))
        if code in seen:
            raise ValueError(f"duplicate source column {table_name}.{code}")
        seen.add(code)
        columns.append({"column_code": code, "data_type": row["data_type"]})
    return columns


def _create_source_table(bind, table_name: str) -> None:
    columns = _load_source_columns(bind, table_name)
    table_q = _quote_ident(table_name)
    unique_name = _make_identifier("uq_", table_name, "_pk")
    index_name = _make_identifier("ix_", table_name, "_pk_hash")
    business_defs = [
        f"    {_quote_ident(col['column_code'])} {_postgres_type(col['data_type'])}"
        for col in columns
    ]
    defs = [
        "    id BIGSERIAL PRIMARY KEY",
        "    pk_hash VARCHAR(64) NOT NULL",
        "    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        *business_defs,
        f"    CONSTRAINT {_quote_ident(unique_name)} UNIQUE (pk_hash)",
    ]
    op.execute("CREATE TABLE IF NOT EXISTS " + table_q + " (\n" + ",\n".join(defs) + "\n)")
    op.execute(
        f"CREATE INDEX IF NOT EXISTS {_quote_ident(index_name)} ON {table_q} (pk_hash)"
    )


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("registered_tables") or not inspector.has_table("table_columns"):
        return

    for table_name in _load_registered_tables(bind):
        if inspector.has_table(table_name, schema="public"):
            continue
        _create_source_table(bind, table_name)


def downgrade() -> None:
    # Missing source tables created by this migration are now application-owned
    # data containers. Downgrade must not guess which empty tables are safe to drop.
    pass
