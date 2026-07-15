# -*- coding: utf-8 -*-
"""数据仓库 Pydantic schemas (请求/响应模型)

命名约定：
- *In   = 请求体（创建/更新入参）
- *Out  = 响应体（返回前端）
"""
from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ==================== 枚举 ====================

WAREHOUSE_LAYERS = ("ODS", "DWD", "DWS", "ADS")
ASSET_STATUSES = ("draft", "published", "disabled", "archived")
QUALITY_STATUSES = ("unknown", "pass", "warn", "fail")
METRIC_TYPES = ("count", "sum", "ratio", "derived", "text")
AGG_ROLES = ("dimension", "measure")


# ==================== UCP 协同 ====================

class UcpInfoOut(BaseModel):
    """UCP 协同信息（仅展示/跳转字段，禁止包含 secret）"""
    enabled: bool = False
    system_id: Optional[int] = None
    resource_id: Optional[int] = None
    connector_config_id: Optional[int] = None
    config_route: Optional[str] = None


# ==================== 数据资产 ====================

class WarehouseAssetOut(BaseModel):
    """资产列表项"""
    table_name: str
    table_label: str
    description: Optional[str] = None
    warehouse_layer: str = "ODS"
    subject_area: Optional[str] = None
    owner_name: Optional[str] = None
    source_system: Optional[str] = None
    asset_status: str = "published"
    last_quality_status: str = "unknown"
    columns_count: Optional[int] = None
    last_synced_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class WarehouseAssetDetailOut(WarehouseAssetOut):
    """资产详情（含完整信息）"""
    owner_user_id: Optional[int] = None
    is_builtin: bool = False
    display_order: int = 999
    created_at: Optional[datetime] = None

    # UCP 协同（结构化对象）
    ucp: UcpInfoOut = UcpInfoOut()

    # UCP 桥接 ID（原始字段，保留向后兼容）
    ucp_system_id: Optional[int] = None
    ucp_resource_id: Optional[int] = None
    ucp_connector_config_id: Optional[int] = None
    last_quality_checked_at: Optional[datetime] = None

    # 运行信息
    period_col: Optional[str] = None
    period_source: Optional[str] = None
    is_period: bool = False
    scope_strategy: Optional[str] = None


class WarehouseAssetUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    """资产更新入参"""
    table_label: Optional[str] = None
    description: Optional[str] = None
    warehouse_layer: Optional[str] = None
    subject_area: Optional[str] = None
    owner_user_id: Optional[int] = None
    owner_name: Optional[str] = None
    source_system: Optional[str] = None
    asset_status: Optional[str] = None
    scope_strategy: Optional[str] = None
    ucp_system_id: Optional[int] = None
    ucp_resource_id: Optional[int] = None
    ucp_connector_config_id: Optional[int] = None


# ==================== 数据模型 ====================

class WarehouseModelCreateIn(BaseModel):
    model_config = {"extra": "forbid"}
    """创建模型"""
    name: str = Field(..., max_length=64)
    label: Optional[str] = Field(None, max_length=128)
    description: Optional[str] = None
    warehouse_layer: str = "DWD"
    subject_area: Optional[str] = None
    owner_user_id: Optional[int] = None
    owner_name: Optional[str] = None
    business_definition: Optional[str] = None
    tables: list["ModelTableIn"] = []
    relations: list["ModelRelationIn"] = []


class ModelTableIn(BaseModel):
    model_config = {"extra": "forbid"}
    table_name: str
    alias: str


class ModelRelationIn(BaseModel):
    model_config = {"extra": "forbid"}
    left_alias: str
    right_alias: str
    join_type: str = "left"
    left_keys: list[str] = []
    right_keys: list[str] = []
    cardinality: str = "1:N"


class WarehouseModelOut(BaseModel):
    """模型列表项"""
    id: int
    name: str
    label: Optional[str] = None
    description: Optional[str] = None
    warehouse_layer: str = "DWD"
    subject_area: Optional[str] = None
    owner_name: Optional[str] = None
    status: str = "draft"
    version: int = 1
    table_count: Optional[int] = None
    published_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class WarehouseModelDetailOut(WarehouseModelOut):
    """模型详情"""
    owner_user_id: Optional[int] = None
    business_definition: Optional[str] = None
    published_by: Optional[int] = None
    tables: list[dict] = []
    relations: list[dict] = []
    output_fields: list["DatasetOutputFieldOut"] = []


class WarehouseModelUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    """模型更新"""
    name: Optional[str] = None
    label: Optional[str] = None
    description: Optional[str] = None
    warehouse_layer: Optional[str] = None
    subject_area: Optional[str] = None
    owner_user_id: Optional[int] = None
    owner_name: Optional[str] = None
    business_definition: Optional[str] = None


# ==================== 输出字段 ====================

class DatasetOutputFieldIn(BaseModel):
    model_config = {"extra": "forbid"}
    source_alias: str = Field(..., max_length=64)
    source_column: str = Field(..., max_length=128)
    output_code: str = Field(..., max_length=128)
    output_label: str = Field(..., max_length=128)
    data_type: str = "string"
    description: Optional[str] = None
    agg_role: str = "dimension"
    is_sensitive: bool = False
    is_visible: bool = True
    display_order: int = 0


class DatasetOutputFieldOut(DatasetOutputFieldIn):
    id: int
    dataset_id: int

    model_config = {"from_attributes": True}


# ==================== 指标 ====================

class WarehouseMetricCreateIn(BaseModel):
    model_config = {"extra": "forbid"}
    metric_code: str = Field(..., max_length=64)
    metric_name: str = Field(..., max_length=128)
    metric_type: Literal["count", "sum", "ratio", "derived", "text"] = "derived"
    subject_area: Optional[str] = None
    business_definition: Optional[str] = None
    calculation_desc: Optional[str] = None
    formula_expr: Optional[str] = None
    stat_period: Optional[str] = None
    related_dataset_id: Optional[int] = None
    related_fields: list[str] = []
    owner_user_id: Optional[int] = None
    owner_name: Optional[str] = None


