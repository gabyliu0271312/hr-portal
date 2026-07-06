# -*- coding: utf-8 -*-
"""数据仓库 Pydantic schemas (请求/响应模型)

命名约定：
- *In   = 请求体（创建/更新入参）
- *Out  = 响应体（返回前端）
"""
from datetime import datetime
from typing import Literal, Optional

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
    scope_strategy: Optional[str] = None


class WarehouseAssetUpdateIn(BaseModel):
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
    """创建模型"""
    name: str = Field(..., max_length=64)
    description: Optional[str] = None
    warehouse_layer: str = "DWD"
    subject_area: Optional[str] = None
    owner_user_id: Optional[int] = None
    owner_name: Optional[str] = None
    business_definition: Optional[str] = None
    tables: list["ModelTableIn"] = []
    relations: list["ModelRelationIn"] = []


class ModelTableIn(BaseModel):
    table_name: str
    alias: str


class ModelRelationIn(BaseModel):
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
    """模型更新"""
    name: Optional[str] = None
    description: Optional[str] = None
    warehouse_layer: Optional[str] = None
    subject_area: Optional[str] = None
    owner_user_id: Optional[int] = None
    owner_name: Optional[str] = None
    business_definition: Optional[str] = None


# ==================== 输出字段 ====================

class DatasetOutputFieldIn(BaseModel):
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
    stat_period: Optional[str] = None
    related_fields: list = []
    published_by: Optional[int] = None
    updated_at: Optional[datetime] = None


class WarehouseMetricUpdateIn(BaseModel):
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

class PreviewSummaryOut(BaseModel):
    main_count: Optional[int] = None
    result_count: Optional[int] = None
    unmatched_count: Optional[int] = None
    duplicate_match_count: Optional[int] = None
    null_count: Optional[int] = None
    type_error_count: Optional[int] = None


class PreviewOut(BaseModel):
    items: list[dict]
    columns: list[str] = []
    summary: PreviewSummaryOut


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


# ==================== 批量分层 (Q0104) ====================

class WarehouseAssetBatchLayerIn(BaseModel):
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
    """质量规则创建/更新入参"""
    asset_type: str = Field(..., max_length=16, description="table/dataset/field")
    asset_code: str = Field(..., max_length=256, description="资产编码")
    rule_type: str = Field(..., max_length=32, description="规则类型")
    rule_config: dict = Field(default_factory=dict, description="规则参数 JSON")
    enabled: bool = True
    severity: str = Field("warn", description="info/warn/error")


class WarehouseQualityRuleUpdateIn(BaseModel):
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
