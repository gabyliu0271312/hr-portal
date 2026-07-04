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
