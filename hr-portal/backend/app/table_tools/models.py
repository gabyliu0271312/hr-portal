"""table_tools 模块数据模型 —— 归集模板库。

- MergeTemplate:一个归集场景(标准字段清单 + 主键 + 聚合口径)。社保是其一。
- MergeSourceMapping:模板下每种源结构的映射(匹配规则/sheet/表头行/列映射/派生)。
- MergeJob:一次合并批次记录(便于复跑与审计)。

业务语义全在这三张表的数据里,引擎代码零业务字段。
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.core.db import Base


class MergeTemplate(Base):
    """归集模板:一个场景。"""

    __tablename__ = "merge_templates"
    __table_args__ = (
        UniqueConstraint("name", name="uq_merge_template_name"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # 归集主键(标准字段名列表),如 ["姓名","证件号码"]
    merge_keys: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # 标准字段清单(目标列),如 ["养老个人","养老公司",...]
    std_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # 聚合口径:sum / first / conflict
    aggregate: Mapped[str] = mapped_column(String(16), nullable=False, default="sum")
    # 结果保存方式: none / input_period / field_period
    result_save_mode: Mapped[str] = mapped_column(String(16), nullable=False, default="input_period")
    result_period_field: Mapped[str | None] = mapped_column(String(128), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    mappings: Mapped[list["MergeSourceMapping"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )
    key_mappings: Mapped[list["MergeKeyMapping"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )
    dwd_relations: Mapped[list["MergeDwdRelation"]] = relationship(
        back_populates="template", cascade="all, delete-orphan"
    )


class MergeSourceMapping(Base):
    """模板下的一种源结构映射。"""

    __tablename__ = "merge_source_mappings"
    __table_args__ = (
        UniqueConstraint("template_id", "name", name="uq_merge_mapping_name"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("merge_templates.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # 自动识别:表头特征列名(子集命中)
    match_signature: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # 样表解析出的完整源字段目录
    source_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # sheet 选择关键词(None=第一个)
    sheet_kw: Mapped[str | None] = mapped_column(String(128), nullable=True)
    # 表头行区间 [start, end](1-based)
    header_start: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    header_end: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    # 主键列映射 源列→标准主键 {"员工":"姓名",...}
    key_map: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # 直接映射 源列→标准字段
    column_map: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    # 派生字段 [{target,expr,round}]
    derived_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # 拆分校验 {sum_of,equals_col,tol}
    derive_check: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # 跳过行关键词
    skip_tokens: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    template: Mapped["MergeTemplate"] = relationship(back_populates="mappings")


class MergeKeyMapping(Base):
    """模板级精确源主键到归集统一键的映射。"""

    __tablename__ = "merge_key_mappings"
    __table_args__ = (
        Index("ix_merge_key_mapping_template", "template_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("merge_templates.id", ondelete="CASCADE"), nullable=False
    )
    source_key: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    canonical_merge_key: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    template: Mapped["MergeTemplate"] = relationship(back_populates="key_mappings")


class MergeDwdRelation(Base):
    """模板独立的 DWD 数据集关联配置。"""

    __tablename__ = "merge_dwd_relations"
    __table_args__ = (
        UniqueConstraint("template_id", "name", name="uq_merge_dwd_relation_name"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("merge_templates.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    report_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("reports.id", ondelete="RESTRICT"), nullable=True
    )
    dataset_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("datasets.id", ondelete="RESTRICT"), nullable=True
    )
    left_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    right_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    select_fields: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    missing_policy: Mapped[str] = mapped_column(String(16), nullable=False, default="anomaly")
    multiple_policy: Mapped[str] = mapped_column(String(16), nullable=False, default="anomaly")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    template: Mapped["MergeTemplate"] = relationship(back_populates="dwd_relations")


class MergeJob(Base):
    """一次合并批次记录。"""

    __tablename__ = "merge_jobs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    file_names: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    stats: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recognize_log: Mapped[list | None] = mapped_column(JSON, nullable=True)
    anomalies: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class MergePreviewRun(Base):
    """短期保存一次完整预览，供保存月度结果时复用。"""

    __tablename__ = "merge_preview_runs"
    __table_args__ = (Index("ix_merge_preview_run_owner", "created_by", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    template_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("merge_templates.id", ondelete="CASCADE"), nullable=False)
    template_version: Mapped[int] = mapped_column(Integer, nullable=False)
    merge_keys_snapshot: Mapped[list] = mapped_column(JSON, nullable=False)
    columns_snapshot: Mapped[list] = mapped_column(JSON, nullable=False)
    rows: Mapped[list] = mapped_column(JSON, nullable=False)
    stats: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    recognize_log: Mapped[list | None] = mapped_column(JSON, nullable=True)
    anomalies: Mapped[list | None] = mapped_column(JSON, nullable=True)
    dwd_anomalies: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MergeResultBatch(Base):
    """模板某业务月份的结果快照。"""

    __tablename__ = "merge_result_batches"
    __table_args__ = (
        UniqueConstraint("template_id", "period", name="uq_merge_result_batch_template_period"),
        Index("ix_merge_result_batch_template", "template_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    template_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("merge_templates.id", ondelete="CASCADE"), nullable=False)
    period: Mapped[str] = mapped_column(String(6), nullable=False)
    template_version: Mapped[int] = mapped_column(Integer, nullable=False)
    merge_keys_snapshot: Mapped[list] = mapped_column(JSON, nullable=False)
    columns_snapshot: Mapped[list] = mapped_column(JSON, nullable=False)
    stats: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    anomalies: Mapped[list | None] = mapped_column(JSON, nullable=True)
    dwd_anomalies: Mapped[list | None] = mapped_column(JSON, nullable=True)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    updated_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class MergeResultRow(Base):
    """月度结果的完整行快照。"""

    __tablename__ = "merge_result_rows"
    __table_args__ = (
        UniqueConstraint("batch_id", "merge_key_hash", name="uq_merge_result_row_key"),
        Index("ix_merge_result_row_batch", "batch_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    batch_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("merge_result_batches.id", ondelete="CASCADE"), nullable=False)
    merge_key: Mapped[dict] = mapped_column(JSON, nullable=False)
    merge_key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    values: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
