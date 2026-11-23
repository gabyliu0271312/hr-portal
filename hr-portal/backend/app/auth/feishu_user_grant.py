import hashlib
from datetime import UTC, datetime, timedelta

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from app.core import secret_box
from app.core.config import settings
from app.core.db import Base
from app.users.models import User

DOCUMENT_METADATA_SCOPE = "drive:drive.metadata:readonly"


class FeishuUserGrant(Base):
    __tablename__ = "feishu_user_grants"

    session_digest: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    open_id: Mapped[str] = mapped_column(String(64), nullable=False)
    app_id: Mapped[str] = mapped_column(String(128), nullable=False)
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def session_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def retain_user_grant(db: AsyncSession, user: User, portal_token: str, identity) -> None:
    if not settings.FEISHU_DOCUMENT_TITLE_ENABLED:
        return
    if (not identity.access_token or identity.expires_in <= 0
            or DOCUMENT_METADATA_SCOPE not in identity.scope.split()
            or identity.open_id != user.feishu_user_id):
        return
    now = datetime.now(UTC)
    encrypted = secret_box.encrypt(identity.access_token)
    await db.execute(delete(FeishuUserGrant).where(
        FeishuUserGrant.user_id == user.id, FeishuUserGrant.expires_at <= now,
    ))
    await db.merge(FeishuUserGrant(
        session_digest=session_digest(portal_token), user_id=user.id,
        open_id=identity.open_id, app_id=settings.FEISHU_APP_ID,
        access_token_encrypted=encrypted,
        expires_at=now + timedelta(seconds=min(identity.expires_in, settings.JWT_EXPIRE_MINUTES * 60)),
    ))


async def get_user_access_token(db: AsyncSession, user_id: int, portal_token: str) -> str | None:
    if not settings.FEISHU_DOCUMENT_TITLE_ENABLED:
        return None
    grant = await db.get(FeishuUserGrant, session_digest(portal_token))
    if not grant or grant.user_id != user_id or grant.app_id != settings.FEISHU_APP_ID:
        return None
    expires_at = grant.expires_at.replace(tzinfo=UTC) if grant.expires_at.tzinfo is None else grant.expires_at
    if expires_at <= datetime.now(UTC):
        return None
    user = await db.get(User, user_id)
    if not user or not user.is_active or user.feishu_user_id != grant.open_id:
        return None
    try:
        return secret_box.decrypt(grant.access_token_encrypted) or None
    except (ValueError, TypeError):
        return None


async def revoke_user_grants(db: AsyncSession, user_id: int) -> None:
    if settings.FEISHU_DOCUMENT_TITLE_ENABLED:
        await db.execute(delete(FeishuUserGrant).where(FeishuUserGrant.user_id == user_id))
