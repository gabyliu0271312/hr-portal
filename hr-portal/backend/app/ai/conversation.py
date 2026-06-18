from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AiConversation
from app.users.models import User


@dataclass
class ChatSession:
    """一次对话的可变会话视图。handler 读写它,router 负责持久化。"""

    conversation_id: int | None
    active_capability_id: str | None = None
    state: dict[str, Any] = field(default_factory=dict)

    def capability_state(self, capability_id: str) -> dict[str, Any]:
        """取某能力的槽位分区(不存在则返回空 dict)。"""
        value = self.state.get(capability_id)
        return dict(value) if isinstance(value, dict) else {}

    def set_capability_state(self, capability_id: str, slots: dict[str, Any]) -> None:
        self.state[capability_id] = slots

    def activate(self, capability_id: str, slots: dict[str, Any]) -> None:
        self.active_capability_id = capability_id
        self.set_capability_state(capability_id, slots)

    def clear_active(self) -> None:
        self.active_capability_id = None


async def load_or_create(
    db: AsyncSession,
    user: User,
    conversation_id: int | None,
    channel: str = "web",
) -> tuple[AiConversation, ChatSession]:
    """按 conversation_id 加载该用户的会话;无 id 或不属于该用户则新建。"""
    conv: AiConversation | None = None
    if conversation_id is not None:
        conv = (
            await db.execute(
                select(AiConversation).where(
                    AiConversation.id == conversation_id,
                    AiConversation.user_id == user.id,
                )
            )
        ).scalar_one_or_none()
    if conv is None:
        conv = AiConversation(user_id=user.id, channel=channel, state={})
        db.add(conv)
        await db.flush()  # 取得自增 id
    session = ChatSession(
        conversation_id=conv.id,
        active_capability_id=conv.active_capability_id,
        state=dict(conv.state or {}),
    )
    return conv, session


async def persist(db: AsyncSession, conv: AiConversation, session: ChatSession) -> None:
    conv.active_capability_id = session.active_capability_id
    conv.state = session.state