class WarehouseMetricOut(BaseModel):
    """指标列表项"""
    id: int
    metric_code: str
    metric_name: str
    metric_type: str = "derived"
    business_definition: Optional[str] = None
    subject_area: Optional[str] = None
    related_dataset_id: Optional[int] = None
    owner_name: Optional[str] = None
    status: str = "draft"
    version: int = 1
    published_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class WarehouseMetricDetailOut(WarehouseMetricOut):
    """指标详情"""
    owner_user_id: Optional[int] = None
    calculation_desc: Optional[str] = None
    formula_expr: Optional[str] = None
    formula_sql: Optional[str] = None
    stat_period: Optional[str] = None
    related_fields: list = []
    published_by: Optional[int] = None
    updated_at: Optional[datetime] = None


class WarehouseMetricUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    metric_name: Optional[str] = None
    metric_type: Optional[Literal["count", "sum", "ratio", "derived", "text"]] = None
    subject_area: Optional[str] = None
    business_definition: Optional[str] = None
    calculation_desc: Optional[str] = None
    formula_expr: Optional[str] = None
    stat_period: Optional[str] = None
    related_dataset_id: Optional[int] = None
    related_fields: Optional[list[str]] = None
    owner_user_id: Optional[int] = None
    owner_name: Optional[str] = None


# ==================== 分页辅助 ====================

class MetricPaginatedOut(BaseModel):
    """指标分页响应"""
    total: int
    page: int
    page_size: int
    items: list[WarehouseMetricOut]

    model_config = {"from_attributes": True}


# ==================== 影响分析 ====================

class ImpactRefOut(BaseModel):
    """影响分析引用对象"""
    type: str  # dataset / report / metric / notification
    id: int
    name: str
    usage: str = ""
    risk_level: str = "low"  # low / medium / high
    blocking: bool = False
    blocking_reason: str = ""
    route: Optional[str] = None  # 前端跳转路径


# ==================== 预览 ====================

# ==================== 分页 ====================

class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int
    items: list


# ==================== 来源与开放 (T0202) ====================

class SyncHistoryEntryOut(BaseModel):
    """同步历史条目（T0210）"""
    source_type: str = Field(description="datasource / pushtarget")
    source_name: str
    source_id: int
    run_id: int
    status: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    rows: Optional[int] = None
    message: Optional[str] = None
    triggered_by: Optional[str] = None


class SyncHistoryOut(BaseModel):
    """同步历史聚合响应"""
    table_name: str
    entries: list[SyncHistoryEntryOut] = []

class ConnectionEndpointSummary(BaseModel):
    """统一端点摘要 DTO — 覆盖 DataSource/PushTarget/UCP Resource/API Expose

    用于资产详情"来源与开放"Tab 聚合展示。不包含 secret。
    """
    endpoint_type: Literal["pull", "push", "expose", "ucp_resource"] = Field(
        description="端点方向: pull=入仓来源, push=出仓目标, expose=API暴露, ucp_resource=UCP资源"
    )
    endpoint_id: int = Field(description="DataSource.id / PushTarget.id / ConnectorResource.id")
    name: str = Field(description="端点名称（如 DataSource table_label / PushTarget name）")
    owner: str = Field(description="底层 owner: datasource / pushtarget / ucp")
    status: str = Field("unknown", description="运行状态: active/inactive/unknown")
    is_active: bool = False
    schedule: Optional[str] = Field(None, description="调度 cron 或文字描述")
    last_run_at: Optional[datetime] = Field(None, description="最近执行时间")
    last_status: Optional[str] = Field(None, description="最近执行状态: success/failed/running")
    last_rows: Optional[int] = Field(None, description="最近执行影响行数")
    last_message: Optional[str] = Field(None, description="最近执行消息/错误摘要")
    has_secrets: bool = Field(False, description="是否已配置凭证（仅布尔，不泄露内容）")
    config_route: Optional[str] = Field(None, description="配置页跳转路由名")
    summary_extra: dict = Field(default_factory=dict, description="附加摘要（字段数、映射数、UCP系统名等）")

    model_config = {"from_attributes": False}


class AssetEndpointsOut(BaseModel):
    """资产级端点聚合响应"""
    table_name: str
    pulls: list[ConnectionEndpointSummary] = []
    pushes: list[ConnectionEndpointSummary] = []
    exposes: list[ConnectionEndpointSummary] = []
    ucp_resources: list[ConnectionEndpointSummary] = []


# ==================== 二期 Feature Flag (Q0002) ====================

class WarehouseFeatureFlagsOut(BaseModel):
    """二期灰度开关（供前端统一读取，避免每页各自判断）"""
    ucp_available: bool = False
    phase2_enabled: bool = False
    quality_rules: bool = False
    lineage: bool = False
    ucp_proxy: bool = False
    modeling_v2: bool = False
    monitoring: bool = False
    layer_enhancement: bool = True
    ods_dwd_automation: bool = False
    metric_automation: bool = False
    l4_full_auto: bool = False


# ==================== 批量分层 (Q0104) ====================

class WarehouseAssetBatchLayerIn(BaseModel):
    model_config = {"extra": "forbid"}
    """批量修改资产分层入参"""
    table_names: list[str] = Field(..., min_length=1, max_length=200)
    warehouse_layer: str


class WarehouseAssetBatchLayerItemOut(BaseModel):
    """单项结果"""
    table_name: str
    success: bool
    message: str = ""


class WarehouseAssetBatchLayerOut(BaseModel):
    """批量修改结果"""
    warehouse_layer: str
    success_count: int = 0
    fail_count: int = 0
    items: list[WarehouseAssetBatchLayerItemOut] = []


# ==================== 分层统计 (Q0106) ====================

class WarehouseLayerStatOut(BaseModel):
    """单个分层的资产统计"""
    code: str
    count: int = 0


class WarehouseLayerStatsOut(BaseModel):
    """分层统计聚合"""
    total: int = 0
    items: list[WarehouseLayerStatOut] = []


