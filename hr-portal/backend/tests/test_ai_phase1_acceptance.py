from __future__ import annotations

import pytest

from app.ai.audit import AiAuditTimer, record_ai_log
from app.ai.capabilities import get_capability
from app.ai.evals import FORMULA_SEMANTIC_REVIEW_CASES, semantic_review_summary
from app.ai.router import (
    AiBadCaseCaptureIn,
    ReportExplainConfigIn,
    _explain_report_config,
    capture_ai_bad_case,
)
from app.ai_formula.field_refs import FieldMeta
from app.ai_formula.router import FormulaDraftIn, draft_formula_impl
from app.main import app
from app.system.models import SystemLog


def test_phase1_semantic_review_samples_are_business_ready():
    summary = semantic_review_summary()

    assert summary["total"] >= 10
    assert summary["passed"] >= 8
    assert summary["failed"] >= 2

    for case in FORMULA_SEMANTIC_REVIEW_CASES:
        assert case.case_id
        assert case.requirement
        assert case.generated_formula.startswith("=")
        assert case.field_mapping
        assert case.business_judgement in {"pass", "fail"}
        if case.business_judgement == "fail":
            assert case.failure_reason
            assert case.repair_suggestion


def test_phase1_report_explain_config_capability_is_registered_and_routed():
    capability = get_capability("report.explain_config")
    paths = {route.path for route in app.routes}

    assert capability is not None
    assert capability.type == "answer"
    assert capability.required_permission == ("report.list", "V")
    assert capability.risk_level == "low"
    assert capability.side_effect_tags == []
    assert capability.tools == ["report.read_config"]
    assert capability.model_profile == "reasoning"
    assert "/api/v1/ai/capabilities/report.explain_config/answer" in paths


def test_phase1_report_explain_config_returns_context_packet():
    out = _explain_report_config(
        ReportExplainConfigIn(
            report_name="月度成本报表",
            columns=["dept", "amount", "hidden_note"],
            filters=[{"column": "month", "op": "eq", "value": "202606"}],
            sorts=[{"column": "amount", "order": "desc"}],
            aggregate=True,
            aggregations={"amount": "sum"},
            column_settings={"hidden_note": {"hidden": True}},
        )
    )

    assert out.field_count == 3
    assert out.filter_count == 1
    assert out.sort_count == 1
    assert out.aggregation_count == 1
    assert out.visible_fields == ["dept", "amount"]
    assert out.context_packet["page"]["kind"] == "report_config"
    assert out.context_packet["permission"]["mode"] == "read_only"
    assert out.context_packet["domain_context"]["side_effect"] == "none"
    assert out.mode == "read_only_chat"
    assert out.answer
    assert out.warnings


@pytest.mark.asyncio
async def test_phase1_bad_case_capture_links_to_source_trace():
    class DummyUser:
        id = 7

    class DummyScalar:
        def __init__(self, row):
            self.row = row

        def scalar_one_or_none(self):
            return self.row

    class DummyDb:
        def __init__(self, source_log):
            self.source_log = source_log
            self.rows = []
            self.committed = False

        async def execute(self, *args, **kwargs):
            return DummyScalar(self.source_log)

        def add(self, row):
            self.rows.append(row)

        async def commit(self):
            self.committed = True

    source_timer = AiAuditTimer()
    source_timer.add_event("model_call", capability_id="formula.generate", model="strong-model")
    source_log = SystemLog(
        category="ai_call",
        action="formula_draft",
        status="validation_failed",
        user_id=7,
        request_summary="将第4条插入到公式",
        response_summary="invalid",
        input_hash="input",
        output_hash="output",
        metadata_json={"capability_id": "formula.generate", "trace_events": source_timer.event_payload()},
        trace_id="trace-source-001",
        error="公式校验失败",
    )
    db = DummyDb(source_log)

    out = await capture_ai_bad_case(
        AiBadCaseCaptureIn(
            trace_id="trace-source-001",
            source="backend_validation_rejected",
            failure_stage="backend",
            user_message="将第4条插入到公式",
            formula="=NOT(ISBLANK(salary.leave_date))",
            reason="模型生成公式后端校验失败",
            repair_suggestion="保留源 trace 并转为 eval 草稿",
        ),
        DummyUser(),
        db,
    )

    assert out.captured is True
    assert out.source_trace_id == "trace-source-001"
    assert out.source_log_found is True
    assert db.committed is True
    captured = db.rows[-1]
    assert captured.action == "bad_case_capture"
    assert captured.status == "captured"
    assert captured.metadata_json["source_trace_id"] == "trace-source-001"
    assert captured.metadata_json["source_log_found"] is True
    assert captured.metadata_json["source_log"]["action"] == "formula_draft"
    assert captured.metadata_json["trace_events"][-1]["event"] == "bad_case_capture"


