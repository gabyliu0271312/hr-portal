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
    DateTime,
    ForeignKey,
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
