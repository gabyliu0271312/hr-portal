from __future__ import annotations

from datetime import date

import pytest

from app.data_compare.metadata import ColumnMeta, MetadataLoader, TableMeta
from app.data_compare.normalizer import normalize_compare_spec_data, normalize_period_text


def _col(code: str, *, pk: bool = False, sensitive: bool = False) -> ColumnMeta:
    return ColumnMeta(
        column_code=code,
        column_label=code,
        data_type="varchar",
        is_pk_part=pk,
        is_sensitive=sensitive,
        agg_role=None,
        scope_role=None,
    )


def _meta(
    table_name: str,
    *,
    period_col: str | None = None,
    join_col: str | None = None,
    columns: list[str] | None = None,
    pk_cols: list[str] | None = None,
) -> TableMeta:
    tm = TableMeta(
        table_name=table_name,
        table_label=table_name,
        is_period=bool(period_col),
        period_col=period_col,
        scope_strategy="cross_filter",
        join_col=join_col,
    )
    for c in columns or []:
        tm.columns[c] = _col(c, pk=c in (pk_cols or []))
    return tm


class _FakeLoader(MetadataLoader):
    def __init__(self, table_map: dict[str, TableMeta]):
        object.__setattr__(self, "_tables", table_map)
        object.__setattr__(self, "_loaded", True)

    async def get_table(self, name: str) -> TableMeta | None:
        return self._tables.get(name)

    async def list_tables(self) -> list[TableMeta]:
        return list(self._tables.values())


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("202605", "202605"),
        ("2026.05", "202605"),
        ("2026-5", "202605"),
        ("2026/05", "202605"),
        ("2026\u5e745\u6708", "202605"),
        ("2026\u5e7405\u6708\u4efd", "202605"),
        ("5\u6708", "202605"),
    ],
)
def test_normalize_period_text_variants(raw, expected):
    assert normalize_period_text(raw, today=date(2026, 6, 28)) == expected


@pytest.mark.asyncio
async def test_production_roster_case_fills_period_and_infers_employee_no():
    meta_a = _meta(
        "emp_monthly_allocation",
        period_col="cost_period",
        columns=["employee_no", "cost_period", "cost_center"],
        pk_cols=["employee_no"],
    )
    meta_b = _meta(
        "emp_monthly_salary",
        period_col="pay_month",
        columns=["employee_no", "pay_month", "salary"],
        pk_cols=["employee_no"],
    )
    loader = _FakeLoader({meta_a.table_name: meta_a, meta_b.table_name: meta_b})

    data = {
        "compare_type": "roster",
        "source_a": {"table": "emp_monthly_allocation", "prefilter": []},
        "source_b": {"table": "emp_monthly_salary", "prefilter": []},
        "join_keys": ["cost_period", "pay_month"],
    }
    normalized = await normalize_compare_spec_data(
        data,
        loader,
        instruction="?????2026.05",
    )

    assert normalized["source_a"]["period"] == "202605"
    assert normalized["source_b"]["period"] == "202605"
    assert normalized["join_keys"] == ["employee_no"]
    assert normalized["roster"]["direction"] == "both"
    assert "employee_no" in normalized["roster"]["display_fields"]


@pytest.mark.asyncio
async def test_period_prefilters_are_moved_to_source_period():
    meta_a = _meta("a", period_col="cost_period", columns=["employee_no", "cost_period"], pk_cols=["employee_no"])
    meta_b = _meta("b", period_col="pay_month", columns=["employee_no", "pay_month"], pk_cols=["employee_no"])
    loader = _FakeLoader({"a": meta_a, "b": meta_b})

    normalized = await normalize_compare_spec_data(
        {
            "compare_type": "roster",
            "source_a": {"table": "a", "prefilter": [{"column": "cost_period", "op": "eq", "value": "2026\u5e745\u6708"}]},
            "source_b": {"table": "b", "prefilter": [{"column": "pay_month", "op": "eq", "value": "2026.05"}]},
            "join_keys": [],
        },
        loader,
    )

    assert normalized["source_a"]["period"] == "202605"
    assert normalized["source_b"]["period"] == "202605"
    assert normalized["source_a"]["prefilter"] == []
    assert normalized["source_b"]["prefilter"] == []
    assert normalized["join_keys"] == ["employee_no"]


