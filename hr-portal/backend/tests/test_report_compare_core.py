"""DB-free tests: run with unittest, not pytest (repository conftest probes PostgreSQL)."""
import unittest
from decimal import Decimal
from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError

from app.ai_formula.ast.semantics import FieldInfo
from app.data_compare.report_compare import (
    ReportCompareSpec, _aggregate_rows, _amount, _compare, _eval_ast,
    compile_amount_expression,
)


def spec_data():
    return {"kind": "report_amount_v1", "report_id": 1, "table_b": "salary",
            "period_field_a": "a.period", "periods": ["202601"],
            "metrics": [{"id": "pay", "label": "金额", "column_a": "a.pay", "expression_b": "pay", "tolerance": "0.01"}],
            "dimension": {"column_a": "a.org", "column_b": "org", "value_map_b": {}}}


class ReportCompareCoreTests(unittest.TestCase):
    def test_contract_rejects_nonfinite_negative_tolerance_and_duplicate_metrics(self):
        for tolerance in ("NaN", "Infinity", "-1"):
            data = spec_data()
            data["metrics"][0]["tolerance"] = tolerance
            with self.assertRaises(ValidationError): ReportCompareSpec.model_validate(data)
        data = spec_data()
        data["metrics"] *= 2
        with self.assertRaises(ValidationError): ReportCompareSpec.model_validate(data)

    def test_contract_period_validation(self):
        for periods in (["202613"], ["202601", "202601"], ["2026-01"]):
            data = spec_data()
            data["periods"] = periods
            with self.assertRaises(ValidationError): ReportCompareSpec.model_validate(data)

    def test_expression_arithmetic_and_decimal(self):
        fields = [FieldInfo(alias="b", column="pay", data_type="number")]
        expression = compile_amount_expression("(pay + 0.1) * 2", fields)
        self.assertEqual(_eval_ast(expression.ast, {"pay": Decimal("9007199254740993.1")}), Decimal("18014398509481986.4"))

    def test_expression_rejects_sql_functions_and_unknown_fields(self):
        fields = [FieldInfo(alias="b", column="pay", data_type="number")]
        for expression in ("SUM(pay)", "ABS(pay)", "hidden + pay", "pay > 1", "pay; SELECT 1", "'text'"):
            with self.subTest(expression=expression), self.assertRaises(ValueError):
                compile_amount_expression(expression, fields)

    def test_null_and_zero_division_are_incomplete_not_zero(self):
        fields = [FieldInfo(alias="b", column="pay", data_type="number")]
        expression = compile_amount_expression("pay / 0", fields)
        self.assertIsNone(_eval_ast(expression.ast, {"pay": 1}))
        metrics = [SimpleNamespace(id="m")]
        totals, _ = _aggregate_rows([{"org": "X", "pay": None}], "org", metrics, lambda metric, row: _amount(row["pay"]))
        result = _compare(totals["m"], totals["m"], Decimal(0))
        self.assertEqual(result["status"], "data_incomplete")
        self.assertIsNone(result["amount_a"])
        self.assertIsNone(result["diff"])

    def test_totals_include_matching_groups_and_two_metrics(self):
        metrics = [SimpleNamespace(id="salary"), SimpleNamespace(id="bonus")]
        a = [{"org": "X", "salary": "60", "bonus": "20"}, {"org": "Y", "salary": "40", "bonus": "30"}]
        b = [{"org": "otherX", "salary": "60", "bonus": "20"}, {"org": "Y", "salary": "35", "bonus": "25"}]
        value = lambda metric, row: _amount(row[metric.id])
        totals_a, groups_a = _aggregate_rows(a, "org", metrics, value)
        totals_b, groups_b = _aggregate_rows(b, "org", metrics, value, {"otherX": "X"})
        expected = {"salary": ("100", "95"), "bonus": ("50", "45")}
        for metric in metrics:
            total = _compare(totals_a[metric.id], totals_b[metric.id], Decimal(0))
            self.assertEqual((total["amount_a"], total["amount_b"]), expected[metric.id])
            differences = [dim for dim in groups_a[metric.id] if _compare(groups_a[metric.id][dim], groups_b[metric.id][dim], Decimal(0))["status"] == "diff"]
            self.assertEqual(differences, ["Y"])
            self.assertEqual(total["diff"], "5")

    def test_offsetting_groups_keep_total_match_and_single_side_is_diff(self):
        metrics = [SimpleNamespace(id="pay")]
        value = lambda metric, row: _amount(row["pay"])
        total_a, group_a = _aggregate_rows([{"org": "X", "pay": "60"}, {"org": "Y", "pay": "40"}], "org", metrics, value)
        total_b, group_b = _aggregate_rows([{"org": "X", "pay": "55"}, {"org": "Y", "pay": "45"}], "org", metrics, value)
        self.assertEqual(_compare(total_a["pay"], total_b["pay"], Decimal(0))["status"], "match")
        self.assertEqual(_compare(group_a["pay"]["X"], group_b["pay"]["X"], Decimal(0))["status"], "diff")
        empty = {"amount": Decimal(0), "rows": 0, "valid": 0, "nulls": 0}
        difference = _compare(group_a["pay"]["X"], empty, Decimal(0), missing_as_zero=True)
        self.assertEqual(difference["status"], "diff")
        self.assertEqual(difference["amount_b"], "0")

    def test_execution_budget_and_decimal_projection(self):
        from app.reports.sql_builder import ExecutionBudget, _project_output_items
        budget = ExecutionBudget(max_rows=2, max_groups=1, max_cells=4)
        budget.check(rows=2, cells=4, groups=1)
        for kwargs in ({"rows": 3}, {"groups": 2}, {"cells": 5}):
            with self.assertRaises(HTTPException): budget.check(**kwargs)
        amount = Decimal("0.123456789012345678901234567")
        rows = _project_output_items([{"pay": amount}], [{"code": "pay"}], preserve_decimal=True)
        self.assertIs(rows[0]["pay"], amount)

    def test_empty_is_not_consistent_and_nonfinite_values_refused(self):
        empty = {"amount": Decimal(0), "rows": 0, "valid": 0, "nulls": 0}
        self.assertEqual(_compare(empty, empty, Decimal(0))["status"], "data_incomplete")
        for value in ("NaN", "Infinity", "******"):
            with self.assertRaises(HTTPException): _amount(value)


