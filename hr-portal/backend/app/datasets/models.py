"""数据集 ORM 模型（spec U4 + FR-MODEL-002）

DataSet：一组源表 + 表间关联 + 访问授权
DataSetTable：数据集纳入的表（5 张业务表之一）
DataSetRelation：数据集内部的表间关联，含连接键定义
DataSetAcl：数据集独立授权（哪些角色/用户可在新建报表时选用）

一对源表（A, B）在不同数据集中可有不同的关联键定义（spec edge case）。
删除一个仍被报表引用的数据集 MUST 被阻止（FR-MODEL-005，409 ）。
"""
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
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class DataSet(Base):
    __tablename__ = "datasets"
    __table_args__ = (UniqueConstraint("name", name="uq_dataset_name"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False, comment="数据集编码（系统标识符，如 ds_dwd_xxx）")
    label: Mapped[str | None] = mapped_column(String(128), nullable=True, comment="数据集展示名称（中文，如'成本分摊DWD数据集'）")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    scope_strategy: Mapped[str | None] = mapped_column(String(32), nullable=True)

    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # === 数据仓库扩展字段 (012) ===
    warehouse_layer: Mapped[str] = mapped_column(
        String(16), nullable=False, default="DWD", server_default="DWD"
    )
    subject_area: Mapped[str | None] = mapped_column(String(64), nullable=True)
    owner_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="published", server_default="published"
    )
    business_definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    published_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    diff_snapshot: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="发布差异快照（V2 版本管理）")


class DataSetTable(Base):
    """数据集纳入的源表

    table_name 必须在 DATA_TABLES 注册表中
    alias 可选（用户在数据集里给这张表起的别名，默认 = table_name）
    """
    __tablename__ = "dataset_tables"
    __table_args__ = (
        UniqueConstraint("dataset_id", "alias", name="uq_dataset_table_alias"),
        Index("ix_dataset_table_ds", "dataset_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    table_name: Mapped[str] = mapped_column(String(64), nullable=False)
    alias: Mapped[str] = mapped_column(String(64), nullable=False)


class DataSetRelation(Base):
    """数据集内部表间关联

    join_type: 'inner' / 'left' / 'right' / 'full'
    keys: JSON 数组，形如 [{"left": "员工 ID", "right": "员工 ID"}, ...]（多列关联）
    """
    __tablename__ = "dataset_relations"
    __table_args__ = (Index("ix_dataset_rel_ds", "dataset_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    left_alias: Mapped[str] = mapped_column(String(64), nullable=False)
    right_alias: Mapped[str] = mapped_column(String(64), nullable=False)
    join_type: Mapped[str] = mapped_column(String(8), nullable=False, default="left")
    # 基数：'1:1' / '1:N' / 'N:1'（描述关系，供报表数值拆分规则引导）
    cardinality: Mapped[str] = mapped_column(String(8), nullable=False, default="1:1")
    keys: Mapped[list] = mapped_column(JSON, nullable=False, default=list)


class DataSetAcl(Base):
    """数据集授权（角色或用户级白名单）

    至少一项不为空：role_id 或 user_id
    没有任何 ACL 行 → 默认仅创建者可见
    """
    __tablename__ = "dataset_acl"
    __table_args__ = (Index("ix_dataset_acl_ds", "dataset_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    role_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("roles.id", ondelete="CASCADE"), nullable=True
    )
    user_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )


class DatasetCalculatedField(Base):
    __tablename__ = "dataset_calculated_fields"
    __table_args__ = (
        UniqueConstraint("dataset_id", "code", name="uq_dataset_calc_field_code"),
        Index("ix_dataset_calc_fields_dataset", "dataset_id", "is_active"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    formula: Mapped[str] = mapped_column(Text, nullable=False)
    formula_display: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_type: Mapped[str] = mapped_column(String(16), nullable=False, default="number")
    agg_role: Mapped[str] = mapped_column(String(16), nullable=False, default="measure")
    depends_on: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    used_functions: Mapped[list] = mapped_column(JSON, nullable=False, default=list, server_default="[]")
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


# === 数据仓库扩展 ORM (012) ===

class DatasetOutputField(Base):
    """数据集输出字段定义。

    对应当前 DataSetTable 与 DataSetRelation 的输出投影。
    source_alias / source_column 指向数据集内的来源表和字段，
    output_code / output_label 定义对外输出编码和显示名。
    """
    __tablename__ = "dataset_output_fields"
    __table_args__ = (
        UniqueConstraint("dataset_id", "output_code", name="uq_dataset_output_code"),
        Index("ix_dataset_output_fields_dataset_id", "dataset_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    dataset_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    source_alias: Mapped[str] = mapped_column(String(64), nullable=False)
    source_column: Mapped[str] = mapped_column(String(128), nullable=False)
    output_code: Mapped[str] = mapped_column(String(128), nullable=False)
    output_label: Mapped[str] = mapped_column(String(128), nullable=False)
    data_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="string", server_default="string"
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    agg_role: Mapped[str] = mapped_column(
        String(16), nullable=False, default="dimension", server_default="dimension"
    )
    is_sensitive: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    is_visible: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class WarehouseMetric(Base):
    """数据仓库指标定义（一期为口径目录，不自动计算）。"""
    __tablename__ = "warehouse_metrics"
    __table_args__ = (
        UniqueConstraint("metric_code", name="uq_warehouse_metric_code"),
        Index("ix_warehouse_metrics_subject_area", "subject_area"),
        Index("ix_warehouse_metrics_status", "status"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    metric_code: Mapped[str] = mapped_column(String(64), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(128), nullable=False)
    metric_type: Mapped[str] = mapped_column(
        String(16), nullable=False, default="derived", server_default="derived"
    )
    subject_area: Mapped[str | None] = mapped_column(String(64), nullable=True)
    business_definition: Mapped[str | None] = mapped_column(Text, nullable=True)
    calculation_desc: Mapped[str | None] = mapped_column(Text, nullable=True)
    formula_expr: Mapped[str | None] = mapped_column(Text, nullable=True)
    formula_sql: Mapped[str | None] = mapped_column(Text, nullable=True, comment="由 Excel 公式翻译的 PostgreSQL SQL 表达式")
    formula_compile_engine: Mapped[str | None] = mapped_column(
        String(32), nullable=True, comment="公式编译器：legacy / ast"
    )
    formula_compile_version: Mapped[str | None] = mapped_column(
        String(32), nullable=True, comment="公式编译器版本，如 1.0.0"
    )
    formula_compile_meta: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, comment="编译元数据：dependencies/functions/warnings 等"
    )
    formula_ast: Mapped[dict | None] = mapped_column(
        JSON, nullable=True, comment="公式抽象语法树（调试/审计用）"
    )
    stat_period: Mapped[str | None] = mapped_column(String(16), nullable=True)
    related_dataset_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("datasets.id", ondelete="SET NULL"), nullable=True
    )
    related_fields: Mapped[list] = mapped_column(
        JSON, nullable=False, default=list, server_default="[]"
    )
    owner_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="draft", server_default="draft"
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    published_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )
