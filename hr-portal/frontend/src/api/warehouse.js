/**
 * 数据仓库 API 封装
 *
 * 集中管理 /api/v1/warehouse/* 接口。
 * 复用项目全局 axios client（baseURL=/api/v1），不新建 request 实例。
 */
import { api } from './client';
// ==================== 资产 API ====================
/** 资产列表（分页 + 筛选） */
export function listAssets(params) {
    return api.get('/warehouse/assets', { params }).then(r => r.data);
}
/** 资产详情（含 UCP 协同信息） */
export function getAsset(tableName) {
    return api.get(`/warehouse/assets/${encodeURIComponent(tableName)}`).then(r => r.data);
}
/** 更新资产 */
export function updateAsset(tableName, payload) {
    return api.patch(`/warehouse/assets/${encodeURIComponent(tableName)}`, payload).then(r => r.data);
}
export function updatePeriodConfig(tableName, payload) {
    return api.put(`/warehouse/assets/${encodeURIComponent(tableName)}/period-config`, payload).then(r => r.data);
}
export function listAssetColumns(tableName, options = {}) {
    return api.get(`/warehouse/assets/${encodeURIComponent(tableName)}/columns`, { params: options }).then(r => r.data);
}
/** 获取资产级端点聚合（来源与开放） */
export function getAssetEndpoints(tableName) {
    return api.get(`/warehouse/assets/${encodeURIComponent(tableName)}/endpoints`).then(r => r.data);
}
/** 获取资产同步/推送历史聚合 */
export function getAssetSyncHistory(tableName, limit = 20) {
    return api.get(`/warehouse/assets/${encodeURIComponent(tableName)}/sync-history`, { params: { limit } }).then(r => r.data);
}
// ==================== 模型 API ====================
/** 模型列表（分页 + 筛选） */
export function listModels(params) {
    return api.get('/warehouse/models', { params }).then(r => r.data);
}
/** 创建模型（返回简化结构，不含完整 tables/relations/output_fields） */
export function createModel(payload) {
    return api.post('/warehouse/models', payload).then(r => r.data);
}
/** 模型详情 */
export function getModel(id) {
    return api.get(`/warehouse/models/${id}`).then(r => r.data);
}
/** 更新模型（router 内部调用 get_model 返回完整详情） */
export function updateModel(id, payload) {
    return api.patch(`/warehouse/models/${id}`, payload).then(r => r.data);
}
/** 发布模型（返回简化结构：{id, status, version}） */
export function publishModel(id) {
    return api.post(`/warehouse/models/${id}/publish`).then(r => r.data);
}
/** 归档模型 */
export function archiveModel(id) {
    return api.post(`/warehouse/models/${id}/archive`).then(r => r.data);
}
/** 模型预览（payload 可选，对齐后端 payload: dict | None） */
export function previewModel(id, payload = {}) {
    return api.post(`/warehouse/models/${id}/preview`, { limit: payload.limit ?? 20 }).then(r => r.data);
}
/** 获取输出字段 */
export function getOutputFields(id) {
    return api.get(`/warehouse/models/${id}/output-fields`).then(r => r.data);
}
/** 保存输出字段（全量覆盖） */
export function saveOutputFields(id, fields) {
    return api.put(`/warehouse/models/${id}/output-fields`, fields).then(r => r.data);
}
// ==================== 指标 API ====================
/** 指标列表（分页 + 筛选） */
export function listMetrics(params) {
    return api.get('/warehouse/metrics', { params }).then(r => r.data);
}
/** 创建指标 */
export function createMetric(payload) {
    return api.post('/warehouse/metrics', payload).then(r => r.data);
}
/** 翻译 Excel 公式为 SQL（预览，不存储） */
export function translateFormula(formula_expr, dataset_id) {
    return api.post('/warehouse/metrics/translate-formula', { formula_expr, dataset_id }).then(r => r.data);
}
export function compileFormula(payload) {
    return api.post('/warehouse/metrics/compile-formula', payload).then(r => r.data);
}
/** 指标详情 */
export function getMetric(id) {
    return api.get(`/warehouse/metrics/${id}`).then(r => r.data);
}
/** 更新指标 */
export function updateMetric(id, payload) {
    return api.patch(`/warehouse/metrics/${id}`, payload).then(r => r.data);
}
/** 发布指标 */
export function publishMetric(id) {
    return api.post(`/warehouse/metrics/${id}/publish`).then(r => r.data);
}
/** 归档指标 */
export function archiveMetric(id) {
    return api.post(`/warehouse/metrics/${id}/archive`).then(r => r.data);
}
// ==================== 影响分析 API ====================
/** 表影响分析 */
export function impactTable(tableName) {
    return api.get(`/warehouse/impact/table/${encodeURIComponent(tableName)}`).then(r => r.data);
}
/** 字段影响分析 */
export function impactField(tableName, columnCode) {
    return api.get('/warehouse/impact/field', {
        params: { table_name: tableName, column_code: columnCode },
    }).then(r => r.data);
}
/** 模型影响分析 */
export function impactModel(datasetId) {
    return api.get(`/warehouse/impact/model/${datasetId}`).then(r => r.data);
}
// ==================== UCP 协同辅助 ====================
/** 判断 UCP 是否已启用且有可跳转资源 */
export function isUcpConnected(ucp) {
    return !!(ucp && ucp.enabled && ucp.resource_id);
}
/** 获取 UCP 跳转路由 */
export function getUcpRoute(ucp) {
    if (!isUcpConnected(ucp))
        return null;
    return ucp.config_route;
}
/** UCP 未启用时的提示文案 */
export const UCP_DISABLED_TEXT = '数据连接平台未启用';
/** UCP 已启用但未关联时的提示文案 */
export const UCP_NOT_CONNECTED_TEXT = '未关联 UCP 资源';
/** 获取二期灰度开关 */
export function getWarehouseFeatures() {
    return api.get('/warehouse/features').then(r => r.data);
}
export function getOdsDwdAutomationConfig(odsTableName) {
    return api.get(`/warehouse/ods-dwd-automation-configs/${encodeURIComponent(odsTableName)}`).then(r => r.data);
}
export function listOdsDwdAutomationConfigs(params) {
    return api.get('/warehouse/ods-dwd-automation-configs', { params }).then(r => r.data);
}
export function createOdsDwdAutomationConfig(data) {
    return api.post('/warehouse/ods-dwd-automation-configs', data).then(r => r.data);
}
export function updateOdsDwdAutomationConfig(odsTableName, data) {
    return api.put(`/warehouse/ods-dwd-automation-configs/${encodeURIComponent(odsTableName)}`, data).then(r => r.data);
}
export function deleteOdsDwdAutomationConfig(odsTableName) {
    return api.delete(`/warehouse/ods-dwd-automation-configs/${encodeURIComponent(odsTableName)}`);
}
export function triggerOdsDwdSync(odsTableName, periodValue) {
    return api.post(`/warehouse/ods-dwd-automation-configs/${encodeURIComponent(odsTableName)}/trigger`, periodValue ? { period_value: periodValue } : undefined).then(r => r.data);
}
export function listOdsDwdAutomationExecutions(odsTableName, pageSize) {
    return api.get(`/warehouse/ods-dwd-automation-executions/${encodeURIComponent(odsTableName)}`, { params: { page_size: pageSize || 5 } }).then(r => r.data);
}
export function detectOdsSyncSemantics(odsTableName) {
    return api.get(`/warehouse/ods-dwd-automation-configs/${encodeURIComponent(odsTableName)}/detect-semantics`).then(r => r.data);
}
/** 批量修改资产分层 */
export function batchUpdateAssetLayer(payload) {
    return api.patch('/warehouse/assets/batch-layer', payload).then(r => r.data);
}
/** 获取分层概览统计 */
export function getLayerStats() {
    return api.get('/warehouse/assets/layer-stats').then(r => r.data);
}
/** 表级血缘 */
export function getTableLineage(tableName, depth = 3, limit = 50) {
    return api.get(`/warehouse/lineage/table/${encodeURIComponent(tableName)}`, {
        params: { depth, limit },
    }).then(r => r.data);
}
/** 字段级血缘 */
export function getFieldLineage(tableName, columnCode, depth = 3, limit = 50) {
    return api.get('/warehouse/lineage/field', {
        params: { table_name: tableName, column_code: columnCode, depth, limit },
    }).then(r => r.data);
}
/** 血缘节点类型配置 */
export const LINEAGE_NODE_COLORS = {
    table: '#409EFF',
    field: '#67C23A',
    dataset: '#E6A23C',
    metric: '#F56C6C',
    report: '#909399',
    datasource: '#337ECC',
    ucp_resource: '#01C9B8',
    notification: '#B37FEB',
};
/** 血缘节点类型中文 */
export const LINEAGE_NODE_LABELS = {
    table: '数据表',
    field: '字段',
    dataset: '数据集',
    metric: '指标',
    report: '报表',
    datasource: '数据源',
    ucp_resource: 'UCP资源',
    notification: '通知',
};
/** 血缘关系类型中文 */
export const LINEAGE_EDGE_LABELS = {
    sync: '同步',
    reference: '引用',
    calculation: '计算',
    output: '输出',
};
/** 质量规则类型中文 */
export const QUALITY_RULE_TYPE_LABELS = {
    not_null: '非空检查',
    unique: '唯一性检查',
    enum: '枚举检查',
    date_format: '日期格式检查',
    referential_integrity: '引用完整性',
    relation_cardinality: '关系基数检查',
    custom_sql: '自定义 SQL',
};
/** 质量严重级别中文 */
export const QUALITY_SEVERITY_LABELS = {
    info: '提示',
    warn: '警告',
    error: '严重',
};
/** 质量规则列表 */
export function listQualityRules(params) {
    return api.get('/warehouse/quality-rules', { params }).then(r => r.data);
}
/** 质量规则详情 */
export function getQualityRule(id) {
    return api.get(`/warehouse/quality-rules/${id}`).then(r => r.data);
}
/** 关系质量规则元数据 */
export function getQualityRelationMetadata() {
    return api.get('/warehouse/quality-rules/relation-metadata').then(r => r.data);
}
/** 创建质量规则 */
export function createQualityRule(payload) {
    return api.post('/warehouse/quality-rules', payload).then(r => r.data);
}
/** 更新质量规则 */
export function updateQualityRule(id, payload) {
    return api.patch(`/warehouse/quality-rules/${id}`, payload).then(r => r.data);
}
/** 启用质量规则 */
export function enableQualityRule(id) {
    return api.post(`/warehouse/quality-rules/${id}/enable`).then(r => r.data);
}
/** 禁用质量规则 */
export function disableQualityRule(id) {
    return api.post(`/warehouse/quality-rules/${id}/disable`).then(r => r.data);
}
/** 删除质量规则 */
export function deleteQualityRule(id) {
    return api.delete(`/warehouse/quality-rules/${id}`);
}
export function runQualityRule(id, payload = {}) {
    return api.post(`/warehouse/quality-rules/${id}/run`, payload).then(r => r.data);
}
/** 质量运行历史列表 */
export function listQualityRuns(params) {
    return api.get('/warehouse/quality-runs', { params }).then(r => r.data);
}
/** 质量运行详情 */
export function getQualityRun(id) {
    return api.get(`/warehouse/quality-runs/${id}`).then(r => r.data);
}
/** 质量告警摘要 */
export function getQualityAlerts() {
    return api.get('/warehouse/quality-alerts').then(r => r.data);
}
/** 按资产期间查询质量状态 */
export function listQualityStatus(params) {
    return api.get('/warehouse/quality-status', { params }).then(r => r.data);
}
export function getQualityStatusImpact(params) {
    return api.get('/warehouse/quality-status/impact', { params }).then(r => r.data);
}
export function rebuildQualityStatusIndex() {
    return api.post('/warehouse/quality-status/rebuild-index').then(r => r.data);
}
/** UCP 系统列表 */
export function listUcpSystems() {
    return api.get('/warehouse/ucp/systems').then(r => r.data);
}
/** UCP 资源列表 */
export function listUcpResources(systemId) {
    return api.get('/warehouse/ucp/resources', { params: systemId ? { system_id: systemId } : {} }).then(r => r.data);
}
/** UCP 资源状态 */
export function getUcpResourceStatus(id) {
    return api.get(`/warehouse/ucp/resources/${id}/status`).then(r => r.data);
}
/** UCP 资源预览 */
export function previewUcpResource(id, limit = 20) {
    return api.get(`/warehouse/ucp/resources/${id}/preview`, { params: { limit } }).then(r => r.data);
}
/** V2 发布模型（含差异快照） */
export function publishModelV2(id) {
    return api.post(`/warehouse/models/${id}/publish-v2`).then(r => r.data);
}
/** 模型版本历史 */
export function listModelVersions(id) {
    return api.get(`/warehouse/models/${id}/versions`).then(r => r.data);
}
/** 回滚模型版本 */
export function rollbackModel(id, targetVersion) {
    return api.post(`/warehouse/models/${id}/rollback`, { target_version: targetVersion }).then(r => r.data);
}
/** V2 模型预览（含 SQL 和错误定位） */
export function previewModelV2(id, limit = 20) {
    return api.post(`/warehouse/models/${id}/preview-v2`, { limit }).then(r => r.data);
}
/** 仓内运行事件聚合 */
export function listWarehouseRuns(params) {
    return api.get('/warehouse/runs', { params }).then(r => r.data);
}
/** 告警规则列表 */
export function listAlertRules() {
    return api.get('/warehouse/alert-rules').then(r => r.data);
}
/** 创建告警规则 */
export function createAlertRule(payload) {
    return api.post('/warehouse/alert-rules', payload).then(r => r.data);
}
/** 删除告警规则 */
export function deleteAlertRule(id) {
    return api.delete(`/warehouse/alert-rules/${id}`);
}
/** 运行类型中文 */
export const RUN_TYPE_LABELS = {
    sync: '数据同步',
    quality: '质量检查',
    dataset_build: '数据集构建',
    metric_run: '指标运行',
    snapshot: '快照任务',
};
/** 告警类型中文 */
export const ALERT_TYPE_LABELS = {
    quality_fail: '质量失败',
    sync_fail: '同步失败',
    build_fail: '构建失败',
    metric_fail: '指标失败',
};
/** 触发数据集物化构建 */
export function buildDataset(datasetId) {
    return api.post(`/warehouse/datasets/${datasetId}/build`).then(r => r.data);
}
/** 触发指标计算 */
export function computeMetric(metricId, period) {
    return api.post(`/warehouse/metrics/${metricId}/compute`, { period }).then(r => r.data);
}
/** 触发指标重算 */
export function recalcMetric(metricId, period) {
    return api.post(`/warehouse/metrics/${metricId}/recalc`, { period }).then(r => r.data);
}
/** 指标计算结果列表 */
export function listMetricResults(metricId, page = 1, pageSize = 20) {
    return api.get(`/warehouse/metrics/${metricId}/results`, { params: { page, page_size: pageSize } })
        .then(r => r.data);
}
/** 指标运行记录列表 */
export function listMetricRuns(metricId, page = 1, pageSize = 20) {
    return api.get(`/warehouse/metrics/${metricId}/runs`, { params: { page, page_size: pageSize } })
        .then(r => r.data);
}
/** 维度列表 */
export function listDimensions() {
    return api.get('/warehouse/dimensions').then(r => r.data);
}
/** 维度层级树 */
export function getDimensionTree() {
    return api.get('/warehouse/dimensions/tree').then(r => r.data);
}
/** 维度详情 */
export function getDimension(id) {
    return api.get(`/warehouse/dimensions/${id}`).then(r => r.data);
}
/** 创建维度 */
export function createDimension(payload) {
    return api.post('/warehouse/dimensions', payload).then(r => r.data);
}
/** 更新维度 */
export function updateDimension(id, payload) {
    return api.patch(`/warehouse/dimensions/${id}`, payload).then(r => r.data);
}
/** 删除维度 */
export function deleteDimension(id) {
    return api.delete(`/warehouse/dimensions/${id}`);
}
/** 维度删除影响分析 */
export function getDimensionImpact(id) {
    return api.get(`/warehouse/dimensions/${id}/impact`).then(r => r.data);
}
/** 聚合定义列表 */
export function listDwsAggregates(params = {}) {
    return api.get('/warehouse/dws-aggregates', { params }).then(r => r.data);
}
/** 聚合定义详情 */
export function getDwsAggregate(id) {
    return api.get(`/warehouse/dws-aggregates/${id}`).then(r => r.data);
}
/** 创建聚合定义 */
export function createDwsAggregate(payload) {
    return api.post('/warehouse/dws-aggregates', payload).then(r => r.data);
}
/** 更新聚合定义 */
export function updateDwsAggregate(id, payload) {
    return api.patch(`/warehouse/dws-aggregates/${id}`, payload).then(r => r.data);
}
/** 删除聚合定义 */
export function deleteDwsAggregate(id) {
    return api.delete(`/warehouse/dws-aggregates/${id}`);
}
/** 发布聚合定义 */
export function publishDwsAggregate(id) {
    return api.post(`/warehouse/dws-aggregates/${id}/publish`).then(r => r.data);
}
/** 归档聚合定义 */
export function archiveDwsAggregate(id) {
    return api.post(`/warehouse/dws-aggregates/${id}/archive`).then(r => r.data);
}
/** 校验聚合定义 */
export function validateDwsAggregate(payload) {
    return api.post('/warehouse/dws-aggregates/validate', payload).then(r => r.data);
}
/** 生成 DWS 逻辑视图 */
export function generateDwsView(aggId) {
    return api.post(`/warehouse/dws-aggregates/${aggId}/generate-view`).then(r => r.data);
}
/** DWS 视图生成影响分析 */
export function getDwsViewImpact(aggId) {
    return api.get(`/warehouse/dws-aggregates/${aggId}/view-impact`).then(r => r.data);
}
/** 多度量 DWS 宽表计算 */
export function computeDwsAggregate(aggId, period) {
    return api.post(`/warehouse/dws-aggregates/${aggId}/compute`, { period }).then(r => r.data);
}
/** 聚合方式中文 */
export const AGGREGATION_LABELS = {
    sum: '求和', count: '计数', avg: '平均值', max: '最大值', min: '最小值',
};
/** 运行状态中文（指标运行） */
export const METRIC_RUN_STATUS_LABELS = {
    pending: '待运行', running: '运行中', success: '成功', failed: '失败',
};
// ==================== R01 标准化规则 ====================
/** 标准化规则类型 */
export const STANDARDIZATION_RULE_TYPES = [
    'rename', 'type_convert', 'value_map', 'unit_convert',
    'split_merge', 'deduplicate', 'null_handling', 'format_standardize',
];
/** 标准化规则类型中文 */
export const STANDARDIZATION_RULE_LABELS = {
    rename: '字段重命名', type_convert: '类型转换', value_map: '枚举映射',
    unit_convert: '单位转换', split_merge: '拆分合并', deduplicate: '去重',
    null_handling: '空值处理', format_standardize: '格式标准化',
};
export function listStandardizationRules(params = {}) {
    return api.get('/warehouse/standardization-rules', { params }).then(r => r.data);
}
export function getStandardizationRule(id) {
    return api.get(`/warehouse/standardization-rules/${id}`).then(r => r.data);
}
export function createStandardizationRule(payload) {
    return api.post('/warehouse/standardization-rules', payload).then(r => r.data);
}
export function updateStandardizationRule(id, payload) {
    return api.patch(`/warehouse/standardization-rules/${id}`, payload).then(r => r.data);
}
export function deleteStandardizationRule(id) {
    return api.delete(`/warehouse/standardization-rules/${id}`);
}
export function enableStandardizationRule(id) {
    return api.post(`/warehouse/standardization-rules/${id}/enable`).then(r => r.data);
}
export function disableStandardizationRule(id) {
    return api.post(`/warehouse/standardization-rules/${id}/disable`).then(r => r.data);
}
export function listStandardizationTemplates(params = {}) {
    return api.get('/warehouse/standardization-templates', { params }).then(r => r.data);
}
export function createStandardizationTemplate(payload) {
    return api.post('/warehouse/standardization-templates', payload).then(r => r.data);
}
export function deleteStandardizationTemplate(id) {
    return api.delete(`/warehouse/standardization-templates/${id}`);
}
export function loadTemplateToAsset(templateId, assetCode, assetType = 'table', onConflict = 'skip') {
    return api.post(`/warehouse/standardization-templates/${templateId}/load`, {
        asset_code: assetCode, asset_type: assetType, on_conflict: onConflict,
    }).then(r => r.data);
}
export function previewStandardization(payload) {
    return api.post('/warehouse/standardization-rules/preview', payload).then(r => r.data);
}
export function executeStandardization(assetCode, targetTable) {
    return api.post('/warehouse/standardization-rules/execute', {
        asset_code: assetCode, target_table: targetTable || undefined,
    }).then(r => r.data);
}
export function generateDwdView(assetCode, assetType = 'table') {
    return api.post('/warehouse/standardization-rules/generate-dwd-view', {
        asset_code: assetCode, asset_type: assetType,
    }).then(r => r.data);
}
/** 诊断指标是否可自动化 */
export function diagnoseMetric(metricId) {
    return api.get(`/warehouse/metric-automation/diagnose/${metricId}`).then(r => r.data);
}
/** 生成 DWS 草稿 */
export function generateDwsDraft(payload) {
    return api.post('/warehouse/metric-automation/dws-draft', payload).then(r => r.data);
}
export function previewMetricDraft(payload) {
    return api.post('/warehouse/metric-automation/preview', payload).then(r => r.data);
}
/** 发布 DWS/ADS 草稿 */
export function publishMetricDraft(payload) {
    return api.post('/warehouse/metric-automation/publish', payload).then(r => r.data);
}
/** 回滚 DWS/ADS */
export function rollbackMetricDraft(payload) {
    return api.post('/warehouse/metric-automation/rollback', payload).then(r => r.data);
}
/** 生成 ADS 草稿 */
export function generateAdsDraft(payload) {
    return api.post('/warehouse/metric-automation/ads-draft', payload).then(r => r.data);
}
/** ADS 下游影响分析 */
export function getAdsImpact(adsId) {
    return api.get(`/warehouse/metric-automation/ads-impact/${adsId}`).then(r => r.data);
}
/** BI 消费契约 */
export function getBiContract(assetType, assetId) {
    return api.get(`/warehouse/metric-automation/bi-contract/${assetType}/${assetId}`).then(r => r.data);
}
/** 指标变更下游更新方案 */
export function getMetricChangePlan(metricId) {
    return api.get(`/warehouse/metric-automation/change-plan/${metricId}`).then(r => r.data);
}
/** 获取刷新策略 */
export function getRefreshStrategy(assetType, assetId) {
    return api.get(`/warehouse/metric-automation/refresh-strategy/${assetType}/${assetId}`).then(r => r.data);
}
/** 设置刷新策略 */
export function setRefreshStrategy(assetType, assetId, strategy) {
    return api.put(`/warehouse/metric-automation/refresh-strategy/${assetType}/${assetId}`, null, { params: { strategy } }).then(r => r.data);
}
/** 指标自动化审计时间线 */
export function getMetricAutomationTimeline(metricId) {
    return api.get(`/warehouse/metric-automation/timeline/${metricId}`).then(r => r.data);
}
// L4 审批
export function listL4Approvals(params) {
    return api.get('/warehouse/l4-auto/approvals', { params }).then(r => r.data);
}
export function createL4Approval(payload) {
    return api.post('/warehouse/l4-auto/approvals', payload).then(r => r.data);
}
export function approveL4Approval(id, reason) {
    return api.put(`/warehouse/l4-auto/approvals/${id}/approve`, { reason }).then(r => r.data);
}
export function rejectL4Approval(id, reason) {
    return api.put(`/warehouse/l4-auto/approvals/${id}/reject`, { reason }).then(r => r.data);
}
export function revokeL4Approval(id) {
    return api.delete(`/warehouse/l4-auto/approvals/${id}`).then(r => r.data);
}
// L4 级联规则
export function getL4CascadeRule(metricId) {
    return api.get(`/warehouse/l4-auto/rules/${metricId}`).then(r => r.data);
}
export function updateL4CascadeRule(metricId, payload) {
    return api.put(`/warehouse/l4-auto/rules/${metricId}`, payload).then(r => r.data);
}
// L4 审计
export function getL4Timeline(metricId) {
    return api.get(`/warehouse/l4-auto/timeline/${metricId}`).then(r => r.data);
}
export function getL4Summary() {
    return api.get('/warehouse/l4-auto/summary').then(r => r.data);
}
export function listL4Executions(params) {
    return api.get('/warehouse/l4-auto/executions', { params }).then(r => r.data);
}
// L4 紧急停止 & 回滚
export function getL4Status() {
    return api.get('/warehouse/l4-auto/status').then(r => r.data);
}
export function emergencyStopL4(reason) {
    return api.post('/warehouse/l4-auto/emergency-stop', null, { params: { reason } }).then(r => r.data);
}
export function resumeL4() {
    return api.post('/warehouse/l4-auto/resume').then(r => r.data);
}
export function rollbackL4Metric(metricId) {
    return api.post(`/warehouse/l4-auto/rollback/${metricId}`).then(r => r.data);
}
/** 组件角色中文 */
export const COMPONENT_ROLE_LABELS = {
    numerator: '分子',
    denominator: '分母',
    base: '基期',
    compare: '对比',
    custom: '自定义',
    rate: '比率',
};
/** 列出指标组件 */
export function listMetricComponents(metricId) {
    return api.get(`/warehouse/metrics/${metricId}/components`).then(r => r.data);
}
/** 创建组件 */
export function createMetricComponent(metricId, payload) {
    return api.post(`/warehouse/metrics/${metricId}/components`, payload).then(r => r.data);
}
/** 更新组件 */
export function updateMetricComponent(metricId, componentId, payload) {
    return api.put(`/warehouse/metrics/${metricId}/components/${componentId}`, payload).then(r => r.data);
}
/** 删除组件 */
export function deleteMetricComponent(metricId, componentId) {
    return api.delete(`/warehouse/metrics/${metricId}/components/${componentId}`);
}
/** 批量保存组件（MR0213） */
export function batchSaveMetricComponents(metricId, payload) {
    return api.post(`/warehouse/metrics/${metricId}/components/batch`, payload).then(r => r.data);
}
/** 公式拆解（MR0207） */
export function decomposeFormula(formulaExpr, datasetId, metricCode) {
    return api.post('/warehouse/metrics/decompose-formula', {
        formula_expr: formulaExpr,
        dataset_id: datasetId,
        ...(metricCode ? { metric_code: metricCode } : {}),
    }).then(r => r.data);
}
/** 获取指标解释上下文（MR0301） */
export function getMetricExplain(metricId, period) {
    return api.get(`/warehouse/metrics/${metricId}/explain`, {
        params: period ? { period } : {},
    }).then(r => r.data);
}
/** 获取 AI-ready 上下文（MR0305） */
export function getMetricAiContext(metricId, period) {
    return api.get(`/warehouse/metrics/${metricId}/ai-context`, {
        params: { period },
    }).then(r => r.data);
}
/** 获取指标血缘图（MR0303） */
export function getMetricLineage(metricId, depth, limit) {
    return api.get(`/warehouse/metrics/${metricId}/lineage`, {
        params: { depth, limit },
    }).then(r => r.data);
}
/** 获取指标下游引用列表（MR0304） */
export function getMetricDownstreamRefs(metricId, limit) {
    return api.get(`/warehouse/metrics/${metricId}/downstream-refs`, {
        params: { limit },
    }).then(r => r.data);
}
/** 获取结果明细（MR0306 权限态 + MR0101 分页） */
export function getMetricResultDetail(metricId, resultId, period, params = {}) {
    return api.get(`/warehouse/metrics/${metricId}/results/${resultId}/detail`, {
        params: { period, ...params },
    }).then(r => r.data);
}
/** 记录导出审计事件（MR0307） */
export function recordExportAudit(metricId, resultId) {
    return api.post(`/warehouse/metrics/${metricId}/results/${resultId}/export-audit`).then(r => r.data);
}
/** 导出结果明细为 CSV 文件（MR0102 真实文件导出，返回 Blob） */
export function exportMetricResult(metricId, resultId, period) {
    return api.get(`/warehouse/metrics/${metricId}/results/${resultId}/export`, {
        params: { period },
        responseType: 'blob',
    }).then(r => r.data);
}
/** 记录 AI 解释审计事件（MR0307） */
export function recordAiExplainAudit(metricId, period) {
    return api.post(`/warehouse/metrics/${metricId}/ai-explain-audit`, null, {
        params: { period },
    }).then(r => r.data);
}
