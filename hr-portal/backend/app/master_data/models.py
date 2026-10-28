from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class EntityDefinition(Base):
    __tablename__ = "master_entity_definitions"
    __table_args__ = (
        UniqueConstraint("entity_code", name="uq_master_entity_code"),
        CheckConstraint("entity_code ~ '^[a-z][a-z0-9_]{0,63}$'", name="ck_master_entity_code"),
        CheckConstraint("length(trim(name)) > 0 AND length(trim(description)) > 0", name="ck_master_entity_definition"),
        CheckConstraint("revision >= 0", name="ck_master_entity_revision"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entity_code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    owner_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
