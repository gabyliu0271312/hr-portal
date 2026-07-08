/**
 * 数据仓库 API 封装
 *
 * 集中管理 /api/v1/warehouse/* 接口。
 * 复用项目全局 axios client（baseURL=/api/v1），不新建 request 实例。
 */
import { api } from './client'

// ==================== 通用类型 ====================

/** 分页响应 */
export interface PaginatedResponse<T> {
  total: number
  page: number
  page_size: number
  items: T[]
}

// ==================== UCP 协同 ====================

/** UCP 协同信息（仅展示/跳转字段，前端不持有 secret） */
export interface UcpInfo {
  enabled: boolean
  system_id: number | null
  resource_id: number | null
  connector_config_id: number | null
  config_route: string | null
}

// ==================== 数据资产 ====================

/** 资产列表项 */
export interface Asset {
  table_name: string
  table_label: string
  description: string | null
  warehouse_layer: string
  subject_area: string | null
  owner_name: string | null
  source_system: string | null
  asset_status: string
  last_quality_status: string
  columns_count: number | null
  last_synced_at: string | null
}

/** 资产详情 */
export interface AssetDetail extends Asset {
  owner_user_id: number | null
  is_builtin: boolean
  display_order: number
  created_at: string | null
  ucp: UcpInfo
  ucp_system_id: number | null
  ucp_resource_id: number | null
  ucp_connector_config_id: number | null
  last_quality_checked_at: string | null
  period_col: string | null
  period_source: string | null
  scope_strategy: string | null
}

/** 资产更新入参 */
export interface AssetUpdatePayload {
  table_label?: string
  description?: string | null
  warehouse_layer?: string
  subject_area?: string | null
  owner_user_id?: number | null
  owner_name?: string | null
  source_system?: string | null
  asset_status?: string
  ucp_system_id?: number | null
  ucp_resource_id?: number | null
  ucp_connector_config_id?: number | null
  scope_strategy?: string | null
}

/** 资产字段信息（对齐后端 get_asset_columns 实际返回） */
export interface AssetColumn {
  id: number
  column_code: string
  column_label: string
  data_type: string
  is_pk_part: boolean
  is_sensitive: boolean
  is_visible: boolean
  display_order: number
  description: string | null
  scope_role: string | null
  copy_from_last_month: boolean
  enum_options: string[] | null
  agg_role: string
  is_computed: boolean
  formula_expr: string | null
  source: string
}

// ==================== 数据模型 ====================

/** 模型关联表（创建入参） */
export interface ModelTableIn {
  table_name: string
  alias: string
}

/** 模型关联表（详情响应，含 id） */
export interface ModelTable {
  id: number
  table_name: string
  alias: string
}

/** 模型表关联（创建入参，keys 以 left_keys/right_keys 分开传入） */
export interface ModelRelationPayload {
  left_alias: string
  right_alias: string
  join_type?: string
  left_keys: string[]
  right_keys: string[]
  cardinality?: string
}

/** 模型表关联（详情响应，keys 已合并为 [{left, right}]） */
export interface ModelRelation {
  id: number
  left_alias: string
  right_alias: string
  join_type: string
  cardinality: string
  keys: { left: string; right: string }[]
}

/** 创建模型入参 */
export interface ModelCreatePayload {
  name: string
  description?: string | null
  warehouse_layer?: string
  subject_area?: string | null
  owner_user_id?: number | null
  owner_name?: string | null
  business_definition?: string | null
  tables: ModelTableIn[]
  relations: ModelRelationPayload[]
}

/** 模型变更操作结果（create/publish 返回的简化结构） */
export interface ModelMutationResult {
  id: number
  name?: string
  status: string
  version: number
}

/** 模型列表项 */
export interface ModelListItem {
  id: number
  name: string
  label?: string | null
  description: string | null
  warehouse_layer: string
  subject_area: string | null
  owner_name: string | null
  status: string
  version: number
  table_count: number | null
  published_at: string | null
  created_at: string | null
}

/** 模型详情 */
export interface ModelDetail extends ModelListItem {
  owner_user_id: number | null
  business_definition: string | null
  published_by: number | null
  tables: ModelTable[]
  relations: ModelRelation[]
  output_fields: OutputField[]
}

/** 更新模型入参 */
export interface ModelUpdatePayload {
  name?: string
  description?: string | null
  warehouse_layer?: string
  subject_area?: string | null
  owner_user_id?: number | null
  owner_name?: string | null
  business_definition?: string | null
}

// ==================== 输出字段 ====================

/** 输出字段 */
export interface OutputField {
  id: number
  dataset_id: number
  source_alias: string
  source_column: string
  output_code: string
  output_label: string
  data_type: string
  description: string | null
  agg_role: string
  is_sensitive: boolean
  is_visible: boolean
  display_order: number
}

