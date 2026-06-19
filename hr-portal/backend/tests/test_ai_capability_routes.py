from app.ai.capabilities import get_capability
from datetime import date

from app.ai.conversation import ChatSession
from app.ai.router import (
    _agreement_document_action,
    CompensationChatContext,
    _comp_ctx_from_session,
    _merge_compensation_request,
    _route_by_capability,
    _route_by_intent,
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
    assert chat.tools == [
        "compensation.employee_resolve",
        "compensation.calculate_preview",
        "document.preview_from_context",
        "document.print_from_context",
    ]

    assert resolve is not None
    assert resolve.required_permission == ("tools.compensation_calc", "V")
    assert resolve.side_effect_tags == []
    assert resolve.tools == ["compensation.employee_search"]

    assert preview is not None
    assert preview.required_permission == ("tools.compensation_calc", "V")
    assert preview.risk_level == "medium"
    assert preview.side_effect_tags == []
    assert preview.tools == ["compensation.employee_search", "compensation.calculate"]

    doc_preview = get_capability("document.preview_from_context")
    doc_print = get_capability("document.print_from_context")
    assert doc_preview is not None
    assert doc_preview.type == "preview"
    assert doc_preview.required_permission == ("tools.compensation_calc", "V")
    assert doc_preview.side_effect_tags == []
    assert doc_print is not None
    assert doc_print.type == "export"
    assert doc_print.required_permission == ("tools.compensation_calc", "V")
    assert doc_print.side_effect_tags == ["export"]


# ── 合并层(确定性状态管理):extracted 由大模型 LLM extractor 产出,这里用字面值代入 ──

def test_compensation_patch_merges_with_previous_context():
    # 仅改方案(extracted 只带 plan),其余字段沿用上一轮上下文。
    extracted = {"intent": "compensation.calculate", "employee_keyword": "", "plan": "N", "changed_fields": ["plan"]}
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


def test_compensation_document_followup_action_merges_with_previous_context():
    extracted = {
        "intent": "compensation.calculate",
        "followup_action": "agreement_preview",
        "changed_fields": [],
    }
    merged = _merge_compensation_request(
        extracted,
        CompensationChatContext(
            employee_id=123,
            employee_keyword="张三",
            employee_name="张三",
            leave_date=date(2026, 6, 25),
            plan="N+1",
            region="深圳",
        ),
    )

    assert merged["employee_id"] == 123
    assert merged["leave_date"] == "2026-06-25"
    assert merged["plan"] == "N+1"
    assert merged["followup_action"] == "agreement_preview"


def test_agreement_document_action_uses_generic_document_action_shape():
    action = _agreement_document_action(
        CompensationChatContext(
            employee_id=123,
            employee_keyword="张三",
            employee_name="张三",
            leave_date=date(2026, 6, 25),
            plan="N+1",
            region="深圳",
        ),
        "agreement_print",
    )

    assert action.type == "document_print"
    assert action.route == ""
    assert action.query["business_type"] == "agreement"
    assert action.query["source_capability_id"] == "compensation.calculate_preview"
    assert action.query["employee_id"] == 123
    assert action.query["leave_date"] == "2026-06-25"
    assert action.query["plan"] == "N+1"


def test_compensation_merge_without_context_keeps_new_task_defaults():
    extracted = {"intent": "compensation.calculate", "employee_keyword": "张三", "changed_fields": ["employee_keyword"]}
    merged = _merge_compensation_request(extracted, None)

    assert merged["employee_keyword"] == "张三"
    assert merged["plan"] == "N+1"


def test_compensation_change_person_resets_stale_employee_and_date():
    # 上一轮已算吴天昊(employee_id=106401, 日期 2026-06-29, 方案 N),本轮"人员改成刘琦":
    # 换人 = 该员工从默认重新算 → 清掉旧 employee_id/日期/地区,方案回默认 N+1。
    extracted = {
        "intent": "compensation.calculate",
        "employee_keyword": "刘琦",
        "changed_fields": ["employee_keyword"],
    }
    merged = _merge_compensation_request(
        extracted,
        CompensationChatContext(
            employee_id=106401,
            employee_keyword="tianhao.wu吴天昊",
            employee_name="tianhao.wu吴天昊",
            leave_date=date(2026, 6, 29),
            plan="N",
            region="深圳",
        ),
    )
    assert merged["employee_keyword"] == "刘琦"
    assert merged["employee_id"] is None
    assert merged["leave_date"] is None
    assert merged["region"] is None
    assert merged["plan"] == "N+1"  # 换人回默认方案,不沿用上一个人的 N


def test_compensation_change_person_honors_explicitly_given_plan():
    # 换人时本轮显式给了方案,则保留显式值(不强制回默认)。
    extracted = {
        "intent": "compensation.calculate",
        "employee_keyword": "刘琦",
        "plan": "N",
        "changed_fields": ["employee_keyword", "plan"],
    }
    merged = _merge_compensation_request(
        extracted,
        CompensationChatContext(employee_id=106401, employee_keyword="吴天昊", leave_date=date(2026, 6, 29), plan="N+1"),
    )
    assert merged["employee_id"] is None
    assert merged["employee_keyword"] == "刘琦"
    assert merged["plan"] == "N"


def test_compensation_change_person_detected_even_without_changed_fields():
    # 模型没把 employee_keyword 列进 changed_fields 时,靠"新关键词≠上一轮"也能识别换人。
    extracted = {"intent": "compensation.calculate", "employee_keyword": "刘琦", "changed_fields": []}
    merged = _merge_compensation_request(
        extracted,
        CompensationChatContext(employee_id=106401, employee_keyword="吴天昊", leave_date=date(2026, 6, 29), plan="N"),
    )
    assert merged["employee_id"] is None
    assert merged["employee_keyword"] == "刘琦"
    assert merged["plan"] == "N+1"  # 换人回默认


def test_compensation_same_person_followup_keeps_employee_id():
    # 仅改方案、不换人(extracted 不带新关键词):必须保留 employee_id,不能误清。
    extracted = {"intent": "compensation.calculate", "employee_keyword": "", "plan": "N", "changed_fields": ["plan"]}
    merged = _merge_compensation_request(
        extracted,
        CompensationChatContext(employee_id=106401, employee_keyword="吴天昊", leave_date=date(2026, 6, 29), plan="N+1"),
    )
    assert merged["employee_id"] == 106401
    assert merged["leave_date"] == "2026-06-29"
    assert merged["plan"] == "N"


# ── 调度(LLM-first):路由按意图,续接按会话状态,均不依赖关键词 ──

def test_active_capability_drives_session_continuation():
    # 上一轮补偿金待补离职日期,active 已置位:可按 active_capability_id 续接到补偿金(状态续接)。
    session = ChatSession(
        conversation_id=1,
        active_capability_id="compensation.calculate_preview",
        state={"compensation.calculate_preview": {"employee_id": 106401, "leave_date": None, "plan": "N+1"}},
    )
    route = _route_by_capability(session.active_capability_id)
    assert route is not None
    assert route.intent == "compensation.calculate"
    ctx = _comp_ctx_from_session(session)
    assert ctx is not None and ctx.employee_id == 106401


def test_intent_maps_to_registered_route():
    assert _route_by_intent("compensation.calculate").capability_id == "compensation.calculate_preview"
    assert _route_by_intent("general_question") is None
    assert _route_by_intent("nonexistent.intent") is None


def test_empty_session_has_no_active_capability_route():
    assert _route_by_capability(None) is None
    assert _comp_ctx_from_session(ChatSession(conversation_id=None)) is None
