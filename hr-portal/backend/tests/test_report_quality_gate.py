from types import SimpleNamespace

import pytest
from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError

from app.reports.config import ReportConfig
from app.reports.quality_gate import enforce_report_quality, evaluate_quality_gate


class Result:
    def __init__(self, *, scalars=None, rows=None, scalar=None):
        self._scalars = scalars
        self._rows = rows
        self._scalar = scalar

    def scalars(self):
        return SimpleNamespace(all=lambda: self._scalars or [])

    def all(self):
        return self._rows or []

    def scalar_one_or_none(self):
        return self._scalar


class FakeDb:
    def __init__(self, results):
        self.results = list(results)

    async def execute(self, _query):
        result = self.results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


def governed_db(status_item=None, *, rule_type="relation_cardinality", asset_type="relation"):
    rule = SimpleNamespace(
        asset_type=asset_type,
        asset_code="salary.pay_month" if asset_type == "field" else ("emp_monthly_salary" if asset_type == "table" else "salary"),
        rule_type=rule_type,
        rule_config={"dataset_id": 1},
    )
    table = SimpleNamespace(table_name="emp_monthly_salary", alias="salary")
    candidate = SimpleNamespace(alias="salary", period_col="pay_month")
    return FakeDb([
        Result(rows=[table]),
        Result(scalars=[rule]),
        Result(rows=[(candidate.alias, candidate.period_col)]),
        Result(scalar=status_item),
    ])


@pytest.mark.asyncio
async def test_governed_report_missing_period_is_blocked():
    db = governed_db()
    with pytest.raises(HTTPException) as exc:
        await enforce_report_quality(
            db,
            report_id=17,
            dataset_id=1,
            config=ReportConfig(quality_period_field="salary.pay_month"),
            filters=[],
        )
    assert exc.value.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_governed_report_missing_status_is_blocked():
    db = governed_db()
    with pytest.raises(HTTPException) as exc:
        await enforce_report_quality(
            db,
            report_id=17,
            dataset_id=1,
            config=ReportConfig(quality_period_field="salary.pay_month"),
            filters=[{"column": "salary.pay_month", "op": "eq", "value": "202607"}],
        )
    assert exc.value.status_code == status.HTTP_409_CONFLICT


@pytest.mark.asyncio
async def test_quality_status_service_failure_is_blocked():
    db = FakeDb([SQLAlchemyError("quality status unavailable")])
    with pytest.raises(HTTPException) as exc:
        await enforce_report_quality(
            db,
            report_id=17,
            dataset_id=1,
            config=ReportConfig(quality_period_field="salary.pay_month"),
            filters=[],
        )
    assert exc.value.status_code == status.HTTP_503_SERVICE_UNAVAILABLE


@pytest.mark.asyncio
async def test_table_rule_governs_report_and_failed_cached_state_blocks():
    db = governed_db(
        SimpleNamespace(status="failed", severity="block"),
        rule_type="not_null",
        asset_type="table",
    )
    with pytest.raises(HTTPException) as exc:
        await enforce_report_quality(
            db,
            report_id=17,
            dataset_id=1,
            config=ReportConfig(quality_period_field="salary.pay_month"),
            filters=[{"column": "salary.pay_month", "op": "eq", "value": "202607"}],
        )
    assert exc.value.status_code == status.HTTP_409_CONFLICT




def quality_item(status_value, severity_value):
    return SimpleNamespace(status=status_value, severity=severity_value)


def test_quality_gate_allows_warning_with_risk_notice():
    assert evaluate_quality_gate(quality_item("warning", "warn"), action="run")
    assert evaluate_quality_gate(quality_item("warning", "warn"), action="export")


def test_quality_gate_allows_failed_warn_with_risk_notice():
    assert evaluate_quality_gate(quality_item("failed", "warn"), action="run")
    assert evaluate_quality_gate(quality_item("failed", "warn"), action="export")


def test_quality_gate_pending_blocks_export_but_allows_run():
    assert evaluate_quality_gate(quality_item("pending", "info"), action="run") is None
    with pytest.raises(HTTPException) as exc:
        evaluate_quality_gate(quality_item("pending", "info"), action="export")
    assert exc.value.status_code == status.HTTP_409_CONFLICT


def test_quality_gate_failed_block_blocks_both_actions():
    for action in ("run", "export"):
        with pytest.raises(HTTPException) as exc:
            evaluate_quality_gate(quality_item("failed", "block"), action=action)
        assert exc.value.status_code == status.HTTP_409_CONFLICT


def test_quality_gate_uses_explicit_chinese_policy_messages():
    with pytest.raises(HTTPException) as exc:
        evaluate_quality_gate(None, action="run")
    assert exc.value.detail == "当前期间尚无数据质量结果，已阻止报表运行"

    with pytest.raises(HTTPException) as exc:
        evaluate_quality_gate(quality_item("pending", "info"), action="export")
    assert exc.value.detail == "当前期间正在进行数据质量校验，暂不允许导出"

    with pytest.raises(HTTPException) as exc:
        evaluate_quality_gate(quality_item("failed", "block"), action="run")
    assert exc.value.detail == "当前期间数据质量检查未通过，暂不允许运行或导出"

    assert evaluate_quality_gate(quality_item("failed", "warn"), action="run") == "当前期间存在数据质量风险，允许继续运行"
    assert evaluate_quality_gate(quality_item("warning", "warn"), action="run") == "当前期间存在数据质量警告，允许继续运行"


def test_quality_user_facing_sources_have_no_placeholder_question_marks():
    from pathlib import Path
    import re

    repo_root = Path(__file__).resolve().parents[2]
    paths = [
        repo_root / "backend/app/reports/quality_gate.py",
        repo_root / "frontend/src/views/warehouse/WarehouseQuality.vue",
    ]
    for path in paths:
        assert re.search(r"\?{3,}", path.read_text(encoding="utf-8")) is None, path
