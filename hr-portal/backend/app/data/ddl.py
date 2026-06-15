"""Controlled DDL helpers for source data tables.

Business tables are managed by the application through structured operations,
never by accepting raw SQL from the frontend.  These helpers centralize the
identifier validation, PostgreSQL type mapping, and DDL statements needed by
the datasource refactor.
"""
from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
import hashlib
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


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


class DDLValidationError(ValueError):
    """Raised when a table/column/type is unsafe or unsupported for DDL."""


@dataclass(frozen=True)
class SourceColumn:
    column_code: str
    data_type: str = "string"


def _byte_len(value: str) -> int:
    return len(value.encode("utf-8"))


def validate_table_name(table_name: str) -> str:
    """Validate an application-managed source table name."""
    value = (table_name or "").strip()
    if not value:
        raise DDLValidationError("表名不能为空")
    if not TABLE_NAME_RE.fullmatch(value):
        raise DDLValidationError("表名只允许小写字母、数字、下划线，且必须以字母开头")
    if _byte_len(value) > POSTGRES_IDENTIFIER_MAX_BYTES:
        raise DDLValidationError("表名超过 PostgreSQL 63 字节上限")
    return value


def validate_column_name(column_code: str, *, allow_base: bool = False) -> str:
    """Validate a physical source column name.

    Leading underscores are allowed because the system injects columns such as
    `org_node_code` for permission filtering.
    """
    value = (column_code or "").strip()
    if not value:
        raise DDLValidationError("字段编码不能为空")
    if not COLUMN_NAME_RE.fullmatch(value):
        raise DDLValidationError("字段编码只允许小写字母、数字、下划线，且必须以字母或下划线开头")
    if _byte_len(value) > POSTGRES_IDENTIFIER_MAX_BYTES:
        raise DDLValidationError("字段编码超过 PostgreSQL 63 字节上限")
    if not allow_base and value in BASE_COLUMN_NAMES:
        raise DDLValidationError(f"字段 {value} 是系统基础列，不允许作为业务字段操作")
    return value


def quote_ident(identifier: str, *, kind: str = "column") -> str:
    """Return a safely quoted PostgreSQL identifier after validation."""
    if kind == "table":
        value = validate_table_name(identifier)
    elif kind == "column":
        value = validate_column_name(identifier, allow_base=True)
    elif kind == "constraint":
        value = validate_column_name(identifier, allow_base=True)
    else:
        raise DDLValidationError(f"未知 identifier 类型: {kind}")
    return f'"{value.replace(chr(34), chr(34) * 2)}"'


def postgres_type(data_type: str | None) -> str:
    """Map table_columns.data_type to a PostgreSQL column type."""
    key = (data_type or "string").strip().lower()
    try:
        return TYPE_MAP[key]
    except KeyError as exc:
        raise DDLValidationError(f"不支持的字段类型: {data_type}") from exc


def make_identifier(prefix: str, table_name: str, suffix: str = "") -> str:
    """Build a deterministic PostgreSQL identifier within 63 bytes."""
    validate_table_name(table_name)
    raw = f"{prefix}{table_name}{suffix}"
    if _byte_len(raw) <= POSTGRES_IDENTIFIER_MAX_BYTES and COLUMN_NAME_RE.fullmatch(raw):
        return raw

    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:10]
    affix = f"_{digest}"
    max_prefix = POSTGRES_IDENTIFIER_MAX_BYTES - _byte_len(affix)
    shortened = raw.encode("utf-8")[:max_prefix].decode("utf-8", errors="ignore").rstrip("_")
    value = f"{shortened}{affix}"
    return validate_column_name(value, allow_base=True)


def _column_code(col: SourceColumn | Mapping[str, Any] | Any) -> str:
    if isinstance(col, SourceColumn):
        return col.column_code
    if isinstance(col, Mapping):
        return str(col.get("column_code") or col.get("code") or "")
    return str(getattr(col, "column_code", "") or getattr(col, "code", ""))


def _column_data_type(col: SourceColumn | Mapping[str, Any] | Any) -> str:
    if isinstance(col, SourceColumn):
        return col.data_type
    if isinstance(col, Mapping):
        return str(col.get("data_type") or "string")
    return str(getattr(col, "data_type", "string") or "string")


def column_definition(col: SourceColumn | Mapping[str, Any] | Any) -> str:
    code = validate_column_name(_column_code(col))
    return f'{quote_ident(code)} {postgres_type(_column_data_type(col))}'


