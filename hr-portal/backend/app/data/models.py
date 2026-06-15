"""业务数据表 + 两棵树（标准列动态扩展架构）

设计原则：
- 业务字段以标准列存储，类型由数据库 schema 保证（不再用 raw JSONB）
- 字段元数据存到 table_columns（管理员可改标签、类型、顺序、敏感标记等）
- 业务主键由 table_columns 中 is_pk_part=true 的字段决定（动态主键）
- 同步时新增字段 → 自动 ALTER TABLE ADD COLUMN（默认 text）+ 写 table_columns
- 管理员在前端改字段类型 → 后端执行 ALTER COLUMN TYPE（需人工确认数据合规）
- 管理员删字段 → ALTER TABLE DROP COLUMN（二次确认，数据不可恢复）
- 同步时字段消失 → 保留历史列，不自动删除
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


# ===== 5 张业务表（极简 schema）=====
# 主键：BIGSERIAL id
# 业务主键：从 raw 中提取的 hash（pk_hash），保证幂等 upsert
# raw：完整源数据 JSONB
# synced_at：同步时间

class EmpRealtimeRoster(Base):
    __tablename__ = "emp_realtime_roster"
    __table_args__ = (UniqueConstraint("pk_hash", name="uq_emp_realtime_pk"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pk_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class EmpMonthlyRoster(Base):
    __tablename__ = "emp_monthly_roster"
    __table_args__ = (UniqueConstraint("pk_hash", name="uq_emp_monthly_roster_pk"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pk_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class EmpMonthlySalary(Base):
    __tablename__ = "emp_monthly_salary"
    __table_args__ = (UniqueConstraint("pk_hash", name="uq_emp_monthly_salary_pk"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pk_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class EmpMonthlyAllocation(Base):
    __tablename__ = "emp_monthly_allocation"
    __table_args__ = (UniqueConstraint("pk_hash", name="uq_emp_monthly_allocation_pk"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pk_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class CostCenterMonthly(Base):
    __tablename__ = "cost_center_monthly"
    __table_args__ = (UniqueConstraint("pk_hash", name="uq_cc_monthly_pk"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pk_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class EmpMonthlyCostClass(Base):
    __tablename__ = "emp_monthly_cost_class"
    __table_args__ = (UniqueConstraint("pk_hash", name="uq_emp_cost_class_pk"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pk_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class EmpMonthlyCostResult(Base):
    """员工月度成本分摊结果表 — 由成本分摊工具计算后存档写入，不从源端拉取。"""
    __tablename__ = "emp_monthly_cost_result"
    __table_args__ = (UniqueConstraint("pk_hash", name="uq_emp_cost_result_pk"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    pk_hash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ===== 字段元数据表（C1 核心）=====
class TableColumn(Base):
    """业务表的字段元数据。

    - 同步时：源端来什么字段就自动 INSERT 一条（首次出现时）
    - 管理员：可改 column_label / data_type / is_pk_part / is_sensitive / display_order / is_visible
    - 查询时：按 display_order 排序，按 column_code 从 raw->>{code} 提取值
    """
    __tablename__ = "table_columns"
    __table_args__ = (
        UniqueConstraint("table_name", "column_code", name="uq_table_col"),
        Index("ix_table_col_table_order", "table_name", "display_order"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    table_name: Mapped[str] = mapped_column(String(64), nullable=False)
    column_code: Mapped[str] = mapped_column(String(128), nullable=False)  # 字段编码（规范英文）
    column_label: Mapped[str] = mapped_column(String(128), nullable=False)  # 展示名
    # 源端稳定字段标识（北森 UUID）：跨同步识别同一字段，中文名变了也认得
    source_field_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    # 类型：string / number / date / datetime / bool
    data_type: Mapped[str] = mapped_column(String(16), nullable=False, default="string")

    # 是否参与业务主键（决定 pk_hash 怎么算）
    is_pk_part: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 是否敏感（用于脱敏）
    is_sensitive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 是否在列表里默认显示
    is_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 列表展示顺序（越小越靠前）
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=999)

    # 是否自动发现（true=同步时自动注册；false=管理员手动建）
    auto_discovered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 复制上月：新月份同步时从上月同业务键行带值（只填空、不覆盖）
    # 仅手工字段（auto_discovered=false）可用，接口字段不生效
    copy_from_last_month: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 「值列表」类型（data_type='enum'）的可选项，JSON 字符串数组；其它类型为 None
    enum_options: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # 报表聚合角色：'dimension'（维度，GROUP BY）/ 'measure'（度量，可聚合）
    agg_role: Mapped[str] = mapped_column(String(16), nullable=False, default="dimension")

    # 计算字段：用本表已有字段做四则运算生成的新列（同步时算好存进 raw）
    is_computed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # 公式表达式，字段以 [列编码] 引用，如 "[应发工资] + [社保] - 5000"；非计算字段为 None
    formula_expr: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 权限维度角色（用于 5 张业务表的数据权限过滤）
    # 取值：'cc_code' / 'org_node_code' / 'employment_type' / 'employment_entity' / None
    scope_role: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # 认领的全局字段 id（指向 global_fields）。NULL=未认领，走物理列自身值（回退）。
    # 认领后：label/scope_role/分类 等从全局字段继承（见 Phase C/D 解析逻辑）。
    global_field_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# ===== 两棵树（保持原结构，含 raw 字段足够灵活）=====
class CostCenterNode(Base):
    __tablename__ = "cost_center_tree"
    __table_args__ = (
        UniqueConstraint("code", name="uq_cc_tree_code"),
        Index("ix_cc_tree_parent", "parent_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("cost_center_tree.id", ondelete="SET NULL"), nullable=True
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_leaf: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class OrgNode(Base):
    __tablename__ = "org_tree"
    __table_args__ = (
        UniqueConstraint("code", name="uq_org_tree_code"),
        Index("ix_org_tree_parent", "parent_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_id: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("org_tree.id", ondelete="SET NULL"), nullable=True
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_leaf: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    manager: Mapped[str | None] = mapped_column(String(64), nullable=True)
    path: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    raw: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ===== 表注册表（方便后续遍历）=====
DATA_TABLES = {
    "emp_realtime_roster": EmpRealtimeRoster,
    "emp_monthly_roster": EmpMonthlyRoster,
    "emp_monthly_salary": EmpMonthlySalary,
    "emp_monthly_allocation": EmpMonthlyAllocation,
    "cost_center_monthly": CostCenterMonthly,
    "emp_monthly_cost_class": EmpMonthlyCostClass,
    "emp_monthly_cost_result": EmpMonthlyCostResult,
}


# ===== 动态注册表元数据（一键新建视图的注册中心）=====
class RegisteredTable(Base):
    """用户通过「新建视图」创建的业务表元数据。

    内置的 7 张表也写入此表（seed 时初始化），前端统一从这里读取表列表，
    不再硬编码。DATA_TABLES 在启动时动态加载此表中的记录。
    """
    __tablename__ = "registered_tables"
    __table_args__ = (UniqueConstraint("table_name", name="uq_registered_table_name"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    table_name: Mapped[str] = mapped_column(String(64), nullable=False)
    table_label: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 是否月度表（影响孤儿删除范围）
    is_period: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # 月度表的期间列名（默认「月份」）
    period_col: Mapped[str] = mapped_column(String(64), nullable=False, default="月份")
    # 月份来源：'field'=接口自带月份字段 / 'inject'=同步时按 MONTH_OFFSET 自动注入
    period_source: Mapped[str] = mapped_column(String(16), nullable=False, default="field")

    # 是否为内置表（内置表不允许删除）
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 是否可作为成本分摊结果表
    is_result_table: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 数据范围免控:为 True 时该表不接入 L2 数据范围过滤（显式声明无需按树管控）。
    # 默认 False = 受控:未配 scope_role 字段时数据范围引擎 fail-closed（拒绝），杜绝裸奔。
    scope_exempt: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # 图标（Element Plus icon name）
    icon: Mapped[str] = mapped_column(String(64), nullable=False, default="Grid")

    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=999)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
