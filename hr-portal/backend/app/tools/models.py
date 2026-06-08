"""HR 小工具相关模型"""
from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base


class CompensationCap(Base):
    __tablename__ = "compensation_caps"
    __table_args__ = (
        UniqueConstraint("region", "effective_start", "effective_end", name="uq_comp_cap_period"),
        Index("ix_comp_caps_region_period", "region", "effective_start", "effective_end"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    region: Mapped[str] = mapped_column(String(64), nullable=False)
    effective_start: Mapped[date] = mapped_column(Date, nullable=False)
    effective_end: Mapped[date] = mapped_column(Date, nullable=False)
    cap_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class InstallmentRule(Base):
    """补偿金分期支付规则（每行 = 一期）。

    取整算法固定为「前面各期向下取整、最后一期取剩余」，保证各期合计 = 补偿总额。
    期数/比例/付款月份偏移/付款日均可在「补偿金规则维护」页配置。
    """

    __tablename__ = "installment_rules"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    period_no: Mapped[int] = mapped_column(Integer, nullable=False, unique=True)  # 期号 1,2,3...
    ratio: Mapped[float] = mapped_column(Numeric(6, 3), nullable=False)  # 该期比例（百分比，如 25.000）
    months_after: Mapped[int] = mapped_column(Integer, nullable=False)  # 离职后第几个月付款
    pay_day: Mapped[int] = mapped_column(Integer, nullable=False, default=15)  # 该月几号付款
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class DocumentTemplate(Base):
    __tablename__ = "document_templates"
    __table_args__ = (
        UniqueConstraint("code", name="uq_document_templates_code"),
        Index("ix_document_templates_business_type", "business_type"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    business_type: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    version: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0", server_default="1.0")
    effective_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    layout_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    template_file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    template_file_content_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    template_file_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    template_file: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    parsed_variables: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    uploaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    blocks: Mapped[list["DocumentTemplateBlock"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="DocumentTemplateBlock.display_order",
    )
    variables: Mapped[list["DocumentTemplateVariable"]] = relationship(
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="DocumentTemplateVariable.id",
    )


class DocumentTemplateBlock(Base):
    __tablename__ = "document_template_blocks"
    __table_args__ = (
        Index("ix_document_template_blocks_template_order", "template_id", "display_order"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("document_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    block_type: Mapped[str] = mapped_column(String(32), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default="10")
    style_config: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")

    template: Mapped[DocumentTemplate] = relationship(back_populates="blocks")


class DocumentTemplateVariable(Base):
    __tablename__ = "document_template_variables"
    __table_args__ = (
        UniqueConstraint("template_id", "variable_code", name="uq_document_template_variable_code"),
        Index("ix_document_template_variables_template", "template_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("document_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    variable_code: Mapped[str] = mapped_column(String(64), nullable=False)
    variable_name: Mapped[str] = mapped_column(String(128), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="manual", server_default="manual")
    source_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    default_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    formatter: Mapped[str | None] = mapped_column(String(32), nullable=True)

    template: Mapped[DocumentTemplate] = relationship(back_populates="variables")


class DocumentGenerationLog(Base):
    __tablename__ = "document_generation_logs"
    __table_args__ = (
        Index("ix_document_generation_logs_business_created", "business_type", "created_at"),
        Index("ix_document_generation_logs_template_code", "template_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    business_type: Mapped[str] = mapped_column(String(64), nullable=False)
    action: Mapped[str] = mapped_column(String(32), nullable=False)
    template_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    template_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    subject_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    manually_adjusted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    draft_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    draft_length: Mapped[int | None] = mapped_column(Integer, nullable=True)
    context: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    created_by: Mapped[int | None] = mapped_column(
        BigInteger,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
