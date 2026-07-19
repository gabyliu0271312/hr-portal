from app.ai.capabilities import get_capability
from datetime import date
from types import SimpleNamespace

import pytest

from pydantic import ValidationError

import app.ai.router as ai_router
from app.ai.audit import AiAuditTimer
from app.ai.conversation import ChatSession
from app.ai.models import AiProviderConfig
from app.ai.router import (
    AI_EXECUTION_STATUSES,
    AI_RESULT_TYPES,
    AiChatIn,
    AiChatOut,
    CapabilityResultOut,
    MaskingResultOut,
    PermissionResultOut,
    _agreement_document_action,
    _append_recent_comp_result,
    _compare_comp_result_snapshots,
    _compare_recent_comp_results,
    _comp_result_snapshot,
    CompensationComparisonSnapshotOut,
    CompensationComparisonResultData,
    MessageCapabilityResult,
    CompensationInputCapabilityResult,
    _handle_compensation_chat,
    _handle_my_scope_chat,
    _handle_automation_rule_chat,
    _handle_data_compare_chat,
    _result_candidate_count,
    _extract_my_scope_request,
    ExtractorResult,
    global_ai_chat,
    CompensationChatContext,
    _comp_ctx_from_session,
    _merge_compensation_request,
    _route_by_capability,
    _route_by_intent,
)
from app.ai.schema_validator import AiOutputSchemaValidationError
from app.main import app
from app.tools.router import CompensationCalcOut, EmployeeCandidate


def _route_paths() -> set[str]:
    return {route.path for route in app.routes}


def _out_json(out: AiChatOut) -> dict:
    data = out.model_dump(mode="json")
    assert set(data) == {
        "intent", "answer", "status", "capability_id", "result",
        "permission", "masking", "trace_id", "conversation_id",
    }
    assert not {"actions", "candidates", "compensation", "missing_fields", "extracted", "artifact"} & set(data)
    return data


def test_ai_chat_output_contract_forbids_legacy_top_level_fields():
    assert set(AiChatOut.model_fields) == {
        "intent", "answer", "status", "capability_id", "result",
        "permission", "masking", "trace_id", "conversation_id",
    }
    base = {
        "intent": "general_question", "answer": "ok", "status": "succeeded",
        "capability_id": "ai.chat", "result": MessageCapabilityResult(),
        "permission": PermissionResultOut(filtered=False), "masking": MaskingResultOut(applied=False),
    }
    AiChatOut(**base)
    for field in ("actions", "candidates", "compensation", "missing_fields", "extracted", "artifact"):
        with pytest.raises(ValidationError):
            AiChatOut(**base, **{field: [] if field.endswith("s") else {}})
    with pytest.raises(ValidationError):
        AiChatOut(**{**base, "status": "ok"})


def test_ai_chat_openapi_result_uses_discriminated_union():
    schema = app.openapi()["components"]["schemas"]["AiChatOut"]
    result_schema = schema["properties"]["result"]
    assert result_schema["discriminator"]["propertyName"] == "type"
    assert len(result_schema["oneOf"]) == len(AI_RESULT_TYPES)


def test_ai_chat_openapi_schema_excludes_legacy_fields():
    schema = app.openapi()["components"]["schemas"]["AiChatOut"]
    properties = set(schema["properties"])
    assert properties == set(AiChatOut.model_fields)
    assert not properties.intersection({"actions", "candidates", "compensation", "missing_fields", "extracted", "artifact"})


def test_capability_result_contract_rejects_invalid_type_data_and_extra_fields():
    assert AI_RESULT_TYPES == {
        "message", "compensation_input", "compensation_preview", "compensation_comparison",
        "automation_rule_draft", "data_compare_result",
    }
    assert AI_EXECUTION_STATUSES == {
        "pending", "requires_input", "requires_confirmation", "running", "succeeded",
        "partial_success", "failed", "cancelled",
    }
    base = {
        "intent": "general_question", "answer": "ok", "status": "succeeded",
        "capability_id": "ai.chat", "permission": PermissionResultOut(filtered=False),
        "masking": MaskingResultOut(applied=False),
    }
    with pytest.raises(ValidationError):
        AiChatOut(**{**base, "result": {"type": "unknown", "data": {}}})
    with pytest.raises(ValidationError):
        AiChatOut(**{**base, "result": {"type": "compensation_input", "data": {"compensation": {}}}})
    with pytest.raises(ValidationError):
        MessageCapabilityResult(unexpected=True)


