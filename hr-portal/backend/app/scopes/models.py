"""数据范围标签 ORM 模型（FR-SCOPE-* 新版语义）

每个标签 = 「管理组织范围」+「管理人员范围」两段（两段都可独立开关）
- 管理组织范围：dimension='cost_center' 选成本中心树节点 或 dimension='org' 选组织树节点
- 管理人员范围：scope_tag_filters 表存筛选条件（用工类型 / 用工主体 / 人员）

合并语义：
- 单标签内：org_part AND person_part
- 多标签间：OR（用户绑多个标签 → 并集）
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class ScopeTag(Base):
    """数据范围标签

    dimension（仅当 org_scope_enabled=True 才有意义）:
      - 'cost_center'  → selections.node_id 指向 cost_center_tree.id
      - 'org'          → selections.node_id 指向 org_tree.id
    """
    __tablename__ = "scope_tags"
    __table_args__ = (
        CheckConstraint(
            "dimension IN ('cost_center', 'org')",
            name="ck_scope_tag_dimension",
        ),
        UniqueConstraint("name", name="uq_scope_tag_name"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    dimension: Mapped[str] = mapped_column(String(16), nullable=False)
    org_scope_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    org_scope_unlimited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    person_scope_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class ScopeTagSelection(Base):
    """管理组织范围内的节点选择（仅 org_scope_enabled 时使用）"""
    __tablename__ = "scope_tag_selections"
    __table_args__ = (
        Index("ix_scope_tag_sel_tag", "tag_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tag_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("scope_tags.id", ondelete="CASCADE"), nullable=False
    )
    node_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # 旧字段：新设计不再用，但 schema 上保留，便于回滚
    value_text: Mapped[str | None] = mapped_column(String(128), nullable=True)
    include_descendants: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )


class ScopeTagFilter(Base):
    """管理人员范围的筛选条件（同一 tag 多条 → AND）

    field_code:
      - 'employment_type'   → 匹配 emp_realtime_roster.员工类型
      - 'employment_entity' → 匹配 emp_realtime_roster.公司名称
      - 'person'            → 匹配 emp_realtime_roster.姓名

    operator: 'eq' (IN) | 'neq' (NOT IN)
    values: 字符串数组
    """
    __tablename__ = "scope_tag_filters"
    __table_args__ = (
        Index("ix_scope_tag_filters_tag", "tag_id"),
        CheckConstraint(
            "field_code IN ('employment_type','employment_entity','person')",
            name="ck_filter_field",
        ),
        CheckConstraint(
            "operator IN ('eq','neq')",
            name="ck_filter_operator",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tag_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("scope_tags.id", ondelete="CASCADE"), nullable=False
    )
    field_code: Mapped[str] = mapped_column(String(32), nullable=False)
    operator: Mapped[str] = mapped_column(String(8), nullable=False)
    values: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class UserScopeTag(Base):
    __tablename__ = "user_scope_tags"

    user_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    tag_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("scope_tags.id", ondelete="CASCADE"), primary_key=True
    )
