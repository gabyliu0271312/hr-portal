"""Public foundation for server-controlled AI follow-up actions."""
from __future__ import annotations

import hashlib
import secrets
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AiControlledAction
from app.users.models import User


class ControlledActionRequest(BaseModel):
    """Client input for a follow-up action; all context remains server-side."""

    model_config = ConfigDict(extra="forbid")

    action_type: str = Field(pattern=r"^[a-z][a-z0-9._-]{0,127}$")
    selection_handle: str = Field(min_length=32, max_length=512)


class ControlledActionContext(BaseModel):
    """Base model for immutable, server-issued action context."""

    model_config = ConfigDict(extra="forbid")


class ControlledActionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action_type: str
    result: dict[str, Any]


class UnknownControlledActionError(ValueError):
    pass


class ControlledActionUnavailableError(ValueError):
    """Use one uniform failure for expired, replayed, invalid, and unbound handles."""


ControlledActionHandler = Callable[
    [ControlledActionContext, AiControlledAction, User, AsyncSession],
    Awaitable[BaseModel | Mapping[str, Any]],
]


@dataclass(frozen=True)
class RegisteredControlledAction:
    action_type: str
    capability_id: str
    context_model: type[ControlledActionContext]
    handler: ControlledActionHandler


@dataclass(frozen=True)
class IssuedControlledAction:
    action_type: str
    selection_handle: str
    expires_at: datetime


_CONTROLLED_ACTIONS: dict[str, RegisteredControlledAction] = {}


def register_controlled_action(
    *,
    action_type: str,
    capability_id: str,
    context_model: type[ControlledActionContext],
    handler: ControlledActionHandler,
) -> None:
    if not action_type or not capability_id:
        raise ValueError("action_type and capability_id are required")
    if not issubclass(context_model, ControlledActionContext):
        raise TypeError("context_model must inherit ControlledActionContext")
    if action_type in _CONTROLLED_ACTIONS:
        raise ValueError(f"controlled action is already registered: {action_type}")
    _CONTROLLED_ACTIONS[action_type] = RegisteredControlledAction(
        action_type=action_type,
        capability_id=capability_id,
        context_model=context_model,
        handler=handler,
    )


def selection_handle_hash(selection_handle: str) -> str:
    return hashlib.sha256(selection_handle.encode("utf-8")).hexdigest()


def _registered_action(action_type: str) -> RegisteredControlledAction:
    registered = _CONTROLLED_ACTIONS.get(action_type)
    if registered is None:
        raise UnknownControlledActionError(action_type)
    return registered


def controlled_action_capability_id(action_type: str) -> str:
    """Resolve an action's registered capability before handle consumption."""
    return _registered_action(action_type).capability_id


async def issue_controlled_action(
    db: AsyncSession,
    *,
    action_type: str,
    conversation_id: int,
    user_id: int,
    channel: str,
    action_context: ControlledActionContext | Mapping[str, Any],
    expires_at: datetime,
) -> IssuedControlledAction:
    registered = _registered_action(action_type)
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None or expires_at <= now:
        raise ValueError("expires_at must be a future timezone-aware datetime")

    context = registered.context_model.model_validate(action_context)
    handle = secrets.token_urlsafe(32)
    db.add(
        AiControlledAction(
            conversation_id=conversation_id,
            user_id=user_id,
            channel=channel,
            capability_id=registered.capability_id,
            action_type=action_type,
            selection_handle_hash=selection_handle_hash(handle),
            action_context=context.model_dump(mode="json"),
            expires_at=expires_at,
        )
    )
    await db.flush()
    return IssuedControlledAction(
        action_type=action_type,
        selection_handle=handle,
        expires_at=expires_at,
    )


async def consume_controlled_action(
    db: AsyncSession,
    *,
    request: ControlledActionRequest,
    conversation_id: int,
    user: User,
    channel: str,
) -> dict[str, Any]:
    registered = _registered_action(request.action_type)
    result = await db.execute(
        select(AiControlledAction)
        .where(AiControlledAction.selection_handle_hash == selection_handle_hash(request.selection_handle))
        .with_for_update()
    )
    action = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if (
        action is None
        or action.conversation_id != conversation_id
        or action.user_id != user.id
        or action.channel != channel
        or action.action_type != request.action_type
        or action.capability_id != registered.capability_id
        or action.consumed_at is not None
        or action.expires_at <= now
    ):
        raise ControlledActionUnavailableError("selection handle is unavailable")

    action.consumed_at = now
    await db.flush()
    context = registered.context_model.model_validate(action.action_context)
    handler_result = await registered.handler(context, action, user, db)
    if isinstance(handler_result, BaseModel):
        return handler_result.model_dump(mode="json")
    if isinstance(handler_result, Mapping):
        return dict(handler_result)
    raise TypeError("controlled action handlers must return a Pydantic model or mapping")