/** 保存输出字段入参 */
export interface OutputFieldPayload {
  source_alias: string
  source_column: string
  output_code: string
  output_label: string
  data_type?: string
  description?: string | null
  agg_role?: string
  is_sensitive?: boolean
  is_visible?: boolean
  display_order?: number
}

// ==================== 指标 ====================

/** 创建指标入参 */
export interface MetricCreatePayload {
  metric_code: string
  metric_name: string
  metric_type?: 'count' | 'sum' | 'ratio' | 'derived' | 'text'
  subject_area?: string | null
  business_definition?: string | null
  calculation_desc?: string | null
  formula_expr?: string | null
  stat_period?: string | null
  related_dataset_id?: number | null
  related_fields?: string[]
  owner_user_id?: number | null
  owner_name?: string | null
}

/** 指标列表项 */
export interface MetricListItem {
  id: number
  metric_code: string
  metric_name: string
  metric_type: string
  business_definition: string | null
  subject_area: string | null
  related_dataset_id: number | null
  owner_name: string | null
  status: string
  version: number
  published_at: string | null
  created_at: string | null
}

/** 指标详情 */
export interface MetricDetail extends MetricListItem {
  owner_user_id: number | null
  calculation_desc: string | null
  formula_expr: string | null
  stat_period: string | null
  related_fields: string[]
  published_by: number | null
  updated_at: string | null
}

/** 更新指标入参 */
export interface MetricUpdatePayload {
  metric_name?: string
  metric_type?: 'count' | 'sum' | 'ratio' | 'derived' | 'text'
  subject_area?: string | null
  business_definition?: string | null
  calculation_desc?: string | null
  formula_expr?: string | null
  stat_period?: string | null
  related_dataset_id?: number | null
  related_fields?: string[]
  owner_user_id?: number | null
  owner_name?: string | null
}

// ==================== 预览 ====================

/** 预览请求参数 */
export interface PreviewPayload {
  limit?: number
}

/** 预览汇总统计 */
export interface PreviewSummary {
  main_count: number | null
  result_count: number | null
  unmatched_count: number | null
  duplicate_match_count: number | null
  null_count: number | null
  type_error_count: number | null
}

/** 预览结果 */
export interface PreviewResult {
  items: Record<string, unknown>[]
  columns: string[]
  summary: PreviewSummary
}

// ==================== 影响分析 ====================

/** 影响分析引用对象 */
export interface ImpactRef {
  type: string
  id: number
  name: string
  usage: string
  risk_level: string
  blocking: boolean
  blocking_reason: string
  route: string | null
}

/** 影响分析结果 */
export interface ImpactResult {
  table_name?: string
  column_code?: string
  dataset_id?: number
  references: ImpactRef[]
  blocking: boolean
}

// ==================== 资产 API ====================

/** 资产列表（分页 + 筛选） */
export function listAssets(params: {
  page?: number
  page_size?: number
  keyword?: string
  warehouse_layer?: string
  subject_area?: string
  source_system?: string
  asset_status?: string
}): Promise<PaginatedResponse<Asset>> {
  return api.get('/warehouse/assets', { params }).then(r => r.data)
}

/** 资产详情（含 UCP 协同信息） */
export function getAsset(tableName: string): Promise<AssetDetail> {
  return api.get(`/warehouse/assets/${encodeURIComponent(tableName)}`).then(r => r.data)
}

/** 更新资产 */
export function updateAsset(
  tableName: string,
  payload: AssetUpdatePayload
): Promise<AssetDetail> {
  return api.patch(`/warehouse/assets/${encodeURIComponent(tableName)}`, payload).then(r => r.data)
}

/** 资产字段列表 */
export function listAssetColumns(tableName: string): Promise<{ table_name: string; columns: AssetColumn[] }> {
  return api.get(`/warehouse/assets/${encodeURIComponent(tableName)}/columns`).then(r => r.data)
}

// ==================== 来源与开放 (T0202) ====================

/** 端点方向 */
export type EndpointDirection = 'pull' | 'push' | 'expose' | 'ucp_resource'

/** 统一端点摘要 */
export interface ConnectionEndpointSummary {
  endpoint_type: EndpointDirection
  endpoint_id: number
  name: string
  owner: string
  status: string
  is_active: boolean
  schedule: string | null
  last_run_at: string | null
  last_status: string | null
  last_rows: number | null
  last_message: string | null
  has_secrets: boolean
  config_route: string | null
  summary_extra: Record<string, any>
}

/** 资产端点聚合 */
export interface AssetEndpoints {
  table_name: string
  pulls: ConnectionEndpointSummary[]
  pushes: ConnectionEndpointSummary[]
  exposes: ConnectionEndpointSummary[]
  ucp_resources: ConnectionEndpointSummary[]
}

/** 获取资产级端点聚合（来源与开放） */
export function getAssetEndpoints(tableName: string): Promise<AssetEndpoints> {
  return api.get(`/warehouse/assets/${encodeURIComponent(tableName)}/endpoints`).then(r => r.data)
}