# ==================== 血缘 (Q02) ====================

# 血缘节点类型（Q0201）
LINEAGE_NODE_TYPES = (
    "table", "field", "dataset", "metric",
    "report", "notification", "datasource", "ucp_resource",
)

# 血缘边关系类型（Q0202）
LINEAGE_RELATION_TYPES = ("sync", "reference", "calculation", "output")


class LineageNodeOut(BaseModel):
    """血缘节点 DTO（Q0201）

    统一字段：id、type、label、status、risk_level。
    8 种节点类型：table/field/dataset/metric/report/notification/datasource/ucp_resource。
    """
    id: str = Field(description="节点唯一标识，格式: {type}:{id}")
    type: str = Field(description=f"节点类型: {'/'.join(LINEAGE_NODE_TYPES)}")
    label: str = Field(description="节点显示名称")
    status: str = Field("unknown", description="节点状态: draft/published/archived/active/unknown")
    risk_level: str = Field("low", description="风险级别: low/medium/high")
    detail_route: Optional[str] = Field(None, description="详情页跳转路由")
    # UCP 资源节点扩展（仅 ucp_resource 类型有值）
    ucp_summary: Optional[dict] = Field(None, description="UCP 资源摘要，不含 secret")


class LineageEdgeOut(BaseModel):
    """血缘边 DTO（Q0202）

    direction: upstream（上游来源）/ downstream（下游影响）
    relation_type: sync（同步）/ reference（引用）/ calculation（计算依赖）/ output（输出字段）
    """
    source_id: str = Field(description="源节点 id")
    target_id: str = Field(description="目标节点 id")
    direction: str = Field(description="方向: upstream / downstream")
    relation_type: str = Field(description=f"关系类型: {'/'.join(LINEAGE_RELATION_TYPES)}")
    label: str = Field("", description="关系标签（如 '关联', '输出字段', '计算依赖'）")
    detail_route: Optional[str] = Field(None, description="关联详情跳转路由")


class LineageGraphOut(BaseModel):
    """血缘图响应 DTO"""
    nodes: list[LineageNodeOut] = []
    edges: list[LineageEdgeOut] = []
    truncated: bool = Field(False, description="是否因 depth/limit 截断")
    truncation_message: Optional[str] = Field(None, description="截断提示信息")


# ==================== 质量规则 (Q03) ====================

QUALITY_RULE_TYPES = (
    "not_null", "unique", "enum", "date_format",
    "referential_integrity", "custom_sql",
)
QUALITY_SEVERITIES = ("info", "warn", "error")
QUALITY_RUN_STATUSES = ("pass", "warn", "fail", "error")

# 二期可执行的规则类型（Q0309: referential_integrity/custom_sql 暂不支持）
EXECUTABLE_RULE_TYPES = ("not_null", "unique", "enum", "date_format")


class WarehouseQualityRuleIn(BaseModel):
    model_config = {"extra": "forbid"}
    """质量规则创建/更新入参"""
    asset_type: str = Field(..., max_length=16, description="table/dataset/field")
    asset_code: str = Field(..., max_length=256, description="资产编码")
    rule_type: str = Field(..., max_length=32, description="规则类型")
    rule_config: dict = Field(default_factory=dict, description="规则参数 JSON")
    enabled: bool = True
    severity: str = Field("warn", description="info/warn/error")


class WarehouseQualityRuleUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    """质量规则部分更新入参"""
    rule_config: Optional[dict] = None
    enabled: Optional[bool] = None
    severity: Optional[str] = None


class WarehouseQualityRuleOut(BaseModel):
    """质量规则响应"""
    id: int
    asset_type: str
    asset_code: str
    rule_type: str
    rule_config: dict
    enabled: bool
    severity: str
    last_run_status: Optional[str] = None
    last_run_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class WarehouseQualityRunOut(BaseModel):
    """质量运行记录响应"""
    id: int
    rule_id: Optional[int] = None
    status: str
    checked_count: int = 0
    failed_count: int = 0
    sample_rows: Optional[list] = None
    message: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class QualityRunTriggerOut(BaseModel):
    """质量规则执行触发响应"""
    run_id: int
    status: str
    message: str = ""


class QualityAlertSummaryOut(BaseModel):
    """质量告警摘要（Q0313）"""
    total_rules: int = 0
    failed_rules: int = 0
    warning_rules: int = 0
    by_severity: dict = Field(default_factory=dict, description="按 severity 分组：{info:n, warn:n, error:n}")


# ==================== UCP 薄代理 (Q04) ====================


class UcpSystemOut(BaseModel):
    """UCP 系统摘要（Q0401/Q0402）"""
    id: int
    name: str
    status: str = "unknown"


class UcpResourceOut(BaseModel):
    """UCP 资源摘要（Q0403/Q0404）"""
    id: int
    system_id: int
    name: str
    resource_type: str = ""
    status: str = "unknown"
    last_test_at: Optional[str] = None
    last_run_at: Optional[str] = None
    config_route: Optional[str] = None


class UcpResourceStatusOut(BaseModel):
    """UCP 资源状态（Q0405）"""
    resource_id: int
    status: str = "unknown"
    message: str = ""
    enabled: bool = False


class UcpResourcePreviewOut(BaseModel):
    """UCP 资源预览（Q0406）"""
    resource_id: int
    columns: list[str] = []
    rows: list[dict] = []
    total: int = 0
    truncated: bool = False
    message: str = ""


# ==================== 建模 V2 (Q05) ====================


class ModelVersionOut(BaseModel):
    """模型版本历史条目（Q0507）"""
    version: int
    status: str
    published_at: Optional[datetime] = None
    published_by: Optional[int] = None
    diff_snapshot: Optional[dict] = None


class ModelVersionRollbackIn(BaseModel):
    model_config = {"extra": "forbid"}
    """回滚入参（Q0507）"""
    target_version: int = Field(..., ge=1)


