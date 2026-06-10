from app.ai.capabilities import get_capability
from datetime import date

from app.ai.router import (
    CompensationChatContext,
    _choose_employee_keyword,
    _extract_compensation_request_fallback,
    _merge_compensation_request,
)
from app.main import app


def _route_paths() -> set[str]:
    return {route.path for route in app.routes}


def test_formula_capabilities_are_registered_with_expected_risk():
    generate = get_capability("formula.generate")
    validate = get_capability("formula.validate")
    save = get_capability("calculated_field.save")

    assert generate is not None
    assert generate.type == "draft"
    assert generate.required_permission == ("datasource.datasets", "C")
    assert "draft_only" in generate.side_effect_tags

    assert validate is not None
    assert validate.type == "diagnose"
    assert validate.required_permission == ("datasource.datasets", "V")

    assert save is not None
    assert save.type == "write"
    assert save.confirmation == "required"
    assert "writes_data" in save.side_effect_tags
    assert "high_risk" in save.side_effect_tags


def test_ai_capability_routes_replace_legacy_ai_formula_routes():
    paths = _route_paths()

    assert "/api/v1/ai/capabilities" in paths
    assert "/api/v1/ai/chat" in paths
    assert "/api/v1/ai/capabilities/formula.generate/draft" in paths
    assert "/api/v1/ai/capabilities/formula.validate/diagnose" in paths
    assert "/api/v1/ai/capabilities/calculated_field.save/write" in paths

    assert "/api/v1/ai-formula/draft" not in paths
    assert "/api/v1/ai-formula/validate" not in paths


def test_phase2_global_ai_compensation_capabilities_are_registered():
    chat = get_capability("ai.chat")
    resolve = get_capability("compensation.employee_resolve")
    preview = get_capability("compensation.calculate_preview")

    assert chat is not None
    assert chat.type == "chat"
    assert chat.risk_level == "low"
    assert chat.side_effect_tags == []
    assert chat.tools == ["compensation.employee_resolve", "compensation.calculate_preview"]

    assert resolve is not None
    assert resolve.required_permission == ("tools.compensation_calc", "V")
    assert resolve.side_effect_tags == []
    assert resolve.tools == ["compensation.employee_search"]

    assert preview is not None
    assert preview.required_permission == ("tools.compensation_calc", "V")
    assert preview.risk_level == "medium"
    assert preview.side_effect_tags == []
    assert preview.tools == ["compensation.employee_search", "compensation.calculate"]


def test_compensation_fallback_does_not_treat_generic_employee_as_keyword():
    extracted = _extract_compensation_request_fallback("帮我计算一个员工的补偿金")

    assert extracted["intent"] == "compensation.calculate"
    assert extracted["employee_keyword"] == ""


def test_compensation_fallback_strips_possessive_particle_from_employee_keyword():
    extracted = _extract_compensation_request_fallback("帮我计算张三的补偿金")

    assert extracted["employee_keyword"] == "张三"


def test_compensation_fallback_preserves_employee_identifier_punctuation():
    extracted = _extract_compensation_request_fallback("帮我计算jay.zhu的补偿金")

    assert extracted["employee_keyword"] == "jay.zhu"


def test_compensation_fallback_extracts_employee_from_query_with_leave_date():
    extracted = _extract_compensation_request_fallback("查询员工gaby.liu刘琦，离职日期为2026-06-25的补偿金")

    assert extracted["employee_keyword"] == "gaby.liu刘琦"
    assert extracted["leave_date"] == "2026-06-25"


def test_compensation_keyword_prefers_fallback_when_model_drops_identifier_punctuation():
    keyword = _choose_employee_keyword("jay zhu", "jay.zhu")

    assert keyword == "jay.zhu"


def test_compensation_fallback_treats_plan_change_as_patch_not_employee_keyword():
    extracted = _extract_compensation_request_fallback("方案改为N")

    assert extracted["employee_keyword"] == ""
    assert extracted["plan"] == "N"
    assert extracted["changed_fields"] == ["plan"]


def test_compensation_patch_merges_with_previous_context():
    extracted = _extract_compensation_request_fallback("方案改为N")
    merged = _merge_compensation_request(
        extracted,
        CompensationChatContext(
            employee_id=123,
            employee_keyword="gaby.liu刘琦",
            employee_name="gaby.liu刘琦",
            leave_date=date(2026, 6, 25),
            plan="N+1",
            region="深圳",
        ),
    )

    assert merged["employee_id"] == 123
    assert merged["employee_keyword"] == "gaby.liu刘琦"
    assert merged["leave_date"] == "2026-06-25"
    assert merged["plan"] == "N"


def test_compensation_merge_without_context_keeps_new_task_defaults():
    extracted = _extract_compensation_request_fallback("帮我计算张三的补偿金")
    merged = _merge_compensation_request(extracted, None)

    assert merged["employee_keyword"] == "张三"
    assert merged["plan"] == "N+1"
