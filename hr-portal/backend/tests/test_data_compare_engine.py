"""Regression tests for data_compare engine (composite join_keys + scope alias).

Covers:
  P1 fix: roster/field engines support composite join_keys (multi-column)
  P0 fix: scope alias uses SQLAlchemy aliased() — verified via SQL string patterns
"""
from __future__ import annotations

import pytest

from app.data_compare.engine import (
    compile_amount_query,
    compile_field_query,
    compile_roster_query,
)
from app.data_compare.metadata import MetadataLoader, TableMeta, ColumnMeta
from app.data_compare.schemas import (
    AggFunction,
    AmountSpec,
    CompareSpec,
    CompareType,
    DataSource,
    FieldCompareMode,
    FieldPair,
    FieldSpec,
    MetricDef,
    OutputConfig,
    RosterSpec,
    ToleranceDef,
)


# ── Helpers ────────────────────────────────────────────────────────────────

def _col(code: str, label: str = "", pk: bool = False,
          sensitive: bool = False) -> ColumnMeta:
    return ColumnMeta(
        column_code=code,
        column_label=label or code,
        data_type="varchar",
        is_pk_part=pk,
        is_sensitive=sensitive,
        agg_role=None,
        scope_role=None,
    )


def _meta(table_name: str, table_label: str,
           columns: dict,          # {code: {"pk":bool,"sensitive":bool}}
           is_period: bool = False,
           scope_strategy: str | None = None) -> TableMeta:
    tm = TableMeta.__new__(TableMeta)
    tm.table_name = table_name
    tm.table_label = table_label
    tm.is_period = is_period
    tm.period_col = "period_ym"
    tm.scope_strategy = scope_strategy
    tm.join_col = None
    tm.columns = {}
    for code, opts in columns.items():
        pk = opts.get("pk", False) if isinstance(opts, dict) else False
        sensitive = opts.get("sensitive", False) if isinstance(opts, dict) else False
        tm.columns[code] = _col(code, pk=pk, sensitive=sensitive)
    return tm


class _FakeLoader(MetadataLoader):
    """MetadataLoader that returns canned TableMeta without touching DB."""

    def __init__(self, table_map: dict[str, TableMeta]):
        # Bypass MetadataLoader.__init__ (needs db session)
        object.__setattr__(self, '_tables', table_map)
        object.__setattr__(self, '_loaded', True)

    async def validate_table(self, name: str) -> TableMeta:
        meta = self._tables.get(name) if hasattr(self, '_tables') else None
        if meta is None:
            raise ValueError(f"table {name} not found")
        return meta

    async def get_table(self, name: str) -> TableMeta | None:
        return self._tables.get(name) if hasattr(self, '_tables') else None


# ── Fake metadata ──────────────────────────────────────────────────────────

COLUMNS_A = {
    "employee_no":   {"pk": True},
    "company_code":  {"pk": True},
    "period_ym":    {},
    "salary":        {},
    "dept":          {},
}
COLUMNS_B = dict(COLUMNS_A)  # same structure

META_A = _meta("emp_table_a", "表A", COLUMNS_A,
                is_period=True, scope_strategy="org_first")
META_B = _meta("emp_table_b", "表B", COLUMNS_B,
                is_period=True, scope_strategy="org_first")

LOADER = _FakeLoader({"emp_table_a": META_A, "emp_table_b": META_B})


# ── Test 1: roster composite join_keys ──────────────────────────────────

class TestRosterCompositeKeys:
    """P1 fix: roster engine must JOIN on ALL join_keys, not just [0]."""

    @pytest.mark.asyncio
    async def test_on_clause_has_all_keys(self):
        spec = CompareSpec(
            compare_type=CompareType.ROSTER,
            source_a=DataSource(table="emp_table_a", period="202401"),
            source_b=DataSource(table="emp_table_b", period="202401"),
            join_keys=["employee_no", "company_code"],
            roster=RosterSpec(direction="both"),
            output=OutputConfig(max_detail=10, only_diff=True),
        )
        compiled = await compile_roster_query(
            spec, LOADER, scope_clause_a="true", scope_clause_b="true",
        )
        sql = compiled.sql

        # Both key equality conditions must appear in the ON clause
        assert '"t_a"."employee_no" = "t_b"."employee_no"' in sql
        assert '"t_a"."company_code" = "t_b"."company_code"' in sql

    @pytest.mark.asyncio
    async def test_select_outputs_all_keys(self):
        spec = CompareSpec(
            compare_type=CompareType.ROSTER,
            source_a=DataSource(table="emp_table_a", period="202401"),
            source_b=DataSource(table="emp_table_b", period="202401"),
            join_keys=["employee_no", "company_code"],
            roster=RosterSpec(direction="both"),
            output=OutputConfig(max_detail=10, only_diff=True),
        )
        compiled = await compile_roster_query(
            spec, LOADER, scope_clause_a="true", scope_clause_b="true",
        )
        sql = compiled.sql

        # SELECT should COALESCE both keys
        assert 'COALESCE("t_a"."employee_no"' in sql
        assert 'COALESCE("t_a"."company_code"' in sql


