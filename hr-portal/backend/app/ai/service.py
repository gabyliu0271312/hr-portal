from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import AiProviderConfig


async def active_ai_config(db: AsyncSession) -> AiProviderConfig | None:
    return (
        await db.execute(
            select(AiProviderConfig)
            .where(AiProviderConfig.is_enabled.is_(True))
            .order_by(AiProviderConfig.id)
            .limit(1)
        )
    ).scalar_one_or_none()