def build_create_source_table_sql(
    table_name: str,
    columns: Iterable[SourceColumn | Mapping[str, Any] | Any] = (),
) -> list[str]:
    """Build CREATE TABLE + index SQL for a source table."""
    table = validate_table_name(table_name)
    table_q = quote_ident(table, kind="table")
    unique_name = make_identifier("uq_", table, "_pk")
    index_name = make_identifier("ix_", table, "_pk_hash")

    seen = set(BASE_COLUMN_NAMES)
    business_defs: list[str] = []
    for col in columns:
        code = validate_column_name(_column_code(col))
        if code in seen:
            raise DDLValidationError(f"字段 {code} 重复或与系统基础列冲突")
        seen.add(code)
        business_defs.append(f"    {column_definition(col)}")

    defs = [
        "    id BIGSERIAL PRIMARY KEY",
        "    pk_hash VARCHAR(64) NOT NULL",
        "    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
        *business_defs,
        f"    CONSTRAINT {quote_ident(unique_name, kind='constraint')} UNIQUE (pk_hash)",
    ]
    create_sql = f"CREATE TABLE IF NOT EXISTS {table_q} (\n" + ",\n".join(defs) + "\n)"
    index_sql = (
        f"CREATE INDEX IF NOT EXISTS {quote_ident(index_name, kind='constraint')} "
        f"ON {table_q} (pk_hash)"
    )
    return [create_sql, index_sql]


def build_drop_source_table_sql(table_name: str, *, cascade: bool = False) -> str:
    table_q = quote_ident(validate_table_name(table_name), kind="table")
    suffix = " CASCADE" if cascade else ""
    return f"DROP TABLE IF EXISTS {table_q}{suffix}"


def build_add_source_column_sql(table_name: str, column_code: str, data_type: str) -> str:
    table_q = quote_ident(validate_table_name(table_name), kind="table")
    col = validate_column_name(column_code)
    return (
        f"ALTER TABLE {table_q} ADD COLUMN IF NOT EXISTS "
        f"{quote_ident(col)} {postgres_type(data_type)}"
    )


def build_drop_source_column_sql(table_name: str, column_code: str) -> str:
    table_q = quote_ident(validate_table_name(table_name), kind="table")
    col = validate_column_name(column_code)
    return f"ALTER TABLE {table_q} DROP COLUMN IF EXISTS {quote_ident(col)}"


def build_alter_source_column_type_sql(
    table_name: str,
    column_code: str,
    data_type: str,
    *,
    using_expr: str | None = None,
) -> str:
    table_q = quote_ident(validate_table_name(table_name), kind="table")
    col = validate_column_name(column_code)
    sql = f"ALTER TABLE {table_q} ALTER COLUMN {quote_ident(col)} TYPE {postgres_type(data_type)}"
    if using_expr:
        sql = f"{sql} USING {using_expr}"
    return sql


async def table_exists(db: AsyncSession, table_name: str) -> bool:
    table = validate_table_name(table_name)
    result = await db.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = :table_name
            )
            """
        ),
        {"table_name": table},
    )
    return bool(result.scalar_one())


async def column_exists(db: AsyncSession, table_name: str, column_code: str) -> bool:
    table = validate_table_name(table_name)
    column = validate_column_name(column_code, allow_base=True)
    result = await db.execute(
        text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = :table_name
                  AND column_name = :column_name
            )
            """
        ),
        {"table_name": table, "column_name": column},
    )
    return bool(result.scalar_one())


async def create_source_table(
    db: AsyncSession,
    table_name: str,
    columns: Iterable[SourceColumn | Mapping[str, Any] | Any] = (),
) -> None:
    for sql in build_create_source_table_sql(table_name, columns):
        await db.execute(text(sql))


async def drop_source_table(db: AsyncSession, table_name: str, *, cascade: bool = False) -> None:
    await db.execute(text(build_drop_source_table_sql(table_name, cascade=cascade)))


async def add_source_column(
    db: AsyncSession,
    table_name: str,
    column_code: str,
    data_type: str = "string",
) -> None:
    await db.execute(text(build_add_source_column_sql(table_name, column_code, data_type)))


async def drop_source_column(db: AsyncSession, table_name: str, column_code: str) -> None:
    await db.execute(text(build_drop_source_column_sql(table_name, column_code)))


async def alter_source_column_type(
    db: AsyncSession,
    table_name: str,
    column_code: str,
    data_type: str,
    *,
    using_expr: str | None = None,
) -> None:
    await db.execute(
        text(
            build_alter_source_column_type_sql(
                table_name,
                column_code,
                data_type,
                using_expr=using_expr,
            )
        )
    )