# ── Test 2: field composite join_keys ───────────────────────────────────

class TestFieldCompositeKeys:
    """P1 fix: field engine must JOIN on ALL join_keys."""

    @pytest.mark.asyncio
    async def test_on_clause_has_all_keys(self):
        spec = CompareSpec(
            compare_type=CompareType.FIELD,
            source_a=DataSource(table="emp_table_a", period="202401"),
            source_b=DataSource(table="emp_table_b", period="202401"),
            join_keys=["employee_no", "company_code"],
            field=FieldSpec(
                pairs=[
                    FieldPair(field_a="salary", field_b="salary",
                              mode=FieldCompareMode.EXACT),
                ]
            ),
            output=OutputConfig(max_detail=10, only_diff=True),
        )
        compiled = await compile_field_query(
            spec, LOADER, scope_clause_a="true", scope_clause_b="true",
        )
        sql = compiled.sql

        assert '"t_a"."employee_no"' in sql
        assert '"t_b"."employee_no"' in sql
        assert '"t_a"."company_code"' in sql
        assert '"t_b"."company_code"' in sql

    @pytest.mark.asyncio
    async def test_select_includes_all_keys(self):
        spec = CompareSpec(
            compare_type=CompareType.FIELD,
            source_a=DataSource(table="emp_table_a", period="202401"),
            source_b=DataSource(table="emp_table_b", period="202401"),
            join_keys=["employee_no", "company_code"],
            field=FieldSpec(
                pairs=[
                    FieldPair(field_a="salary", field_b="salary",
                              mode=FieldCompareMode.EXACT),
                ]
            ),
            output=OutputConfig(max_detail=10, only_diff=True),
        )
        compiled = await compile_field_query(
            spec, LOADER, scope_clause_a="true", scope_clause_b="true",
        )
        sql = compiled.sql

        # SELECT must include both join keys
        assert '"employee_no"' in sql
        assert '"company_code"' in sql


# ── Test 3: scope alias — SQL must use alias, not raw table name ───────

class TestScopeAlias:
    """P0 fix: scope SQL must reference table alias (t_a/t_b/v), not raw name."""

    @pytest.mark.asyncio
    async def test_roster_scope_uses_alias_not_raw_table(self):
        scope_sql = '"t_a"."cost_center_code" IN (1, 2, 3)'
        spec = CompareSpec(
            compare_type=CompareType.ROSTER,
            source_a=DataSource(table="emp_table_a", period="202401"),
            source_b=DataSource(table="emp_table_b", period="202401"),
            join_keys=["employee_no"],
            roster=RosterSpec(direction="both"),
            output=OutputConfig(max_detail=10, only_diff=True),
        )
        compiled = await compile_roster_query(
            spec, LOADER,
            scope_clause_a=scope_sql,
            scope_clause_b="true",
        )
        sql = compiled.sql

        # Scope condition must appear with alias
        assert '"t_a"."cost_center_code"' in sql
        # Raw table name must NOT appear as a column qualifier in subquery WHERE
        from_idx = sql.index('FROM "emp_table_a"')
        where_idx = sql.index("WHERE 1=1", from_idx)
        subquery_tail = sql[where_idx:]
        assert "emp_table_a." not in subquery_tail

    @pytest.mark.asyncio
    async def test_amount_scope_uses_v_alias(self):
        scope_sql = '"v"."cost_center_code" IN (1, 2, 3)'
        spec = CompareSpec(
            compare_type=CompareType.AMOUNT,
            source_a=DataSource(table="emp_table_a", period="202401"),
            source_b=DataSource(table="emp_table_b", period="202401"),
            join_keys=["employee_no"],
            amount=AmountSpec(
                metric_a=MetricDef(field="salary", agg=AggFunction.SUM),
                metric_b=MetricDef(field="salary", agg=AggFunction.SUM),
                group_by=["dept"],
                tolerance=ToleranceDef(value=0.0, type="absolute"),
            ),
            output=OutputConfig(max_detail=10, only_diff=True),
        )
        compiled = await compile_amount_query(
            spec, LOADER,
            scope_clause_a=scope_sql,
            scope_clause_b="true",
        )
        sql = compiled.sql

        assert '"v"."cost_center_code"' in sql
        # Raw table name must NOT appear as column qualifier in subquery WHERE
        from_idx = sql.index('FROM "emp_table_a"')
        where_idx = sql.index("WHERE 1=1", from_idx)
        subquery_tail = sql[where_idx:]
        assert "emp_table_a." not in subquery_tail
