from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint, func
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
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    published_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    published_fields: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())


class EntitySource(Base):
    __tablename__ = "master_entity_sources"
    __table_args__ = (UniqueConstraint("entity_id", "source_system", name="uq_master_entity_source"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entity_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("master_entity_definitions.id", ondelete="RESTRICT"), nullable=False)
    source_system: Mapped[str] = mapped_column(String(64), nullable=False)
    adapter_code: Mapped[str] = mapped_column(String(64), nullable=False)
    field_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")


class EntityRecordAcl(Base):
    __tablename__ = "master_entity_record_acl"
    __table_args__ = (CheckConstraint("(user_id IS NULL) <> (role_id IS NULL)", name="ck_master_record_acl_subject"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    entity_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("master_entity_definitions.id", ondelete="RESTRICT"), nullable=False)
    user_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    role_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("roles.id", ondelete="CASCADE"), nullable=True)


class ScopePersonReference(Base):
    __tablename__ = "scope_person_references"

    tag_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("scope_tags.id", ondelete="CASCADE"), primary_key=True)
    entity_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("master_entity_definitions.id", ondelete="RESTRICT"), primary_key=True)
    record_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
