"""业务数据表 + 两棵树（标准列动态扩展架构）

设计原则：
- 业务字段以标准列存储，类型由数据库 schema 保证
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
    CheckConstraint,
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


# ===== 字段元数据表（C1 核心）=====
class TableColumn(Base):
    """业务表的字段元数据。

    - 同步时：源端来什么字段就自动 INSERT 一条（首次出现时）
    - 管理员：可改 column_label / data_type / is_pk_part / is_sensitive / display_order
    - 查询时：按 display_order 排序，按 column_code 从实体列提取值
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

    # 列表展示顺序（越小越靠前）
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=999)

    # 是否自动发现（true=同步时自动注册；false=管理员手动建）
    auto_discovered: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # 复制上月：新月份同步时从上月同业务键行带值（只填空、不覆盖）
    # 仅手工字段（auto_discovered=false）可用，接口字段不生效
    copy_from_last_month: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 「值列表」类型（data_type='enum'）的可选项，JSON 字符串数组；其它类型为 None
    enum_options: Mapped[list | None] = mapped_column(JSON, nullable=True)
    enum_default: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # 报表聚合角色：'dimension'（维度，GROUP BY）/ 'measure'（度量，可聚合）
    agg_role: Mapped[str] = mapped_column(String(16), nullable=False, default="dimension")

    # 计算字段：用本表已有字段做四则运算生成的新列（同步时算好写入实体列）
    is_computed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # 公式表达式，字段以 [列编码] 引用，如 "[应发工资] + [社保] - 5000"；非计算字段为 None
    formula_expr: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 权限维度角色（用于 5 张业务表的数据权限过滤）
    # 取值：'cc_code' / 'org_node_code' / 'employment_type' / 'employment_entity' / None
    scope_role: Mapped[str | None] = mapped_column(String(32), nullable=True)

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


# ===== 两棵树（标准列结构）=====
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
    synced_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# ===== 运行时业务表注册表 =====
# 业务表不再在 ORM 中静态定义；启动时由 registered_tables + 数据库真实 schema 反射填充。
DATA_TABLES = {}


# ===== 动态注册表元数据（一键新建视图的注册中心）=====
class RegisteredTable(Base):
    """用户通过「新建视图」创建的业务表元数据。

    内置的 7 张表也写入此表（seed 时初始化），前端统一从这里读取表列表，
    不再硬编码。DATA_TABLES 在启动时动态加载此表中的记录。
    """
    __tablename__ = "registered_tables"
    __table_args__ = (
        UniqueConstraint("table_name", name="uq_registered_table_name"),
        CheckConstraint(
            "security_classification IN ('controlled_fact','sensitive_fact','person_bridge','public_reference')",
            name="ck_registered_table_security_classification",
        ),
        CheckConstraint(
            "(scope_classification_version = 0 AND security_classification = 'controlled_fact' "
            "AND scope_approved_by IS NULL AND scope_approved_at IS NULL AND scope_approval_reason IS NULL) "
            "OR (scope_classification_version > 0 AND scope_approved_by IS NOT NULL "
            "AND scope_approved_at IS NOT NULL AND scope_approval_reason IS NOT NULL "
            "AND length(trim(scope_approval_reason)) > 0)",
            name="ck_registered_table_scope_approval",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    table_name: Mapped[str] = mapped_column(String(64), nullable=False)
    table_label: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 是否月度表（影响孤儿删除范围）
    is_period: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # 月度表的期间实体列编码（默认 month）
    period_col: Mapped[str] = mapped_column(String(64), nullable=False, default="month")
    # 月份来源：'field'=接口自带月份字段 / 'inject'=同步时按 MONTH_OFFSET 自动注入
    period_source: Mapped[str] = mapped_column(String(16), nullable=False, default="field")

    # 是否为内置表（内置表不允许删除）
    is_builtin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # 是否可作为成本分摊结果表
    is_result_table: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # G3 子查询穿透：本表关联实时花名册 employee_no 的列名（如 'employee_no'）。
    # 非空时，本表缺少的人员维度（org/用工类型/主体/person）经花名册子查询解析。
    roster_join_col: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # 数据范围场景策略：person_first / cc_first / cross_filter。
    scope_strategy: Mapped[str] = mapped_column(String(32), nullable=False, default="cross_filter")

    security_classification: Mapped[str] = mapped_column(
        String(32), nullable=False, default="controlled_fact", server_default="controlled_fact"
    )
    scope_classification_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    scope_approved_by: Mapped[int | None] = mapped_column(
        BigInteger, ForeignKey("users.id", ondelete="RESTRICT", name="fk_registered_table_scope_approved_by"), nullable=True
    )
    scope_approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scope_approval_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 图标（Element Plus icon name）
    icon: Mapped[str] = mapped_column(String(64), nullable=False, default="Grid")

    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=999)

    # === 数据仓库扩展字段 (012) ===
    # 数据分层：ODS/DWD/DWS/ADS
    warehouse_layer: Mapped[str] = mapped_column(
        String(16), nullable=False, default="ODS", server_default="ODS"
    )
    # 主题域
    subject_area: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 负责人
    owner_user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    owner_name: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 来源系统
    source_system: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # 资产状态：draft/published/disabled/archived
    asset_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="published", server_default="published"
    )
    # UCP 关联（不强 FK）
    ucp_system_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    ucp_resource_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    ucp_connector_config_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    # 质量状态
    last_quality_status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="unknown", server_default="unknown"
    )
    last_quality_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class FieldGroup(Base):
    """全局一套的字段业务分组（工作信息/个人信息/银行卡…），与敏感分类独立。"""
    __tablename__ = "field_groups"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class StandardField(Base):
    __tablename__ = "standard_fields"
    __table_args__ = (
        UniqueConstraint("field_code", name="uq_standard_field_code"),
        CheckConstraint("length(trim(field_code)) > 0", name="ck_standard_field_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    field_code: Mapped[str] = mapped_column(String(64), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("master_entity_definitions.id", ondelete="RESTRICT"), nullable=True, index=True)
    group_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("field_groups.id", ondelete="RESTRICT"), nullable=True, index=True)
    display_name: Mapped[str] = mapped_column(String(128), nullable=False)
    has_history: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    business_definition: Mapped[str] = mapped_column(Text, nullable=False)
    data_type: Mapped[str] = mapped_column(String(16), nullable=False)
    value_domain: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    grain_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    permission_domain: Mapped[str] = mapped_column(String(32), nullable=False, default="public", server_default="public")
    is_permission_anchor: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class StandardFieldCategory(Base):
    __tablename__ = "standard_field_categories"

    standard_field_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("standard_fields.id", ondelete="RESTRICT"), primary_key=True)
    field_category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("field_categories.id", ondelete="RESTRICT"), primary_key=True)


