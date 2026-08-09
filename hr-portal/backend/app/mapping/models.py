"""Mapping 元数据模型

只新增或复用以下元数据：规则集目录、不可变版本、调用方绑定、依赖、发布审计和重算运行记录。
不复制 ODS→DWD 规则正文。
"""

from __future__ import annotations

from datetime import datetime
from sqlalchemy import (
    BigInteger,
    String,
    Integer,
    Text,
    DateTime,
    Boolean,
    JSON,
    ForeignKey,
    Index,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.mapping.cost_center_models import (
    CostCenterMappingPeriod,
    CostCenterMappingException,
    CostCenterMappingDiff,
    CostCenterMappingNotification,
)


class MappingRuleSetCatalog(Base):
    """规则集目录: 只保存规则集身份、当前版本、状态和 owner"""

    __tablename__ = "mapping_rule_set_catalog"
    __table_args__ = (
        UniqueConstraint("code", name="uq_mapping_rule_set_code"),
        Index("ix_mapping_rule_set_owner", "owner"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(128), nullable=False)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    owner: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    versions: Mapped[list["MappingRuleSetVersion"]] = relationship(back_populates="catalog", cascade="all, delete-orphan")


class MappingRuleSetVersion(Base):
    """规则集版本: 只保存版本元数据及 standardization_rule_ids 或调用方配置引用, 不保存第二份 ODS→DWD 规则正文"""

    __tablename__ = "mapping_rule_set_versions"
    __table_args__ = (
        UniqueConstraint("catalog_id", "version", name="uq_mapping_version"),
        Index("ix_mapping_version_catalog", "catalog_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    catalog_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("mapping_rule_set_catalog.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="draft")
    # 快照: mappingSchemaVersion, source/target schema hash, adapter, storageMode, 兼容状态
    mapping_schema_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source_schema_hash: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    target_schema_hash: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    adapter: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    storage_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="component_v1")
    compatibility_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 引用 standardization_rules 的 ID 列表 (Warehouse caller) 或调用方配置引用
    standardization_rule_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    # 调用方配置引用 (非 Warehouse)
    caller_config_ref: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 发布信息
    published_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    catalog: Mapped["MappingRuleSetCatalog"] = relationship(back_populates="versions")


class MappingBinding(Base):
    """调用方绑定: 规则集版本 → 调用方 + 资产"""

    __tablename__ = "mapping_bindings"
    __table_args__ = (
        Index("ix_mapping_binding_caller", "caller", "asset_id"),
        UniqueConstraint("caller", "asset_id", "binding_key", name="uq_mapping_binding"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    caller: Mapped[str] = mapped_column(String(32), nullable=False)
    asset_id: Mapped[str] = mapped_column(String(256), nullable=False)
    binding_key: Mapped[str] = mapped_column(String(256), nullable=False, default="default")
    catalog_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("mapping_rule_set_catalog.id"), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expected_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    storage_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="component_v1")
    legacy_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class MappingDependency(Base):
    """依赖: 规则集 → 清洗配置 → DWD/流程节点 → 目标资产"""

    __tablename__ = "mapping_dependencies"
    __table_args__ = (
        Index("ix_mapping_dep_source", "source_type", "source_id"),
        Index("ix_mapping_dep_target", "target_type", "target_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    binding_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("mapping_bindings.id"), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False)
    source_id: Mapped[str] = mapped_column(String(256), nullable=False)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[str] = mapped_column(String(256), nullable=False)
    rebuild_policy: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class MappingPublishAudit(Base):
    """发布审计"""

    __tablename__ = "mapping_publish_audits"
    __table_args__ = (
        Index("ix_mapping_audit_binding", "binding_id"),
        Index("ix_mapping_audit_event", "event_id"),
        UniqueConstraint("idempotency_key", name="uq_mapping_audit_idempotency"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    binding_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("mapping_bindings.id"), nullable=False)
    event_id: Mapped[str] = mapped_column(String(128), nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    mapping_version: Mapped[int] = mapped_column(Integer, nullable=False)
    schema_hash: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    rebuild_policy: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    actor: Mapped[str | None] = mapped_column(String(128), nullable=True)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class MappingRebuildRun(Base):
    """重算运行记录"""

    __tablename__ = "mapping_rebuild_runs"
    __table_args__ = (
        Index("ix_mapping_rebuild_binding", "binding_id"),
        Index("ix_mapping_rebuild_status", "status"),
        UniqueConstraint(
            "event_id", "binding_id", "mapping_version", "target_id",
            name="uq_mapping_rebuild_idempotency",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    binding_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("mapping_bindings.id"), nullable=False)
    audit_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("mapping_publish_audits.id"), nullable=True)
    event_id: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    mapping_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[str] = mapped_column(String(256), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