class ModelPreviewV2Out(BaseModel):
    """V2 预览响应（Q0509）"""
    sql: str = ""
    sql_explanation: str = ""
    items: list[dict] = []
    columns: list[str] = []
    total: Optional[int] = None
    errors: list[dict] = Field(default_factory=list, description="错误定位列表 [{node_id, message}]")


# ==================== 执行监控 (Q06) ====================

class WarehouseRunSummaryOut(BaseModel):
    """统一仓内运行事件 DTO（Q0601）"""
    run_type: str = Field(description="sync/quality/dataset_build/metric_run/snapshot")
    run_id: int
    status: str
    target_label: str = ""
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    duration: Optional[float] = Field(None, description="耗时秒数")
    error_summary: Optional[str] = None
    source_link: Optional[str] = Field(None, description="来源跳转路由")


class WarehouseAlertRuleIn(BaseModel):
    model_config = {"extra": "forbid"}
    """告警规则创建/更新入参（Q0605）"""
    alert_type: str = Field(..., max_length=32, description="quality_fail/sync_fail/build_fail/metric_fail")
    target_code: str = Field(..., max_length=256)
    enabled: bool = True
    severity: str = Field("warn")
    notify_channels: Optional[dict] = None


class WarehouseAlertRuleOut(BaseModel):
    """告警规则响应（Q0605）"""
    id: int
    alert_type: str
    target_code: str
    enabled: bool
    severity: str
    notify_channels: Optional[dict] = None
    last_triggered_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ==================== 标准化规则 (R0102-R0107) ====================

STANDARDIZATION_RULE_TYPES = (
    "rename", "type_convert", "value_map", "unit_convert",
    "split_merge", "deduplicate", "null_handling", "format_standardize",
)


class StandardizationRuleIn(BaseModel):
    model_config = {"extra": "forbid"}
    """标准化规则创建/更新入参"""
    asset_type: str = Field(..., max_length=16, description="table/dataset")
    asset_code: str = Field(..., max_length=256, description="ODS 表名或 DataSet ID")
    rule_type: str = Field(..., max_length=32, description="8 类枚举之一")
    source_field: str = Field(..., max_length=128, description="ODS 源字段名")
    target_field: str = Field(..., max_length=128, description="DWD 目标字段名")
    rule_config: dict = Field(default_factory=dict, description="规则参数 JSON")
    enabled: bool = True
    display_order: int = Field(0, ge=0)
    description: Optional[str] = Field(None, max_length=512)


class StandardizationRuleUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    """标准化规则部分更新入参"""
    rule_config: Optional[dict] = None
    enabled: Optional[bool] = None
    display_order: Optional[int] = Field(None, ge=0)
    description: Optional[str] = Field(None, max_length=512)


class StandardizationRuleOut(BaseModel):
    """标准化规则响应"""
    id: int
    asset_type: str
    asset_code: str
    rule_type: str
    source_field: str
    target_field: str
    rule_config: dict
    enabled: bool
    display_order: int = 0
    description: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ==================== 标准化模板 (R0106) ====================


class TemplateRuleEntry(BaseModel):
    """模板内单条规则快照"""
    rule_type: str = Field(..., max_length=32)
    source_field: str = Field(..., max_length=128)
    target_field: str = Field(..., max_length=128)
    rule_config: dict = Field(default_factory=dict)
    display_order: int = Field(0, ge=0)
    description: Optional[str] = Field(None, max_length=512)


class StandardizationTemplateIn(BaseModel):
    model_config = {"extra": "forbid"}
    """创建/更新模板入参"""
    name: str = Field(..., max_length=128)
    description: Optional[str] = Field(None, max_length=512)
    business_object: str = Field(..., max_length=64, description="业务对象: 员工表/组织表/岗位表等")
    template_rules: list[TemplateRuleEntry] = Field(default_factory=list, description="规则快照列表")


class StandardizationTemplateUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    """部分更新模板"""
    name: Optional[str] = Field(None, max_length=128)
    description: Optional[str] = Field(None, max_length=512)
    template_rules: Optional[list[TemplateRuleEntry]] = None


class StandardizationTemplateOut(BaseModel):
    """模板响应"""
    id: int
    name: str
    description: Optional[str] = None
    business_object: str
    template_rules: list[dict] = []
    version: int = 1
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class TemplateLoadRequest(BaseModel):
    model_config = {"extra": "forbid"}
    """模板加载请求"""
    asset_code: str = Field(..., max_length=256, description="目标 ODS 表名或 DataSet ID")
    asset_type: str = Field("table", max_length=16, description="table/dataset")
    on_conflict: str = Field("skip", description="冲突策略: skip(跳过已有规则) / overwrite(覆盖已有规则)")


# ==================== 预览 (R0107) ====================


class PreviewRuleInput(BaseModel):
    """预览用规则输入（不要求已保存）"""
    rule_type: str = Field(..., max_length=32)
    source_field: str = Field(..., max_length=128)
    target_field: str = Field(..., max_length=128)
    rule_config: dict = Field(default_factory=dict)
    display_order: int = Field(0, ge=0)


class PreviewRequest(BaseModel):
    model_config = {"extra": "forbid"}
    """预览请求"""
    asset_code: str = Field(..., max_length=256, description="ODS 表名或 DataSet ID")
    sample_size: int = Field(20, ge=1, le=500, description="采样行数")
    rule_ids: list[int] = Field(default_factory=list, description="已保存规则 ID 列表")
    inline_rules: list[PreviewRuleInput] = Field(
        default_factory=list, description="未保存的规则（用于保存前预览）"
    )


class FieldChangeOut(BaseModel):
    """单字段变更"""
    field: str
    before: Optional[str] = None
    after: Optional[str] = None
    changed: bool = False
    error: Optional[str] = None


class PreviewRowOut(BaseModel):
    """预览单行"""
    row_index: int
    fields: list[FieldChangeOut] = []


