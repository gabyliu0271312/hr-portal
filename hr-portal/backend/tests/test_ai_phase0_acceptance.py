from __future__ import annotations

import pytest

from app.ai.capabilities import CAPABILITIES, get_capability
from app.ai.audit import AiAuditTimer, record_ai_log
from app.ai.evals import FORMULA_EVAL_CASES, classify_formula_failure
from app.ai_formula.field_refs import FieldMeta
from app.ai_formula.validator import validate_dataset_formula
from app.main import app


def test_phase0_capability_registry_metadata_complete():
    required = {"formula.generate", "formula.validate", "formula.repair", "calculated_field.save"}
    capabilities = {item.capability_id: item for item in CAPABILITIES}

    assert required.issubset(capabilities)
    for capability in capabilities.values():
        assert capability.capability_id
        assert capability.version
        assert capability.risk_level in {"low", "medium", "high"}
        assert isinstance(capability.side_effect_tags, list)
        assert capability.policy_profile
        assert capability.model_profile
        assert capability.audit_enabled is True
        assert isinstance(capability.tools, list)
        assert capability.input_schema
        assert capability.output_schema


def test_phase0_capability_routes_are_registered_and_legacy_routes_removed():
    paths = {route.path for route in app.routes}

    assert "/api/v1/ai/capabilities" in paths
    assert "/api/v1/ai/capabilities/formula.generate/draft" in paths
    assert "/api/v1/ai/capabilities/formula.validate/diagnose" in paths
    assert "/api/v1/ai/capabilities/formula.repair/draft" in paths
    assert "/api/v1/ai/capabilities/calculated_field.save/write" in paths
    assert "/api/v1/ai-formula/draft" not in paths
    assert "/api/v1/ai-formula/validate" not in paths


def test_phase0_write_capability_requires_confirmation():
    save = get_capability("calculated_field.save")

    assert save is not None
    assert save.confirmation == "required"
    assert "writes_data" in save.side_effect_tags
    assert "high_risk" in save.side_effect_tags


@pytest.mark.asyncio
async def test_phase0_trace_records_required_event_types():
    class DummyDb:
        def __init__(self):
            self.rows = []

        def add(self, row):
            self.rows.append(row)

    class DummyUser:
        id = 7

    timer = AiAuditTimer()
    for event in [
        "entry",
        "capability",
        "tool",
        "model_call",
        "schema_validation",
        "policy_validation",
        "user_confirmation",
        "failure",
    ]:
        timer.add_event(event, capability_id="formula.generate")

    db = DummyDb()
    await record_ai_log(
        db=db,
        user=DummyUser(),
        action="phase0_trace_check",
        request_summary="check",
        response_summary="ok",
        input_payload={},
        output_payload={},
        status="success",
        metadata={"capability_id": "formula.generate"},
        timer=timer,
    )

    events = db.rows[0].metadata_json["trace_events"]
    event_names = {item["event"] for item in events}
    assert {
        "entry",
        "capability",
        "tool",
        "model_call",
        "schema_validation",
        "policy_validation",
        "user_confirmation",
        "failure",
    }.issubset(event_names)
    assert db.rows[0].trace_id == timer.trace_id


@pytest.mark.asyncio
async def test_phase0_formula_eval_cases_replay(monkeypatch):
    assert len(FORMULA_EVAL_CASES) >= 25

    fields = [
        FieldMeta("salary.base", "salary.基本工资", "number", True, "measure", "salary", "base", "sensitive"),
        FieldMeta("salary.bonus", "salary.奖金", "number", False, "measure", "salary", "bonus", "internal"),
        FieldMeta("salary.leave_date", "salary.离职日期", "string", False, "dimension", "salary", "leave_date", "internal"),
        FieldMeta("salary.name", "salary.姓名", "string", False, "dimension", "salary", "name", "internal"),
        FieldMeta("salary.dept", "salary.部门", "string", False, "dimension", "salary", "dept", "internal"),
        *[
            FieldMeta(f"salary.f{i}", f"salary.f{i}", "number", False, "measure", "salary", f"f{i}", "internal")
            for i in range(21)
        ],
    ]

    async def fake_dataset_field_meta(dataset_id, db):
        class DummyDataset:
            id = dataset_id
            name = "eval dataset"

        return DummyDataset(), fields

    async def fake_available_function_codes(db):
        return {
            "IF",
            "AND",
            "OR",
            "NOT",
            "SUM",
            "AVERAGE",
            "MIN",
            "MAX",
            "ROUND",
            "ABS",
            "CONCAT",
            "LEN",
            "UPPER",
            "LOWER",
            "ISBLANK",
            "CALC_TAX",
            "SAFE_DIVIDE",
        }

    async def fake_enabled_function_rows(db):
        class Row:
            def __init__(self, code, is_sensitive_output=False):
                self.code = code
                self.is_sensitive_output = is_sensitive_output
                self.function_type = "system_builtin"

        return [Row("CALC_TAX", True), Row("SAFE_DIVIDE", False)]

    monkeypatch.setattr("app.ai_formula.validator.dataset_field_meta", fake_dataset_field_meta)
    monkeypatch.setattr("app.ai_formula.validator.available_function_codes", fake_available_function_codes)
    monkeypatch.setattr("app.ai_formula.validator.enabled_function_rows", fake_enabled_function_rows)
    monkeypatch.setattr("app.ai_formula.validator.sensitive_system_builtin_codes", lambda: {"CALC_TAX"})

    for case in FORMULA_EVAL_CASES:
        result = await validate_dataset_formula(1, case.input_payload["formula"], db=None)
        expected = case.expected
        assert result["valid"] is expected["valid"], case.case_id
        if expected["valid"]:
            for function in expected.get("used_functions", []):
                assert function in result["used_functions"], case.case_id
            for ref in expected.get("depends_on", []):
                assert ref in result["depends_on"], case.case_id
            if "is_sensitive" in expected:
                assert result["is_sensitive"] is expected["is_sensitive"], case.case_id
        else:
            assert classify_formula_failure(result["errors"]) == expected["failure_reason"], case.case_id
