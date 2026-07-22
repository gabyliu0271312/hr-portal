import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from starlette.requests import Request

import app.integrations.feishu.ai_channel as ai_channel
import app.integrations.feishu.ai_gate as ai_gate
import app.integrations.feishu.router as feishu_router
from app.ai.actions import ControlledActionUnavailableError


def _settings(**overrides):
    values = {
        "FEISHU_BOT_ENABLED": True,
        "FEISHU_EMPLOYEE_PROFILE_ENABLED": True,
        "FEISHU_EMPLOYEE_PROFILE_ALLOWED_USER_IDS": "7",
        "FEISHU_VERIFICATION_TOKEN": "test-token",
        "FEISHU_CALLBACK_MAX_TIMESTAMP_DIFF": 300,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_feishu_employee_channel_gate_is_fail_closed(monkeypatch):
    monkeypatch.setattr(ai_gate, "settings", _settings(FEISHU_EMPLOYEE_PROFILE_ENABLED=False))
    with pytest.raises(HTTPException) as exc_info:
        ai_gate.enforce_feishu_capability_gate("employee.profile.query", 7)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "????????"

    monkeypatch.setattr(ai_gate, "settings", _settings(FEISHU_EMPLOYEE_PROFILE_ALLOWED_USER_IDS=""))
    with pytest.raises(HTTPException):
        ai_gate.enforce_feishu_capability_gate("employee.profile.query", 7)

    monkeypatch.setattr(ai_gate, "settings", _settings(FEISHU_BOT_ENABLED=False))
    with pytest.raises(HTTPException):
        ai_gate.enforce_feishu_capability_gate("ai.chat", 7)


def test_event_request_accepts_configured_token_and_rejects_invalid_tokens(monkeypatch):
    monkeypatch.setattr(ai_channel, "settings", _settings())
    challenge = {"type": "url_verification", "token": "test-token", "challenge": "value"}
    ai_channel.verify_feishu_signed_request(headers={}, raw_body=b"{}", body=challenge)

    raw_body = json.dumps(
        {"header": {"event_type": "im.message.receive_v1", "token": "test-token"}}
    ).encode("utf-8")
    ai_channel.verify_feishu_signed_request(
        headers={}, raw_body=raw_body, body=json.loads(raw_body)
    )
    with pytest.raises(HTTPException):
        ai_channel.verify_feishu_signed_request(
            headers={}, raw_body=raw_body, body={"header": {"token": "incorrect-token"}}
        )
    with pytest.raises(HTTPException):
        ai_channel.verify_feishu_signed_request(
            headers={}, raw_body=raw_body, body={"header": {"event_type": "im.message.receive_v1"}}
        )

    monkeypatch.setattr(ai_channel, "settings", _settings(FEISHU_VERIFICATION_TOKEN="测试令牌"))
    ai_channel.verify_feishu_signed_request(
        headers={}, raw_body=raw_body, body={"header": {"token": "测试令牌"}}
    )
    with pytest.raises(HTTPException) as exc_info:
        ai_channel.verify_feishu_signed_request(
            headers={}, raw_body=raw_body, body={"header": {"token": "错误令牌"}}
        )
    assert exc_info.value.status_code == 403


def test_private_text_event_and_generic_card_are_minimally_rendered():
    event = {
        "sender": {"sender_id": {"open_id": "ou_123"}},
        "message": {
            "chat_id": "oc_123",
            "chat_type": "p2p",
            "message_type": "text",
            "content": '{"text":" ???? "}',
        },
    }
    assert ai_channel.is_private_message(event)
    assert ai_channel.event_open_id(event) == "ou_123"
    assert ai_channel.event_chat_id(event) == "oc_123"
    assert ai_channel.message_text(event) == "????"
    assert ai_channel.message_text({"message": {"message_type": "image"}}) is None

    card = json.loads(ai_channel.render_envelope_card(SimpleNamespace(answer="????")))
    assert card["config"]["enable_forward"] is False
    assert card["elements"] == [{"tag": "markdown", "content": "????"}]


def _employee_out(result_type, data, *, answer="????"):
    return SimpleNamespace(
        capability_id="employee.profile.query",
        answer=answer,
        result=SimpleNamespace(type=result_type, data=data),
    )


def test_employee_profile_cards_only_render_authorized_envelope_data():
    result_card = json.loads(
        ai_channel.render_envelope_card(
            _employee_out(
                "employee_profile_result",
                SimpleNamespace(fields=[SimpleNamespace(label="??", value="??"), SimpleNamespace(label="??", value="?????")]),
            )
        )
    )
    assert result_card["header"]["title"]["content"] == "????????"
    assert result_card["config"]["enable_forward"] is False
    assert "??" in result_card["elements"][0]["text"]["content"]
    assert "?????" in result_card["elements"][0]["text"]["content"]

    handle = "a" * 32
    candidates_card = json.loads(
        ai_channel.render_envelope_card(
            _employee_out(
                "employee_profile_candidates",
                SimpleNamespace(
                    candidates=[
                        SimpleNamespace(display_fields=[SimpleNamespace(label="??", value="??")], selection_handle=handle),
                        SimpleNamespace(display_fields=[SimpleNamespace(label="????", value="????")], selection_handle="b" * 32),
                    ]
                ),
            )
        )
    )
    button = candidates_card["elements"][1]["actions"][0]
    assert button["text"]["content"] == "?????"
    assert button["value"] == {
        "action_type": "employee.profile.select_candidate",
        "selection_handle": handle,
    }
    readable_parts = [element.get("text", {}).get("content", "") for element in candidates_card["elements"]]
    assert handle not in "\n".join(readable_parts)

    input_card = json.loads(
        ai_channel.render_envelope_card(_employee_out("employee_profile_input", SimpleNamespace(), answer="????????"))
    )
    message_card = json.loads(
        ai_channel.render_envelope_card(_employee_out("message", SimpleNamespace(), answer="???????"))
    )
    assert input_card["elements"][0]["text"]["content"] == "????????"
    assert message_card["elements"][0]["text"]["content"] == "???????"


def test_employee_candidate_card_fails_closed_when_display_fields_are_missing():
    card = json.loads(
        ai_channel.render_employee_profile_card(
            _employee_out(
                "employee_profile_candidates",
                SimpleNamespace(candidates=[SimpleNamespace(display_fields=[], selection_handle="a" * 32)]),
            )
        )
    )
    assert "?????" in card["elements"][0]["text"]["content"]
    assert all(element["tag"] != "action" for element in card["elements"])


def _request(body: dict):
    payload = json.dumps(body).encode("utf-8")

    async def receive():
        return {"type": "http.request", "body": payload, "more_body": False}

    return Request({"type": "http", "method": "POST", "path": "/", "headers": []}, receive)


@pytest.mark.asyncio
async def test_bot_event_sends_employee_candidate_card(monkeypatch):
    sent_cards = []

    async def no_op(*args, **kwargs):
        return None

    async def claim(*args, **kwargs):
        return True

    async def chat(*args, **kwargs):
        return _employee_out(
            "employee_profile_candidates",
            SimpleNamespace(
                candidates=[
                    SimpleNamespace(display_fields=[SimpleNamespace(label="??", value="??")], selection_handle="a" * 32),
                    SimpleNamespace(display_fields=[SimpleNamespace(label="??", value="??")], selection_handle="b" * 32),
                ]
            ),
        )

    async def mapped_user(*args, **kwargs):
        return SimpleNamespace(id=7)

    class Client:
        async def send_interactive_card_to_user(self, open_id, card):
            sent_cards.append((open_id, json.loads(card)))

    monkeypatch.setattr(feishu_router, "verify_feishu_signed_request", lambda **kwargs: None)
    monkeypatch.setattr(feishu_router, "claim_feishu_nonce", claim)
    monkeypatch.setattr(feishu_router, "claim_channel_event", claim)
    monkeypatch.setattr(feishu_router, "complete_channel_event", no_op)
    monkeypatch.setattr(feishu_router, "enforce_feishu_capability_gate", lambda *args: None)
    monkeypatch.setattr(feishu_router, "resolve_feishu_portal_user", mapped_user)
    monkeypatch.setattr(feishu_router, "run_feishu_chat", chat)
    monkeypatch.setattr(feishu_router, "get_feishu_client", lambda: Client())
    db = SimpleNamespace(commit=no_op, rollback=no_op)
    body = {
        "header": {"event_type": "im.message.receive_v1", "event_id": "evt-1"},
        "event": {
            "sender": {"sender_id": {"open_id": "ou_1"}},
            "message": {"message_id": "msg-1", "chat_id": "oc_1", "chat_type": "p2p", "message_type": "text", "content": '{"text":"????"}'},
        },
    }
    assert await feishu_router.handle_bot_event(_request(body), db=db) == {"ok": True}
    assert sent_cards[0][0] == "ou_1"
    assert sent_cards[0][1]["header"]["title"]["content"] == "?????"
    assert sent_cards[0][1]["elements"][1]["actions"][0]["value"] == {
        "action_type": "employee.profile.select_candidate",
        "selection_handle": "a" * 32,
    }


@pytest.mark.asyncio
async def test_candidate_action_updates_card_and_expiry_clears_candidates(monkeypatch):
    updated_cards = []

    async def no_op(*args, **kwargs):
        return None

    async def claim(*args, **kwargs):
        return True

    async def mapped_user(*args, **kwargs):
        return SimpleNamespace(id=7)

    async def conversation(*args, **kwargs):
        return SimpleNamespace(id=9)

    class Client:
        async def update_interactive_message(self, message_id, card):
            updated_cards.append((message_id, json.loads(card)))

    body = {"event": {"context": {"open_chat_id": "oc_1", "open_message_id": "om_1", "chat_type": "p2p"}}}
    request = _request(body)
    request.state._feishu_raw_body = json.dumps(body)
    monkeypatch.setattr(feishu_router, "verify_feishu_signed_request", lambda **kwargs: None)
    monkeypatch.setattr(feishu_router, "claim_feishu_nonce", claim)
    monkeypatch.setattr(feishu_router, "resolve_feishu_portal_user", mapped_user)
    monkeypatch.setattr(feishu_router, "load_or_create_channel_conversation", conversation)
    monkeypatch.setattr(feishu_router, "controlled_action_capability_id", lambda *args: "employee.profile.query")
    monkeypatch.setattr(feishu_router, "enforce_feishu_capability_gate", lambda *args: None)
    monkeypatch.setattr(feishu_router, "enforce_capability_rate_limit", no_op)
    monkeypatch.setattr(feishu_router, "record_controlled_action_audit", no_op)
    monkeypatch.setattr(feishu_router, "get_feishu_client", lambda: Client())

    async def succeeds(*args, **kwargs):
        return {
            "status": "succeeded",
                "data": {"fields": [{"code": "employee_name", "label": "\u59d3\u540d", "value": "\u5f20\u4e09"}]},
            "permission_filtered": False,
            "masking_applied": False,
        }

    db = SimpleNamespace(commit=no_op, rollback=no_op)
    monkeypatch.setattr(feishu_router, "consume_controlled_action", succeeds)
    result = await feishu_router._consume_bot_card_action(
        request=request,
        db=db,
        body=body,
        open_id="ou_1",
        action_value={"action_type": "employee.profile.select_candidate", "selection_handle": "a" * 32},
    )
    assert result == {"ok": True, "toast": "?????"}
    assert updated_cards[-1][1]["header"]["title"]["content"] == "????????"

    async def expired(*args, **kwargs):
        raise ControlledActionUnavailableError("expired")

    monkeypatch.setattr(feishu_router, "consume_controlled_action", expired)
    result = await feishu_router._consume_bot_card_action(
        request=request,
        db=db,
        body=body,
        open_id="ou_1",
        action_value={"action_type": "employee.profile.select_candidate", "selection_handle": "b" * 32},
    )
    assert result["ok"] is False
    assert "????" in result["toast"]
    assert "?????" in updated_cards[-1][1]["elements"][0]["text"]["content"]


@pytest.mark.asyncio
async def test_replayed_feishu_event_never_requeries_or_resends_a_card(monkeypatch):
    query_calls = []
    sent_cards = []
    event_claims = iter([True, False])

    async def no_op(*args, **kwargs):
        return None

    async def claim_nonce(*args, **kwargs):
        return True

    async def claim_event(*args, **kwargs):
        return next(event_claims)

    async def mapped_user(*args, **kwargs):
        return SimpleNamespace(id=7)

    async def chat(*args, **kwargs):
        query_calls.append(True)
        return _employee_out("message", SimpleNamespace(), answer="????")

    class Client:
        async def send_interactive_card_to_user(self, open_id, card):
            sent_cards.append((open_id, card))

    monkeypatch.setattr(feishu_router, "verify_feishu_signed_request", lambda **kwargs: None)
    monkeypatch.setattr(feishu_router, "claim_feishu_nonce", claim_nonce)
    monkeypatch.setattr(feishu_router, "claim_channel_event", claim_event)
    monkeypatch.setattr(feishu_router, "complete_channel_event", no_op)
    monkeypatch.setattr(feishu_router, "enforce_feishu_capability_gate", lambda *args: None)
    monkeypatch.setattr(feishu_router, "resolve_feishu_portal_user", mapped_user)
    monkeypatch.setattr(feishu_router, "run_feishu_chat", chat)
    monkeypatch.setattr(feishu_router, "get_feishu_client", lambda: Client())
    db = SimpleNamespace(commit=no_op, rollback=no_op)
    body = {
        "header": {"event_type": "im.message.receive_v1", "event_id": "evt-replay"},
        "event": {
            "sender": {"sender_id": {"open_id": "ou_1"}},
            "message": {"message_id": "msg-1", "chat_id": "oc_1", "chat_type": "p2p", "message_type": "text", "content": '{"text":"??"}'},
        },
    }
    assert await feishu_router.handle_bot_event(_request(body), db=db) == {"ok": True}
    assert await feishu_router.handle_bot_event(_request(body), db=db) == {"ok": True}
    assert query_calls == [True]
    assert len(sent_cards) == 1


@pytest.mark.asyncio
async def test_group_and_unmapped_feishu_events_never_enter_chat_handler(monkeypatch):
    handler_calls = []
    sent_texts = []

    async def no_op(*args, **kwargs):
        return None

    async def claim(*args, **kwargs):
        return True

    async def unmapped(*args, **kwargs):
        return None

    async def chat(*args, **kwargs):
        handler_calls.append(True)

    class Client:
        async def send_text_to_user(self, open_id, text):
            sent_texts.append((open_id, text))

    monkeypatch.setattr(feishu_router, "verify_feishu_signed_request", lambda **kwargs: None)
    monkeypatch.setattr(feishu_router, "claim_feishu_nonce", claim)
    monkeypatch.setattr(feishu_router, "claim_channel_event", claim)
    monkeypatch.setattr(feishu_router, "complete_channel_event", no_op)
    monkeypatch.setattr(feishu_router, "enforce_feishu_capability_gate", lambda *args: None)
    monkeypatch.setattr(feishu_router, "resolve_feishu_portal_user", unmapped)
    monkeypatch.setattr(feishu_router, "run_feishu_chat", chat)
    monkeypatch.setattr(feishu_router, "get_feishu_client", lambda: Client())
    db = SimpleNamespace(commit=no_op, rollback=no_op)
    base = {
        "header": {"event_type": "im.message.receive_v1", "event_id": "evt-group"},
        "event": {
            "sender": {"sender_id": {"open_id": "ou_1"}},
            "message": {"message_id": "msg-group", "chat_id": "oc_group", "chat_type": "group", "message_type": "text", "content": '{"text":"??"}'},
        },
    }
    assert await feishu_router.handle_bot_event(_request(base), db=db) == {"ok": True}
    base["header"]["event_id"] = "evt-unmapped"
    base["event"]["message"]["message_id"] = "msg-unmapped"
    base["event"]["message"]["chat_type"] = "p2p"
    assert await feishu_router.handle_bot_event(_request(base), db=db) == {"ok": True}
    assert handler_calls == []
    assert len(sent_texts) == 2
