import json
from types import SimpleNamespace

import pytest

import app.ai.router as ai_router
from app.ai.audit import AiAuditTimer
from app.ai.conversation import ChatSession
from app.ai.employee_profile_audit import record_employee_profile_query_audit
from app.ai.employee_profile_schemas import EmployeeProfileFieldCode
from app.ai.router import AiChatIn


class FakeDb:
    def __init__(self):
        self.items = []

    def add(self, item):
        self.items.append(item)


@pytest.mark.asyncio
async def test_employee_profile_extractor_only_emits_strict_query_spec(monkeypatch):
    async def config(*args, **kwargs):
        return SimpleNamespace(
            model_fast_json="fast-json",
            model_reasoning=None,
            api_key_encrypted="encrypted",
            base_url=None,
            timeout_seconds=30,
        )

    async def model_call(**kwargs):
        assert "selection_handle" not in str(kwargs["messages"])
        assert "employee_id" not in str(kwargs["messages"])
        return None, '{"lookup_type":"name","lookup_value":"Alice","requested_field_codes":["organization_name"]}', {"total_tokens": 1}

    monkeypatch.setattr(ai_router, "active_ai_config", config)
    monkeypatch.setattr(ai_router, "decrypt", lambda value: value)
    monkeypatch.setattr(ai_router, "chat_completion_openai_compatible", model_call)

    extracted = await ai_router._extract_employee_profile_pending(
        AiChatIn(message="Find Alice's organization"),
        ChatSession(conversation_id=11),
        FakeDb(),
        AiAuditTimer(),
    )

    assert extracted.extracted == {
        "lookup_type": "name",
        "lookup_value": "Alice",
        "requested_field_codes": ["organization_name"],
    }


@pytest.mark.asyncio
async def test_intent_classifier_marks_dotted_english_name_as_employee_profile(monkeypatch):
    async def config(*args, **kwargs):
        return SimpleNamespace(
            model_fast_json="fast-json", model_reasoning=None, api_key_encrypted="encrypted", base_url=None, timeout_seconds=30
        )

    async def model_call(**kwargs):
        assert "Tianhao.wu is an employee lookup" in str(kwargs["messages"])
        return None, '{"intent":"employee.profile.query"}', {"total_tokens": 1}

    monkeypatch.setattr(ai_router, "active_ai_config", config)
    monkeypatch.setattr(ai_router, "decrypt", lambda value: value)
    monkeypatch.setattr(ai_router, "chat_completion_openai_compatible", model_call)

    intent, _ = await ai_router._classify_chat_intent(
        AiChatIn(message="查询员工Tianhao.wu的信息"), ChatSession(conversation_id=11), FakeDb(), AiAuditTimer()
    )

    assert intent == "employee.profile.query"


@pytest.mark.asyncio
async def test_employee_profile_extractor_reuses_active_employee_and_appends_fields(monkeypatch):
    async def config(*args, **kwargs):
        return SimpleNamespace(
            model_fast_json="fast-json", model_reasoning=None, api_key_encrypted="encrypted", base_url=None, timeout_seconds=30
        )

    async def model_call(**kwargs):
        return None, '{"lookup_type":null,"lookup_value":null,"requested_field_codes" :["employment_status"]}', {"total_tokens": 1}

    session = ChatSession(conversation_id=11)
    session.activate(
        ai_router.EMPLOYEE_PROFILE_CAPABILITY_ID,
        {"lookup_type": "employee_no", "lookup_value": "107505", "requested_field_codes": ["organization_name"]},
    )
    monkeypatch.setattr(ai_router, "active_ai_config", config)
    monkeypatch.setattr(ai_router, "decrypt", lambda value: value)
    monkeypatch.setattr(ai_router, "chat_completion_openai_compatible", model_call)

    extracted = await ai_router._extract_employee_profile_pending(
        AiChatIn(message="add employment status"), session, FakeDb(), AiAuditTimer()
    )

    assert extracted.extracted == {
        "lookup_type": "employee_no",
        "lookup_value": "107505",
        "requested_field_codes": ["organization_name", "employment_status"],
    }


@pytest.mark.asyncio
async def test_employee_profile_extractor_appends_business_unit(monkeypatch):
    async def config(*args, **kwargs):
        return SimpleNamespace(
            model_fast_json="fast-json", model_reasoning=None, api_key_encrypted="encrypted", base_url=None, timeout_seconds=30
        )

    async def model_call(**kwargs):
        return None, '{"lookup_type":null,"lookup_value":null,"requested_field_codes":["business_unit"]}', {"total_tokens": 1}

    session = ChatSession(conversation_id=11)
    session.activate(
        ai_router.EMPLOYEE_PROFILE_CAPABILITY_ID,
        {"lookup_type": "name", "lookup_value": "\u5929\u660a", "requested_field_codes": ["organization_name"]},
    )
    monkeypatch.setattr(ai_router, "active_ai_config", config)
    monkeypatch.setattr(ai_router, "decrypt", lambda value: value)
    monkeypatch.setattr(ai_router, "chat_completion_openai_compatible", model_call)

    extracted = await ai_router._extract_employee_profile_pending(
        AiChatIn(message="\u589e\u52a0\u4e00\u4e2a BU \u4fe1\u606f"), session, FakeDb(), AiAuditTimer()
    )

    assert extracted.extracted == {
        "lookup_type": "name",
        "lookup_value": "\u5929\u660a",
        "requested_field_codes": ["organization_name", "business_unit"],
    }


@pytest.mark.asyncio
async def test_employee_profile_extractor_normalizes_bu_alias(monkeypatch):
    async def config(*args, **kwargs):
        return SimpleNamespace(
            model_fast_json="fast-json", model_reasoning=None, api_key_encrypted="encrypted", base_url=None, timeout_seconds=30
        )

    async def model_call(**kwargs):
        return None, '{"lookup_type":null,"lookup_value":null,"requested_field_codes":["bu"]}', {"total_tokens": 1}

    session = ChatSession(conversation_id=11)
    session.activate(
        ai_router.EMPLOYEE_PROFILE_CAPABILITY_ID,
        {"lookup_type": "name", "lookup_value": "\u5929\u660a", "requested_field_codes": ["organization_name"]},
    )
    monkeypatch.setattr(ai_router, "active_ai_config", config)
    monkeypatch.setattr(ai_router, "decrypt", lambda value: value)
    monkeypatch.setattr(ai_router, "chat_completion_openai_compatible", model_call)

    extracted = await ai_router._extract_employee_profile_pending(
        AiChatIn(message="\u8865\u5145\u4e00\u4e0b BU"), session, FakeDb(), AiAuditTimer()
    )

    assert extracted.extracted["requested_field_codes"] == ["organization_name", "business_unit"]


@pytest.mark.asyncio
async def test_employee_profile_extractor_recovers_legacy_all_field_session_before_appending(monkeypatch):
    async def config(*args, **kwargs):
        return SimpleNamespace(
            model_fast_json="fast-json", model_reasoning=None, api_key_encrypted="encrypted", base_url=None, timeout_seconds=30
        )

    async def model_call(**kwargs):
        return None, '{"lookup_type":null,"lookup_value":null,"requested_field_codes":["bu"]}', {"total_tokens": 1}

    session = ChatSession(conversation_id=11)
    session.activate(
        ai_router.EMPLOYEE_PROFILE_CAPABILITY_ID,
        {
            "lookup_type": "name",
            "lookup_value": "\u5929\u660a",
            "requested_field_codes": [field_code.value for field_code in EmployeeProfileFieldCode],
        },
    )
    monkeypatch.setattr(ai_router, "active_ai_config", config)
    monkeypatch.setattr(ai_router, "decrypt", lambda value: value)
    monkeypatch.setattr(ai_router, "chat_completion_openai_compatible", model_call)

    extracted = await ai_router._extract_employee_profile_pending(
        AiChatIn(message="\u8865\u5145\u4e00\u4e0b BU"), session, FakeDb(), AiAuditTimer()
    )

    assert extracted.extracted["requested_field_codes"] == [
        "full_name", "employee_no", "organization_name", "hire_date", "employee_type",
        "standard_position", "position_level", "business_unit",
    ]


