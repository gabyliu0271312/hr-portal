"""QueryExecutor — safely execute compiled parameterized SQL.

Scope resolution is done BEFORE engine compilation. The engine receives
pre-built scope clauses and injects them directly into WHERE 1=1.

Scope alias handling:
  build_scope_filter() accepts a table_alias parameter. When provided,
  it uses SQLAlchemy's aliased() at the expression level so that compiled
  SQL already contains alias-prefixed column references (e.g.
  "t_a"."cost_center_code"). No post-hoc string replacement is needed.
"""
from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import AsyncSession

from app.data_compare.engine import CompiledQuery
from app.data_compare.metadata import MetadataLoader
from app.users.models import User


class ScopeDeniedError(PermissionError):
    """Raised when user has no row-level access to one or both tables."""
    pass


async def _build_scope_sql(
    user: User,
    table_name: str,
    db: AsyncSession,
    strategy: str,
    table_alias: str | None = None,
) -> str:
    """Build scope filter as a raw SQL WHERE condition string.

    Uses build_scope_filter with an optional table_alias. When table_alias
    is provided, SQLAlchemy's aliased() generates alias-prefixed column
    references (e.g. "t_a"."cost_center_code") directly — no post-hoc
    regex rewriting needed.

    Returns "true" if the user has unrestricted access (super_admin or
    unlimited scope tag). Returns "false" if the user has no access.
    """
    from app.permissions.scope_filter import _is_super_admin
    if await _is_super_admin(user, db):
        return "true"

    try:
        from app.permissions.scope_filter import build_scope_filter
        clause = await build_scope_filter(
            user, table_name, db, strategy=strategy, table_alias=table_alias,
        )
    except Exception:
        return "false"

    if clause is None:
        return "false"

    compiled = str(clause.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    ))

    compiled = compiled.strip()
    lower = compiled.lower()

    if lower.startswith("true"):
        return "true"
    if lower.startswith("false"):
        return "false"

    return compiled


async def build_scope_for_compare(
    user: User,
    source_a_table: str,
    source_b_table: str,
    loader: MetadataLoader,
    db: AsyncSession,
    alias_a: str = "t_a",
    alias_b: str = "t_b",
) -> tuple[str, str]:
    """Build row-level scope conditions for both sides of a comparison.

    Returns (scope_clause_a, scope_clause_b) where each is:
      - "true" → no restriction
      - a raw SQL condition like '"t_a"."org_id" IN (1, 2, 3)'

    alias_a / alias_b specify the table aliases used in the compiled SQL
    (e.g. "t_a"/"t_b" for roster/field, "v" for amount). The alias is
    passed to build_scope_filter() which uses SQLAlchemy's aliased() to
    generate alias-prefixed column references at the expression level.

    Raises ScopeDeniedError if either side has scope = "false", ensuring
    "no access" is never misreported as "data is consistent".
    """
    meta_a = await loader.get_table(source_a_table)
    meta_b = await loader.get_table(source_b_table)

    scope_a = "true"
    scope_b = "true"

    if meta_a and meta_a.scope_strategy:
        scope_a = await _build_scope_sql(
            user, source_a_table, db, meta_a.scope_strategy,
            table_alias=alias_a,
        )
    if meta_b and meta_b.scope_strategy:
        scope_b = await _build_scope_sql(
            user, source_b_table, db, meta_b.scope_strategy,
            table_alias=alias_b,
        )

    if scope_a.strip() == "false" or scope_b.strip() == "false":
        raise ScopeDeniedError(
            f"User {user.id} has no row-level access to one or both tables "
            f"({source_a_table}, {source_b_table})"
        )

    return scope_a, scope_b


async def execute_compare(
    compiled: CompiledQuery,
    loader: MetadataLoader,
    user: User,
    db: AsyncSession,
    max_rows: int = 10000,
    timeout_seconds: int = 30,
) -> list[dict]:
    """Execute parameterized query and return result rows.

    Safety measures:
    1. statement_timeout limit — SET LOCAL in transaction before SELECT
    2. max_rows result row limit
    3. Read-only guarantee: compiled SQL only contains SELECT
    """
    params = compiled.params or {}

    # Set statement_timeout within the transaction (P0 fix: split execution)
    await db.execute(text(f"SET LOCAL statement_timeout = '{timeout_seconds * 1000}'"))

    # Execute the SELECT separately
    result = await db.execute(text(compiled.sql), params)
    rows = result.fetchall()

    if len(rows) > max_rows:
        rows = rows[:max_rows]

    columns = list(result.keys())
    return [dict(zip(columns, row)) for row in rows]