class PreviewSummary(BaseModel):
    """预览摘要"""
    total_sampled: int = 0
    rows_with_changes: int = 0
    fields_changed: int = 0
    errors: int = 0
    rows_to_drop: int = 0  # null_handling drop_row 会丢弃的行数
    rows_to_dedup: int = 0  # deduplicate 会移除的重复行数


class PreviewOut(BaseModel):
    """预览响应"""
    asset_code: str
    sample_size: int
    columns: list[str] = []
    rows: list[PreviewRowOut] = []
    summary: PreviewSummary = PreviewSummary()


# ==================== DWD 视图生成 (R0108) ====================


class DwdViewGenerateRequest(BaseModel):
    model_config = {"extra": "forbid"}
    """DWD 视图生成请求"""
    asset_code: str = Field(..., max_length=256, description="ODS 表名")
    asset_type: str = Field("table", max_length=16, description="table/dataset")


class DwdViewGenerateOut(BaseModel):
    """DWD 视图生成响应"""
    dataset_id: int
    dataset_name: str
    warehouse_layer: str = "DWD"
    version: int = 1
    view_sql: str = ""
    output_fields_count: int = 0
    rules_count: int = 0


# ==================== 数据集构建 (R0201-R0202) ====================

BUILD_STATUSES = ("pending", "running", "success", "failed")


class DatasetBuildOut(BaseModel):
    """构建运行记录响应"""
    id: int
    dataset_id: int
    status: str
    layer_check_result: Optional[dict] = None
    row_count: Optional[int] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ==================== 刷新策略 (R0204) ====================

REFRESH_STRATEGIES = ("manual", "full", "incremental")


class RefreshStrategyUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    refresh_strategy: str = Field(..., max_length=32, description="manual/full/incremental")


class RefreshStrategyOut(BaseModel):
    dataset_id: int
    refresh_strategy: str = "manual"
    build_mode: str = "virtual"


# ==================== 指标计算 (R0302) ====================

METRIC_RUN_STATUSES = ("pending", "running", "success", "failed")
METRIC_COMPUTE_PERIODS = ("day", "week", "month", "quarter", "year")