def test_compensation_comparison_snapshot_rejects_unknown_missing_and_invalid_fields():
    snapshot = _comp_result_snapshot(_comp_result("N", 75.0))
    payload = snapshot.model_dump()
    assert set(payload) == {
        "employee_id", "employee_name", "employee_no", "leave_date", "plan",
        "service_years_n", "compensation_base", "n_amount", "extra_amount", "total_amount",
    }
    assert CompensationComparisonResultData(previous=snapshot, current=snapshot).previous.total_amount == 75.0

    with pytest.raises(ValidationError):
        CompensationComparisonSnapshotOut(**{**payload, "unexpected": "blocked"})
    with pytest.raises(ValidationError):
        CompensationComparisonSnapshotOut(**{key: value for key, value in payload.items() if key != "total_amount"})
    with pytest.raises(ValidationError):
        CompensationComparisonSnapshotOut(**{**payload, "total_amount": "75.0"})



    generate = get_capability("formula.generate")
    validate = get_capability("formula.validate")
    save = get_capability("calculated_field.save")
    assert generate and generate.type == "draft" and generate.required_permission == ("datasource.datasets", "C")
    assert "draft_only" in generate.side_effect_tags
    assert validate and validate.required_permission == ("datasource.datasets", "V")
    assert save and save.type == "write" and save.confirmation == "required"


def test_ai_capability_routes_replace_legacy_ai_formula_routes():
    paths = _route_paths()
    assert "/api/v1/ai/capabilities" in paths
    assert "/api/v1/ai/chat" in paths
    assert "/api/v1/ai/capabilities/formula.generate/draft" in paths
    assert "/api/v1/ai-formula/draft" not in paths


def test_phase2_global_ai_compensation_capabilities_are_registered():
    chat = get_capability("ai.chat")
    resolve = get_capability("compensation.employee_resolve")
    preview = get_capability("compensation.calculate_preview")
    assert chat and chat.type == "chat" and chat.risk_level == "low"
    assert chat.tools == ["compensation.employee_resolve", "compensation.calculate_preview", "document.preview_from_context", "document.print_from_context"]
    assert resolve and resolve.required_permission == ("tools.compensation_calc", "V")
    assert preview and preview.required_permission == ("tools.compensation_calc", "V")
    assert get_capability("document.preview_from_context").type == "preview"
    assert get_capability("document.print_from_context").type == "export"


def test_compensation_patch_merges_with_previous_context():
    merged = _merge_compensation_request(
        {"intent": "compensation.calculate", "employee_keyword": "", "plan": "N", "changed_fields": ["plan"]},
        CompensationChatContext(employee_id=123, employee_keyword="gaby.liu刘琦", employee_name="gaby.liu刘琦", leave_date=date(2026, 6, 25), plan="N+1", region="深圳"),
    )
    assert merged["employee_id"] == 123
    assert merged["employee_keyword"] == "gaby.liu刘琦"
    assert merged["leave_date"] == "2026-06-25"
    assert merged["plan"] == "N"


def test_compensation_document_followup_action_merges_with_previous_context():
    merged = _merge_compensation_request(
        {"intent": "compensation.calculate", "followup_action": "agreement_preview", "changed_fields": []},
        CompensationChatContext(employee_id=123, employee_keyword="张三", employee_name="张三", leave_date=date(2026, 6, 25), plan="N+1", region="深圳"),
    )
    assert merged["employee_id"] == 123
    assert merged["leave_date"] == "2026-06-25"
    assert merged["plan"] == "N+1"
    assert merged["followup_action"] == "agreement_preview"


def test_agreement_document_action_uses_generic_document_action_shape():
    action = _agreement_document_action(
        CompensationChatContext(employee_id=123, employee_keyword="张三", employee_name="张三", leave_date=date(2026, 6, 25), plan="N+1", region="深圳"),
        "agreement_print",
    )
    assert action.type == "document_print"
    assert action.route == ""
    assert action.query["business_type"] == "agreement"
    assert action.query["source_capability_id"] == "compensation.calculate_preview"
    assert action.query["employee_id"] == 123
    assert action.query["leave_date"] == "2026-06-25"
    assert action.query["plan"] == "N+1"