class SnapshotSecurityTests(unittest.IsolatedAsyncioTestCase):
    async def test_changed_definition_and_foreign_executor_refused(self):
        from unittest.mock import AsyncMock, patch
        from app.data_compare.report_compare import validate_snapshot
        snapshot = {"kind": "report_amount_v1", "executed_by": 7, "spec": spec_data(), "fingerprint": "old"}
        with self.assertRaises(HTTPException) as denied:
            await validate_snapshot(snapshot, SimpleNamespace(id=8), None)
        self.assertEqual(denied.exception.status_code, 403)
        with patch("app.data_compare.report_compare.validate_report_compare", AsyncMock(return_value={"fingerprint": "new"})):
            with self.assertRaises(HTTPException) as stale:
                await validate_snapshot(snapshot, SimpleNamespace(id=7), None)
            self.assertEqual(stale.exception.status_code, 409)

    async def test_savepoint_propagates_failure_and_keeps_outer_transaction(self):
        from unittest.mock import AsyncMock, MagicMock, patch
        from app.data_compare.report_compare import execute_report_compare
        context = MagicMock()
        context.__aenter__ = AsyncMock()
        context.__aexit__ = AsyncMock(return_value=False)
        db = SimpleNamespace(begin_nested=MagicMock(return_value=context), scalar=AsyncMock(return_value="0"))
        error = HTTPException(422, detail="budget exceeded")
        with patch("app.data_compare.report_compare._execute_report_compare", AsyncMock(side_effect=error)):
            with self.assertRaises(HTTPException):
                await execute_report_compare(spec_data(), SimpleNamespace(id=7), db)
        context.__aexit__.assert_awaited_once()
        self.assertIs(context.__aexit__.call_args.args[1], error)


if __name__ == "__main__":
    unittest.main()