// ==================== 同步历史 (T0210) ====================

export interface SyncHistoryEntry {
  source_type: string
  source_name: string
  source_id: number
  run_id: number
  status: string
  started_at: string | null
  finished_at: string | null
  rows: number | null
  message: string | null
  triggered_by: string | null
}

/** 获取资产同步/推送历史聚合 */
export function getAssetSyncHistory(tableName: string, limit = 20): Promise<{ table_name: string; entries: SyncHistoryEntry[] }> {
  return api.get(`/warehouse/assets/${encodeURIComponent(tableName)}/sync-history`, { params: { limit } }).then(r => r.data)
}

// ==================== 模型 API ====================

/** 模型列表（分页 + 筛选） */
export function listModels(params: {
  page?: number
  page_size?: number
  status?: string
  warehouse_layer?: string
  subject_area?: string
  keyword?: string
}): Promise<PaginatedResponse<ModelListItem>> {
  return api.get('/warehouse/models', { params }).then(r => r.data)
}

/** 创建模型（返回简化结构，不含完整 tables/relations/output_fields） */
export function createModel(payload: ModelCreatePayload): Promise<ModelMutationResult> {
  return api.post('/warehouse/models', payload).then(r => r.data)
}

/** 模型详情 */
export function getModel(id: number): Promise<ModelDetail> {
  return api.get(`/warehouse/models/${id}`).then(r => r.data)
}

/** 更新模型（router 内部调用 get_model 返回完整详情） */
export function updateModel(id: number, payload: ModelUpdatePayload): Promise<ModelDetail> {
  return api.patch(`/warehouse/models/${id}`, payload).then(r => r.data)
}

/** 发布模型（返回简化结构：{id, status, version}） */
export function publishModel(id: number): Promise<ModelMutationResult> {
  return api.post(`/warehouse/models/${id}/publish`).then(r => r.data)
}

/** 归档模型 */
export function archiveModel(id: number): Promise<{ id: number; status: string }> {
  return api.post(`/warehouse/models/${id}/archive`).then(r => r.data)
}

/** 模型预览（payload 可选，对齐后端 payload: dict | None） */
export function previewModel(id: number, payload: PreviewPayload = {}): Promise<PreviewResult> {
  return api.post(`/warehouse/models/${id}/preview`, { limit: payload.limit ?? 20 }).then(r => r.data)
}

/** 获取输出字段 */
export function getOutputFields(id: number): Promise<OutputField[]> {
  return api.get(`/warehouse/models/${id}/output-fields`).then(r => r.data)
}

/** 保存输出字段（全量覆盖） */
export function saveOutputFields(id: number, fields: OutputFieldPayload[]): Promise<OutputField[]> {
  return api.put(`/warehouse/models/${id}/output-fields`, fields).then(r => r.data)
}

// ==================== 指标 API ====================

/** 指标列表（分页 + 筛选） */
export function listMetrics(params: {
  page?: number
  page_size?: number
  keyword?: string
  subject_area?: string
  status?: string
}): Promise<PaginatedResponse<MetricListItem>> {
  return api.get('/warehouse/metrics', { params }).then(r => r.data)
}

/** 创建指标 */
export function createMetric(payload: MetricCreatePayload): Promise<MetricDetail> {
  return api.post('/warehouse/metrics', payload).then(r => r.data)
}

/** 指标详情 */
export function getMetric(id: number): Promise<MetricDetail> {
  return api.get(`/warehouse/metrics/${id}`).then(r => r.data)
}

/** 更新指标 */
export function updateMetric(id: number, payload: MetricUpdatePayload): Promise<MetricDetail> {
  return api.patch(`/warehouse/metrics/${id}`, payload).then(r => r.data)
}

/** 发布指标 */
export function publishMetric(id: number): Promise<MetricDetail> {
  return api.post(`/warehouse/metrics/${id}/publish`).then(r => r.data)
}

/** 归档指标 */
export function archiveMetric(id: number): Promise<MetricDetail> {
  return api.post(`/warehouse/metrics/${id}/archive`).then(r => r.data)
}

// ==================== 影响分析 API ====================

/** 表影响分析 */
export function impactTable(tableName: string): Promise<ImpactResult> {
  return api.get(`/warehouse/impact/table/${encodeURIComponent(tableName)}`).then(r => r.data)
}

/** 字段影响分析 */
export function impactField(tableName: string, columnCode: string): Promise<ImpactResult> {
  return api.get('/warehouse/impact/field', {
    params: { table_name: tableName, column_code: columnCode },
  }).then(r => r.data)
}

/** 模型影响分析 */
export function impactModel(datasetId: number): Promise<ImpactResult> {
  return api.get(`/warehouse/impact/model/${datasetId}`).then(r => r.data)
}

// ==================== UCP 协同辅助 ====================