def _candidate(employee_id: int = 123, name: str = "张三", leave_date: str | None = "2026-06-30") -> EmployeeCandidate:
    return EmployeeCandidate(
        id=employee_id, employee_no=f"E{employee_id}", name=name, chinese_name=name,
        english_name=None, company="测试公司", department="测试部门", work_region="深圳",
        employment_status=None, hire_date="2020-01-01", leave_date=leave_date,
    )


def _comp_result(plan: str, total: float, extra: float = 0.0) -> CompensationCalcOut:
    return CompensationCalcOut(
        employee=_candidate(), hire_date=date(2020, 1, 1), leave_date=date(2026, 6, 30),
        work_region="深圳", basic_salary=100.0, cap_amount=1000.0, compensation_base=150.0,
        service_years_n=0.5, plan=plan, n_amount=75.0, extra_amount=extra,
        total_amount=total, cap_rule_id=1,
    )


def test_recent_compensation_results_can_be_compared_deterministically():
    ctx = CompensationChatContext(employee_id=123, employee_keyword="张三", leave_date=date(2026, 6, 30), plan="N+1")
    ctx = _append_recent_comp_result(ctx, _comp_result("N+1", 225.0, 150.0))
    ctx = _append_recent_comp_result(ctx, _comp_result("N", 75.0))
    compared = _compare_recent_comp_results(ctx)
    assert compared and compared.status == "succeeded"
    assert compared.result.type == "compensation_comparison"
    assert "差额为 150.00" in compared.answer
    _out_json(compared)


def test_compensation_snapshot_comparison_supports_current_two_plan_task():
    compared = _compare_comp_result_snapshots(
        _comp_result_snapshot(_comp_result("N", 75.0)),
        _comp_result_snapshot(_comp_result("N+1", 225.0, 150.0)),
        subject="N 与 N+1 两个方案",
    )
    assert compared.status == "succeeded"
    assert compared.result.type == "compensation_comparison"
    assert "N 与 N+1 两个方案差额为 150.00" in compared.answer


def test_recent_compensation_compare_requires_two_results():
    ctx = _append_recent_comp_result(CompensationChatContext(employee_id=123, employee_keyword="张三"), _comp_result("N", 75.0))
    assert _compare_recent_comp_results(ctx) is None


async def _allow_permission(*args):
    return True


@pytest.mark.asyncio
async def test_compensation_branches_emit_envelope(monkeypatch):
    monkeypatch.setattr(ai_router, "user_has_permission", _allow_permission)
    timer = AiAuditTimer()

    missing = await _handle_compensation_chat(AiChatIn(message="计算补偿金"), {"changed_fields": []}, ChatSession(conversation_id=1), object(), object(), timer)
    assert missing.status == "requires_input"
    assert missing.result.type == "compensation_input"
    assert missing.result.data.missing_fields == ["employee_keyword"]
    _out_json(missing)

    async def no_result(*args, **kwargs): return []
    monkeypatch.setattr(ai_router, "search_compensation_employees", no_result)
    absent = await _handle_compensation_chat(AiChatIn(message="算张三"), {"employee_keyword": "张三", "changed_fields": ["employee_keyword"]}, ChatSession(conversation_id=1), object(), object(), timer)
    assert absent.status == "failed" and absent.result.type == "message"
    assert absent.result.data.reason_code == "employee_not_found"
    assert absent.permission.filtered is True
    _out_json(absent)

    async def same_name(*args, **kwargs): return [_candidate(1, "张三"), _candidate(2, "张三")]
    monkeypatch.setattr(ai_router, "search_compensation_employees", same_name)
    ambiguous = await _handle_compensation_chat(AiChatIn(message="算张三"), {"employee_keyword": "张三", "changed_fields": ["employee_keyword"]}, ChatSession(conversation_id=1), object(), object(), timer)
    assert ambiguous.status == "requires_input" and len(ambiguous.result.data.candidates) == 2
    _out_json(ambiguous)

    async def no_leave(*args, **kwargs): return [_candidate(1, "张三", None)]
    monkeypatch.setattr(ai_router, "search_compensation_employees", no_leave)
    need_date = await _handle_compensation_chat(AiChatIn(message="算张三"), {"employee_keyword": "张三", "changed_fields": ["employee_keyword"]}, ChatSession(conversation_id=1), object(), object(), timer)
    assert need_date.status == "requires_input"
    assert need_date.result.data.missing_fields == ["leave_date"]
    _out_json(need_date)