@pytest.mark.asyncio
async def test_join_keys_inferred_from_composite_common_pk():
    meta_a = _meta("a", columns=["employee_no", "company_code", "dept"], pk_cols=["employee_no", "company_code"])
    meta_b = _meta("b", columns=["employee_no", "company_code", "salary"], pk_cols=["employee_no", "company_code"])
    loader = _FakeLoader({"a": meta_a, "b": meta_b})

    normalized = await normalize_compare_spec_data(
        {
            "compare_type": "roster",
            "source_a": {"table": "a"},
            "source_b": {"table": "b"},
        },
        loader,
    )

    assert normalized["join_keys"] == ["employee_no", "company_code"]


@pytest.mark.asyncio
async def test_join_keys_fallback_to_employee_no_when_pk_not_common():
    meta_a = _meta("a", columns=["employee_no", "a_id"], pk_cols=["a_id"])
    meta_b = _meta("b", columns=["employee_no", "b_id"], pk_cols=["b_id"])
    loader = _FakeLoader({"a": meta_a, "b": meta_b})

    normalized = await normalize_compare_spec_data(
        {"compare_type": "roster", "source_a": {"table": "a"}, "source_b": {"table": "b"}, "join_keys": ["period"]},
        loader,
    )

    assert normalized["join_keys"] == ["employee_no"]

@pytest.mark.asyncio
async def test_display_defaults_for_roster_template():
    meta_a = _meta("a", columns=["employee_no", "employee_name"], pk_cols=["employee_no"])
    meta_b = _meta("b", columns=["employee_no", "employee_name"], pk_cols=["employee_no"])
    loader = _FakeLoader({"a": meta_a, "b": meta_b})

    normalized = await normalize_compare_spec_data(
        {"compare_type": "roster", "source_a": {"table": "a"}, "source_b": {"table": "b"}},
        loader,
        instruction="对比两张表名单差异",
    )

    assert normalized["display"]["template"] == "roster"
    assert normalized["display"]["primary_metric"] == "diff_count"
    assert "employee_no" in normalized["display"]["columns"]
    assert "diff_type" in normalized["display"]["highlight_columns"]


@pytest.mark.asyncio
async def test_display_uses_prompt_mentioned_columns_as_highlight():
    meta_a = _meta("a", columns=["employee_no", "employee_name", "dept_name"], pk_cols=["employee_no"])
    meta_b = _meta("b", columns=["employee_no", "employee_name", "dept_name"], pk_cols=["employee_no"])
    loader = _FakeLoader({"a": meta_a, "b": meta_b})

    normalized = await normalize_compare_spec_data(
        {"compare_type": "roster", "source_a": {"table": "a"}, "source_b": {"table": "b"}},
        loader,
        instruction="对比名单，重点看 dept_name",
    )

    assert "dept_name" in normalized["display"]["columns"]
    assert "dept_name" in normalized["display"]["highlight_columns"]


@pytest.mark.asyncio
async def test_display_amount_sort_by_diff_desc_from_instruction():
    meta_a = _meta("a", columns=["employee_no", "amount"], pk_cols=["employee_no"])
    meta_b = _meta("b", columns=["employee_no", "amount"], pk_cols=["employee_no"])
    loader = _FakeLoader({"a": meta_a, "b": meta_b})

    normalized = await normalize_compare_spec_data(
        {
            "compare_type": "amount",
            "source_a": {"table": "a"},
            "source_b": {"table": "b"},
            "amount": {
                "metric_a": {"agg": "sum", "field": "amount"},
                "metric_b": {"agg": "sum", "field": "amount"},
                "group_by": ["employee_no"],
                "tolerance": {"type": "absolute", "value": 0},
            },
        },
        loader,
        instruction="对比金额差额，并按差额从高到低排序",
    )

    assert normalized["display"]["template"] == "amount"
    assert normalized["display"]["primary_metric"] == "amount_diff"
    assert normalized["display"]["sort_by"] == "diff"
    assert normalized["display"]["sort_order"] == "desc"