/** 判断 UCP 是否已启用且有可跳转资源 */
export function isUcpConnected(ucp: UcpInfo | null | undefined): boolean {
  return !!(ucp && ucp.enabled && ucp.resource_id)
}

/** 获取 UCP 跳转路由 */
export function getUcpRoute(ucp: UcpInfo | null | undefined): string | null {
  if (!isUcpConnected(ucp)) return null
  return ucp!.config_route
}

/** UCP 未启用时的提示文案 */
export const UCP_DISABLED_TEXT = '数据连接平台未启用'

/** UCP 已启用但未关联时的提示文案 */
export const UCP_NOT_CONNECTED_TEXT = '未关联 UCP 资源'

// ==================== Feature Flags (Q0002) ====================

/** 二期灰度开关 */
export interface WarehouseFeatureFlags {
  ucp_available: boolean
  phase2_enabled: boolean
  quality_rules: boolean
  lineage: boolean
  ucp_proxy: boolean
  modeling_v2: boolean
  monitoring: boolean
  layer_enhancement: boolean
}

/** 获取二期灰度开关 */
export function getWarehouseFeatures(): Promise<WarehouseFeatureFlags> {
  return api.get('/warehouse/features').then(r => r.data)
}

// ==================== 批量分层 (Q0104/Q0105) ====================

/** 批量分层请求 */
export interface BatchLayerPayload {
  table_names: string[]
  warehouse_layer: string
}

/** 单项结果 */
export interface BatchLayerItem {
  table_name: string
  success: boolean
  message: string
}

/** 批量分层结果 */
export interface BatchLayerResult {
  warehouse_layer: string
  success_count: number
  fail_count: number
  items: BatchLayerItem[]
}

/** 批量修改资产分层 */
export function batchUpdateAssetLayer(payload: BatchLayerPayload): Promise<BatchLayerResult> {
  return api.patch('/warehouse/assets/batch-layer', payload).then(r => r.data)
}

// ==================== 分层统计 (Q0106/Q0107) ====================

/** 单个分层统计 */
export interface LayerStat {
  code: string
  count: number
}

/** 分层统计聚合 */
export interface LayerStatsResult {
  total: number
  items: LayerStat[]
}

/** 获取分层概览统计 */
export function getLayerStats(): Promise<LayerStatsResult> {
  return api.get('/warehouse/assets/layer-stats').then(r => r.data)
}

// ==================== 血缘 API (Q02) ====================

/** 血缘节点 */
export interface LineageNode {
  id: string
  type: string
  label: string
  status: string
  risk_level: string
  detail_route: string | null
  ucp_summary?: Record<string, any> | null
}

/** 血缘边 */
export interface LineageEdge {
  source_id: string
  target_id: string
  direction: string
  relation_type: string
  label: string
}

/** 血缘图响应 */
export interface LineageGraph {
  nodes: LineageNode[]
  edges: LineageEdge[]
  truncated: boolean
  truncation_message: string | null
}

/** 表级血缘 */
export function getTableLineage(
  tableName: string,
  depth = 3,
  limit = 50
): Promise<LineageGraph> {
  return api.get(`/warehouse/lineage/table/${encodeURIComponent(tableName)}`, {
    params: { depth, limit },
  }).then(r => r.data)
}

/** 字段级血缘 */
export function getFieldLineage(
  tableName: string,
  columnCode: string,
  depth = 3,
  limit = 50
): Promise<LineageGraph> {
  return api.get('/warehouse/lineage/field', {
    params: { table_name: tableName, column_code: columnCode, depth, limit },
  }).then(r => r.data)
}

/** 血缘节点类型配置 */
export const LINEAGE_NODE_COLORS: Record<string, string> = {
  table: '#409EFF',
  field: '#67C23A',
  dataset: '#E6A23C',
  metric: '#F56C6C',
  report: '#909399',
  datasource: '#337ECC',
  ucp_resource: '#01C9B8',
  notification: '#B37FEB',
}

/** 血缘节点类型中文 */
export const LINEAGE_NODE_LABELS: Record<string, string> = {
  table: '数据表',
  field: '字段',
  dataset: '数据集',
  metric: '指标',
  report: '报表',
  datasource: '数据源',
  ucp_resource: 'UCP资源',
  notification: '通知',
}

/** 血缘关系类型中文 */
export const LINEAGE_EDGE_LABELS: Record<string, string> = {
  sync: '同步',
  reference: '引用',
  calculation: '计算',
  output: '输出',
}

// ==================== 质量规则 API (Q03) ====================

/** 质量规则 */
export interface QualityRule {
  id: number
  asset_type: string
  asset_code: string
  rule_type: string
  rule_config: Record<string, any>
  enabled: boolean
  severity: string
  last_run_status: string | null
  last_run_at: string | null
  created_at: string | null
  updated_at: string | null
}

/** 质量规则创建入参 */
export interface QualityRuleCreatePayload {
  asset_type: string
  asset_code: string
  rule_type: string
  rule_config: Record<string, any>
  enabled?: boolean
  severity?: string
}

