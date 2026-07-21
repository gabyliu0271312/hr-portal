"""Shared Feishu Bot ingress, identity mapping, and Envelope rendering."""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.channel_sessions import claim_channel_event
from app.ai.employee_profile_actions import EMPLOYEE_PROFILE_SELECT_CANDIDATE_ACTION
from app.ai.employee_profile_gate import EMPLOYEE_PROFILE_CAPABILITY_ID
from app.ai.router import AiChatIn, AiChatOut, global_ai_chat
from app.core.config import settings
from app.users.models import User


FEISHU_CHANNEL = "feishu"


def verify_feishu_signed_request(*, headers: Any, raw_body: bytes, body: dict[str, Any]) -> None:
    """Validate URL challenge or signed Feishu callbacks without logging payloads."""
    if body.get("type") == "url_verification":
        if not settings.FEISHU_VERIFICATION_TOKEN or not hmac.compare_digest(
            str(body.get("token", "")), settings.FEISHU_VERIFICATION_TOKEN
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="verification token mismatch")
        return

    timestamp = headers.get("X-Lark-Request-Timestamp") or headers.get("X-Feishu-Request-Timestamp")
    nonce = headers.get("X-Lark-Request-Nonce") or headers.get("X-Feishu-Request-Nonce")
    signature = headers.get("X-Lark-Signature") or headers.get("X-Feishu-Signature")
    if not settings.FEISHU_VERIFICATION_TOKEN or not timestamp or not nonce or not signature:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid callback signature")
    try:
        if abs(int(time.time()) - int(timestamp)) > settings.FEISHU_CALLBACK_MAX_TIMESTAMP_DIFF:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="callback timestamp expired")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid callback timestamp") from exc
    expected = hashlib.sha256(
        f"{timestamp}{nonce}{settings.FEISHU_VERIFICATION_TOKEN}".encode("utf-8") + raw_body
    ).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid callback signature")


async def claim_feishu_nonce(db: AsyncSession, headers: Any) -> bool:
    timestamp = headers.get("X-Lark-Request-Timestamp") or headers.get("X-Feishu-Request-Timestamp")
    nonce = headers.get("X-Lark-Request-Nonce") or headers.get("X-Feishu-Request-Nonce")
    return await claim_channel_event(db, channel="feishu_nonce", event_key=f"{timestamp}:{nonce}")


async def resolve_feishu_portal_user(db: AsyncSession, open_id: str) -> User | None:
    if not open_id:
        return None
    return (
        await db.execute(
            select(User).where(User.feishu_user_id == open_id, User.is_active.is_(True))
        )
    ).scalar_one_or_none()


def event_open_id(event: dict[str, Any]) -> str:
    sender = event.get("sender") or {}
    sender_id = sender.get("sender_id") or {}
    return str(sender_id.get("open_id") or sender.get("open_id") or "")


def event_chat_id(event: dict[str, Any]) -> str:
    message = event.get("message") or {}
    return str(message.get("chat_id") or "")


def is_private_message(event: dict[str, Any]) -> bool:
    message = event.get("message") or {}
    return message.get("chat_type") == "p2p"


def message_text(event: dict[str, Any]) -> str | None:
    message = event.get("message") or {}
    if message.get("message_type") != "text":
        return None
    try:
        content = json.loads(message.get("content") or "{}")
    except json.JSONDecodeError:
        return None
    text = content.get("text")
    return text.strip() if isinstance(text, str) and text.strip() else None


def render_envelope_card(out: AiChatOut) -> str:
    """Render a public Envelope, dispatching registered capability cards safely."""
    if getattr(out, "capability_id", None) == EMPLOYEE_PROFILE_CAPABILITY_ID:
        return render_employee_profile_card(out)
    return json.dumps(
        {
            "config": {"wide_screen_mode": True, "enable_forward": False},
            "header": {"title": {"tag": "plain_text", "content": "HR ??"}},
            "elements": [{"tag": "markdown", "content": out.answer}],
        },
        ensure_ascii=False,
    )


def _markdown_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("*", "\\*").replace("[", "\\[").replace("]", "\\]")


def _employee_card(title: str, elements: list[dict[str, Any]]) -> str:
    return json.dumps(
        {
            "config": {"wide_screen_mode": True, "enable_forward": False},
            "header": {"title": {"tag": "plain_text", "content": title}},
            "elements": elements,
        },
        ensure_ascii=False,
    )


def render_employee_profile_card(out: AiChatOut) -> str:
    """Render only the employee fields already authorized by the shared Envelope."""
    result = out.result
    if result.type == "employee_profile_result":
        lines = [f"**{_markdown_text(field.label)}**?{_markdown_text(field.value)}" for field in result.data.fields]
        return _employee_card(
            "????????",
            [{"tag": "div", "text": {"tag": "lark_md", "content": "\n".join(lines)}}],
        )
    if result.type == "employee_profile_candidates":
        if not result.data.candidates or any(not candidate.display_fields for candidate in result.data.candidates):
            return _employee_card(
                "????????",
                [{"tag": "div", "text": {"tag": "lark_md", "content": "???????????"}}],
            )
        elements: list[dict[str, Any]] = []
        for candidate in result.data.candidates:
            lines = [
                f"**{_markdown_text(field.label)}**?{_markdown_text(field.value)}"
                for field in candidate.display_fields
            ]
            elements.extend(
                [
                    {"tag": "div", "text": {"tag": "lark_md", "content": "\n".join(lines)}},
                    {
                        "tag": "action",
                        "actions": [
                            {
                                "tag": "button",
                                "type": "primary",
                                "text": {"tag": "plain_text", "content": "?????"},
                                "value": {
                                    "action_type": EMPLOYEE_PROFILE_SELECT_CANDIDATE_ACTION,
                                    "selection_handle": candidate.selection_handle,
                                },
                            }
                        ],
                    },
                ]
            )
        return _employee_card("?????", elements)
    if result.type == "employee_profile_input":
        return _employee_card(
            "????????",
            [{"tag": "div", "text": {"tag": "lark_md", "content": _markdown_text(out.answer)}}],
        )
    return _employee_card(
        "????????",
        [{"tag": "div", "text": {"tag": "lark_md", "content": _markdown_text(out.answer)}}],
    )


def render_employee_profile_action_unavailable_card() -> str:
    return _employee_card(
        "????????",
        [{"tag": "div", "text": {"tag": "lark_md", "content": "?????????????????"}}],
    )


async def run_feishu_chat(db: AsyncSession, *, user: User, chat_id: str, text: str) -> AiChatOut:
    from app.ai.channel_sessions import load_or_create_channel_conversation

    conversation = await load_or_create_channel_conversation(
        db, user=user, channel=FEISHU_CHANNEL, external_session_key=chat_id
    )
    return await global_ai_chat(
        AiChatIn(message=text, page_path="feishu:bot", conversation_id=conversation.id),
        user=user,
        db=db,
    )