@pytest.mark.asyncio
async def test_compensation_compare_and_document_actions_emit_envelope(monkeypatch):
    monkeypatch.setattr(ai_router, "user_has_permission", _allow_permission)
    async def search(*args, **kwargs): return [_candidate(107405, "测试员工", None)]
    async def calculate(calc_in, user, db):
        return _comp_result(calc_in.plan, 75.0 if calc_in.plan == "N" else 225.0, 0.0 if calc_in.plan == "N" else 150.0), {}
    monkeypatch.setattr(ai_router, "search_compensation_employees", search)
    monkeypatch.setattr(ai_router, "calculate_compensation_impl", calculate)
    result = await _handle_compensation_chat(
        AiChatIn(message="算 107405 N 和 N+1"),
        {"employee_keyword": "107405", "leave_date": "2026-06-20", "followup_action": "compare_results", "changed_fields": ["employee_keyword", "leave_date"]},
        ChatSession(conversation_id=1), object(), object(), AiAuditTimer(),
    )
    assert result.status == "succeeded" and result.result.type == "compensation_comparison"
    assert result.result.data.compensation.plan == "N+1"
    assert len(result.result.actions) == 1
    _out_json(result)

    for action, capability in (("agreement_preview", "document.preview_from_context"), ("agreement_print", "document.print_from_context")):
        document = await _handle_compensation_chat(
            AiChatIn(message=action, selected_employee_id=1),
            {"followup_action": action, "employee_id": 1, "leave_date": "2026-06-30", "plan": "N+1", "changed_fields": []},
            ChatSession(conversation_id=1), object(), object(), AiAuditTimer(),
        )
        assert document.status == "succeeded" and document.capability_id == capability
        assert len(document.result.actions) == 1 and document.result.type == "message"
        _out_json(document)


@pytest.mark.asyncio
async def test_compensation_permission_is_403(monkeypatch):
    async def deny(*args): return False
    monkeypatch.setattr(ai_router, "user_has_permission", deny)
    with pytest.raises(ai_router.HTTPException) as exc:
        await _handle_compensation_chat(AiChatIn(message="算"), {}, ChatSession(conversation_id=1), object(), object(), AiAuditTimer())
    assert exc.value.status_code == 403


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("is_super", "bundles", "expected_filtered", "text"),
    [
        (True, [], False, "超级管理员"),
        (False, [], True, "没有被授予"),
        (False, [{"name": "华南", "description": None, "dimension": "org", "org_scope_enabled": False, "org_scope_unlimited": False, "person_scope_enabled": False, "selections": [], "filters": []}], True, "华南"),
        (False, [
            {"name": "华南", "description": None, "dimension": "org", "org_scope_enabled": False, "org_scope_unlimited": False, "person_scope_enabled": False, "selections": [], "filters": []},
            {"name": "华东", "description": None, "dimension": "org", "org_scope_enabled": False, "org_scope_unlimited": False, "person_scope_enabled": False, "selections": [], "filters": []},
        ], True, "并集"),
    ],
)
async def test_scope_envelope_permission_semantics(monkeypatch, is_super, bundles, expected_filtered, text):
    async def super_admin(*args): return is_super
    async def load(*args): return bundles
    monkeypatch.setattr(ai_router, "_is_super_admin", super_admin)
    monkeypatch.setattr(ai_router, "_load_my_scope_bundles", load)
    out = await _handle_my_scope_chat(AiChatIn(message="我的权限"), {}, ChatSession(conversation_id=1), object(), object(), AiAuditTimer())
    assert out.capability_id == "scope.describe_my_scope"
    assert out.result.type == "message" and out.masking.applied is False
    assert out.permission.filtered is expected_filtered
    assert text in out.answer and "SELECT " not in out.answer and "rule_id" not in out.answer
    _out_json(out)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("extracted", "expected_status", "expect_slot"),
    [
        ({}, "requires_input", "trigger_type"),
        ({"trigger_type": "scheduled_report_success"}, "requires_input", "feishu_receivers"),
        ({"feishu_receivers": "薪酬组群"}, "requires_input", "trigger_type"),
    ],
)
async def test_automation_draft_missing_slots(monkeypatch, extracted, expected_status, expect_slot):
    monkeypatch.setattr(ai_router, "user_has_permission", _allow_permission)
    out = await _handle_automation_rule_chat(AiChatIn(message="生成规则"), extracted, ChatSession(conversation_id=1), object(), object(), AiAuditTimer())
    assert out.status == expected_status and out.result.type == "automation_rule_draft"
    assert expect_slot in out.result.data.missing_slots
    _out_json(out)