/** 质量规则更新入参 */
export interface QualityRuleUpdatePayload {
  rule_config?: Record<string, any>
  enabled?: boolean
  severity?: string
}

/** 质量运行记录 */
export interface QualityRun {
  id: number
  rule_id: number | null
  status: string
  checked_count: number
  failed_count: number
  sample_rows: Record<string, any>[] | null
  message: string | null
  started_at: string | null
  finished_at: string | null
}

/** 质量规则执行触发响应 */
export interface QualityRunTriggerResult {
  run_id: number
  status: string
  message: string
}

/** 质量告警摘要 */
export interface QualityAlertSummary {
  total_rules: number
  failed_rules: number
  warning_rules: number
  by_severity: Record<string, number>
}

/** 质量规则类型中文 */
export const QUALITY_RULE_TYPE_LABELS: Record<string, string> = {
  not_null: '非空检查',
  unique: '唯一性检查',
  enum: '枚举检查',
  date_format: '日期格式检查',
  referential_integrity: '引用完整性',
  custom_sql: '自定义 SQL',
}

/** 质量严重级别中文 */
export const QUALITY_SEVERITY_LABELS: Record<string, string> = {
  info: '提示',
  warn: '警告',
  error: '严重',
}

/** 质量规则列表 */
export function listQualityRules(params: {
  asset_type?: string
  asset_code?: string
  rule_type?: string
  enabled?: boolean
  page?: number
  page_size?: number
}): Promise<PaginatedResponse<QualityRule>> {
  return api.get('/warehouse/quality-rules', { params }).then(r => r.data)
}

/** 质量规则详情 */
export function getQualityRule(id: number): Promise<QualityRule> {
  return api.get(`/warehouse/quality-rules/${id}`).then(r => r.data)
}

/** 创建质量规则 */
export function createQualityRule(payload: QualityRuleCreatePayload): Promise<QualityRule> {
  return api.post('/warehouse/quality-rules', payload).then(r => r.data)
}

/** 更新质量规则 */
export function updateQualityRule(id: number, payload: QualityRuleUpdatePayload): Promise<QualityRule> {
  return api.patch(`/warehouse/quality-rules/${id}`, payload).then(r => r.data)
}

/** 启用质量规则 */
export function enableQualityRule(id: number): Promise<QualityRule> {
  return api.post(`/warehouse/quality-rules/${id}/enable`).then(r => r.data)
}

/** 禁用质量规则 */
export function disableQualityRule(id: number): Promise<QualityRule> {
  return api.post(`/warehouse/quality-rules/${id}/disable`).then(r => r.data)
}

/** 删除质量规则 */
export function deleteQualityRule(id: number): Promise<void> {
  return api.delete(`/warehouse/quality-rules/${id}`)
}

/** 手动执行质量规则 */
export function runQualityRule(id: number): Promise<QualityRunTriggerResult> {
  return api.post(`/warehouse/quality-rules/${id}/run`).then(r => r.data)
}

/** 质量运行历史列表 */
export function listQualityRuns(params: {
  rule_id?: number
  asset_code?: string
  status?: string
  page?: number
  page_size?: number
}): Promise<PaginatedResponse<QualityRun>> {
  return api.get('/warehouse/quality-runs', { params }).then(r => r.data)
}

/** 质量运行详情 */
export function getQualityRun(id: number): Promise<QualityRun> {
  return api.get(`/warehouse/quality-runs/${id}`).then(r => r.data)
}

/** 质量告警摘要 */
export function getQualityAlerts(): Promise<QualityAlertSummary> {
  return api.get('/warehouse/quality-alerts').then(r => r.data)
}

// ==================== UCP 薄代理 API (Q04) ====================

/** UCP 系统 */
export interface UcpSystem {
  id: number
  name: string
  status: string
}

/** UCP 资源 */
export interface UcpResource {
  id: number
  system_id: number
  name: string
  resource_type: string
  status: string
  last_test_at: string | null
  last_run_at: string | null
  config_route: string | null
}

/** UCP 资源状态 */
export interface UcpResourceStatus {
  resource_id: number
  status: string
  message: string
  enabled: boolean
}

/** UCP 资源预览 */
export interface UcpResourcePreview {
  resource_id: number
  columns: string[]
  rows: Record<string, any>[]
  total: number
  truncated: boolean
  message: string
}

/** UCP 系统列表 */
export function listUcpSystems(): Promise<UcpSystem[]> {
  return api.get('/warehouse/ucp/systems').then(r => r.data)
}

/** UCP 资源列表 */
export function listUcpResources(systemId?: number): Promise<UcpResource[]> {
  return api.get('/warehouse/ucp/resources', { params: systemId ? { system_id: systemId } : {} }).then(r => r.data)
}