@pytest.mark.asyncio
async def test_phase1_formula_question_keeps_current_formula(monkeypatch):
    class DummyDataset:
        id = 1
        name = "员工数据集"

    class DummyConfig:
        api_key_encrypted = "encrypted"
        base_url = "https://example.test/v1"
        model_fast_json = "strong-model"
        timeout_seconds = 30

    class DummyUser:
        id = 7

    fields = [
        FieldMeta(
            code="salary.base",
            label="salary.基本工资",
            data_type="number",
            is_sensitive=False,
            agg_role="measure",
            alias="salary",
            column_code="base",
        )
    ]

    async def fake_dataset_field_meta_for_ai(dataset_id, user, db):
        return DummyDataset(), fields, {
            "total_fields": len(fields),
            "visible_fields": len(fields),
            "filtered_sensitive_fields": [],
            "context_policy": "authorized_metadata_only",
        }

    async def fake_enabled_function_rows(db):
        return []

    async def fake_active_ai_config(db):
        return DummyConfig()

    async def fake_generate_json_openai_compatible(**kwargs):
        return (
            {
                "intent": "formula_question",
                "should_update_formula": False,
                "explanation": "平台支持 IF、AND、OR、NOT 和 ISBLANK。",
                "warnings": [],
            },
            {"total_tokens": 10},
        )

    log_calls: list[dict] = []

    async def fake_record_ai_log(**kwargs):
        log_calls.append(kwargs)

    async def fake_ensure_dataset_access(*args):
        return None

    monkeypatch.setattr("app.ai_formula.router._ensure_dataset_access", fake_ensure_dataset_access)
    monkeypatch.setattr("app.ai_formula.router.dataset_field_meta_for_ai", fake_dataset_field_meta_for_ai)
    monkeypatch.setattr("app.ai_formula.router.enabled_function_rows", fake_enabled_function_rows)
    monkeypatch.setattr("app.ai_formula.router.active_ai_config", fake_active_ai_config)
    monkeypatch.setattr("app.ai_formula.router.decrypt", lambda value: "api-key")
    monkeypatch.setattr(
        "app.ai_formula.router.generate_json_openai_compatible",
        fake_generate_json_openai_compatible,
    )
    monkeypatch.setattr("app.ai_formula.router.record_ai_log", fake_record_ai_log)

    class DummyDb:
        async def execute(self, *args, **kwargs):
            class Result:
                def scalars(self):
                    return self

                def all(self):
                    return []

            return Result()

        async def commit(self):
            return None

    current_formula = '=IF(FIELD("salary.base")>10000,"高薪","普通")'
    out = await draft_formula_impl(
        FormulaDraftIn(
            dataset_id=1,
            message="有哪些条件判断的公式",
            current_formula=current_formula,
        ),
        DummyUser(),
        DummyDb(),
    )

    assert out.intent == "formula_question"
    assert out.should_update_formula is False
    assert out.formula == current_formula
    assert out.formula_display == current_formula
    assert out.formula_compile is None
    assert log_calls[-1]["action"] == "formula_question"
    assert log_calls[-1]["metadata"]["should_update_formula"] is False
