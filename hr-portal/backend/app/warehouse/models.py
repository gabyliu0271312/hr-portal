# -*- coding: utf-8 -*-
"""数据仓库 二期 ORM 模型

Q00 契约：
- 表名/字段名以 spec.md §5.5/§5.6 为准，不得自行发明
- 权限统一走 require_op("warehouse.governance", action)
"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import declarative_base, relationship

from app.core.db import Base


# ==================== warehouse_quality_rules (Q0301) ====================

class WarehouseQualityRule(Base):
    """数据质量规则定义

    spec.md §5.5:
    - asset_type: table/dataset/field
    - rule_type: not_null/unique/enum/date_format/referential_integrity/custom_sql
    - severity: info/warn/error
    """

    __tablename__ = "warehouse_quality_rules"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    asset_type = Column(String(16), nullable=False, comment="table/dataset/field")
    asset_code = Column(String(256), nullable=False, comment="资产编码：table_name/dataset_id/table.column")
    rule_type = Column(
        String(32), nullable=False,
        comment="not_null/unique/enum/date_format/referential_integrity/custom_sql",
    )
    rule_config = Column(JSON, nullable=False, default=dict, comment="规则参数 JSON")
    enabled = Column(Boolean, nullable=False, default=True, comment="是否启用")
    severity = Column(String(16), nullable=False, default="warn", comment="info/warn/error")
    last_run_status = Column(String(16), nullable=True, comment="最近运行状态: pass/warn/fail/error")
    last_run_at = Column(DateTime, nullable=True, comment="最近运行时间")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    runs = relationship("WarehouseQualityRun", back_populates="rule", lazy="selectin")


# ==================== warehouse_quality_runs (Q0302) ====================

class WarehouseQualityRun(Base):
    """数据质量规则执行记录

    spec.md §5.6
    """

    __tablename__ = "warehouse_quality_runs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    rule_id = Column(
        BigInteger,
        ForeignKey("warehouse_quality_rules.id", ondelete="SET NULL"),
        nullable=True,
        comment="关联质量规则 ID（删除规则后保留历史记录）",
    )
    status = Column(String(16), nullable=False, comment="pass/warn/fail/error")
    checked_count = Column(Integer, nullable=False, default=0, comment="检查总行数")
    failed_count = Column(Integer, nullable=False, default=0, comment="失败行数")
    sample_rows = Column(JSON, nullable=True, comment="失败样例数据")
    message = Column(Text, nullable=True, comment="运行消息/错误摘要")
    started_at = Column(DateTime, nullable=True, comment="开始时间")
    finished_at = Column(DateTime, nullable=True, comment="结束时间")

    rule = relationship("WarehouseQualityRule", back_populates="runs", lazy="selectin")


# ==================== warehouse_alert_rules (Q0605) ====================

class WarehouseAlertRule(Base):
    """数据仓库告警规则

    Q0605 占位：本期只实现规则保存，不实现真实通知发送。
    alert_type: quality_fail/sync_fail/build_fail/metric_fail
    """

    __tablename__ = "warehouse_alert_rules"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    alert_type = Column(String(32), nullable=False, comment="quality_fail/sync_fail/build_fail/metric_fail")
    target_code = Column(String(256), nullable=False, comment="目标资产编码")
    enabled = Column(Boolean, nullable=False, default=True)
    severity = Column(String(16), nullable=False, default="warn")
    notify_channels = Column(JSON, nullable=True, comment="通知渠道配置（占位）")
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== warehouse_model_versions (Q0507) ====================

class WarehouseModelVersion(Base):
    """模型版本历史

    Q0507: 每次 publish-v2 写入一条新版本记录；rollback 从 snapshot 恢复。
    """

    __tablename__ = "warehouse_model_versions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    model_id = Column(BigInteger, nullable=False, comment="关联 datasets.id")
    version = Column(Integer, nullable=False, comment="版本号")
    status = Column(String(16), nullable=False, default="published")
    snapshot = Column(JSON, nullable=False, comment="模型完整快照（tables/relations/output_fields/model_meta）")
    diff_snapshot = Column(JSON, nullable=True, comment="发布差异快照")
    published_by = Column(BigInteger, nullable=True, comment="发布人 user.id")
    published_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


# ==================== standardization_rules (R0102) ====================

class StandardizationRule(Base):
    """ODS→DWD 字段标准化规则

    R0101 统一决策：全部字段级转换只用一张表承载，rule_type 8 类枚举。
    规则执行顺序：rename → type_convert → value_map → unit_convert → split_merge → deduplicate → null_handling → format_standardize
    """

    __tablename__ = "standardization_rules"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    asset_type = Column(String(16), nullable=False, comment="table/dataset")
    asset_code = Column(String(256), nullable=False, comment="ODS 表名或 DataSet ID")
    rule_type = Column(
        String(32), nullable=False,
        comment="rename/type_convert/value_map/unit_convert/split_merge/deduplicate/null_handling/format_standardize",
    )
    source_field = Column(String(128), nullable=False, comment="ODS 源字段名")
    target_field = Column(String(128), nullable=False, comment="DWD 目标字段名")
    rule_config = Column(JSON, nullable=False, default=dict, comment="规则参数 JSON")
    enabled = Column(Boolean, nullable=False, default=True, comment="是否启用")
    display_order = Column(Integer, nullable=False, default=0, comment="同字段多条规则的执行顺序")
    description = Column(String(512), nullable=True, comment="规则说明/备注")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== standardization_templates (R0106) ====================

class StandardizationTemplate(Base):
    """标准化规则模板

    按业务对象（员工表、组织表等）沉淀可复用的标准化规则集。
    template_rules 存储规则快照 JSON 数组，加载时写入 standardization_rules。
    """

    __tablename__ = "standardization_templates"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False, comment="模板名称")
    description = Column(String(512), nullable=True, comment="模板描述")
    business_object = Column(String(64), nullable=False, comment="业务对象: 员工表/组织表/岗位表等")
    template_rules = Column(JSON, nullable=False, default=list, comment="规则快照 JSON 数组")
    version = Column(Integer, nullable=False, default=1, comment="版本号")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== dataset_builds (R0201) ====================

class DatasetBuild(Base):
    """数据集构建运行记录

    记录每次数据集物化执行的状态和结果。"""
    __tablename__ = "dataset_builds"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    dataset_id = Column(BigInteger, nullable=False, comment="关联 datasets.id")
    status = Column(String(16), nullable=False, default="pending", comment="pending/running/success/failed")
    layer_check_result = Column(JSON, nullable=True, comment="分层校验结果")
    row_count = Column(Integer, nullable=True, comment="输出行数")
    error_message = Column(Text, nullable=True, comment="错误摘要")
    started_at = Column(DateTime, nullable=True, comment="开始时间")
    finished_at = Column(DateTime, nullable=True, comment="结束时间")


# ==================== metric_results / metric_runs (R0301) ====================

class MetricResult(Base):
    """指标计算结果

    R0301: 按周期保存指标计算值，支持趋势展示和历史追溯。
    """

    __tablename__ = "metric_results"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    metric_id = Column(
        BigInteger, ForeignKey("warehouse_metrics.id", ondelete="CASCADE"),
        nullable=False, comment="关联 warehouse_metrics.id",
    )
    period = Column(String(32), nullable=False, comment="计算周期，如 2026-07/2026Q3/2026H1")
    value = Column(JSON, nullable=False, comment="指标值（支持单值和复合值）")
    computed_at = Column(DateTime, nullable=False, default=datetime.utcnow, comment="计算时间")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class MetricRun(Base):
    """指标计算运行记录

    R0301: 记录每次指标计算的执行状态和结果。
    """

    __tablename__ = "metric_runs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    metric_id = Column(
        BigInteger, ForeignKey("warehouse_metrics.id", ondelete="CASCADE"),
        nullable=False, comment="关联 warehouse_metrics.id",
    )
    status = Column(String(16), nullable=False, default="pending", comment="pending/running/success/failed")
    error_message = Column(Text, nullable=True, comment="错误信息")
    period = Column(String(32), nullable=True, comment="本次计算的周期")
    result_id = Column(BigInteger, ForeignKey("metric_results.id", ondelete="SET NULL"), nullable=True, comment="关联计算结果")
    started_at = Column(DateTime, nullable=True, comment="开始时间")
    finished_at = Column(DateTime, nullable=True, comment="结束时间")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


# ==================== dimensions (R0304) ====================

class Dimension(Base):
    """维度目录

    R0304: 支持层级（父子关系）和字段绑定，为指标聚合提供统一维度口径。
    使用 parent_id 自引用实现树形结构，bound_table + bound_field 绑定物理字段。
    """

    __tablename__ = "dimensions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    dimension_code = Column(String(64), nullable=False, unique=True, comment="维度编码")
    dimension_name = Column(String(128), nullable=False, comment="维度名称")
    parent_id = Column(
        BigInteger, ForeignKey("dimensions.id", ondelete="SET NULL"),
        nullable=True, comment="父维度 ID，NULL 表示根节点",
    )
    bound_table = Column(String(128), nullable=True, comment="绑定物理表名")
    bound_field = Column(String(128), nullable=True, comment="绑定物理字段名")
    description = Column(String(512), nullable=True, comment="维度说明")
    display_order = Column(Integer, nullable=False, default=0, comment="同级排序")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== dws_aggregate_definitions (R0307) ====================

class DwsAggregateDefinition(Base):
    """DWD → DWS 聚合定义

    R0307: 基于指标定义和维度字段，定义从 DWD 明细到 DWS 汇总的聚合口径。
    为后续 SQL/View 自动生成提供结构化输入。
    """

    __tablename__ = "dws_aggregate_definitions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False, comment="聚合定义名称")
    metric_id = Column(
        BigInteger, ForeignKey("warehouse_metrics.id", ondelete="SET NULL"),
        nullable=True, comment="关联指标 ID",
    )
    source_dataset_id = Column(
        BigInteger, ForeignKey("datasets.id", ondelete="SET NULL"),
        nullable=True, comment="来源 DWD DataSet ID",
    )
    group_by = Column(JSON, nullable=False, default=list, comment="分组维度字段列表")
    filter = Column(JSON, nullable=True, comment="过滤条件 JSON")
    aggregation = Column(String(16), nullable=False, default="sum", comment="聚合方式: sum/count/avg/max/min")
    measure_field = Column(String(128), nullable=True, comment="度量字段名")
    time_grain = Column(String(16), nullable=True, comment="时间粒度: day/week/month/quarter/year")
    business_definition = Column(Text, nullable=True, comment="业务口径说明")
    status = Column(String(16), nullable=False, default="draft", comment="draft/published/archived")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== snapshot_jobs / snapshot_runs (R0401) ====================

class SnapshotJob(Base):
    """快照任务定义

    R0401: 定义快照对象、周期和保留策略。
    """

    __tablename__ = "snapshot_jobs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False, comment="快照任务名称")
    source_table = Column(String(128), nullable=False, comment="源表名")
    target_table = Column(String(128), nullable=False, comment="快照目标表名")
    snapshot_keys = Column(JSON, nullable=False, default=list, comment="快照对象标识字段（如 employee_id）")
    period = Column(String(16), nullable=False, default="monthly", comment="周期: daily/weekly/monthly/quarterly/yearly")
    retention = Column(Integer, nullable=False, default=12, comment="保留最近 N 期，超出自动清理")
    enabled = Column(Boolean, nullable=False, default=True)
    last_run_at = Column(DateTime, nullable=True, comment="上次执行时间")
    last_status = Column(String(16), nullable=True, comment="上次执行状态")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class SnapshotRun(Base):
    """快照任务执行记录"""

    __tablename__ = "snapshot_runs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    job_id = Column(BigInteger, ForeignKey("snapshot_jobs.id", ondelete="CASCADE"), nullable=False, comment="关联快照任务")
    status = Column(String(16), nullable=False, default="pending", comment="pending/running/success/failed")
    period_value = Column(String(32), nullable=False, comment="快照周期值，如 2026-07")
    row_count = Column(Integer, nullable=True, comment="快照行数")
    error_message = Column(Text, nullable=True, comment="错误信息")
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


# ==================== scd_configs / scd_runs (R0403) ====================

class ScdConfig(Base):
    """SCD Type 2 拉链配置

    定义业务键、时间字段、需要比较变更的字段。
    执行时：新增记录直接插入，变更记录关闭旧行+写入新行。
    """

    __tablename__ = "scd_configs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False, comment="SCD 配置名称")
    source_table = Column(String(128), nullable=False, comment="来源表")
    target_table = Column(String(128), nullable=False, comment="拉链表目标表")
    business_key = Column(String(256), nullable=False, comment="业务主键字段，逗号分隔")
    effective_from_field = Column(String(64), nullable=False, default="effective_from", comment="生效起始字段名")
    effective_to_field = Column(String(64), nullable=False, default="effective_to", comment="生效结束字段名")
    current_flag_field = Column(String(64), nullable=False, default="current_flag", comment="当前标记字段名")
    compare_fields = Column(JSON, nullable=False, default=list, comment="需比较变更的字段列表")
    enabled = Column(Boolean, nullable=False, default=True)
    last_run_at = Column(DateTime, nullable=True)
    last_status = Column(String(16), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class ScdRun(Base):
    """SCD 执行记录"""

    __tablename__ = "scd_runs"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    config_id = Column(BigInteger, ForeignKey("scd_configs.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(16), nullable=False, default="pending", comment="pending/running/success/failed")
    new_count = Column(Integer, nullable=True, comment="新增记录数")
    updated_count = Column(Integer, nullable=True, comment="变更记录数")
    closed_count = Column(Integer, nullable=True, comment="旧记录关闭数")
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


# ==================== ads_definitions (R0701) ====================

class AdsDefinition(Base):
    """DWS → ADS 消费资产组装定义

    将 DWS 聚合/数据集/模型组装为面向 BI/API/推送/报表的消费资产。
    """

    __tablename__ = "ads_definitions"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    name = Column(String(256), nullable=False, comment="ADS 消费资产名称")
    description = Column(Text, nullable=True, comment="描述")
    source_type = Column(String(32), nullable=False, comment="来源类型: dws_aggregate/dataset/model")
    source_id = Column(BigInteger, nullable=False, comment="来源 DWS 聚合/数据集/模型 ID")
    source_label = Column(String(128), nullable=True, comment="来源可读标签")
    dimension_refs = Column(JSON, nullable=False, default=list, comment="关联维度")
    output_fields = Column(JSON, nullable=False, default=list, comment="输出字段定义")
    preset_filters = Column(JSON, nullable=True, comment="预置过滤条件")
    subject_area = Column(String(64), nullable=True, comment="主题域")
    consume_domain = Column(String(64), nullable=True, comment="消费域")
    owner_name = Column(String(64), nullable=True, comment="负责人")
    publish_status = Column(String(16), nullable=False, default="draft", comment="draft/published/archived")
    publish_targets = Column(JSON, nullable=True, comment="发布目标")
    permissions_inherited_from = Column(JSON, nullable=True, comment="权限继承来源")
    lineage_snapshot = Column(JSON, nullable=True, comment="血缘快照")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== warehouse_lineage_edges (Z02) ====================

class WarehouseLineageEdge(Base):
    """自动血缘边 — 关键操作（标准化/SCD/快照/ADS发布/指标计算）执行时自动写入"""

    __tablename__ = "warehouse_lineage_edges"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    source_asset = Column(String(256), nullable=False, comment="源资产标识")
    target_asset = Column(String(256), nullable=False, comment="目标资产标识")
    operation = Column(String(64), nullable=False, comment="操作类型")
    operator = Column(String(64), nullable=True, comment="操作人")
    run_id = Column(BigInteger, nullable=True, comment="关联运行 ID")
    edge_metadata = Column(JSON, nullable=True, comment="血缘 metadata（definition_id/rule_ids/version）")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