/** UCP 资源状态 */
export function getUcpResourceStatus(id: number): Promise<UcpResourceStatus> {
  return api.get(`/warehouse/ucp/resources/${id}/status`).then(r => r.data)
}

/** UCP 资源预览 */
export function previewUcpResource(id: number, limit = 20): Promise<UcpResourcePreview> {
  return api.get(`/warehouse/ucp/resources/${id}/preview`, { params: { limit } }).then(r => r.data)
}

// ==================== 建模 V2 API (Q05) ====================

/** 模型版本历史 */
export interface ModelVersion {
  version: number
  status: string
  published_at: string | null
  published_by: number | null
  diff_snapshot: Record<string, any> | null
}

/** V2 预览结果 */
export interface ModelPreviewV2 {
  sql: string
  sql_explanation: string
  items: Record<string, any>[]
  columns: string[]
  total: number | null
  errors: { node_id: string; message: string }[]
}

/** V2 发布模型（含差异快照） */
export function publishModelV2(id: number): Promise<{ id: number; status: string; version: number; diff_snapshot: any }> {
  return api.post(`/warehouse/models/${id}/publish-v2`).then(r => r.data)
}

/** 模型版本历史 */
export function listModelVersions(id: number): Promise<ModelVersion[]> {
  return api.get(`/warehouse/models/${id}/versions`).then(r => r.data)
}

/** 回滚模型版本 */
export function rollbackModel(id: number, targetVersion: number): Promise<{ id: number; version: number; message: string }> {
  return api.post(`/warehouse/models/${id}/rollback`, { target_version: targetVersion }).then(r => r.data)
}

/** V2 模型预览（含 SQL 和错误定位） */
export function previewModelV2(id: number, limit = 20): Promise<ModelPreviewV2> {
  return api.post(`/warehouse/models/${id}/preview-v2`, { limit }).then(r => r.data)
}

// ==================== 执行监控 API (Q06) ====================

/** 仓内运行事件 */
export interface WarehouseRunSummary {
  run_type: string
  run_id: number
  status: string
  target_label: string
  started_at: string | null
  finished_at: string | null
  duration: number | null
  error_summary: string | null
  source_link: string | null
}

/** 告警规则 */
export interface AlertRule {
  id: number
  alert_type: string
  target_code: string
  enabled: boolean
  severity: string
  notify_channels: Record<string, any> | null
  last_triggered_at: string | null
  created_at: string | null
}

/** 告警规则创建入参 */
export interface AlertRuleCreatePayload {
  alert_type: string
  target_code: string
  enabled?: boolean
  severity?: string
  notify_channels?: Record<string, any> | null
}

/** 仓内运行事件聚合 */
export function listWarehouseRuns(params: {
  run_type?: string
  status?: string
  page?: number
  page_size?: number
}): Promise<WarehouseRunSummary[]> {
  return api.get('/warehouse/runs', { params }).then(r => r.data)
}

/** 告警规则列表 */
export function listAlertRules(): Promise<AlertRule[]> {
  return api.get('/warehouse/alert-rules').then(r => r.data)
}

/** 创建告警规则 */
export function createAlertRule(payload: AlertRuleCreatePayload): Promise<AlertRule> {
  return api.post('/warehouse/alert-rules', payload).then(r => r.data)
}

/** 删除告警规则 */
export function deleteAlertRule(id: number): Promise<void> {
  return api.delete(`/warehouse/alert-rules/${id}`)
}

/** 运行类型中文 */
export const RUN_TYPE_LABELS: Record<string, string> = {
  sync: '数据同步',
  quality: '质量检查',
  dataset_build: '数据集构建',
  metric_run: '指标运行',
  snapshot: '快照任务',
}

/** 告警类型中文 */
export const ALERT_TYPE_LABELS: Record<string, string> = {
  quality_fail: '质量失败',
  sync_fail: '同步失败',
  build_fail: '构建失败',
  metric_fail: '指标失败',
}

/** 数据集构建结果 */
export interface BuildResult {
  build_id: number
  status: string  // running/success/failed
  row_count?: number
  error_message?: string
}

/** 触发数据集物化构建 */
export function buildDataset(datasetId: number) {
  return api.post(`/warehouse/datasets/${datasetId}/build`).then(r => r.data as BuildResult)
}

// ==================== R0302 指标计算 ====================

/** 指标计算结果 */
export interface MetricResult {
  id: number
  metric_id: number
  period: string
  value: Record<string, any>
  computed_at: string | null
}

/** 指标运行记录 */
export interface MetricRun {
  id: number
  metric_id: number
  status: string
  error_message: string | null
  period: string | null
  result_id: number | null
  started_at: string | null
  finished_at: string | null
  created_at: string | null
}

/** 触发指标计算 */
export function computeMetric(metricId: number, period: string) {
  return api.post(`/warehouse/metrics/${metricId}/compute`, { period }).then(r => r.data as {
    run_id: number; metric_id: number; status: string; period: string; value: any; error_message: string | null
  })
}

