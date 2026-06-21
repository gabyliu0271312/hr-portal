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
    name: Mapped[str] = mapped_column(String(64), nullable=False)
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
