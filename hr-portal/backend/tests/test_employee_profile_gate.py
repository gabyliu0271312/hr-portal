from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import app.ai.router as ai_router
from app.ai.employee_profile_gate import employee_profile_rollout_decision
from app.ai.router import AiAuditTimer, AiChatIn, ChatRoute, ChatSession, TargetCapabilityGateDenied, _enforce_chat_route_gate, global_ai_chat


def _settings(**overrides):
    values = {
        "EMPLOYEE_PROFILE_ENABLED": True,
        "EMPLOYEE_PROFILE_ALLOWED_USER_IDS": "7",
        "EMPLOYEE_PROFILE_EXPIRES_AT": (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
        "AI_CAPABILITY_RATE_LIMIT_MAX_REQUESTS": 20,
        "AI_CAPABILITY_RATE_LIMIT_WINDOW_SECONDS": 300,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_rollout_is_fail_closed_for_disabled_allowlist_and_expiry():
    assert employee_profile_rollout_decision(_settings(EMPLOYEE_PROFILE_ENABLED=False), 7).failure_stage == "controlled_rollout_disabled"
    assert employee_profile_rollout_decision(_settings(EMPLOYEE_PROFILE_ALLOWED_USER_IDS=""), 7).failure_stage == "controlled_rollout_allowlist_denied"
    assert employee_profile_rollout_decision(_settings(EMPLOYEE_PROFILE_EXPIRES_AT="invalid"), 7).failure_stage == "controlled_rollout_expired"
    assert employee_profile_rollout_decision(_settings(EMPLOYEE_PROFILE_EXPIRES_AT=(datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()), 7).failure_stage == "controlled_rollout_expired"


@pytest.mark.asyncio
async def test_employee_profile_gate_blocks_before_permission_when_rollout_denied(monkeypatch):
    route = ChatRoute("employee.profile.query", "employee.profile.query", "", None, None)
    monkeypatch.setattr(ai_router, "settings", _settings(EMPLOYEE_PROFILE_ENABLED=False))

    async def permission_should_not_run(*args):
        raise AssertionError("permission check must not run before rollout gate")

    monkeypatch.setattr(ai_router, "user_has_permission", permission_should_not_run)
    with pytest.raises(TargetCapabilityGateDenied) as exc_info:
        await _enforce_chat_route_gate(route, SimpleNamespace(id=7), object(), AiAuditTimer())
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "\u5f53\u524d\u529f\u80fd\u6682\u672a\u5f00\u653e"
    assert exc_info.value.failure_stage == "controlled_rollout_disabled"


@pytest.mark.asyncio
async def test_employee_profile_gate_checks_target_permission_after_rollout(monkeypatch):
    route = ChatRoute("employee.profile.query", "employee.profile.query", "", None, None)
    monkeypatch.setattr(ai_router, "settings", _settings())

    async def denied(*args):
        return False

    monkeypatch.setattr(ai_router, "user_has_permission", denied)
    with pytest.raises(TargetCapabilityGateDenied) as exc_info:
        await _enforce_chat_route_gate(route, SimpleNamespace(id=7), object(), AiAuditTimer())
    assert exc_info.value.failure_stage == "target_permission_denied"


@pytest.mark.asyncio
async def test_global_chat_blocks_employee_route_before_extractor_and_sanitizes_audit(monkeypatch):
    extractor_calls = []
    audit_records = []

    async def extractor(*args):
        extractor_calls.append(args)
        raise AssertionError("employee extractor must not run")

    route = ChatRoute("employee.profile.query", "employee.profile.query", "", extractor, None)

    async def resolve_route(*args):
        return route, "intent_classify", None

    async def ai_config(*args):
        return SimpleNamespace(api_key_encrypted="configured", model_reasoning="model", model_fast_json=None)

    async def load_conversation(*args):
        return SimpleNamespace(), ChatSession(conversation_id=9)

    async def persist(*args):
        return None

    async def record(**kwargs):
        audit_records.append(kwargs)

    async def commit():
        return None

    monkeypatch.setattr(ai_router, "settings", _settings(EMPLOYEE_PROFILE_ENABLED=False))
    monkeypatch.setattr(ai_router, "_resolve_chat_route", resolve_route)
    monkeypatch.setattr(ai_router, "active_ai_config", ai_config)
    monkeypatch.setattr(ai_router, "load_or_create_conversation", load_conversation)
    monkeypatch.setattr(ai_router, "persist_conversation", persist)
    monkeypatch.setattr(ai_router, "record_ai_log", record)
    db = SimpleNamespace(commit=commit)

    with pytest.raises(ai_router.HTTPException) as exc_info:
        await global_ai_chat(AiChatIn(message="secret employee lookup"), user=SimpleNamespace(id=7), db=db)

    assert exc_info.value.status_code == 403
    assert extractor_calls == []
    assert audit_records[0]["request_summary"] == "employee_profile_query"
    assert audit_records[0]["input_payload"] == {
        "capability_id": "employee.profile.query",
        "failure_stage": "controlled_rollout_disabled",
    }


@pytest.mark.asyncio
async def test_feishu_gate_blocks_employee_handler_after_routing(monkeypatch):
    extractor_calls = []

    async def extractor(*args):
        extractor_calls.append(args)
        raise AssertionError("employee extractor must not run when Feishu channel gate denies")

    async def resolve_route(*args):
        return ChatRoute("employee.profile.query", "employee.profile.query", "", extractor, None), "intent_classify", None

    async def ai_config(*args):
        return SimpleNamespace(api_key_encrypted="configured", model_reasoning="model", model_fast_json=None)

    async def load_conversation(*args):
        return SimpleNamespace(), ChatSession(conversation_id=9, channel="feishu")

    async def persist(*args):
        return None

    async def permit_route(*args):
        return None

    async def commit():
        return None

    async def record(*args, **kwargs):
        return None

    def deny_channel(*args):
        raise ai_router.HTTPException(status_code=403, detail="????????")

    monkeypatch.setattr(ai_router, "settings", _settings())
    monkeypatch.setattr(ai_router, "_resolve_chat_route", resolve_route)
    monkeypatch.setattr(ai_router, "active_ai_config", ai_config)
    monkeypatch.setattr(ai_router, "load_or_create_conversation", load_conversation)
    monkeypatch.setattr(ai_router, "persist_conversation", persist)
    monkeypatch.setattr(ai_router, "_enforce_chat_route_gate", permit_route)
    monkeypatch.setattr(ai_router, "enforce_feishu_capability_gate", deny_channel)
    monkeypatch.setattr(ai_router, "record_ai_log", record)
    db = SimpleNamespace(commit=commit)

    with pytest.raises(ai_router.HTTPException) as exc_info:
        await global_ai_chat(AiChatIn(message="????"), user=SimpleNamespace(id=7), db=db)

    assert exc_info.value.status_code == 403
    assert extractor_calls == []


@pytest.mark.asyncio
async def test_global_chat_rate_limits_employee_route_before_extractor(monkeypatch):
    extractor_calls = []
    audit_records = []

    async def extractor(*args):
        extractor_calls.append(args)
        raise AssertionError("employee extractor must not run when rate limited")

    async def resolve_route(*args):
        return ChatRoute("employee.profile.query", "employee.profile.query", "", extractor, None), "intent_classify", None

    async def ai_config(*args):
        return SimpleNamespace(api_key_encrypted="configured", model_reasoning="model", model_fast_json=None)

    async def load_conversation(*args):
        return SimpleNamespace(), ChatSession(conversation_id=9)

    async def allow_permission(*args):
        return True

    async def rate_limit(*args, **kwargs):
        raise ai_router.CapabilityRateLimitExceeded(19)

    async def record(**kwargs):
        audit_records.append(kwargs)

    async def commit():
        return None

    monkeypatch.setattr(ai_router, "settings", _settings())
    monkeypatch.setattr(ai_router, "_resolve_chat_route", resolve_route)
    monkeypatch.setattr(ai_router, "active_ai_config", ai_config)
    monkeypatch.setattr(ai_router, "load_or_create_conversation", load_conversation)
    monkeypatch.setattr(ai_router, "user_has_permission", allow_permission)
    monkeypatch.setattr(ai_router, "enforce_capability_rate_limit", rate_limit)
    monkeypatch.setattr(ai_router, "record_ai_log", record)
    db = SimpleNamespace(commit=commit)

    with pytest.raises(ai_router.HTTPException) as exc_info:
        await global_ai_chat(AiChatIn(message="employee lookup"), user=SimpleNamespace(id=7), db=db)

    assert exc_info.value.status_code == 429
    assert exc_info.value.headers["Retry-After"] == "19"
    assert extractor_calls == []
    assert audit_records[0]["input_payload"] == {
        "capability_id": "employee.profile.query",
        "failure_stage": "rate_limited",
    }


@pytest.mark.asyncio
async def test_global_chat_converts_employee_internal_error_to_sanitized_500(monkeypatch):
    audit_records = []

    async def extractor(*args):
        return ai_router.ExtractorResult({"lookup_type": "name", "lookup_value": "Alice", "requested_field_codes": []}, None, "test")

    async def handler(*args):
        raise RuntimeError("Alice E10086 should never be exposed")

    async def resolve_route(*args):
        return ChatRoute("employee.profile.query", "employee.profile.query", "", extractor, handler), "intent_classify", None

    async def ai_config(*args):
        return SimpleNamespace(api_key_encrypted="configured", model_reasoning="model", model_fast_json=None)

    async def load_conversation(*args):
        return SimpleNamespace(), ChatSession(conversation_id=9)

    async def allow_permission(*args):
        return True

    async def allow_rate(*args, **kwargs):
        return None

    async def record(**kwargs):
        audit_records.append(kwargs)

    async def commit():
        return None

    monkeypatch.setattr(ai_router, "settings", _settings())
    monkeypatch.setattr(ai_router, "_resolve_chat_route", resolve_route)
    monkeypatch.setattr(ai_router, "active_ai_config", ai_config)
    monkeypatch.setattr(ai_router, "load_or_create_conversation", load_conversation)
    monkeypatch.setattr(ai_router, "user_has_permission", allow_permission)
    monkeypatch.setattr(ai_router, "enforce_capability_rate_limit", allow_rate)
    monkeypatch.setattr(ai_router, "record_ai_log", record)
    db = SimpleNamespace(commit=commit)

    with pytest.raises(ai_router.HTTPException) as exc_info:
        await global_ai_chat(AiChatIn(message="employee lookup"), user=SimpleNamespace(id=7), db=db)

    assert exc_info.value.status_code == 500
    assert "Alice" not in str(exc_info.value.detail)
    assert "E10086" not in str(exc_info.value.detail)
    assert audit_records[0]["input_payload"] == {
        "capability_id": "employee.profile.query",
        "failure_stage": "employee_profile_internal_error",
    }