/** 触发指标重算 */
export function recalcMetric(metricId: number, period: string) {
  return api.post(`/warehouse/metrics/${metricId}/recalc`, { period }).then(r => r.data)
}

/** 指标计算结果列表 */
export function listMetricResults(metricId: number, page = 1, pageSize = 20) {
  return api.get(`/warehouse/metrics/${metricId}/results`, { params: { page, page_size: pageSize } })
    .then(r => r.data as PaginatedResponse<MetricResult>)
}

/** 指标运行记录列表 */
export function listMetricRuns(metricId: number, page = 1, pageSize = 20) {
  return api.get(`/warehouse/metrics/${metricId}/runs`, { params: { page, page_size: pageSize } })
    .then(r => r.data as PaginatedResponse<MetricRun>)
}

// ==================== R0305 维度定义 ====================

/** 维度定义 */
export interface Dimension {
  id: number
  dimension_code: string
  dimension_name: string
  parent_id: number | null
  bound_table: string | null
  bound_field: string | null
  description: string | null
  display_order: number
  children?: Dimension[]
  created_at?: string
  updated_at?: string
}

/** 维度列表 */
export function listDimensions() {
  return api.get('/warehouse/dimensions').then(r => r.data as Dimension[])
}

/** 维度层级树 */
export function getDimensionTree() {
  return api.get('/warehouse/dimensions/tree').then(r => r.data as Dimension[])
}

/** 维度详情 */
export function getDimension(id: number) {
  return api.get(`/warehouse/dimensions/${id}`).then(r => r.data as Dimension)
}

/** 创建维度 */
export function createDimension(payload: Omit<Dimension, 'id' | 'children' | 'created_at' | 'updated_at'>) {
  return api.post('/warehouse/dimensions', payload).then(r => r.data as Dimension)
}

/** 更新维度 */
export function updateDimension(id: number, payload: Partial<Dimension>) {
  return api.patch(`/warehouse/dimensions/${id}`, payload).then(r => r.data as Dimension)
}

/** 删除维度 */
export function deleteDimension(id: number) {
  return api.delete(`/warehouse/dimensions/${id}`)
}

/** 维度删除影响分析 */
export function getDimensionImpact(id: number) {
  return api.get(`/warehouse/dimensions/${id}/impact`).then(r => r.data as {
    dimension_id: number; dimension_code: string; referenced_by_aggregates: any[]
    referenced_by_children: any[]; can_delete: boolean
  })
}

// ==================== R0308 DWS 聚合定义 ====================

/** DWS 聚合定义 */
export interface DwsAggregate {
  id: number
  name: string
  metric_id: number | null
  source_dataset_id: number | null
  group_by: string[]
  filter: Record<string, any> | null
  aggregation: string
  measure_field: string | null
  time_grain: string | null
  business_definition: string | null
  status: string
  created_at?: string
  updated_at?: string
}

/** 聚合定义列表 */
export function listDwsAggregates(params: { metric_id?: number; status?: string; page?: number; page_size?: number } = {}) {
  return api.get('/warehouse/dws-aggregates', { params }).then(r => r.data as PaginatedResponse<DwsAggregate>)
}

/** 聚合定义详情 */
export function getDwsAggregate(id: number) {
  return api.get(`/warehouse/dws-aggregates/${id}`).then(r => r.data as DwsAggregate)
}

/** 创建聚合定义 */
export function createDwsAggregate(payload: Omit<DwsAggregate, 'id' | 'status' | 'created_at' | 'updated_at'>) {
  return api.post('/warehouse/dws-aggregates', payload).then(r => r.data as DwsAggregate)
}

/** 更新聚合定义 */
export function updateDwsAggregate(id: number, payload: Partial<DwsAggregate>) {
  return api.patch(`/warehouse/dws-aggregates/${id}`, payload).then(r => r.data as DwsAggregate)
}

/** 删除聚合定义 */
export function deleteDwsAggregate(id: number) {
  return api.delete(`/warehouse/dws-aggregates/${id}`)
}

/** 发布聚合定义 */
export function publishDwsAggregate(id: number) {
  return api.post(`/warehouse/dws-aggregates/${id}/publish`).then(r => r.data as DwsAggregate)
}

/** 归档聚合定义 */
export function archiveDwsAggregate(id: number) {
  return api.post(`/warehouse/dws-aggregates/${id}/archive`).then(r => r.data as DwsAggregate)
}

/** 校验聚合定义 */
export function validateDwsAggregate(payload: any) {
  return api.post('/warehouse/dws-aggregates/validate', payload).then(r => r.data)
}

/** 生成 DWS 逻辑视图 */
export function generateDwsView(aggId: number) {
  return api.post(`/warehouse/dws-aggregates/${aggId}/generate-view`).then(r => r.data as {
    aggregate_id: number; view_name: string; sql_summary: string
    output_fields: string[]; dependencies: any[]; version: number; status: string
  })
}