@pytest.mark.asyncio
async def test_employee_profile_extractor_uses_standard_fields_when_model_returns_all_fields(monkeypatch):
    async def config(*args, **kwargs):
        return SimpleNamespace(
            model_fast_json="fast-json", model_reasoning=None, api_key_encrypted="encrypted", base_url=None, timeout_seconds=30
        )

    all_fields = [field_code.value for field_code in EmployeeProfileFieldCode]

    async def model_call(**kwargs):
        return None, json.dumps({"lookup_type": "name", "lookup_value": "\u5929\u660a", "requested_field_codes": all_fields}), {"total_tokens": 1}

    monkeypatch.setattr(ai_router, "active_ai_config", config)
    monkeypatch.setattr(ai_router, "decrypt", lambda value: value)
    monkeypatch.setattr(ai_router, "chat_completion_openai_compatible", model_call)

    extracted = await ai_router._extract_employee_profile_pending(
        AiChatIn(message="\u67e5\u8be2\u5929\u660a\u7684\u4fe1\u606f"), ChatSession(conversation_id=11), FakeDb(), AiAuditTimer()
    )

    assert extracted.extracted["requested_field_codes"] == []


@pytest.mark.asyncio
async def test_employee_profile_extractor_does_not_repeat_card_without_new_field(monkeypatch):
    async def config(*args, **kwargs):
        return SimpleNamespace(
            model_fast_json="fast-json", model_reasoning=None, api_key_encrypted="encrypted", base_url=None, timeout_seconds=30
        )

    async def model_call(**kwargs):
        return None, '{"lookup_type":null,"lookup_value":null,"requested_field_codes":[]}', {"total_tokens": 1}

    session = ChatSession(conversation_id=11)
    session.activate(
        ai_router.EMPLOYEE_PROFILE_CAPABILITY_ID,
        {"lookup_type": "name", "lookup_value": "\u5929\u660a", "requested_field_codes": ["organization_name"]},
    )
    monkeypatch.setattr(ai_router, "active_ai_config", config)
    monkeypatch.setattr(ai_router, "decrypt", lambda value: value)
    monkeypatch.setattr(ai_router, "chat_completion_openai_compatible", model_call)

    extracted = await ai_router._extract_employee_profile_pending(
        AiChatIn(message="\u518d\u589e\u52a0\u4e00\u4e2a\u4fe1\u606f"), session, FakeDb(), AiAuditTimer()
    )

    assert extracted.extracted == {"no_additional_requested_fields": True}


@pytest.mark.asyncio
async def test_employee_profile_handler_returns_only_adjudicated_fields(monkeypatch):
    class QueryService:
        async def query(self, query_spec, *, user, db):
            assert query_spec.requested_field_codes == [EmployeeProfileFieldCode.ORGANIZATION_NAME]
            return SimpleNamespace(
                match_kind="unique",
                rows=({"employee_id": 9, "organization_name": "Platform"},),
                effective_requested_field_codes=(EmployeeProfileFieldCode.ORGANIZATION_NAME,),
                permission_filtered=True,
                masking_applied=False,
                scope_filter_applied=True,
                scope_filter_restrictive=True,
            )

    monkeypatch.setattr(ai_router, "EmployeeProfileQueryService", QueryService)
    session = ChatSession(conversation_id=11)
    out = await ai_router._handle_employee_profile_pending(
        AiChatIn(message="Find Alice's organization"),
        {
            "lookup_type": "name",
            "lookup_value": "Alice",
            "requested_field_codes": ["organization_name"],
        },
        session,
        SimpleNamespace(id=7),
        FakeDb(),
        AiAuditTimer(),
    )

    assert out.result.type == "employee_profile_result"
    assert [field.code.value for field in out.result.data.fields] == ["organization_name"]
    assert out.permission.filtered is True
    assert session.active_capability_id == ai_router.EMPLOYEE_PROFILE_CAPABILITY_ID
    assert session.capability_state(ai_router.EMPLOYEE_PROFILE_CAPABILITY_ID) == {
        "lookup_type": "name",
        "lookup_value": "Alice",
        "requested_field_codes": ["organization_name"],
    }
    assert "employee_id" not in out.model_dump_json()


