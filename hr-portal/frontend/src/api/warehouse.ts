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
}

/** 资产字段信息（对齐后端 get_asset_columns 实际返回） */
export interface AssetColumn {
  column_code: string
  column_label: string
  data_type: string
  is_pk_part: boolean
  is_sensitive: boolean
  agg_role: string
  is_visible: boolean
  description: string | null
  source: string
  is_computed: boolean
  formula_expr: string | null
  display_order: number
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