/** DWS 视图生成影响分析 */
export function getDwsViewImpact(aggId: number) {
  return api.get(`/warehouse/dws-aggregates/${aggId}/view-impact`).then(r => r.data as {
    aggregate_id: number; aggregate_name: string; dependencies: any[]
    warnings: string[]; estimated_output_fields: number
  })
}

/** 聚合方式中文 */
export const AGGREGATION_LABELS: Record<string, string> = {
  sum: '求和', count: '计数', avg: '平均值', max: '最大值', min: '最小值',
}

/** 运行状态中文（指标运行） */
export const METRIC_RUN_STATUS_LABELS: Record<string, string> = {
  pending: '待运行', running: '运行中', success: '成功', failed: '失败',
}

// ==================== R01 标准化规则 ====================

/** 标准化规则类型 */
export const STANDARDIZATION_RULE_TYPES = [
  'rename', 'type_convert', 'value_map', 'unit_convert',
  'split_merge', 'deduplicate', 'null_handling', 'format_standardize',
] as const

/** 标准化规则类型中文 */
export const STANDARDIZATION_RULE_LABELS: Record<string, string> = {
  rename: '字段重命名', type_convert: '类型转换', value_map: '枚举映射',
  unit_convert: '单位转换', split_merge: '拆分合并', deduplicate: '去重',
  null_handling: '空值处理', format_standardize: '格式标准化',
}

/** 标准化规则 */
export interface StandardizationRule {
  id: number
  asset_type: string
  asset_code: string
  rule_type: string
  source_field: string
  target_field: string
  rule_config: Record<string, any>
  enabled: boolean
  display_order: number
  description: string | null
  created_at?: string
  updated_at?: string
}

/** 标准化模板 */
export interface StandardizationTemplate {
  id: number
  name: string
  description: string | null
  business_object: string
  template_rules: any[]
  version: number
  created_at?: string
  updated_at?: string
}

export function listStandardizationRules(params: {
  asset_type?: string; asset_code?: string; rule_type?: string
  enabled?: boolean; page?: number; page_size?: number
} = {}) {
  return api.get('/warehouse/standardization-rules', { params }).then(r => r.data as PaginatedResponse<StandardizationRule>)
}

export function getStandardizationRule(id: number) {
  return api.get(`/warehouse/standardization-rules/${id}`).then(r => r.data as StandardizationRule)
}

export function createStandardizationRule(payload: Partial<StandardizationRule>) {
  return api.post('/warehouse/standardization-rules', payload).then(r => r.data as StandardizationRule)
}

export function updateStandardizationRule(id: number, payload: Partial<StandardizationRule>) {
  return api.patch(`/warehouse/standardization-rules/${id}`, payload).then(r => r.data as StandardizationRule)
}

export function deleteStandardizationRule(id: number) {
  return api.delete(`/warehouse/standardization-rules/${id}`)
}

export function enableStandardizationRule(id: number) {
  return api.post(`/warehouse/standardization-rules/${id}/enable`).then(r => r.data as StandardizationRule)
}

export function disableStandardizationRule(id: number) {
  return api.post(`/warehouse/standardization-rules/${id}/disable`).then(r => r.data as StandardizationRule)
}

export function listStandardizationTemplates(params: { business_object?: string; page?: number; page_size?: number } = {}) {
  return api.get('/warehouse/standardization-templates', { params }).then(r => r.data as PaginatedResponse<StandardizationTemplate>)
}

export function createStandardizationTemplate(payload: Partial<StandardizationTemplate>) {
  return api.post('/warehouse/standardization-templates', payload).then(r => r.data as StandardizationTemplate)
}

export function deleteStandardizationTemplate(id: number) {
  return api.delete(`/warehouse/standardization-templates/${id}`)
}

export function loadTemplateToAsset(templateId: number, assetCode: string, assetType = 'table', onConflict = 'skip') {
  return api.post(`/warehouse/standardization-templates/${templateId}/load`, {
    asset_code: assetCode, asset_type: assetType, on_conflict: onConflict,
  }).then(r => r.data)
}

export function previewStandardization(payload: {
  asset_code: string; rule_ids: number[]; inline_rules: any[]; sample_size?: number
}) {
  return api.post('/warehouse/standardization-rules/preview', payload).then(r => r.data)
}

export function executeStandardization(assetCode: string, targetTable?: string) {
  return api.post('/warehouse/standardization-rules/execute', {
    asset_code: assetCode, target_table: targetTable || undefined,
  }).then(r => r.data as { total: number; success: number; failed: number; errors: any[]; target_table: string })
}

export function generateDwdView(assetCode: string, assetType = 'table') {
  return api.post('/warehouse/standardization-rules/generate-dwd-view', {
    asset_code: assetCode, asset_type: assetType,
  }).then(r => r.data as { dataset_id: number; view_name: string; version: number })
}
