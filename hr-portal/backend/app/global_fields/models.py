"""全局字段字典 ORM 模型（统一权限方案 Phase C/D）

GlobalField：全局唯一的业务字段（如"工号""一级部门""成本中心编码"）。
- 多个物理列（table_columns）可认领到同一个全局字段（N→1）。
- 全局字段携带：标准名、类型、维度度量、权限角色(绑哪棵树)、字段分类(继承敏感)。

FieldCategoryToolWhitelist：字段分类 → 授权工具白名单（Phase D 核心）。
- 含义：某字段分类，允许哪些工具在"用户无该分类权限"时仍使用其字段。
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.core.db import Base


class GlobalField(Base):
    __tablename__ = "global_fields"
    __table_args__ = (UniqueConstraint("code", name="uq_global_field_code"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    data_type: Mapped[str] = mapped_column(String(16), nullable=False, default="string")
    # 报表聚合角色：'dimension' / 'measure'
    agg_role: Mapped[str] = mapped_column(String(16), nullable=False, default="dimension")
    # 权限角色：绑哪棵树/维度。'cc_code'/'org_node_code'/'employment_type'/'employment_entity'/'person'/None
    scope_role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # 字段分类（诉求2）：认领该全局字段的物理列自动归入此分类、继承敏感判定
    category_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("field_categories.id", ondelete="SET NULL"), nullable=True
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class FieldCategoryToolWhitelist(Base):
    """字段分类 → 授权工具白名单

    无该分类权限的用户，仅在白名单工具内可使用该分类字段（原值可见、可计算）。
    """
    __tablename__ = "field_category_tool_whitelist"
    __table_args__ = (
        UniqueConstraint("category_id", "tool_key", name="uq_field_cat_tool"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    category_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("field_categories.id", ondelete="CASCADE"), nullable=False
    )
    # 工具标识，如 'compensation_calc' / 'income_certificate'
    tool_key: Mapped[str] = mapped_column(String(64), nullable=False)