class StandardFieldVersion(Base):
    __tablename__ = "standard_field_versions"
    __table_args__ = (
        UniqueConstraint("standard_field_id", "version", name="uq_standard_field_version"),
        CheckConstraint("version > 0", name="ck_standard_field_version_number"),
        CheckConstraint("revision >= 0", name="ck_standard_field_revision"),
        CheckConstraint("length(trim(field_name)) > 0 AND length(trim(business_definition)) > 0", name="ck_standard_field_definition"),
        CheckConstraint("data_type IN ('string','number','date','datetime','bool','enum')", name="ck_standard_field_type"),
        CheckConstraint("grain_level IS NULL OR grain_level IN ('coarse','fine','identifying')", name="ck_standard_field_grain"),
        CheckConstraint("permission_domain IN ('public','org','cost_center','salary','personal')", name="ck_standard_field_domain"),
        CheckConstraint("status IN ('draft','active','deprecated','archived')", name="ck_standard_field_status"),
        CheckConstraint(
            "NOT is_permission_anchor OR (data_type='string' AND permission_domain IN ('org','cost_center') "
            "AND grain_level IS NOT NULL AND grain_level IN ('coarse','fine'))", name="ck_standard_field_anchor"
        ),
        CheckConstraint(
            "(status IN ('draft','archived') AND approved_by IS NULL AND approved_at IS NULL AND approval_reason IS NULL) "
            "OR (status IN ('active','deprecated','archived') AND approved_by IS NOT NULL AND approved_at IS NOT NULL "
            "AND approval_reason IS NOT NULL AND length(trim(approval_reason)) > 0)", name="ck_standard_field_approval"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    standard_field_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("standard_fields.id", ondelete="RESTRICT"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    field_name: Mapped[str] = mapped_column(String(128), nullable=False)
    business_definition: Mapped[str] = mapped_column(Text, nullable=False)
    data_type: Mapped[str] = mapped_column(String(16), nullable=False)
    grain_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    permission_domain: Mapped[str] = mapped_column(String(32), nullable=False)
    is_permission_anchor: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    owner_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    value_domain: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="draft", server_default="draft")
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    approved_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approval_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_changed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    status_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class StandardFieldVersionCategory(Base):
    __tablename__ = "standard_field_version_categories"

    standard_field_version_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("standard_field_versions.id", ondelete="RESTRICT"), primary_key=True)
    field_category_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("field_categories.id", ondelete="RESTRICT"), primary_key=True)


class StandardFieldBinding(Base):
    __tablename__ = "standard_field_bindings"
    __table_args__ = (
        UniqueConstraint("table_column_id", name="uq_standard_binding_table_column"),
        UniqueConstraint("dataset_output_field_id", name="uq_standard_binding_output_field"),
        CheckConstraint(
            "(table_column_id IS NOT NULL AND dataset_output_field_id IS NULL) "
            "OR (table_column_id IS NULL AND dataset_output_field_id IS NOT NULL)", name="ck_standard_binding_target"
        ),
        CheckConstraint("binding_version >= 0", name="ck_standard_binding_version"),
        CheckConstraint("status IN ('unmapped','suggested','confirmed','invalid')", name="ck_standard_binding_status"),
        CheckConstraint(
            "(status='unmapped' AND standard_field_id IS NULL AND confirmed_by IS NULL AND confirmed_at IS NULL) "
            "OR (status='suggested' AND standard_field_id IS NOT NULL AND confirmed_by IS NULL AND confirmed_at IS NULL) "
            "OR (status='confirmed' AND standard_field_id IS NOT NULL AND binding_version > 0 "
            "AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL AND observed_data_type IS NOT NULL "
            "AND length(trim(observed_data_type)) > 0) "
            "OR (status='invalid' AND ((confirmed_by IS NULL AND confirmed_at IS NULL) OR "
            "(standard_field_id IS NOT NULL AND binding_version > 0 AND confirmed_by IS NOT NULL AND confirmed_at IS NOT NULL)))",
            name="ck_standard_binding_confirmation"
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    table_column_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("table_columns.id", ondelete="RESTRICT"), nullable=True)
    dataset_output_field_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("dataset_output_fields.id", ondelete="RESTRICT"), nullable=True)
    standard_field_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("standard_fields.id", ondelete="RESTRICT"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="unmapped", server_default="unmapped")
    binding_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    observed_source_field_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    observed_data_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_by: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    confirmed_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id", ondelete="RESTRICT"), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