@pytest.mark.asyncio
async def test_employee_profile_handler_returns_complete_candidates_without_internal_ids(monkeypatch):
    class QueryService:
        async def query(self, query_spec, *, user, db):
            return SimpleNamespace(
                match_kind="candidates",
                rows=(
                    {"employee_id": 1, "full_name": "Alice", "organization_name": "Platform"},
                    {"employee_id": 2, "full_name": "Alice", "employment_status": "Active"},
                ),
                effective_requested_field_codes=(EmployeeProfileFieldCode.ORGANIZATION_NAME,),
                permission_filtered=False,
                masking_applied=False,
                scope_filter_applied=True,
                scope_filter_restrictive=False,
            )

    async def issue_actions(*args, **kwargs):
        return (SimpleNamespace(selection_handle="a" * 43), SimpleNamespace(selection_handle="b" * 43))

    monkeypatch.setattr(ai_router, "EmployeeProfileQueryService", QueryService)
    monkeypatch.setattr(ai_router, "issue_employee_profile_candidate_actions", issue_actions)
    out = await ai_router._handle_employee_profile_pending(
        AiChatIn(message="Find Alice"),
        {"lookup_type": "name", "lookup_value": "Alice", "requested_field_codes": []},
        ChatSession(conversation_id=11),
        SimpleNamespace(id=7),
        FakeDb(),
        AiAuditTimer(),
    )

    assert out.result.type == "employee_profile_candidates"
    assert len(out.result.data.candidates) == 2
    assert "employee_id" not in out.model_dump_json()


@pytest.mark.asyncio
async def test_employee_profile_handler_returns_neutral_no_match(monkeypatch):
    class QueryService:
        async def query(self, query_spec, *, user, db):
            return SimpleNamespace(
                match_kind="no_match",
                rows=(),
                effective_requested_field_codes=(),
                permission_filtered=True,
                masking_applied=False,
                scope_filter_applied=True,
                scope_filter_restrictive=True,
            )

    monkeypatch.setattr(ai_router, "EmployeeProfileQueryService", QueryService)
    out = await ai_router._handle_employee_profile_pending(
        AiChatIn(message="Find Alice"),
        {"lookup_type": "name", "lookup_value": "Alice", "requested_field_codes": []},
        ChatSession(conversation_id=11),
        SimpleNamespace(id=7),
        FakeDb(),
        AiAuditTimer(),
    )

    assert out.status == "failed"
    assert out.result.type == "message"
    assert out.permission.filtered is True


@pytest.mark.asyncio
async def test_employee_profile_audit_projection_excludes_personal_values_and_handles():
    db = FakeDb()
    await record_employee_profile_query_audit(
        db=db,
        user=SimpleNamespace(id=7),
        lookup_type="name",
        status="succeeded",
        result_type="employee_profile_result",
        returned_field_codes=["organization_name"],
        candidate_count=0,
        scope_filter_applied=True,
        scope_filter_restrictive=True,
        conversation_id=11,
    )

    log = db.items[0]
    serialized = str(log.metadata_json) + str(log.request_summary) + str(log.response_summary)
    assert "Alice" not in serialized
    assert "E10086" not in serialized
    assert "selection_handle" not in serialized
    assert log.action == "employee_profile_query"
    assert log.metadata_json["returned_field_codes"] == ["organization_name"]