class MetricResultRowOut(BaseModel):
    """指标计算结果明细行"""
    id: int
    result_id: int
    metric_id: int
    period: str
    row_index: int
    dimension_values: dict
    measure_values: dict
    value: Optional[Any] = None
    computed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class MetricResultOut(BaseModel):
    """指标计算结果"""
    id: int
    metric_id: int
    period: str
    value: dict
    computed_at: Optional[datetime] = None
    rows: list[MetricResultRowOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class MetricRunOut(BaseModel):
    """指标计算运行记录"""
    id: int
    metric_id: int
    status: str
    error_message: Optional[str] = None
    period: Optional[str] = None
    result_id: Optional[int] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class MetricComputeIn(BaseModel):
    model_config = {"extra": "forbid"}
    """触发指标计算入参"""
    period: str = Field(..., max_length=32, description="计算周期: 2026-07/2026Q3/2026H1")


class MetricComputeOut(BaseModel):
    """指标计算结果出参"""
    run_id: int
    metric_id: int
    status: str
    period: str
    value: Optional[dict] = None
    error_message: Optional[str] = None


class MetricRecalcIn(BaseModel):
    model_config = {"extra": "forbid"}
    """触发指标重算入参"""
    period: str = Field(..., max_length=32, description="重算周期")


class MetricResultsPaginatedOut(BaseModel):
    """指标结果分页"""
    total: int
    page: int
    page_size: int
    items: list[MetricResultOut]


# ==================== 维度定义 (R0305) ====================


class DimensionCreateIn(BaseModel):
    model_config = {"extra": "forbid"}
    dimension_code: str = Field(..., max_length=64)
    dimension_name: str = Field(..., max_length=128)
    parent_id: Optional[int] = None
    source_dataset_id: int = Field(..., description="数据集ID（必填，仅限DWD层）")
    bound_field: str = Field(..., max_length=128)
    description: Optional[str] = None
    display_order: int = 0


class DimensionUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    dimension_name: Optional[str] = None
    parent_id: Optional[int] = None
    source_dataset_id: Optional[int] = None
    bound_field: Optional[str] = None
    description: Optional[str] = None
    display_order: Optional[int] = None


class DimensionOut(BaseModel):
    id: int
    dimension_code: str
    dimension_name: str
    parent_id: Optional[int] = None
    source_dataset_id: Optional[int] = None
    bound_table: Optional[str] = None
    bound_field: Optional[str] = None
    description: Optional[str] = None
    display_order: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DimensionTreeNode(BaseModel):
    """维度树节点"""
    id: int
    dimension_code: str
    dimension_name: str
    parent_id: Optional[int] = None
    source_dataset_id: Optional[int] = None
    bound_table: Optional[str] = None
    bound_field: Optional[str] = None
    description: Optional[str] = None
    display_order: int = 0
    children: list["DimensionTreeNode"] = []

    model_config = {"from_attributes": True}


class DimensionImpactOut(BaseModel):
    """维度删除前影响分析"""
    dimension_id: int
    dimension_code: str
    referenced_by_aggregates: list[dict] = Field(default_factory=list, description="引用该维度的聚合定义")
    referenced_by_children: list[dict] = Field(default_factory=list, description="引用该维度的子维度")
    can_delete: bool = False


# ==================== DWS 聚合定义 (R0308) ====================

DWS_AGGREGATIONS = ("sum", "count", "avg", "max", "min")
DWS_TIME_GRAINS = ("day", "week", "month", "quarter", "year")
DWS_AGG_STATUSES = ("draft", "published", "archived")


class DwsAggregateDefinitionCreateIn(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(..., max_length=128, description="聚合编码（dws_ 开头）")
    label: str = Field(..., max_length=128, description="聚合展示名称")
    metric_id: Optional[int] = None
    source_dataset_id: Optional[int] = None
    group_by: list[str] = Field(default_factory=list, description="分组维度字段列表")
    filter: Optional[dict] = None
    time_grain: Optional[str] = None
    business_definition: Optional[str] = None


class DwsAggregateDefinitionUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    name: Optional[str] = None
    label: Optional[str] = None
    metric_id: Optional[int] = None
    source_dataset_id: Optional[int] = None
    group_by: Optional[list[str]] = None
    filter: Optional[dict] = None
    time_grain: Optional[str] = None
    business_definition: Optional[str] = None


class DwsAggregateDefinitionOut(BaseModel):
    id: int
    name: str
    label: Optional[str] = None
    metric_id: Optional[int] = None
    source_dataset_id: Optional[int] = None
    group_by: list = []
    filter: Optional[dict] = None
    time_grain: Optional[str] = None
    business_definition: Optional[str] = None
    status: str = "draft"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class DwsViewGenerateRequest(BaseModel):
    model_config = {"extra": "forbid"}
    """DWS 视图生成请求"""
    aggregate_id: int = Field(..., description="聚合定义 ID")


class DwsViewGenerateOut(BaseModel):
    """DWS 视图生成响应"""
    aggregate_id: int
    view_name: str
    sql_summary: str = ""
    output_fields: list[str] = Field(default_factory=list)
    dependencies: list[dict] = Field(default_factory=list)
    version: int = 1
    status: str = "draft"


# ==================== R04 快照任务 Schema ====================

class SnapshotJobIn(BaseModel):
    model_config = {"extra": "forbid"}
    """快照任务创建/更新入参"""
    name: str = Field(..., max_length=128)
    source_table: str = Field(..., max_length=128)
    target_table: str = Field(..., max_length=128)
    snapshot_keys: list[str] = Field(default_factory=list)
    period: str = Field(default="monthly", max_length=16)
    retention: int = Field(default=12, ge=1, le=120)


class SnapshotJobUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    """快照任务部分更新"""
    name: Optional[str] = Field(None, max_length=128)
    snapshot_keys: Optional[list[str]] = None
    period: Optional[str] = Field(None, max_length=16)
    retention: Optional[int] = Field(None, ge=1, le=120)
    enabled: Optional[bool] = None


class SnapshotTriggerIn(BaseModel):
    model_config = {"extra": "forbid"}
    """快照触发入参"""
    period_value: str = Field(..., max_length=32)


# ==================== R0403 SCD Schema ====================

class ScdConfigIn(BaseModel):
    model_config = {"extra": "forbid"}
    """SCD 配置创建/更新入参"""
    name: str = Field(..., max_length=128)
    source_table: str = Field(..., max_length=128)
    target_table: str = Field(..., max_length=128)
    business_key: str = Field(..., max_length=256)
    effective_from_field: str = Field(default="effective_from", max_length=64)
    effective_to_field: str = Field(default="effective_to", max_length=64)
    current_flag_field: str = Field(default="current_flag", max_length=64)
    compare_fields: list[str] = Field(default_factory=list)


class ScdConfigUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    """SCD 配置部分更新"""
    name: Optional[str] = Field(None, max_length=128)
    business_key: Optional[str] = None
    effective_from_field: Optional[str] = None
    effective_to_field: Optional[str] = None
    current_flag_field: Optional[str] = None
    compare_fields: Optional[list[str]] = None
    enabled: Optional[bool] = None


# ==================== R07 ADS Schema ====================

class AdsDimensionRef(BaseModel):
    """ADS 关联维度"""
    code: str = Field(..., max_length=64)
    name: str = Field(default="", max_length=128)
    field: str = Field(default="", max_length=128)
    ref_table: str = Field(default="", max_length=128)


class AdsOutputField(BaseModel):
    """ADS 输出字段定义"""
    source_field: str = Field(..., max_length=128)
    output_name: str = Field(..., max_length=128)
    output_label: str = Field(default="", max_length=128)
    data_type: str = Field(default="string", max_length=32)
    agg_role: str = Field(default="dimension", max_length=32)
    is_sensitive: bool = False


class AdsPresetFilter(BaseModel):
    """ADS 预置过滤"""
    field: str = Field(..., max_length=128)
    operator: str = Field(default="eq", max_length=16)
    value: str = Field(default="", max_length=256)


class AdsDefinitionIn(BaseModel):
    model_config = {"extra": "forbid"}
    """ADS 组装定义创建/更新入参"""
    name: str = Field(..., max_length=256)
    description: Optional[str] = Field(None, max_length=2000)
    source_type: str = Field(default="dws_aggregate", max_length=32)
    source_id: int = Field(...)
    source_label: Optional[str] = Field(None, max_length=128)
    dimension_refs: list[AdsDimensionRef] = Field(default_factory=list)
    output_fields: list[AdsOutputField] = Field(default_factory=list)
    preset_filters: Optional[list[AdsPresetFilter]] = None
    subject_area: Optional[str] = Field(None, max_length=64)
    consume_domain: Optional[str] = Field(None, max_length=64)
    owner_name: Optional[str] = Field(None, max_length=64)


class AdsDefinitionUpdateIn(BaseModel):
    model_config = {"extra": "forbid"}
    """ADS 定义部分更新"""
    name: Optional[str] = Field(None, max_length=256)
    description: Optional[str] = Field(None, max_length=2000)
    dimension_refs: Optional[list[AdsDimensionRef]] = None
    output_fields: Optional[list[AdsOutputField]] = None
    preset_filters: Optional[list[AdsPresetFilter]] = None
    subject_area: Optional[str] = Field(None, max_length=64)
    consume_domain: Optional[str] = Field(None, max_length=64)
    owner_name: Optional[str] = Field(None, max_length=64)


# ==================== ODS→DWD 自动化配置 (Z0104) ====================

class OdsDwdAutomationConfigCreate(BaseModel):
    """创建 ODS→DWD 自动化配置"""
    model_config = {"extra": "forbid"}

    ods_table_name: str = Field(..., max_length=256)
    target_dwd_asset_id: Optional[int] = None
    target_dwd_table_name: Optional[str] = Field(None, max_length=256)
    update_mode: Literal["cleaning_rule", "passthrough"] = "cleaning_rule"
    ods_sync_semantics: Literal["full_snapshot", "incremental_append", "incremental_upsert"] = "full_snapshot"
    dwd_write_strategy: Literal["full_refresh", "incremental_upsert", "append", "passthrough_view"] = "incremental_upsert"
    business_key_fields: Optional[list[str]] = None
    missing_row_strategy: Literal["mark_inactive", "keep_history", "hard_delete"] = "mark_inactive"
    standardization_rule_set_id: Optional[int] = None
    standardization_rule_ids: Optional[list[int]] = None
    enabled: bool = False


class OdsDwdAutomationConfigUpdate(BaseModel):
    """更新 ODS→DWD 自动化配置"""
    model_config = {"extra": "forbid"}

    target_dwd_asset_id: Optional[int] = None
    target_dwd_table_name: Optional[str] = Field(None, max_length=256)
    update_mode: Optional[Literal["cleaning_rule", "passthrough"]] = None
    ods_sync_semantics: Optional[Literal["full_snapshot", "incremental_append", "incremental_upsert"]] = None
    dwd_write_strategy: Optional[Literal["full_refresh", "incremental_upsert", "append", "passthrough_view"]] = None
    business_key_fields: Optional[list[str]] = None
    missing_row_strategy: Optional[Literal["mark_inactive", "keep_history", "hard_delete"]] = None
    standardization_rule_set_id: Optional[int] = None
    standardization_rule_ids: Optional[list[int]] = None
    trigger_strategy: Optional[Literal["on_sync_success"]] = None
    enabled: Optional[bool] = None


class OdsDwdAutomationConfigOut(BaseModel):
    """ODS→DWD 自动化配置响应"""
    model_config = {"from_attributes": True}

    id: int
    ods_table_name: str
    target_dwd_asset_id: Optional[int] = None
    target_dwd_table_name: Optional[str] = None
    update_mode: str
    ods_sync_semantics: str
    dwd_write_strategy: str
    business_key_fields: Optional[list[str]] = None
    missing_row_strategy: str
    standardization_rule_set_id: Optional[int] = None
    standardization_rule_ids: Optional[list[int]] = None
    trigger_strategy: str
    enabled: bool
    last_execution_status: Optional[str] = None
    last_execution_at: Optional[datetime] = None
    last_execution_rows: Optional[int] = None
    last_execution_error: Optional[str] = None
    # Z01 自动生成审计字段
    auto_created: bool = False
    trigger_event: Optional[str] = None
    default_strategy: Optional[str] = None
    risk_decision: Optional[str] = None
    trace_id: Optional[str] = None
    source_system: str = "manual"
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# ==================== X05 指标自动化数仓开发 ====================

class MetricAutomationDiagnosisOut(BaseModel):
    """指标自动化解析诊断结果（X0502）

    诊断指标是否具备生成 DWS/ADS 草稿的条件，不可解析时列出缺失项。
    """
    metric_id: int
    metric_code: str
    metric_name: str
    automatable: bool = Field(False, description="是否可自动化生成 DWS/ADS 草稿")
    metric_type: str = ""
    # 解析出的结构化信息
    source_dataset_id: Optional[int] = Field(None, description="来源数据集 ID")
    source_dataset_name: Optional[str] = Field(None, description="来源数据集名称")
    dimension_fields: list[str] = Field(default_factory=list, description="解析出的维度字段")
    measure_fields: list[str] = Field(default_factory=list, description="解析出的度量字段")
    aggregation_functions: list[str] = Field(default_factory=list, description="聚合函数列表")
    filters: list[dict] = Field(default_factory=list, description="解析出的过滤条件")
    time_grain: Optional[str] = Field(None, description="时间粒度")
    # 诊断
    errors: list[str] = Field(default_factory=list, description="阻断性错误")
    warnings: list[str] = Field(default_factory=list, description="非阻断警告")
    suggestions: list[str] = Field(default_factory=list, description="修复建议")


class MetricAutomationDwsDraftIn(BaseModel):
    """生成 DWS 草稿请求（X0503）"""
    model_config = {"extra": "forbid"}
    metric_id: int = Field(..., description="指标 ID")
    aggregate_name: Optional[str] = Field(None, max_length=128, description="聚合定义名称，默认从指标名生成")
    group_by: Optional[list[str]] = Field(None, description="覆盖维度字段")
    measure_field: Optional[str] = Field(None, description="覆盖度量字段")
    aggregation: Optional[str] = Field(None, max_length=16, description="覆盖聚合方式")
    time_grain: Optional[str] = Field(None, max_length=16, description="覆盖时间粒度")


class MetricAutomationDwsDraftOut(BaseModel):
    """DWS 聚合草稿响应（X0503）"""
    draft_id: int = Field(description="草稿 ID（dws_aggregate_definitions.id）")
    metric_id: int
    metric_code: str
    metric_name: str
    aggregate_name: str
    source_dataset_id: Optional[int] = None
    source_dataset_name: Optional[str] = None
    group_by: list[str] = []
    filter: Optional[dict] = None
    aggregation: str = "sum"
    measure_field: Optional[str] = None
    time_grain: Optional[str] = None
    business_definition: Optional[str] = None
    status: str = "draft"
    # 诊断
    diagnosis: MetricAutomationDiagnosisOut | None = None


class MetricAutomationViewPreviewIn(BaseModel):
    """DWS/ADS View 预览请求（X0504/X0505）"""
    model_config = {"extra": "forbid"}
    draft_id: int = Field(..., description="草稿 ID")
    draft_type: str = Field("dws", description="dws / ads")
    sample_size: int = Field(20, ge=1, le=500)


class MetricAutomationViewPreviewOut(BaseModel):
    """DWS/ADS View 预览响应（X0504/X0505）"""
    draft_id: int
    draft_type: str
    view_name: str = ""
    sql_summary: str = ""
    output_fields: list[dict] = Field(default_factory=list, description="输出字段列表")
    dependencies: list[dict] = Field(default_factory=list, description="依赖资产")
    sample_columns: list[str] = Field(default_factory=list)
    sample_rows: list[dict] = Field(default_factory=list)
    sample_truncated: bool = False
    # 门禁
    quality_status: str = Field("unknown", description="unknown / pass / warn / fail")
    quality_checks: list[dict] = Field(default_factory=list)
    small_sample_risk: str = Field("unknown", description="unknown / low / warn / block")
    small_sample_detail: Optional[str] = None
    risk_level: str = Field("low", description="low / medium / high")
    # 阻断
    blocked: bool = False
    blocked_reasons: list[str] = Field(default_factory=list)


class MetricAutomationPublishIn(BaseModel):
    """发布确认请求（X0506/X0508）"""
    model_config = {"extra": "forbid"}
    draft_id: int = Field(..., description="草稿 ID")
    draft_type: str = Field("dws", description="dws / ads")
    confirmed: bool = Field(True, description="用户确认发布")


class MetricAutomationPublishOut(BaseModel):
    """发布确认响应（X0506/X0508）"""
    draft_id: int
    draft_type: str
    status: str = "published"
    published_version: int = 1
    view_name: Optional[str] = None
    output_fields_count: int = 0
    warnings: list[str] = Field(default_factory=list)


class MetricAutomationRollbackIn(BaseModel):
    """回滚请求（X0506/X0508）"""
    model_config = {"extra": "forbid"}
    draft_id: int = Field(..., description="草稿/资产 ID")
    draft_type: str = Field("dws", description="dws / ads")
    target_version: int = Field(..., ge=1, description="回滚到指定版本")


class MetricAutomationAdsDraftIn(BaseModel):
    """生成 ADS 草稿请求（X0507）"""
    model_config = {"extra": "forbid"}
    source_type: str = Field("dws_aggregate", max_length=32, description="dws_aggregate / dataset / model")
    source_id: int = Field(..., description="来源 DWS 聚合/数据集/模型 ID")
    name: Optional[str] = Field(None, max_length=256, description="ADS 名称")
    consume_domain: Optional[str] = Field(None, max_length=64)


class MetricAutomationAdsDraftOut(BaseModel):
    """ADS 消费草稿响应（X0507）"""
    draft_id: int
    name: str
    source_type: str
    source_id: int
    source_label: Optional[str] = None
    output_fields: list[dict] = []
    dimension_refs: list[dict] = []
    preset_filters: Optional[list[dict]] = None
    subject_area: Optional[str] = None
    consume_domain: Optional[str] = None
    status: str = "draft"


class MetricChangePlanOut(BaseModel):
    """指标变更驱动的下游更新方案（X0510）"""
    metric_id: int
    metric_code: str
    metric_version: int
    change_type: str = Field(description="field_added / field_removed / type_changed / formula_changed")
    affected_dws: list[dict] = Field(default_factory=list, description="受影响的 DWS 聚合")
    affected_ads: list[dict] = Field(default_factory=list, description="受影响的 ADS 消费资产")
    affected_bi_contracts: list[dict] = Field(default_factory=list, description="受影响的 BI 消费契约")
    risk_level: str = Field("low", description="low / medium / high")
    blocked: bool = False
    recommended_actions: list[str] = Field(default_factory=list)


class MetricRefreshStrategyOut(BaseModel):
    """指标自动化刷新策略响应（X0511）"""
    asset_type: str = "view"
    asset_name: str
    refresh_strategy: str = "view_realtime"  # view_realtime / manual / on_upstream_change
    last_refreshed_at: Optional[datetime] = None
    last_refresh_status: Optional[str] = None
    upstream_dependency: Optional[str] = None


class MetricAutomationTimelineOut(BaseModel):
    """指标自动化审计时间线（X0512）"""
    metric_id: int
    metric_code: str
    events: list[dict] = Field(default_factory=list, description="时间线事件列表")
    summary: dict = Field(default_factory=dict, description="摘要统计")


# ==================== Z03 L4 全自动级联 ====================

class L4AutoApprovalCreate(BaseModel):
    """L4 试点申请请求"""
    model_config = {"extra": "forbid"}
    metric_id: int = Field(..., description="指标 ID")
    max_auto_frequency: int = Field(1, ge=1, le=100, description="每日最大自动执行次数")
    auto_rollback_enabled: bool = Field(True, description="失败时自动回滚")
    reason: Optional[str] = Field(None, max_length=512, description="申请理由")


class L4AutoApprovalOut(BaseModel):
    """L4 试点审批记录响应"""
    id: int
    metric_id: int
    metric_code: str = ""
    metric_name: str = ""
    subject_area: Optional[str] = None
    risk_level: str = "medium"
    max_auto_frequency: int = 1
    auto_rollback_enabled: bool = True
    status: str = "pending"
    requested_by: Optional[str] = None
    approved_by: Optional[str] = None
    reason: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class L4AutoApprovalAction(BaseModel):
    """审批操作"""
    model_config = {"extra": "forbid"}
    reason: Optional[str] = Field(None, max_length=512, description="审批备注")


class L4CascadeRuleOut(BaseModel):
    """L4 级联规则响应"""
    metric_id: int
    trigger_conditions: list[str] = Field(default_factory=list)
    risk_strategies: dict = Field(default_factory=dict)
    max_frequency: int = 1
    auto_rollback: bool = True
    notify_on_success: bool = False
    notify_on_block: bool = True
    notify_on_fail: bool = True


class L4CascadeRuleUpdate(BaseModel):
    """L4 级联规则更新请求"""
    model_config = {"extra": "forbid"}
    trigger_conditions: Optional[list[str]] = None
    risk_strategies: Optional[dict] = None
    max_frequency: Optional[int] = Field(None, ge=1, le=100)
    auto_rollback: Optional[bool] = None
    notify_on_success: Optional[bool] = None
    notify_on_block: Optional[bool] = None
    notify_on_fail: Optional[bool] = None
