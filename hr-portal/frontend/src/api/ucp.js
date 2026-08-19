import { api } from './client';
function extractItems(data) {
    return data.items ?? [];
}
/* ── API ── */
export const ucpApi = {
    executions: (params = {}) => api.get('/ucp/executions', { params }).then((r) => ({ total: r.data.total, items: extractItems(r.data) })),
    ingestBatches: (params = {}) => api.get('/ucp/warehouse-ingest-batches', { params }).then((r) => r.data),
    ingestBatchDetail: (resourceCode, batchId) => api.get(`/ucp/warehouse-ingest-batches/${resourceCode}/${batchId}`).then((r) => r.data),
    ingestBatchReplay: (resourceCode, batchId) => api.post(`/ucp/warehouse-ingest-batches/${resourceCode}/${batchId}/replay`).then((r) => r.data),
    executionDetail: (pipelineRunId) => api.get(`/ucp/executions/${pipelineRunId}`).then((r) => r.data),
    /* Manual trigger (Phase 2-4: with concurrent lock + permission + params) */
    runPipeline: (pipelineCode, params) => api.post(`/ucp/pipelines/${pipelineCode}/run`, params ?? {}, { timeout: params?.dry_run ? 60000 : 300000 }).then((r) => r.data),
    /* Failed items */
    failedItems: (pipelineRunId) => api.get(`/ucp/executions/${pipelineRunId}/failed-items`).then((r) => ({ total: r.data.total, items: extractItems(r.data) })),
    /* Phase 2-2: Retry failed (real implementation) */
    retryFailed: (pipelineRunId) => api.post(`/ucp/executions/${pipelineRunId}/retry-failed`).then((r) => r.data),
    /* Phase 2-2: Retry a single step */
    /* Phase 2-3: 单项重跑 */
    retryItem: (pipelineRunId, itemId) => api.post(`/ucp/executions/${pipelineRunId}/items/${itemId}/retry`).then((r) => r.data),
    retryStep: (pipelineRunId, stepRunId) => api.post(`/ucp/executions/${pipelineRunId}/steps/${stepRunId}/retry`).then((r) => r.data),
    /* Seed Offer sync pipeline */
    seedOfferSync: () => api.post('/ucp/seed/offer-sync').then((r) => r.data),
    /* ── Credential Config CRUD ── */
    credentials: (authType) => api.get('/ucp/credentials', { params: { auth_type: authType } }).then((r) => ({ total: r.data.total, items: extractItems(r.data) })),
    createCredential: (payload) => api.post('/ucp/credentials', payload).then((r) => r.data),
    updateCredential: (credentialId, payload) => api.patch(`/ucp/credentials/${credentialId}`, payload).then((r) => r.data),
    toggleCredential: (credentialId, is_active) => api.patch(`/ucp/credentials/${credentialId}/toggle`, { is_active }).then((r) => r.data),
    /* ── Phase 4: System + Resource (1:N) ── */
    systems: (systemType) => api.get('/ucp/systems', { params: systemType ? { system_type: systemType } : {} }).then((r) => r.data),
    systemDetail: (systemId) => api.get(`/ucp/systems/${systemId}`).then((r) => r.data),
    systemsOverview: () => api.get('/ucp/systems/overview').then((r) => r.data),
    connectorTypes: (consumer = 'ucp') => api.get('/datasources/types', { params: { consumer } }).then((r) => r.data.items),
    resourceConfigurationProfiles: (objectType) => api.get('/ucp/resource-configuration-profiles', { params: objectType ? { object_type: objectType } : {} }).then((r) => r.data.items),
    connectorPackages: (params = {}) => api.get('/ucp/connector-packages', { params }).then((r) => r.data.items),
    connectorPackage: (packageCode) => api.get('/ucp/connector-packages/' + packageCode).then((r) => r.data),
    resourceTemplateImpact: (packageCode) => api.get('/ucp/connector-packages/' + packageCode + '/resource-impact').then((r) => r.data),
    createConnectorPackage: (payload) => api.post('/ucp/connector-packages', payload).then((r) => r.data),
    updateConnectorPackage: (packageCode, payload) => api.patch(`/ucp/connector-packages/${packageCode}`, payload).then((r) => r.data),
    validateConnectorPackage: (packageCode) => api.post(`/ucp/connector-packages/${packageCode}/validate`).then((r) => r.data),
    publishConnectorPackage: (packageCode) => api.post(`/ucp/connector-packages/${packageCode}/publish`).then((r) => r.data),
    deprecateConnectorPackage: (packageCode) => api.post(`/ucp/connector-packages/${packageCode}/deprecate`).then((r) => r.data),
    packageOperations: (packageCode) => api.get(`/ucp/connector-packages/${packageCode}/operations`).then((r) => r.data.items),
    createPackageOperation: (packageCode, payload) => api.post(`/ucp/connector-packages/${packageCode}/operations`, payload).then((r) => r.data),
    updatePackageOperation: (packageCode, operationId, payload) => api.patch(`/ucp/connector-packages/${packageCode}/operations/${operationId}`, payload).then((r) => r.data),
    testPackageOperation: (packageCode, operationId, payload) => api.post(`/ucp/connector-packages/${packageCode}/operations/${operationId}/test`, payload).then((r) => r.data),
    ensureCatalogTestInstance: (packageCode) => api.post(`/ucp/connector-packages/${packageCode}/catalog-test-instance`).then((r) => r.data),
    publishPackageOperation: (packageCode, operationId) => api.post(`/ucp/connector-packages/${packageCode}/operations/${operationId}/publish`).then((r) => r.data),
    disablePackageOperation: (packageCode, operationId) => api.post(`/ucp/connector-packages/${packageCode}/operations/${operationId}/disable`).then((r) => r.data),
    previewPackageOpenApi: (packageCode, document) => api.post(`/ucp/connector-packages/${packageCode}/operations/openapi/preview`, { document }).then((r) => r.data),
    importPackageOpenApi: (packageCode, payload) => api.post(`/ucp/connector-packages/${packageCode}/operations/openapi/import`, payload).then((r) => r.data),
    systemCapabilities: (systemId) => api.get(`/ucp/systems/${systemId}/capabilities`).then((r) => r.data.items),
    setSystemCapability: (systemId, operationId, payload) => api.put(`/ucp/systems/${systemId}/capabilities/${operationId}`, payload).then((r) => r.data),
    testSystemCapability: (systemId, operationId, parameters) => api.post(`/ucp/systems/${systemId}/capabilities/${operationId}/test`, { parameters }).then((r) => r.data),
    systemCapabilityTestRuns: (systemId, operationId, limit = 20) => api.get(`/ucp/systems/${systemId}/capabilities/${operationId}/test-runs`, { params: { limit } }).then((r) => r.data.items),
    verifiedCapabilityCatalog: () => api.get('/ucp/capabilities/catalog').then((r) => r.data.items),
    capabilityCatalog: (params = {}) => api.get('/ucp/capabilities/catalog', { params }).then((r) => r.data.items),
    createSystem: (payload) => api.post('/ucp/systems', payload).then((r) => r.data),
    updateSystem: (systemId, payload) => api.patch(`/ucp/systems/${systemId}`, payload).then((r) => r.data),
    deleteSystem: (systemId) => api.delete(`/ucp/systems/${systemId}`).then((r) => r.data),
    /* ── Resource (一张表/一个 API) ── */
    resources: (params = {}) => api.get('/ucp/resources', { params }).then((r) => r.data),
    resourceTemplates: (systemId) => api.get(`/ucp/systems/${systemId}/resource-templates`).then((r) => r.data.items),
    createResource: (payload) => api.post('/ucp/resources', payload).then((r) => r.data),
    updateResource: (resourceId, payload) => api.patch(`/ucp/resources/${resourceId}`, payload).then((r) => r.data),
    resourceDataObjects: (resourceId) => api.get(`/ucp/resources/${resourceId}/data-objects`).then((r) => r.data),
    createResourceDataObject: (resourceId, payload) => api.post(`/ucp/resources/${resourceId}/data-objects`, payload).then((r) => r.data),
    updateResourceDataObject: (resourceId, objectId, payload) => api.patch(`/ucp/resources/${resourceId}/data-objects/${objectId}`, payload).then((r) => r.data),
    deleteResourceDataObject: (resourceId, objectId) => api.delete(`/ucp/resources/${resourceId}/data-objects/${objectId}`).then((r) => r.data),
    resourceObjects: (resourceId, params = {}) => api.get(`/ucp/resources/${resourceId}/objects`, { params }).then((r) => r.data),
    createResourceObject: (resourceId, payload) => api.post(`/ucp/resources/${resourceId}/objects`, payload).then((r) => r.data),
    updateResourceObject: (resourceId, objectId, payload) => api.patch(`/ucp/resources/${resourceId}/objects/${objectId}`, payload).then((r) => r.data),
    deleteResourceObject: (resourceId, objectId) => api.delete(`/ucp/resources/${resourceId}/objects/${objectId}`).then((r) => r.data),
    verifyWebhookResource: (resourceId) => api.post(`/ucp/resources/${resourceId}/verify`).then((r) => r.data),
    verifyResourceObject: (resourceId, objectId, sample_event) => api.post(`/ucp/resources/${resourceId}/objects/${objectId}/verify`, { sample_event }).then((r) => r.data),
    warehouseIngestBatches: (params = {}) => api.get('/ucp/warehouse-ingest-batches', { params }).then((r) => r.data),
    warehouseIngestBatch: (resourceCode, batchId) => api.get(`/ucp/warehouse-ingest-batches/${resourceCode}/${batchId}`).then((r) => r.data),
    replayWarehouseIngestBatch: (resourceCode, batchId) => api.post(`/ucp/warehouse-ingest-batches/${resourceCode}/${batchId}/replay`).then((r) => r.data),
    eventDefinitions: (params = {}) => api.get('/ucp/event-definitions', { params }).then((r) => r.data),
    platformEventCatalog: () => api.get('/ucp/platform-event-catalog').then((r) => r.data),
    pipelineTriggers: (params = {}) => api.get('/ucp/pipeline-triggers', { params }).then((r) => r.data),
    triggerMigrationStatus: () => api.get('/ucp/trigger-migration/status').then((r) => r.data),
    migrateLegacyPipelineTrigger: (code, source_resource_object_id) => api.post(`/ucp/trigger-migration/${code}`, { source_resource_object_id }).then((r) => r.data),
    rollbackLegacyPipelineTrigger: (code) => api.post(`/ucp/trigger-migration/${code}/rollback`).then((r) => r.data),
    createPipelineTrigger: (payload) => api.post('/ucp/pipeline-triggers', payload).then((r) => r.data),
    updatePipelineTrigger: (code, payload) => api.patch(`/ucp/pipeline-triggers/${code}`, payload).then((r) => r.data),
    enablePipelineTrigger: (code, enabled) => api.post(`/ucp/pipeline-triggers/${code}/enable`, null, { params: { enabled } }).then((r) => r.data),
    testPipelineTrigger: (code, payload) => api.post(`/ucp/pipeline-triggers/${code}/test`, payload).then((r) => r.data),
    deletePipelineTrigger: (code) => api.delete(`/ucp/pipeline-triggers/${code}`).then((r) => r.data),
    deleteResource: (resourceId) => api.delete(`/ucp/resources/${resourceId}`).then((r) => r.data),
    systemDefaultCredential: (systemId) => api.get(`/ucp/systems/${systemId}/default-credential`).then((r) => r.data),
    bitableTables: (resourceId, params = {}) => api.get(`/ucp/resources/${resourceId}/bitable-tables`, { params }).then((r) => r.data),
    createBitableTable: (resourceId, payload) => api.post(`/ucp/resources/${resourceId}/bitable-tables`, payload).then((r) => r.data),
    updateBitableTable: (resourceId, tableId, payload) => api.patch(`/ucp/resources/${resourceId}/bitable-tables/${tableId}`, payload).then((r) => r.data),
    deleteBitableTable: (resourceId, tableId) => api.delete(`/ucp/resources/${resourceId}/bitable-tables/${tableId}`).then((r) => r.data),
    previewBitableTable: (resourceId, tableId, limit = 20) => api.post(`/ucp/resources/${resourceId}/bitable-tables/${tableId}/preview`, { limit }).then((r) => r.data),
    /* ── Pipeline Config CRUD ── */
    pipelines: (triggerType) => api.get('/ucp/pipelines', { params: { trigger_type: triggerType } }).then((r) => ({ total: r.data.total, items: extractItems(r.data) })),
    pipelineDetail: (pipelineId) => api.get(`/ucp/pipelines/${pipelineId}`).then((r) => r.data),
    createPipeline: (payload) => api.post('/ucp/pipelines', payload).then((r) => r.data),
    updatePipeline: (pipelineId, payload) => api.patch(`/ucp/pipelines/${pipelineId}`, payload).then((r) => r.data),
    togglePipeline: (pipelineId, status) => api.patch(`/ucp/pipelines/${pipelineId}/toggle`, { status }).then((r) => r.data),
    deletePipeline: (pipelineId) => api.delete(`/ucp/pipelines/${pipelineId}`).then((r) => r.data),
    /** Phase 6-3: 反向引用 — 哪些流水线引用了此 resource (蓝本 v2 场景 6) */
    pipelinesUsingResource: (resourceId) => api.get(`/ucp/resources/${resourceId}/pipelines`).then((r) => r.data),
    /* ── Phase 2-5: 管理界面增强 ── */
    /** 统计概览（系统资源 / Pipeline / 凭证） */
    configStats: () => api.get('/ucp/config/stats').then((r) => r.data),
    /** 跨表统一搜索 */
    configSearch: (params = {}) => api.get('/ucp/config/search', { params }).then((r) => r.data),
    /** 批量启停 */
    configBatchToggle: (targetType, targetIds, newStatus) => api.post('/ucp/config/batch-toggle', { target_type: targetType, target_ids: targetIds, new_status: newStatus }).then((r) => r.data),
    /** 导出配置 */
    configExport: (params = {}) => api.get('/ucp/config/export', { params }).then((r) => r.data),
    /** 导入配置 */
    configImport: (payload) => api.post('/ucp/config/import', payload).then((r) => r.data),
    /* ── Phase 2-6: 执行详情增强 ── */
    /** 步骤循环项明细 */
    stepItems: (pipelineRunId, stepRunId, params) => api.get(`/ucp/executions/${pipelineRunId}/steps/${stepRunId}/items`, { params }).then((r) => r.data),
    /** 执行日志 */
    executionLogs: (pipelineRunId, limit) => api.get(`/ucp/executions/${pipelineRunId}/logs`, { params: { limit } }).then((r) => r.data),
    /* ── Phase 2-7: Excel 文件导入 ── */
    /** 上传 Excel 文件并预览 */
    excelUpload: (file) => {
        const form = new FormData();
        form.append('file', file);
        return api.post('/ucp/excel/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
    },
    /** 导入 Excel 数据到目标表 */
    excelImport: (payload) => api.post('/ucp/excel/import', payload).then((r) => r.data),
    /* ── Phase 2-9: 熔断与限流 ── */
    /** 列出所有熔断器状态 */
    listCircuits: () => api.get('/ucp/circuits').then((r) => r.data),
    /** 查询单个资源熔断状态 */
    getCircuit: (resourceCode) => api.get(`/ucp/circuits/${resourceCode}`).then((r) => r.data),
    /** 手动重置熔断器 */
    resetCircuit: (resourceCode) => api.post(`/ucp/circuits/${resourceCode}/reset`).then((r) => r.data),
    /** 更新熔断配置 */
    updateCircuitConfig: (resourceCode, payload) => api.patch(`/ucp/circuits/${resourceCode}/config`, payload).then((r) => r.data),
    /** 列出所有限流桶 */
    listRateLimits: () => api.get('/ucp/rate-limits').then((r) => r.data),
    /** 重置限流桶 */
    resetRateLimit: (key) => api.post(`/ucp/rate-limits/${encodeURIComponent(key)}/reset`).then((r) => r.data),
    /* ── Phase 2-10: 通知模板管理 ── */
    /** 通知模板触发场景常量 */
    NOTIFICATION_SCENES: {
        ON_SUCCESS: 'on_success',
        ON_FAILURE: 'on_failure',
        ON_PARTIAL_SUCCESS: 'on_partial_success',
        ON_CIRCUIT_OPEN: 'on_circuit_open',
    },
    NOTIFICATION_SCENE_LABELS: {
        on_success: '执行成功',
        on_failure: '执行失败',
        on_partial_success: '部分成功',
        on_circuit_open: '熔断触发',
    },
    /** 列出通知模板 */
    listNotificationTemplates: (params) => api.get('/ucp/notification-templates', { params }).then((r) => r.data),
    /** 查询通知模板详情 */
    getNotificationTemplate: (templateId) => api.get(`/ucp/notification-templates/${templateId}`).then((r) => r.data),
    /** 创建通知模板 */
    createNotificationTemplate: (payload) => api.post('/ucp/notification-templates', payload).then((r) => r.data),
    /** 更新通知模板 */
    updateNotificationTemplate: (templateId, payload) => api.patch(`/ucp/notification-templates/${templateId}`, payload).then((r) => r.data),
    /** 切换通知模板启用状态 */
    toggleNotificationTemplate: (templateId) => api.patch(`/ucp/notification-templates/${templateId}/toggle`).then((r) => r.data),
    /** 删除通知模板 */
    deleteNotificationTemplate: (templateId) => api.delete(`/ucp/notification-templates/${templateId}`).then((r) => r.data),
    /** 预览通知模板 */
    previewNotificationTemplate: (templateId, mockVars) => api.post(`/ucp/notification-templates/${templateId}/preview`, { mock_vars: mockVars || {} }).then((r) => r.data),
    /** 应用模板到 notification_config */
    applyNotificationTemplate: (templateId, payload) => api.post(`/ucp/notification-templates/${templateId}/apply`, payload).then((r) => r.data),
    /* ── Phase 3-1: 事件总线 ── */
    /** 事件接口 */
    ingestEvent: (payload) => api.post('/ucp/events', payload).then((r) => r.data),
    listEvents: (params) => api.get('/ucp/events', { params }).then((r) => r.data),
    getEvent: (eventId) => api.get(`/ucp/events/${eventId}`).then((r) => r.data),
    getRawEventPayload: (eventId, reason) => api.get(`/ucp/events/${eventId}/payload/raw`, { params: { reason } }).then((r) => r.data),
    manualDispatchEvent: (eventId) => api.post(`/ucp/events/${eventId}/dispatch`).then((r) => r.data),
    /* ── 事件触发器 ── */
    createEventTrigger: (payload) => api.post('/ucp/triggers', payload).then((r) => r.data),
    listEventTriggers: (params) => api.get('/ucp/triggers', { params }).then((r) => r.data),
    updateEventTrigger: (triggerId, payload) => api.patch(`/ucp/triggers/${triggerId}`, payload).then((r) => r.data),
    deleteEventTrigger: (triggerId) => api.delete(`/ucp/triggers/${triggerId}`).then((r) => r.data),
    /* Phase 3-4: 触发器测试 */
    testTrigger: (triggerId, payload) => api.post(`/ucp/triggers/${triggerId}/test`, payload).then((r) => r.data),
    /* ── Phase 3-3: 死信 + 重放 ── */
    listDeadLetters: (params) => api.get('/ucp/dead-letters', { params }).then((r) => r.data),
    getDeadLetter: (deliveryId) => api.get(`/ucp/dead-letters/${deliveryId}`).then((r) => r.data),
    replayDeadLetter: (deliveryId) => api.post(`/ucp/dead-letters/${deliveryId}/replay`).then((r) => r.data),
    discardDeadLetter: (deliveryId) => api.post(`/ucp/dead-letters/${deliveryId}/discard`).then((r) => r.data),
    replayEvent: (eventId) => api.post(`/ucp/events/${eventId}/replay`).then((r) => r.data),
    listEventDeliveries: (eventId, limit = 50) => api.get(`/ucp/events/${eventId}/deliveries`, { params: { limit } }).then((r) => r.data),
    scanDueRetries: () => api.post('/ucp/events/scan-retries').then((r) => r.data),
};
export const externalAccountApi = {
    list: (params) => api
        .get('/ucp/external-accounts', { params })
        .then((r) => extractItems(r.data)),
    get: (accountId) => api.get(`/ucp/external-accounts/${accountId}`).then((r) => r.data),
    listAudits: (accountId, limit = 50, offset = 0) => api
        .get(`/ucp/external-accounts/${accountId}/audits`, { params: { limit, offset } })
        .then((r) => extractItems(r.data)),
    runAction: (req) => api
        .post('/ucp/external-accounts/run', req)
        .then((r) => r.data),
};
export const approvalApi = {
    submit: (req) => api.post('/ucp/approvals', req).then((r) => r.data),
    list: (params) => api
        .get('/ucp/approvals', { params })
        .then((r) => extractItems(r.data)),
    getDetail: (id) => api.get(`/ucp/approvals/${id}`).then((r) => r.data),
    myTodo: () => api.get('/ucp/approvals/my-todo').then((r) => r.data),
    doAction: (id, req) => api.post(`/ucp/approvals/${id}/action`, req).then((r) => r.data),
    scanExpired: () => api
        .post('/ucp/approvals/scan-expired')
        .then((r) => r.data),
};
export const controlledWriteApi = { execute: (requestId, confirmation_token) => api.post(`/ucp/write-operations/${requestId}/execute`, { confirmation_token }).then(r => r.data) };
export const oaSyncApi = {
    listRuns: (params) => api
        .get('/ucp/oa-sync/runs', { params })
        .then((r) => extractItems(r.data)),
    getRun: (id) => api.get(`/ucp/oa-sync/runs/${id}`).then((r) => r.data),
    listRecords: (runId, params) => api
        .get(`/ucp/oa-sync/runs/${runId}/records`, { params })
        .then((r) => extractItems(r.data)),
    trigger: (req) => api
        .post('/ucp/oa-sync/trigger', req)
        .then((r) => r.data),
};
export const adapterRegistryApi = {
    list: (params) => api
        .get('/ucp/adapter-registry', { params })
        .then((r) => r.data.items),
    get: (code) => api.get(`/ucp/adapter-registry/${code}`).then((r) => r.data),
    getSchema: (code) => api.get(`/ucp/adapter-registry/${code}/schema`).then((r) => r.data),
    register: (req) => api.post('/ucp/adapter-registry', req).then((r) => r.data),
    activate: (code, is_active) => api
        .post(`/ucp/adapter-registry/${code}/activate`, { is_active })
        .then((r) => r.data),
    remove: (code) => api.delete(`/ucp/adapter-registry/${code}`).then((r) => r.data),
};
export const pipelineTemplateApi = {
    list: (params) => api
        .get('/ucp/pipeline-templates', { params })
        .then((r) => r.data.items),
    get: (code) => api.get(`/ucp/pipeline-templates/${code}`).then((r) => r.data),
    create: (req) => api.post('/ucp/pipeline-templates', req).then((r) => r.data),
    update: (code, req) => api.patch(`/ucp/pipeline-templates/${code}`, req).then((r) => r.data),
    fieldCatalog: (code, nodeId, refresh = false) => api.get(`/ucp/pipeline-templates/${code}/field-catalog`, { params: { node_id: nodeId, refresh } }).then((r) => r.data),
    versions: (code) => api
        .get(`/ucp/pipeline-templates/${code}/versions`)
        .then((r) => r.data.items),
    rollback: (code, target_version_id) => api
        .post(`/ucp/pipeline-templates/${code}/rollback`, {
        target_version_id,
    })
        .then((r) => r.data),
    remove: (code) => api.delete(`/ucp/pipeline-templates/${code}`).then((r) => r.data),
    nodeTypes: () => api
        .get('/ucp/pipeline-templates/_meta/node-types')
        .then((r) => r.data),
};
export const monitorApi = {
    // Phase 5-3: 透传 system_id / resource_id 过滤
    summaryRaw: (params = {}) => api.get('/ucp/monitor/summary', { params }).then((r) => r.data),
    summary: (hours = 24) => api.get('/ucp/monitor/summary', { params: { hours } }).then((r) => r.data),
    trend: (hours = 24, bucket = 'hour', filter = {}) => api
        .get('/ucp/monitor/trend', { params: { hours, bucket, ...filter } })
        .then((r) => r.data.items),
    statusDistribution: (hours = 24, filter = {}) => api
        .get('/ucp/monitor/status-distribution', {
        params: { hours, ...filter },
    })
        .then((r) => r.data.distribution),
    recentRuns: (limit = 20, filter = {}) => api
        .get('/ucp/monitor/recent-runs', { params: { limit, ...filter } })
        .then((r) => r.data.items),
    alertsRaw: (limit = 50, filter = {}) => api
        .get('/ucp/monitor/alerts', { params: { limit, ...filter } })
        .then((r) => r.data.items),
    alerts: (limit = 50) => api
        .get('/ucp/monitor/alerts', { params: { limit } })
        .then((r) => r.data.items),
    pipelineStats: (hours = 24, limit = 10, filter = {}) => api
        .get('/ucp/monitor/pipeline-stats', {
        params: { hours, limit, ...filter },
    })
        .then((r) => r.data.items),
};
export const alertRuleApi = {
    list: (ruleType) => api.get('/ucp/alert-rules', { params: ruleType ? { rule_type: ruleType } : {} }).then((r) => r.data),
    create: (payload) => api.post('/ucp/alert-rules', payload).then((r) => r.data),
    update: (ruleId, payload) => api.patch(`/ucp/alert-rules/${ruleId}`, payload).then((r) => r.data),
    delete: (ruleId) => api.delete(`/ucp/alert-rules/${ruleId}`).then((r) => r.data),
    logs: (limit) => api.get('/ucp/alert-logs', { params: { limit } }).then((r) => r.data),
};
export const apiTemplateApi = {
    list: (params) => api.get('/ucp/api-templates', { params }).then((r) => r.data),
    get: (code) => api.get(`/ucp/api-templates/${code}`).then((r) => r.data),
    create: (payload) => api.post('/ucp/api-templates', payload).then((r) => r.data),
    update: (code, payload) => api.patch(`/ucp/api-templates/${code}`, payload).then((r) => r.data),
    copy: (sourceCode, newCode, newName) => api.post(`/ucp/api-templates/${sourceCode}/copy`, { new_code: newCode, new_name: newName }).then((r) => r.data),
    delete: (code) => api.delete(`/ucp/api-templates/${code}`).then((r) => r.data),
    versions: (code) => api.get(`/ucp/api-templates/${code}/versions`).then((r) => r.data),
    rollback: (code, versionId) => api.post(`/ucp/api-templates/${code}/rollback`, { version_id: versionId }).then((r) => r.data),
    previewOpenApi: (payload) => api.post('/ucp/api-templates/openapi/preview', payload).then((r) => r.data),
    importOpenApi: (payload) => api.post('/ucp/api-templates/openapi/import', payload).then((r) => r.data),
    approvePublish: (code) => api.post(`/ucp/api-templates/${code}/approve-publish`).then((r) => r.data),
    importTemplate: (payload) => api.post('/ucp/api-templates/import', payload).then((r) => r.data),
    exportTemplate: (code) => api.get(`/ucp/api-templates/${code}/export`).then((r) => r.data),
    testEngine: (payload) => api.post('/ucp/template-engine/test', payload).then((r) => r.data),
    /** Phase 5: 测试执行 API 模板（含 SSRF 校验、脱敏、样例保存） */
    testApiTemplate: (payload) => api.post('/ucp/api-templates/test', payload).then((r) => r.data),
};
export const assetCatalogApi = {
    catalog: () => api.get('/ucp/assets/catalog').then((r) => r.data),
    list: (params) => api.get('/ucp/assets', { params }).then((r) => r.data),
    setTag: (payload) => api.post('/ucp/assets/tags', payload).then((r) => r.data),
    removeTag: (assetType, assetId, tagKey) => api.delete('/ucp/assets/tags', { params: { asset_type: assetType, asset_id: assetId, tag_key: tagKey } }).then((r) => r.data),
};
/* ── Phase 6-B: 依赖拓扑 ── */
export const topologyApi = {
    get: (params) => api.get('/ucp/topology', { params }).then((r) => r.data),
    impact: (targetType, targetId) => api.get('/ucp/topology/impact', { params: { target_type: targetType, target_id: targetId } }).then((r) => r.data),
};
export const slaApi = {
    listConfigs: () => api.get('/ucp/sla/configs').then((r) => r.data),
    createConfig: (payload) => api.post('/ucp/sla/configs', payload).then((r) => r.data),
    updateConfig: (slaId, payload) => api.patch(`/ucp/sla/configs/${slaId}`, payload).then((r) => r.data),
    deleteConfig: (slaId) => api.delete(`/ucp/sla/configs/${slaId}`).then((r) => r.data),
    calculate: (slaId) => api.post(`/ucp/sla/configs/${slaId}/calculate`).then((r) => r.data),
    records: (slaId, limit) => api.get(`/ucp/sla/configs/${slaId}/records`, { params: { limit } }).then((r) => r.data),
    dashboard: () => api.get('/ucp/sla/dashboard').then((r) => r.data),
};
/* ── Phase 6-D: 变更管理 ── */
export const changeApi = {
    list: (params) => api.get('/ucp/changes', { params }).then((r) => r.data),
    create: (payload) => api.post('/ucp/changes', payload).then((r) => r.data),
    publish: (changeId) => api.post(`/ucp/changes/${changeId}/publish`).then((r) => r.data),
    rollback: (changeId) => api.post(`/ucp/changes/${changeId}/rollback`).then((r) => r.data),
};
export const migrationApi = {
    preview: (payload) => api.post('/ucp/migrations/adapter/preview', payload).then((r) => r.data),
    confirm: (payload) => api.post('/ucp/migrations/adapter/confirm', payload).then((r) => r.data),
    publish: (changeId) => api.post('/ucp/migrations/adapter/publish', { change_id: changeId }).then((r) => r.data),
};
/* ── Phase 6-E: 治理评分 ── */
export const governanceScoreApi = {
    calculate: (assetType, windowHours) => api.post('/ucp/governance/scores/calculate', null, { params: { asset_type: assetType, window_hours: windowHours } }).then((r) => r.data),
    list: (assetType, limit) => api.get('/ucp/governance/scores', { params: { asset_type: assetType, limit } }).then((r) => r.data),
};
/* ── Phase 7-A: 主数据目录 ── */
export const masterDataApi = {
    listObjects: (params) => api.get('/ucp/master-data/objects', { params }).then((r) => r.data),
    createObject: (payload) => api.post('/ucp/master-data/objects', payload).then((r) => r.data),
    updateObject: (code, payload) => api.patch(`/ucp/master-data/objects/${code}`, payload).then((r) => r.data),
};
/* ── Phase 7-B: ID 映射 ── */
export const idMappingApi = {
    list: (params) => api.get('/ucp/master-data/mappings', { params }).then((r) => r.data),
    create: (payload) => api.post('/ucp/master-data/mappings', payload).then((r) => r.data),
    update: (id, payload) => api.patch(`/ucp/master-data/mappings/${id}`, payload).then((r) => r.data),
    delete: (id) => api.delete(`/ucp/master-data/mappings/${id}`).then((r) => r.data),
    checkConflicts: () => api.post('/ucp/master-data/mappings/check-conflicts').then((r) => r.data),
};
/* ── Phase 7-C: 差异检测 ── */
export const diffApi = {
    listJobs: () => api.get('/ucp/diff/jobs').then((r) => r.data),
    createJob: (payload) => api.post('/ucp/diff/jobs', payload).then((r) => r.data),
    updateJob: (id, payload) => api.patch(`/ucp/diff/jobs/${id}`, payload).then((r) => r.data),
    deleteJob: (id) => api.delete(`/ucp/diff/jobs/${id}`).then((r) => r.data),
    runJob: (id) => api.post(`/ucp/diff/jobs/${id}/run`).then((r) => r.data),
    listRecords: (params) => api.get('/ucp/diff/records', { params }).then((r) => r.data),
    trend: (days) => api.get('/ucp/diff/trend', { params: { days } }).then((r) => r.data),
};
/* ── Phase 7-D: 数据质量规则 ── */
export const qualityApi = {
    listRules: (params) => api.get('/ucp/quality/rules', { params }).then((r) => r.data),
    createRule: (payload) => api.post('/ucp/quality/rules', payload).then((r) => r.data),
    updateRule: (id, payload) => api.patch(`/ucp/quality/rules/${id}`, payload).then((r) => r.data),
    deleteRule: (id) => api.delete(`/ucp/quality/rules/${id}`).then((r) => r.data),
    scan: (ruleId) => api.post(`/ucp/quality/rules/${ruleId}/scan`).then((r) => r.data),
    listIssues: (params) => api.get('/ucp/quality/issues', { params }).then((r) => r.data),
};
/* ── Phase 7-E/F: 冲突 + 治理 ── */
export const conflictApi = {
    list: (params) => api.get('/ucp/conflicts', { params }).then((r) => r.data),
    resolve: (id, payload) => api.post(`/ucp/conflicts/${id}/resolve`, payload).then((r) => r.data),
    sync: () => api.post('/ucp/conflicts/sync').then((r) => r.data),
};
export const governanceApi = {
    listTasks: (params) => api.get('/ucp/governance/tasks', { params }).then((r) => r.data),
    createTask: (payload) => api.post('/ucp/governance/tasks', payload).then((r) => r.data),
    updateTask: (id, payload) => api.patch(`/ucp/governance/tasks/${id}`, payload).then((r) => r.data),
    generateReport: (reportPeriod) => api.post('/ucp/governance/reports/generate', reportPeriod ? { report_period: reportPeriod } : {}).then((r) => r.data),
};
/* ── SSRF 安全规则 ── */
export const securityApi = {
    ssrfRules: () => api.get('/ucp/security/ssrf-rules').then((r) => r.data),
};
ucpApi.adapterRegistryList = adapterRegistryApi.list;
ucpApi.adapterSchema = adapterRegistryApi.getSchema;
export const accountLifecycleApi = {
    listRules: () => api.get('/ucp/account-lifecycle-rules').then((r) => r.data),
    createRule: (payload) => api.post('/ucp/account-lifecycle-rules', payload).then((r) => r.data),
    setRuleEnabled: (code, enabled) => api.post(`/ucp/account-lifecycle-rules/${code}/${enabled ? 'enable' : 'disable'}`).then((r) => r.data),
    dryRun: (code, event) => api.post(`/ucp/account-lifecycle-rules/${code}/dry-run`, { event }).then((r) => r.data),
    listJobs: () => api.get('/ucp/account-lifecycle-jobs').then((r) => r.data),
    retryJob: (code) => api.post(`/ucp/account-lifecycle-jobs/${code}/retry`).then((r) => r.data),
    cancelJob: (code) => api.post(`/ucp/account-lifecycle-jobs/${code}/cancel`).then((r) => r.data),
    rescheduleJob: (code, scheduled_at) => api.post(`/ucp/account-lifecycle-jobs/${code}/reschedule`, { scheduled_at }).then((r) => r.data),
};
export const accountLifecycleReleaseApi = {
    readiness: () => api.get('/ucp/account-lifecycle-readiness').then((r) => r.data),
};