@pytest.mark.asyncio
async def test_automation_draft_needs_config_and_permission(monkeypatch):
    monkeypatch.setattr(ai_router, "user_has_permission", _allow_permission)
    extracted = {"trigger_type": "scheduled_report_success", "feishu_receivers": "薪酬组群", "feishu_message_template": "完成", "rule_name": "通知"}
    out = await _handle_automation_rule_chat(AiChatIn(message="生成规则"), extracted, ChatSession(conversation_id=1), object(), object(), AiAuditTimer())
    assert out.status == "requires_confirmation"
    assert out.result.data.needs_config
    assert out.result.data.rule_draft.enabled is False
    _out_json(out)

    async def deny(*args): return False
    monkeypatch.setattr(ai_router, "user_has_permission", deny)
    with pytest.raises(ai_router.HTTPException) as exc:
        await _handle_automation_rule_chat(AiChatIn(message="生成规则"), extracted, ChatSession(conversation_id=1), object(), object(), AiAuditTimer())
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_data_compare_envelope_permission_scope_and_masking(monkeypatch):
    monkeypatch.setattr(ai_router, "user_has_permission", _allow_permission)
    result = {
        "compare_type": "roster", "table_a": "A", "table_b": "B", "status": "consistent",
        "summary": {"total_compared": 1, "matched_count": 1, "diff_count": 0},
        "details": [], "conclusion": "一致", "display": {},
    }
    async def compare(*args, **kwargs): return result, {"permission_filtered": False}
    monkeypatch.setattr(ai_router, "run_data_compare", compare)
    out = await _handle_data_compare_chat(AiChatIn(message="对比"), {"compare_type": "roster", "source_a": {"table": "A"}, "source_b": {"table": "B"}, "join_keys": ["id"]}, ChatSession(conversation_id=1), object(), object(), AiAuditTimer())
    assert out.status == "succeeded" and out.result.type == "data_compare_result"
    assert out.permission.filtered is False and out.masking.applied is False
    _out_json(out)

    result["details"] = [{"employee_name": "***", "diff_type": "不一致"}]
    async def filtered_compare(*args, **kwargs): return result, {"permission_filtered": True}
    monkeypatch.setattr(ai_router, "run_data_compare", filtered_compare)
    masked = await _handle_data_compare_chat(AiChatIn(message="对比"), {"compare_type": "roster", "source_a": {"table": "A"}, "source_b": {"table": "B"}, "join_keys": ["id"]}, ChatSession(conversation_id=1), object(), object(), AiAuditTimer())
    assert masked.permission.filtered is True and masked.masking.applied is True


