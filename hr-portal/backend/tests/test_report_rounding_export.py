from decimal import Decimal

import pytest

from app.reports.router import _prepare_xlsx_export_rows, _xlsx_display_value
from app.reports.sql_builder import _rounding_target_sort_key


def test_xlsx_value_is_rounded_to_default_display_precision():
    value, number_format = _xlsx_display_value(Decimal("1.234"), {})

    assert value == pytest.approx(1.23)
    assert number_format == "#,##0.00"


def test_xlsx_export_closing_difference_is_stable_at_display_precision():
    rows = [
        ["A", "B", Decimal("1.005")],
        ["A", "A", Decimal("1.005")],
    ]
    config = {
        "rounding_corrections": [{"group_by": "group", "target_cols": ["amount"]}],
        "column_settings": {"amount": {"display_format": {"type": "default"}}},
    }

    first = _prepare_xlsx_export_rows(rows, ["group", "employee", "amount"], {"amount"}, config)
    repeated = _prepare_xlsx_export_rows(list(reversed(rows)), ["group", "employee", "amount"], {"amount"}, config)

    assert sum(row[2] for row in first) == Decimal("2.01")
    assert {row[1]: row[2] for row in first}["B"] == Decimal("1.00")
    assert {row[1]: row[2] for row in repeated}["B"] == Decimal("1.00")


def test_runtime_rounding_target_selection_is_independent_of_query_order():
    rows = [
        {"group": "A", "employee": "B", "amount": Decimal("1.01")},
        {"group": "A", "employee": "A", "amount": Decimal("1.01")},
    ]

    assert max(rows, key=_rounding_target_sort_key)["employee"] == "B"
    assert max(list(reversed(rows)), key=_rounding_target_sort_key)["employee"] == "B"
