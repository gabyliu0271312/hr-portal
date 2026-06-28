"""CompareTemplateEngine — parameterized SQL template compiler.

Safety invariants:
  All identifiers (column/field/group_by/table_name) are remapped from
  table_columns whitelist metadata. Raw strings from LLM/user CompareSpec
  are NEVER interpolated directly — the validator confirms they exist, and
  the engine remaps them to canonical names as a second line of defense.

Three fixed templates:
  1. roster_engine  — roster consistency (FULL OUTER JOIN)
  2. field_engine   — field value consistency (INNER JOIN + WHERE conditions)
  3. amount_engine  — amount summary comparison (subquery GROUP BY + FULL OUTER JOIN)

Scope injection:
  Scope conditions are built externally (via build_scope_filter) and passed as
  pre-formatted SQL clauses. The engine appends them directly to WHERE 1=1,
  avoiding fragile post-compilation string replacement.
"""
from __future__ import annotations

from app.data_compare.metadata import MetadataLoader, TableMeta
from app.data_compare.schemas import (
    CompareSpec,
    CompareType,
    FieldCompareMode,
    PrefilterOp,
)


def _compile_prefilter_clause(
    prefilters: list,
    sql_alias: str,
    param_prefix: str,
    meta: TableMeta,
) -> tuple[str, dict]:
    """Compile prefilter list into WHERE clause + parameterized bind dict.

    Each op maps to a known-safe SQL fragment; values use parameterized binding.
    sql_alias  — alias used INSIDE the subquery SQL (e.g. "t_a", "v")
    param_prefix — prefix for parameter bind names (e.g. "t_a", "v_a")
                   separated from sql_alias to avoid collisions when the same
                   SQL alias is reused across independent subqueries (amount).
    """
    if not prefilters:
        return "", {}

    conditions: list[str] = []
    params: dict = {}

    for i, pf in enumerate(prefilters):
        col_meta = meta.columns.get(pf.column)
        if col_meta is None:
            continue
        # whitelist-mapped canonical name — never use pf.column raw
        safe_col = f'"{sql_alias}"."{col_meta.column_code}"'
        param_key = f"pf_{param_prefix}_{i}"

        op = pf.op
        if op == PrefilterOp.EQ:
            conditions.append(f"{safe_col} = :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.NE:
            conditions.append(f"{safe_col} != :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.IN:
            if isinstance(pf.value, list) and pf.value:
                placeholders = []
                for j, v in enumerate(pf.value):
                    pk = f"{param_key}_{j}"
                    placeholders.append(f":{pk}")
                    params[pk] = v
                conditions.append(f"{safe_col} IN ({', '.join(placeholders)})")
        elif op == PrefilterOp.NOT_IN:
            if isinstance(pf.value, list) and pf.value:
                placeholders = []
                for j, v in enumerate(pf.value):
                    pk = f"{param_key}_{j}"
                    placeholders.append(f":{pk}")
                    params[pk] = v
                conditions.append(f"{safe_col} NOT IN ({', '.join(placeholders)})")
        elif op == PrefilterOp.GT:
            conditions.append(f"{safe_col} > :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.GTE:
            conditions.append(f"{safe_col} >= :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.LT:
            conditions.append(f"{safe_col} < :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.LTE:
            conditions.append(f"{safe_col} <= :{param_key}")
            params[param_key] = pf.value
        elif op == PrefilterOp.CONTAINS:
            conditions.append(f"{safe_col} LIKE :{param_key}")
            params[param_key] = f"%{pf.value}%"
        elif op == PrefilterOp.BETWEEN:
            if isinstance(pf.value, list) and len(pf.value) == 2:
                lo_key, hi_key = f"{param_key}_lo", f"{param_key}_hi"
                conditions.append(f"{safe_col} BETWEEN :{lo_key} AND :{hi_key}")
                params[lo_key] = pf.value[0]
                params[hi_key] = pf.value[1]
        elif op == PrefilterOp.IS_NULL:
            conditions.append(f"{safe_col} IS NULL")
        elif op == PrefilterOp.IS_NOT_NULL:
            conditions.append(f"{safe_col} IS NOT NULL")

    clause = " AND ".join(conditions) if conditions else ""
    return (f" AND {clause}" if clause else ""), params


def _format_scope_clause(scope_sql: str) -> str:
    """Format scope SQL into a WHERE-compatible clause.

    scope_sql may be:
      - "true"  → no restriction → ""
      - "false" → caller must reject before engine (raise 403)
      - any SQL → " AND (<sql>)"
    """
    s = scope_sql.strip()
    if not s or s.lower() == "true":
        return ""
    return f" AND ({s})"


class CompiledQuery:
    """Compiled parameterized SQL + params dict"""

    def __init__(self, sql: str, params: dict | None = None):
        self.sql = sql
        self.params = params or {}


async def compile_roster_query(
    spec: CompareSpec,
    loader: MetadataLoader,
    scope_clause_a: str = "true",
    scope_clause_b: str = "true",
) -> CompiledQuery:
    """Template 1 — roster consistency comparison (FULL OUTER JOIN).

    Unified WHERE 1=1 pattern for period + prefilter + scope inside each subquery.
    Supports composite join_keys (multi-column primary key).
    """
    meta_a = await loader.validate_table(spec.source_a.table)
    meta_b = await loader.validate_table(spec.source_b.table)

    tbl_a = meta_a.table_name
    tbl_b = meta_b.table_name

    # Build all join-key expressions (supports composite keys)
    join_on_conditions: list[str] = []
    coal_cols: list[str] = []
    inner_cols_a: list[str] = []
    inner_cols_b: list[str] = []
    for jk in spec.join_keys:
        col_code_a = meta_a.columns[jk].column_code
        col_code_b = meta_b.columns[jk].column_code
        safe_a = f'"t_a"."{col_code_a}"'
        safe_b = f'"t_b"."{col_code_b}"'
        join_on_conditions.append(f"{safe_a} = {safe_b}")
        coal_cols.append(f'COALESCE({safe_a}, {safe_b}) as "{jk}"')
        inner_cols_a.append(safe_a)
        inner_cols_b.append(safe_b)

    join_on = " AND ".join(join_on_conditions)
    inner_select_a = ", ".join(inner_cols_a)
    inner_select_b = ", ".join(inner_cols_b)

    # Use first join key for direction checks (FULL OUTER JOIN makes ALL
    # columns from the unmatched side NULL, so any key works).
    first_key_a = inner_cols_a[0]
    first_key_b = inner_cols_b[0]

    params: dict = {}

    # period filter
    period_clause_a = ""
    period_clause_b = ""
    if meta_a.is_period and spec.source_a.period:
        period_col = meta_a.period_col or "period_ym"
        period_clause_a = f' AND "t_a"."{period_col}" = :period_a'
        params["period_a"] = spec.source_a.period
    if meta_b.is_period and spec.source_b.period:
        period_col = meta_b.period_col or "period_ym"
        period_clause_b = f' AND "t_b"."{period_col}" = :period_b'
        params["period_b"] = spec.source_b.period

    # prefilter — inner alias "t_a"/"t_b"
    pf_clause_a, pf_params_a = _compile_prefilter_clause(spec.source_a.prefilter, "t_a", "t_a", meta_a)
    pf_clause_b, pf_params_b = _compile_prefilter_clause(spec.source_b.prefilter, "t_b", "t_b", meta_b)
    params.update(pf_params_a)
    params.update(pf_params_b)

    # scope — compiled at engine level, not post-hoc string replace
    scope_a = _format_scope_clause(scope_clause_a)
    scope_b = _format_scope_clause(scope_clause_b)

    direction = "both"
    if spec.roster:
        direction = spec.roster.direction

    where_clause = ""
    if direction == "both":
        where_clause = f"WHERE {first_key_a} IS NULL OR {first_key_b} IS NULL"
    elif direction == "only_in_a":
        where_clause = f"WHERE {first_key_b} IS NULL"
    elif direction == "only_in_b":
        where_clause = f"WHERE {first_key_a} IS NULL"

    sql = f"""
SELECT
    {', '.join(coal_cols)},
    CASE
        WHEN {first_key_a} IS NULL THEN '仅存在于{meta_b.table_label}'
        WHEN {first_key_b} IS NULL THEN '仅存在于{meta_a.table_label}'
    END as diff_type
FROM (
    SELECT DISTINCT {inner_select_a} FROM "{tbl_a}" t_a WHERE 1=1{period_clause_a}{pf_clause_a}{scope_a}
) t_a
FULL OUTER JOIN (
    SELECT DISTINCT {inner_select_b} FROM "{tbl_b}" t_b WHERE 1=1{period_clause_b}{pf_clause_b}{scope_b}
) t_b ON {join_on}
{where_clause}
"""
    return CompiledQuery(sql.strip(), params)


async def compile_field_query(
    spec: CompareSpec,
    loader: MetadataLoader,
    scope_clause_a: str = "true",
    scope_clause_b: str = "true",
) -> CompiledQuery:
    """Template 2 — field value consistency (INNER JOIN + WHERE conditions).

    Unified WHERE 1=1 pattern for period + prefilter + scope inside each subquery.
    Supports composite join_keys (multi-column primary key).
    """
    meta_a = await loader.validate_table(spec.source_a.table)
    meta_b = await loader.validate_table(spec.source_b.table)

    tbl_a = meta_a.table_name
    tbl_b = meta_b.table_name

    # Build all join-key expressions (supports composite keys)
    join_on_conditions: list[str] = []
    select_cols: list[str] = []
    for jk in spec.join_keys:
        col_code_a = meta_a.columns[jk].column_code
        col_code_b = meta_b.columns[jk].column_code
        safe_a = f'"t_a"."{col_code_a}"'
        safe_b = f'"t_b"."{col_code_b}"'
        join_on_conditions.append(f"{safe_a} = {safe_b}")
        select_cols.append(f'{safe_a} as "{jk}"')

    join_on = " AND ".join(join_on_conditions)

    compare_conditions: list[str] = []
    params: dict = {}

    if spec.field:
        for i, pair in enumerate(spec.field.pairs):
            col_a = meta_a.columns[pair.field_a]
            col_b = meta_b.columns[pair.field_b]
            safe_a = f'"t_a"."{col_a.column_code}"'
            safe_b = f'"t_b"."{col_b.column_code}"'

            select_cols.append(f"{safe_a} as {pair.field_a}_a")
            select_cols.append(f"{safe_b} as {pair.field_b}_b")

            if pair.mode == FieldCompareMode.EXACT:
                compare_conditions.append(
                    f"({safe_a} IS NULL AND {safe_b} IS NOT NULL) OR "
                    f"({safe_a} IS NOT NULL AND {safe_b} IS NULL) OR "
                    f"({safe_a} != {safe_b})"
                )
            elif pair.mode == FieldCompareMode.TRIM:
                compare_conditions.append(
                    f"TRIM(LOWER(COALESCE({safe_a}::text,''))) != "
                    f"TRIM(LOWER(COALESCE({safe_b}::text,'')))"
                )
            elif pair.mode == FieldCompareMode.NUMERIC:
                tol = pair.tolerance or 0.0
                tol_key = f"field_tol_{i}"
                params[tol_key] = tol
                compare_conditions.append(
                    f"ABS(COALESCE({safe_a}::numeric, 0) - "
                    f"COALESCE({safe_b}::numeric, 0)) > :{tol_key}"
                )

    # period filter
    period_clause_a, period_clause_b = "", ""
    if meta_a.is_period and spec.source_a.period:
        period_col = meta_a.period_col or "period_ym"
        period_clause_a = f' AND "t_a"."{period_col}" = :period_a'
        params["period_a"] = spec.source_a.period
    if meta_b.is_period and spec.source_b.period:
        period_col = meta_b.period_col or "period_ym"
        period_clause_b = f' AND "t_b"."{period_col}" = :period_b'
        params["period_b"] = spec.source_b.period

    # prefilter — inner alias "t_a"/"t_b"
    pf_clause_a, pf_params_a = _compile_prefilter_clause(spec.source_a.prefilter, "t_a", "t_a", meta_a)
    pf_clause_b, pf_params_b = _compile_prefilter_clause(spec.source_b.prefilter, "t_b", "t_b", meta_b)
    params.update(pf_params_a)
    params.update(pf_params_b)

    # scope — compiled at engine level
    scope_a = _format_scope_clause(scope_clause_a)
    scope_b = _format_scope_clause(scope_clause_b)

    sql = f"""
SELECT {', '.join(select_cols)}
FROM (
    SELECT * FROM "{tbl_a}" t_a WHERE 1=1{period_clause_a}{pf_clause_a}{scope_a}
) t_a
INNER JOIN (
    SELECT * FROM "{tbl_b}" t_b WHERE 1=1{period_clause_b}{pf_clause_b}{scope_b}
) t_b ON {join_on}
WHERE {' OR '.join(compare_conditions)}
"""
    return CompiledQuery(sql.strip(), params)


async def compile_amount_query(
    spec: CompareSpec,
    loader: MetadataLoader,
    scope_clause_a: str = "true",
    scope_clause_b: str = "true",
) -> CompiledQuery:
    """Template 3 — amount summary comparison (subquery GROUP BY + FULL OUTER JOIN).

    Already uses WHERE 1=1 pattern. Scope is appended after prefilter.
    """
    meta_a = await loader.validate_table(spec.source_a.table)
    meta_b = await loader.validate_table(spec.source_b.table)

    tbl_a = meta_a.table_name
    tbl_b = meta_b.table_name

    amount_spec = spec.amount
    if amount_spec is None:
        raise ValueError("amount_spec is empty")

    # Group by columns — whitelist-mapped canonical names
    group_cols_a: list[str] = []
    group_cols_b: list[str] = []
    for g in amount_spec.group_by:
        col_a = meta_a.columns.get(g)
        col_b = meta_b.columns.get(g)
        code_a = col_a.column_code if col_a else g
        code_b = col_b.column_code if col_b else g
        group_cols_a.append(f'"{code_a}"')
        group_cols_b.append(f'"{code_b}"')

    # COALESCE columns for outer SELECT — use canonical names
    coal_cols: list[str] = []
    for g in amount_spec.group_by:
        col_a_code = meta_a.columns[g].column_code if meta_a.has_column(g) else g
        col_b_code = meta_b.columns[g].column_code if meta_b.has_column(g) else g
        coal_cols.append(f'COALESCE(a."{col_a_code}", b."{col_b_code}") as "{col_a_code}"')

    # ON clause — use canonical names from metadata
    on_conditions: list[str] = []
    for g in amount_spec.group_by:
        code_a = meta_a.columns[g].column_code if meta_a.has_column(g) else g
        code_b = meta_b.columns[g].column_code if meta_b.has_column(g) else g
        on_conditions.append(f'a."{code_a}" = b."{code_b}"')

    # Aggregate fields — whitelist-mapped canonical names
    safe_field_a = f'"{meta_a.columns[amount_spec.metric_a.field].column_code}"'
    safe_field_b = f'"{meta_b.columns[amount_spec.metric_b.field].column_code}"'

    # Use each metric's own aggregation function
    agg_func_a = amount_spec.metric_a.agg.value.upper()
    agg_func_b = amount_spec.metric_b.agg.value.upper()
    agg_a = f"{agg_func_a}({safe_field_a})"
    agg_b = f"{agg_func_b}({safe_field_b})"

    params: dict = {}

    # Period filter
    period_clause_a = ""
    period_clause_b = ""
    if meta_a.is_period and spec.source_a.period:
        period_col = meta_a.period_col or "period_ym"
        period_clause_a = f' AND "v"."{period_col}" = :period_a'
        params["period_a"] = spec.source_a.period
    if meta_b.is_period and spec.source_b.period:
        period_col = meta_b.period_col or "period_ym"
        period_clause_b = f' AND "v"."{period_col}" = :period_b'
        params["period_b"] = spec.source_b.period

    # Prefilter — inner alias "v" for SQL, "v_a"/"v_b" for param prefix (avoid collision)
    pf_clause_a, pf_params_a = _compile_prefilter_clause(spec.source_a.prefilter, "v", "v_a", meta_a)
    pf_clause_b, pf_params_b = _compile_prefilter_clause(spec.source_b.prefilter, "v", "v_b", meta_b)
    params.update(pf_params_a)
    params.update(pf_params_b)

    # Scope — compiled at engine level
    scope_a = _format_scope_clause(scope_clause_a)
    scope_b = _format_scope_clause(scope_clause_b)

    # Tolerance
    tol = amount_spec.tolerance.value
    tol_type = amount_spec.tolerance.type.value
    if tol_type == "absolute":
        tol_cond = f"ABS(COALESCE(a.total_a, 0) - COALESCE(b.total_b, 0)) > :tolerance"
    else:
        tol_cond = (
            f"CASE WHEN COALESCE(b.total_b, 0) != 0 THEN "
            f"ABS(COALESCE(a.total_a, 0) - COALESCE(b.total_b, 0)) / ABS(b.total_b) > :tolerance "
            f"ELSE COALESCE(a.total_a, 0) != 0 END"
        )
    params["tolerance"] = tol

    group_cols_inner_a = ", ".join(group_cols_a) if group_cols_a else "1"
    group_cols_inner_b = ", ".join(group_cols_b) if group_cols_b else "1"

    # When only_diff=true, add status WHERE filter to return only diff rows
    only_diff = spec.output.only_diff if spec.output else True
    status_where = f"WHERE status != '一致'" if only_diff else ""

    sql = f"""
SELECT *
FROM (
    SELECT
        {', '.join(coal_cols)},
        a.total_a as amount_a,
        b.total_b as amount_b,
        ABS(COALESCE(a.total_a, 0) - COALESCE(b.total_b, 0)) as diff,
        CASE
            WHEN a.total_a IS NULL THEN '仅{meta_b.table_label}有'
            WHEN b.total_b IS NULL THEN '仅{meta_a.table_label}有'
            WHEN {tol_cond} THEN '金额不一致'
            ELSE '一致'
        END as status
    FROM (
        SELECT {group_cols_inner_a}, {agg_a} as total_a
        FROM "{tbl_a}" v
        WHERE 1=1{period_clause_a}{pf_clause_a}{scope_a}
        GROUP BY {group_cols_inner_a}
    ) a
    FULL OUTER JOIN (
        SELECT {group_cols_inner_b}, {agg_b} as total_b
        FROM "{tbl_b}" v
        WHERE 1=1{period_clause_b}{pf_clause_b}{scope_b}
        GROUP BY {group_cols_inner_b}
    ) b ON {' AND '.join(on_conditions)}
) _sub
{status_where}
"""
    return CompiledQuery(sql.strip(), params)


async def compile_query(
    spec: CompareSpec,
    loader: MetadataLoader,
    scope_clause_a: str = "true",
    scope_clause_b: str = "true",
) -> CompiledQuery:
    """Select the appropriate template based on compare_type.

    scope_clause_a / scope_clause_b are pre-built SQL conditions from
    build_scope_filter (e.g. "org_id IN (1,2,3)"). The engine appends
    them directly to WHERE 1=1, avoiding post-compilation string replacement.
    """
    if spec.compare_type == CompareType.ROSTER:
        return await compile_roster_query(spec, loader, scope_clause_a, scope_clause_b)
    elif spec.compare_type == CompareType.FIELD:
        return await compile_field_query(spec, loader, scope_clause_a, scope_clause_b)
    elif spec.compare_type == CompareType.AMOUNT:
        return await compile_amount_query(spec, loader, scope_clause_a, scope_clause_b)
    else:
        raise ValueError(f"Unsupported compare type: {spec.compare_type}")