@pytest.mark.asyncio
async def test_data_compare_errors_and_permission(monkeypatch):
    monkeypatch.setattr(ai_router, "user_has_permission", _allow_permission)
    invalid = await _handle_data_compare_chat(AiChatIn(message="对比"), {}, ChatSession(conversation_id=1), object(), object(), AiAuditTimer())
    assert invalid.status == "failed" and invalid.result.data.reason_code == "invalid_compare_spec"

    async def denied(*args, **kwargs): raise ai_router.ScopeDeniedError("denied")
    monkeypatch.setattr(ai_router, "run_data_compare", denied)
    scope_denied = await _handle_data_compare_chat(AiChatIn(message="对比"), {"compare_type": "roster", "source_a": {"table": "A"}, "source_b": {"table": "B"}, "join_keys": ["id"]}, ChatSession(conversation_id=1), object(), object(), AiAuditTimer())
    assert scope_denied.status == "failed" and scope_denied.result.data.reason_code == "compare_permission_denied"

    async def no_permission(*args): return False
    monkeypatch.setattr(ai_router, "user_has_permission", no_permission)
    with pytest.raises(ai_router.HTTPException) as exc:
        await _handle_data_compare_chat(AiChatIn(message="对比"), {}, ChatSession(conversation_id=1), object(), object(), AiAuditTimer())
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_global_chat_unconfigured_returns_envelope_and_result_audit(monkeypatch):
    recorded = []

    async def no_config(db): return None
    async def load_conversation(db, user, conversation_id):
        return SimpleNamespace(), ChatSession(conversation_id=9)
    async def persist(*args): return None
    async def record(**kwargs): recorded.append(kwargs)

    monkeypatch.setattr(ai_router, "active_ai_config", no_config)
    monkeypatch.setattr(ai_router, "load_or_create_conversation", load_conversation)
    monkeypatch.setattr(ai_router, "persist_conversation", persist)
    monkeypatch.setattr(ai_router, "record_ai_log", record)
    db = SimpleNamespace(commit=lambda: None)

    async def commit(): return None
    db.commit = commit
    out = await global_ai_chat(AiChatIn(message="测试"), user=object(), db=db)
    assert out.status == "failed" and out.capability_id == "ai.chat"
    assert out.result.type == "message"
    _out_json(out)
    assert recorded[0]["status"] == "failed"
    assert recorded[0]["metadata"]["action_count"] == 0
    assert recorded[0]["metadata"]["candidate_count"] == 0


def test_candidate_count_is_result_type_controlled():
    assert _result_candidate_count(MessageCapabilityResult()) == 0
    assert _result_candidate_count(CompensationInputCapabilityResult(data={"candidates": [_candidate()], "missing_fields": []})) == 1


@pytest.mark.asyncio
async def test_global_chat_output_schema_failure_is_500_with_trace(monkeypatch):
    recorded = []

    async def no_config(db): return None
    async def load_conversation(db, user, conversation_id): return SimpleNamespace(), ChatSession(conversation_id=9)
    async def persist(*args): return None
    async def record(**kwargs): recorded.append(kwargs)
    def fail_output(model, payload, *, label, phase="input"):
        if phase == "output":
            raise AiOutputSchemaValidationError("invalid output")
        return payload
    async def commit(): return None

    monkeypatch.setattr(ai_router, "active_ai_config", no_config)
    monkeypatch.setattr(ai_router, "load_or_create_conversation", load_conversation)
    monkeypatch.setattr(ai_router, "persist_conversation", persist)
    monkeypatch.setattr(ai_router, "record_ai_log", record)
    monkeypatch.setattr(ai_router, "validate_model_payload", fail_output)
    db = SimpleNamespace(commit=commit)

    with pytest.raises(ai_router.HTTPException) as exc:
        await global_ai_chat(AiChatIn(message="测试"), user=object(), db=db)
    assert exc.value.status_code == 500
    assert exc.value.detail["message"] == "服务端响应校验失败"
    assert exc.value.detail["trace_id"]
    assert recorded[0]["status"] == "failed"


@pytest.mark.asyncio
async def test_scope_extractor_returns_named_noop_result():
    result = await _extract_my_scope_request(AiChatIn(message="我的权限"), ChatSession(conversation_id=1), object(), AiAuditTimer())
    assert isinstance(result, ExtractorResult)
    assert result.extracted == {}
    assert result.usage is None
    assert result.parse_mode == "noop"

def test_active_capability_drives_session_continuation():
    session = ChatSession(conversation_id=1, active_capability_id="compensation.calculate_preview", state={"compensation.calculate_preview": {"employee_id": 106401, "leave_date": None, "plan": "N+1"}})
    route = _route_by_capability(session.active_capability_id)
    assert route and route.intent == "compensation.calculate"
    assert _comp_ctx_from_session(session).employee_id == 106401


def test_intent_maps_to_registered_route():
    assert _route_by_intent("compensation.calculate").capability_id == "compensation.calculate_preview"
    assert _route_by_intent("general_question") is None


def test_empty_session_has_no_active_capability_route():
    assert _route_by_capability(None) is None
    assert _comp_ctx_from_session(ChatSession(conversation_id=None)) is None
