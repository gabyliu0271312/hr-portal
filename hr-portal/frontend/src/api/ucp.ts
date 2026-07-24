import { api } from './client'

/* ── Paginated wrapper ── */

interface Paginated<T> {
  total: number
  items: T[]
}

function extractItems<T>(data: Paginated<T>): T[] {
  return data.items ?? []
}

/* ── Pipeline Execution ── */

// Phase 2-3：PARTIAL 严重度
export interface PartialSeverity {
  severity: 'NONE' | 'WARNING' | 'CRITICAL'
  label: string
  total: number
  total_failed: number
  total_not_found: number
  step_severities?: StepPartialSeverity[]
}

export interface StepPartialSeverity {
  severity: 'NONE' | 'WARNING' | 'CRITICAL'
  label: string
  failed_count: number
  not_found_count: number
  total: number
  failed_rate: number
  failure_rate: number
  step_status: string
}

export interface PipelineExecutionItem {
  pipeline_run_id: string
  trace_id: string
  pipeline_code: string
  trigger_type: string
  triggered_by: string | null
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED'
  total_steps: number
  success_steps: number
  failed_steps: number
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null
  error_message: string | null
  created_at: string | null
  /** Phase 2-3：context_summary 中可能含 partial_severity 字段 */
  context_summary?: Record<string, any> | null
}

export interface PipelineExecutionDetail {
  pipeline_run_id: string
  trace_id: string
  pipeline_code: string
  trigger_type: string
  status: string
  total_steps: number
  success_steps: number
  failed_steps: number
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null
  error_message: string | null
  context_summary: Record<string, any> | null
  steps: PipelineStepExecutionItem[]
}

export interface PipelineStepExecutionItem {
  step_run_id: string
  step_id: string
  step_type: string
  resource_code: string | null
  status: string
  retry_count: number
  total_items: number | null
  success_items: number | null
  failed_items: number | null
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null
  input_snapshot: Record<string, any> | null
  output_snapshot: Record<string, any> | null
  error_message: string | null
}

export interface StepLoopItem {
  id: number
  item_key: string
  status: string
  request_params_masked: Record<string, any> | null
  response_summary_masked: Record<string, any> | null
  error_code: string | null
  error_message: string | null
  retry_count: number
  is_retryable: number
  last_failed_at: string | null
  created_at: string | null
}

export interface ExecutionLogItem {
  id: number
  trace_id: string
  resource_code: string | null
  pipeline_code: string | null
  trigger_type: string
  request_url: string | null
  request_body_masked: Record<string, any> | null
  response_body_masked: Record<string, any> | null
  status: string
  record_count: number | null
  success_count: number | null
  failed_count: number | null
  error_message: string | null
  duration_ms: number | null
  executor: string
  data_source: string | null
  created_at: string | null
}

export interface LoopFailedItem {
  id: number
  trace_id: string
  step_run_id: string
  resource_code: string
  item_key: string
  status: string
  error_code: string | null
  error_message: string | null
  retry_count: number
  is_retryable: number
  last_failed_at: string | null
}

/* ── System Overview ── */

export interface SystemOverview {
  system_id: number
  resource_count: number
  active_count: number
  pipeline_count: number
  sync_count_24h: number
  success_count_24h: number
  success_rate_24h: number | null
  dead_letter_count: number
  latest_run_at: string | null
  credential_status: 'ok' | 'warning' | 'expired' | 'none'
  credential_count: number
  health_status: 'ok' | 'warning' | 'blocked' | 'failing' | 'offline' | 'unconfigured'
}

/* ── Credential Config ── */

export interface CredentialConfigItem {
  id: number
  credential_code: string
  credential_name: string
  auth_type: string
  description: string | null
  is_active: number
  last_verified_at: string | null
  last_verified_status: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string | null
}

/* ── Pipeline Config ── */

export interface PipelineConfigItem {
  id: number
  pipeline_code: string
  pipeline_name: string
  description: string | null
  trigger_type: string
  trigger_config: Record<string, any> | null
  error_handling: string | null
  steps_count: number
  status: number
  notification_enabled: boolean
  created_by: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface PipelineConfigDetail {
  id: number
  pipeline_code: string
  pipeline_name: string
  description: string | null
  steps: any[]
  trigger_type: string
  trigger_config: Record<string, any> | null
  error_handling: string
  notification_config: Record<string, any> | null
  run_as_type: string
  run_as_user_id: number | null
  service_account_code: string | null
  status: number
  created_by: string | null
  updated_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface SeedResult {
  message: string
  created: {
    credentials: number
    resources: number
    pipelines: number
    scheduler_job_id: number
  }
}

/* ── API ── */

export const ucpApi = {
  /* Pipeline execution history */
  executions: (params: {
    pipeline_code?: string
    status?: string
    limit?: number
    offset?: number
  } = {}) =>
    api.get<Paginated<PipelineExecutionItem>>('/ucp/executions', { params }).then((r) => ({ total: r.data.total, items: extractItems(r.data) })),

  executionDetail: (pipelineRunId: string) =>
    api.get<{execution: PipelineExecutionDetail, steps: PipelineStepExecutionItem[]}>(`/ucp/executions/${pipelineRunId}`).then((r) => r.data),

  /* Manual trigger (Phase 2-4: with concurrent lock + permission + params) */
  runPipeline: (pipelineCode: string, params?: { dry_run?: boolean; time_range?: { start: string; end: string } | null; override_params?: Record<string, any> | null }) =>
    api.post<{pipeline_run_id: string; trace_id: string; status: string; duration_ms: number | null; dry_run?: boolean}>(`/ucp/pipelines/${pipelineCode}/run`, params ?? {}).then((r) => r.data),

  /* Failed items */
  failedItems: (pipelineRunId: string) =>
    api.get<Paginated<LoopFailedItem>>(`/ucp/executions/${pipelineRunId}/failed-items`).then((r) => ({ total: r.data.total, items: extractItems(r.data) })),

  /* Phase 2-2: Retry failed (real implementation) */
  retryFailed: (pipelineRunId: string) =>
    api.post<{
      status: string
      message: string
      total: number
      success_count: number
      failed_count: number
      skipped_count: number
      details: Array<{ item_key: string; status: string; error_code?: string; error_message?: string; step_run_id: string }>
      pipeline_status?: string
    }>(`/ucp/executions/${pipelineRunId}/retry-failed`).then((r) => r.data),

  /* Phase 2-2: Retry a single step */
  /* Phase 2-3: 单项重跑 */
  retryItem: (pipelineRunId: string, itemId: number) =>
    api.post<{ status: string; item_id: number; message?: string; error?: string; retry_count?: number }>(`/ucp/executions/${pipelineRunId}/items/${itemId}/retry`).then((r) => r.data),

  retryStep: (pipelineRunId: string, stepRunId: string) =>
    api.post<{
      status: string
      message: string
      step: {
        step_run_id: string
        step_id: string
        status: string
        retry_count: number
        duration_ms: number | null
        error_message: string | null
        output_snapshot: Record<string, any> | null
      }
      pipeline: {
        pipeline_run_id: string
        status: string
        success_steps: number | null
        failed_steps: number | null
      }
    }>(`/ucp/executions/${pipelineRunId}/steps/${stepRunId}/retry`).then((r) => r.data),

  /* Seed Offer sync pipeline */
  seedOfferSync: () =>
    api.post<SeedResult>('/ucp/seed/offer-sync').then((r) => r.data),

  /* ── Credential Config CRUD ── */
  credentials: (authType?: string) =>
    api.get<Paginated<CredentialConfigItem>>('/ucp/credentials', { params: { auth_type: authType } }).then((r) => ({ total: r.data.total, items: extractItems(r.data) })),

  createCredential: (payload: { credential_code: string; credential_name: string; secrets: Record<string, string>; auth_type?: string; description?: string; system_id?: number; env_tag?: string; is_primary?: boolean; expires_at?: string; remind_before_days?: number }) =>
    api.post<{id: number; credential_code: string; message: string}>('/ucp/credentials', payload).then((r) => r.data),

  updateCredential: (credentialId: number, payload: { credential_name?: string; secrets?: Record<string, string>; auth_type?: string; description?: string; is_primary?: boolean; expires_at?: string; remind_before_days?: number }) =>
    api.patch<{id: number; credential_code: string; message: string}>(`/ucp/credentials/${credentialId}`, payload).then((r) => r.data),

  toggleCredential: (credentialId: number, is_active: boolean) =>
    api.patch<{id: number; credential_code: string; is_active: number; message: string}>(`/ucp/credentials/${credentialId}/toggle`, { is_active }).then((r) => r.data),

  /* ── Phase 4: System + Resource (1:N) ── */
  systems: (systemType?: string) =>
    api.get<{ total: number; items: any[] }>('/ucp/systems', { params: systemType ? { system_type: systemType } : {} }).then((r) => r.data),

  systemDetail: (systemId: number) =>
    api.get<any>(`/ucp/systems/${systemId}`).then((r) => r.data),

  systemsOverview: () =>
    api.get<{ total: number; items: SystemOverview[] }>('/ucp/systems/overview').then((r) => r.data),

  standardPackages: () =>
    api.get<{ items: any[] }>('/ucp/standard-packages').then((r) => r.data.items),

  systemCapabilities: (systemId: number) =>
    api.get<{ items: any[] }>(`/ucp/systems/${systemId}/capabilities`).then((r) => r.data.items),

  setSystemCapability: (systemId: number, operationId: number, payload: { credential_id?: number; enabled: boolean }) =>
    api.put<any>(`/ucp/systems/${systemId}/capabilities/${operationId}`, payload).then((r) => r.data),

  testSystemCapability: (systemId: number, operationId: number, parameters: Record<string, string>) =>
    api.post<any>(`/ucp/systems/${systemId}/capabilities/${operationId}/test`, { parameters }).then((r) => r.data),

  systemCapabilityTestRuns: (systemId: number, operationId: number, limit = 20) =>
    api.get<{ items: any[] }>(`/ucp/systems/${systemId}/capabilities/${operationId}/test-runs`, { params: { limit } }).then((r) => r.data.items),

  verifiedCapabilityCatalog: () =>
    api.get<{ items: any[] }>('/ucp/capabilities/catalog').then((r) => r.data.items),

  createSystem: (payload: { system_code: string; system_name: string; system_type?: string; icon?: string; owner?: string; domain?: string; description?: string; tags?: string[]; sensitivity?: string }) =>
    api.post<{ id: number; system_code: string; system_name: string }>('/ucp/systems', payload).then((r) => r.data),

  updateSystem: (systemId: number, payload: Record<string, any>) =>
    api.patch<{ id: number; system_code: string }>(`/ucp/systems/${systemId}`, payload).then((r) => r.data),

  deleteSystem: (systemId: number) =>
    api.delete<{ deleted: boolean }>(`/ucp/systems/${systemId}`).then((r) => r.data),

  /* ── Resource (一张表/一个 API) ── */
  resources: (params: { system_id?: number; credential_id?: number; status?: number } = {}) =>
    api.get<{ total: number; items: any[] }>('/ucp/resources', { params }).then((r) => r.data),

  createResource: (payload: {
    system_id: number
    resource_code: string
    resource_name: string
    connector_type?: string
    adapter_code?: string
    credential_id?: number
    protocol?: Record<string, any>
    report_config?: Record<string, any>
    mapping_config?: Record<string, any>
    file_config?: Record<string, any>
    scheduling?: Record<string, any>
    notification_config?: Record<string, any>
    retry_config?: Record<string, any>
    circuit_breaker_config?: Record<string, any>
  }) =>
    api.post<{ id: number; resource_code: string }>('/ucp/resources', payload).then((r) => r.data),

  updateResource: (resourceId: number, payload: Record<string, any>) =>
    api.patch<{ id: number }>(`/ucp/resources/${resourceId}`, payload).then((r) => r.data),

  resourceDataObjects: (resourceId: number) =>
    api.get<{ total: number; items: any[] }>(`/ucp/resources/${resourceId}/data-objects`).then((r) => r.data),
  createResourceDataObject: (resourceId: number, payload: Record<string, any>) =>
    api.post<any>(`/ucp/resources/${resourceId}/data-objects`, payload).then((r) => r.data),
  updateResourceDataObject: (resourceId: number, objectId: number, payload: Record<string, any>) =>
    api.patch<any>(`/ucp/resources/${resourceId}/data-objects/${objectId}`, payload).then((r) => r.data),
  deleteResourceDataObject: (resourceId: number, objectId: number) =>
    api.delete<{ deleted: number }>(`/ucp/resources/${resourceId}/data-objects/${objectId}`).then((r) => r.data),

  deleteResource: (resourceId: number) =>
    api.delete<{ deleted: boolean }>(`/ucp/resources/${resourceId}`).then((r) => r.data),

  systemDefaultCredential: (systemId: number) =>
    api.get<{ credential_id: number | null }>(`/ucp/systems/${systemId}/default-credential`).then((r) => r.data),

  bitableTables: (resourceId: number, params: { is_active?: boolean } = {}) =>
    api.get<{ total: number; items: any[] }>(`/ucp/resources/${resourceId}/bitable-tables`, { params }).then((r) => r.data),
  createBitableTable: (resourceId: number, payload: Record<string, any>) =>
    api.post<any>(`/ucp/resources/${resourceId}/bitable-tables`, payload).then((r) => r.data),
  updateBitableTable: (resourceId: number, tableId: number, payload: Record<string, any>) =>
    api.patch<any>(`/ucp/resources/${resourceId}/bitable-tables/${tableId}`, payload).then((r) => r.data),
  deleteBitableTable: (resourceId: number, tableId: number) =>
    api.delete<{ deleted: number }>(`/ucp/resources/${resourceId}/bitable-tables/${tableId}`).then((r) => r.data),
  previewBitableTable: (resourceId: number, tableId: number, limit = 20) =>
    api.post<any>(`/ucp/resources/${resourceId}/bitable-tables/${tableId}/preview`, { limit }).then((r) => r.data),
  /* ── Pipeline Config CRUD ── */
  pipelines: (triggerType?: string) =>
    api.get<Paginated<PipelineConfigItem>>('/ucp/pipelines', { params: { trigger_type: triggerType } }).then((r) => ({ total: r.data.total, items: extractItems(r.data) })),

  pipelineDetail: (pipelineId: number) =>
    api.get<PipelineConfigDetail>(`/ucp/pipelines/${pipelineId}`).then((r) => r.data),

  createPipeline: (payload: Record<string, any>) =>
    api.post<{id: number; pipeline_code: string; message: string}>('/ucp/pipelines', payload).then((r) => r.data),

  updatePipeline: (pipelineId: number, payload: Record<string, any>) =>
    api.patch<{id: number; pipeline_code: string; message: string}>(`/ucp/pipelines/${pipelineId}`, payload).then((r) => r.data),

  togglePipeline: (pipelineId: number, status: number) =>
    api.patch<{id: number; pipeline_code: string; status: number; message: string}>(`/ucp/pipelines/${pipelineId}/toggle`, { status }).then((r) => r.data),

  deletePipeline: (pipelineId: number) =>
    api.delete<{message: string}>(`/ucp/pipelines/${pipelineId}`).then((r) => r.data),

  /** Phase 6-3: 反向引用 — 哪些流水线引用了此 resource (蓝本 v2 场景 6) */
  pipelinesUsingResource: (resourceId: number) =>
    api.get<{
      resource_id: number
      total: number
      items: Array<{
        id: number
        pipeline_code: string
        pipeline_name: string
        description: string | null
        trigger_type: string
        status: number
        step_count: number
        hit_steps: Array<{ step_id: string; type: string; match_field: string }>
      }>
    }>(`/ucp/resources/${resourceId}/pipelines`).then((r) => r.data),

  /* ── Phase 2-5: 管理界面增强 ── */

  /** 统计概览（系统资源 / Pipeline / 凭证） */
  configStats: () =>
    api.get<{
      resources: { total: number; enabled: number; disabled: number; untested: number; failed_test: number; by_type: Record<string, number> }
      pipelines: { total: number; enabled: number; disabled: number; by_trigger: Record<string, number> }
      credentials: { total: number; active: number; inactive: number }
    }>('/ucp/config/stats').then((r) => r.data),

  /** 跨表统一搜索 */
  configSearch: (params: { keyword?: string; target_type?: string; status?: number; limit?: number } = {}) =>
    api.get<{
      resources: any[]
      pipelines: any[]
      credentials: any[]
      total: number
    }>('/ucp/config/search', { params }).then((r) => r.data),

  /** 批量启停 */
  configBatchToggle: (targetType: 'system' | 'resource' | 'pipeline' | 'credential', targetIds: number[], newStatus: 1 | 2) =>
    api.post<{ success_count: number; failed_count: number; new_status: number; failed_details: any[] }>(
      '/ucp/config/batch-toggle',
      { target_type: targetType, target_ids: targetIds, new_status: newStatus }
    ).then((r) => r.data),

  /** 导出配置 */
  configExport: (params: { target_type?: string; format?: 'json' | 'yaml' } = {}) =>
    api.get<{ format: string; content: any }>('/ucp/config/export', { params }).then((r) => r.data),

  /** 导入配置 */
  configImport: (payload: { content: any; target_type?: string; dry_run?: boolean; skip_existing?: boolean }) =>
    api.post<{
      dry_run: boolean
      credentials: { created: number; skipped: number; errors: any[] }
      resources: { created: number; skipped: number; errors: any[] }
      pipelines: { created: number; skipped: number; errors: any[] }
    }>('/ucp/config/import', payload).then((r) => r.data),

  /* ── Phase 2-6: 执行详情增强 ── */

  /** 步骤循环项明细 */
  stepItems: (pipelineRunId: string, stepRunId: string, params?: { status?: string; limit?: number }) =>
    api.get<{ total: number; items: StepLoopItem[] }>(`/ucp/executions/${pipelineRunId}/steps/${stepRunId}/items`, { params }).then((r) => r.data),

  /** 执行日志 */
  executionLogs: (pipelineRunId: string, limit?: number) =>
    api.get<{ total: number; items: ExecutionLogItem[] }>(`/ucp/executions/${pipelineRunId}/logs`, { params: { limit } }).then((r) => r.data),

  /* ── Phase 2-7: Excel 文件导入 ── */

  /** 上传 Excel 文件并预览 */
  excelUpload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post<{
      file_key: string
      filename: string
      sheet_names: string[]
      headers: string[]
      preview_rows: Record<string, any>[]
      total_rows: number
    }>('/ucp/excel/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data)
  },

  /** 导入 Excel 数据到目标表 */
  excelImport: (payload: { file_key: string; target_table: string; join_key: string; mapping_rules?: Array<{ source: string; target: string }>; sheet_name?: string }) =>
    api.post<{
      status: string
      total_rows: number
      success_count: number
      failed_count: number
      failed_details: Array<{ row_index: number; reason: string }>
      target_table: string
      message?: string
    }>('/ucp/excel/import', payload).then((r) => r.data),

  /* ── Phase 2-9: 熔断与限流 ── */

  /** 列出所有熔断器状态 */
  listCircuits: () =>
    api.get<{ circuits: Array<{
      resource_code: string
      state: string
      consecutive_failures: number
      consecutive_successes: number
      half_open_calls: number
      last_error_code: string | null
      last_error_message: string | null
      open_remaining_seconds: number
    }> }>('/ucp/circuits').then((r) => r.data),

  /** 查询单个资源熔断状态 */
  getCircuit: (resourceCode: string) =>
    api.get<{
      resource_code: string
      config: Record<string, any>
      state: {
        state: string
        consecutive_failures: number
        consecutive_successes: number
        half_open_calls: number
        last_error_code: string | null
        last_error_message: string | null
        open_remaining_seconds: number
      }
    }>(`/ucp/circuits/${resourceCode}`).then((r) => r.data),

  /** 手动重置熔断器 */
  resetCircuit: (resourceCode: string) =>
    api.post<{ resource_code: string; state: Record<string, any> }>(`/ucp/circuits/${resourceCode}/reset`).then((r) => r.data),

  /** 更新熔断配置 */
  updateCircuitConfig: (resourceCode: string, payload: Record<string, any>) =>
    api.patch<{ resource_code: string; config: Record<string, any> }>(`/ucp/circuits/${resourceCode}/config`, payload).then((r) => r.data),

  /** 列出所有限流桶 */
  listRateLimits: () =>
    api.get<{ buckets: Array<{ key: string; calls_in_last_second: number; last_acquire: number }> }>('/ucp/rate-limits').then((r) => r.data),

  /** 重置限流桶 */
  resetRateLimit: (key: string) =>
    api.post<{ key: string; reset: boolean }>(`/ucp/rate-limits/${encodeURIComponent(key)}/reset`).then((r) => r.data),

  /* ── Phase 2-10: 通知模板管理 ── */

  /** 通知模板触发场景常量 */
  NOTIFICATION_SCENES: {
    ON_SUCCESS: 'on_success',
    ON_FAILURE: 'on_failure',
    ON_PARTIAL_SUCCESS: 'on_partial_success',
    ON_CIRCUIT_OPEN: 'on_circuit_open',
  } as const,
  NOTIFICATION_SCENE_LABELS: {
    on_success: '执行成功',
    on_failure: '执行失败',
    on_partial_success: '部分成功',
    on_circuit_open: '熔断触发',
  } as const,

  /** 列出通知模板 */
  listNotificationTemplates: (params?: { trigger_scene?: string; is_active?: number; keyword?: string; limit?: number }) =>
    api.get<{ items: Array<{
      id: number
      template_code: string
      template_name: string
      description: string | null
      trigger_scene: string
      trigger_scene_label: string
      channel: string
      message_format: string
      title_template: string
      content_template: string
      receivers: string[]
      variable_schema: Record<string, string>
      is_active: number
      created_at: string | null
      updated_at: string | null
    }>; total: number }>('/ucp/notification-templates', { params }).then((r) => r.data),

  /** 查询通知模板详情 */
  getNotificationTemplate: (templateId: number) =>
    api.get<{
      id: number
      template_code: string
      template_name: string
      description: string | null
      trigger_scene: string
      trigger_scene_label: string
      channel: string
      message_format: string
      title_template: string
      content_template: string
      receivers: string[]
      variable_schema: Record<string, string>
      is_active: number
      created_at: string | null
      updated_at: string | null
    }>(`/ucp/notification-templates/${templateId}`).then((r) => r.data),

  /** 创建通知模板 */
  createNotificationTemplate: (payload: {
    template_code: string
    template_name: string
    description?: string
    trigger_scene: string
    channel: string
    message_format: string
    title_template: string
    content_template: string
    receivers: string[]
    variable_schema?: Record<string, string>
    is_active: number
  }) => api.post('/ucp/notification-templates', payload).then((r) => r.data),

  /** 更新通知模板 */
  updateNotificationTemplate: (templateId: number, payload: Record<string, any>) =>
    api.patch(`/ucp/notification-templates/${templateId}`, payload).then((r) => r.data),

  /** 切换通知模板启用状态 */
  toggleNotificationTemplate: (templateId: number) =>
    api.patch(`/ucp/notification-templates/${templateId}/toggle`).then((r) => r.data),

  /** 删除通知模板 */
  deleteNotificationTemplate: (templateId: number) =>
    api.delete(`/ucp/notification-templates/${templateId}`).then((r) => r.data),

  /** 预览通知模板 */
  previewNotificationTemplate: (templateId: number, mockVars?: Record<string, any>) =>
    api.post<{
      template_id: number
      template_code: string
      title_rendered: string
      content_rendered: string
      variables_used: string[]
      missing_variables: string[]
      extra_variables: string[]
    }>(`/ucp/notification-templates/${templateId}/preview`, { mock_vars: mockVars || {} }).then((r) => r.data),

  /** 应用模板到 notification_config */
  applyNotificationTemplate: (templateId: number, payload: { target_type: string; target_id: number; base_config?: Record<string, any> }) =>
    api.post<{ template_code: string; trigger_scene: string; new_config: Record<string, any> }>(`/ucp/notification-templates/${templateId}/apply`, payload).then((r) => r.data),

  /* ── Phase 3-1: 事件总线 ── */

  /** 事件接口 */
  ingestEvent: (payload: {
    event_id: string
    event_type: string
    source: string
    payload: Record<string, any>
    trigger?: string
    metadata?: Record<string, any>
    event_timestamp?: string
    is_dedup?: boolean
    auto_dispatch?: boolean
  }) =>
    api.post<{
      id: number
      event_id: string
      status: string
      matched_trigger_code: string | null
      pipeline_run_id: string | null
      trace_id: string | null
    }>('/ucp/events', payload).then((r) => r.data),

  listEvents: (params?: {
    source?: string
    event_type?: string
    status?: string
    trigger_code?: string
    limit?: number
    offset?: number
  }) =>
    api.get<{
      total: number
      items: Array<{
        id: number
        event_id: string
        event_type: string
        source: string
        trigger: string
        payload: Record<string, any>
        status: string
        trace_id: string | null
        matched_trigger_code: string | null
        pipeline_run_id: string | null
        retry_count: number
        error_code: string | null
        error_message: string | null
        event_timestamp: string | null
        received_at: string | null
        dispatched_at: string | null
        completed_at: string | null
      }>
    }>('/ucp/events', { params }).then((r) => r.data),

  getEvent: (eventId: string) =>
    api.get<{
      id: number
      event_id: string
      event_type: string
      source: string
      trigger: string
      payload: Record<string, any>
      metadata: Record<string, any> | null
      status: string
      trace_id: string | null
      matched_trigger_id: number | null
      matched_trigger_code: string | null
      pipeline_run_id: string | null
      retry_count: number
      error_code: string | null
      error_message: string | null
      event_timestamp: string | null
      received_at: string | null
      dispatched_at: string | null
      completed_at: string | null
    }>(`/ucp/events/${eventId}`).then((r) => r.data),

  manualDispatchEvent: (eventId: string) =>
    api.post<{
      id: number
      event_id: string
      status: string
      matched_trigger_code: string | null
      pipeline_run_id: string | null
    }>(`/ucp/events/${eventId}/dispatch`).then((r) => r.data),

  /* ── 事件触发器 ── */

  createEventTrigger: (payload: {
    trigger_code: string
    trigger_name: string
    description?: string
    event_source: string
    event_types: string
    pipeline_code: string
    filter_rule?: Record<string, any>
    signing_secret?: string
    signature_header?: string
    feishu_verification_token?: string
    feishu_encrypt_key?: string
    run_as_type?: string
    service_account_code?: string
    is_active?: boolean
    webhook_path?: string
  }) =>
    api.post<{ id: number; trigger_code: string; is_active: boolean }>('/ucp/triggers', payload).then((r) => r.data),

  listEventTriggers: (params?: { event_source?: string; is_active?: number; limit?: number }) =>
    api.get<{
      items: Array<{
        id: number
        trigger_code: string
        trigger_name: string
        description: string | null
        event_source: string
        event_types: string
        pipeline_code: string
        filter_rule: Record<string, any> | null
        signature_header: string | null
        run_as_type: string
        is_active: boolean
        webhook_path: string | null
        created_at: string | null
      }>
    }>('/ucp/triggers', { params }).then((r) => r.data),

  updateEventTrigger: (triggerId: string, payload: Record<string, any>) =>
    api.patch<{ id: number; trigger_code: string; is_active: boolean }>(`/ucp/triggers/${triggerId}`, payload).then((r) => r.data),

  deleteEventTrigger: (triggerId: string) =>
    api.delete<{ deleted: boolean; trigger_code: string }>(`/ucp/triggers/${triggerId}`).then((r) => r.data),

  /* Phase 3-4: 触发器测试 */
  testTrigger: (triggerId: string, payload: { event_type?: string; source?: string; payload?: Record<string, any> }) =>
    api.post<{ matched: boolean; is_test_payload: boolean; checks: Record<string, any>; pipeline_code: string | null }>(`/ucp/triggers/${triggerId}/test`, payload).then((r) => r.data),

  /* ── Phase 3-3: 死信 + 重放 ── */

  listDeadLetters: (params?: { trigger_code?: string; limit?: number; offset?: number }) =>
    api.get<{
      total: number
      items: Array<{
        id: number
        event_id: number
        event_uuid: string
        trigger_code: string | null
        pipeline_run_id: string | null
        attempt: number
        status: string
        error_code: string | null
        error_message: string | null
        next_retry_at: string | null
        last_retry_at: string | null
        created_at: string | null
        updated_at: string | null
      }>
    }>('/ucp/dead-letters', { params }).then((r) => r.data),

  getDeadLetter: (deliveryId: number) =>
    api.get<{
      id: number
      event_id: number
      event_uuid: string
      trigger_id: number | null
      trigger_code: string | null
      pipeline_run_id: string | null
      attempt: number
      status: string
      error_code: string | null
      error_message: string | null
      next_retry_at: string | null
      last_retry_at: string | null
      trigger_source: string
      triggered_by: string | null
      created_at: string | null
      updated_at: string | null
    }>(`/ucp/dead-letters/${deliveryId}`).then((r) => r.data),

  replayDeadLetter: (deliveryId: number) =>
    api.post<{
      id: number
      event_uuid: string
      status: string
      attempt: number
      pipeline_run_id: string | null
    }>(`/ucp/dead-letters/${deliveryId}/replay`).then((r) => r.data),

  discardDeadLetter: (deliveryId: number) =>
    api.post<{ id: number; event_uuid: string; status: string }>(`/ucp/dead-letters/${deliveryId}/discard`).then((r) => r.data),

  replayEvent: (eventId: string) =>
    api.post<{
      id: number
      event_id: string
      status: string
      matched_trigger_code: string | null
      pipeline_run_id: string | null
    }>(`/ucp/events/${eventId}/replay`).then((r) => r.data),

  listEventDeliveries: (eventId: string, limit = 50) =>
    api.get<{
      items: Array<{
        id: number
        event_id: number
        event_uuid: string
        trigger_code: string | null
        pipeline_run_id: string | null
        attempt: number
        status: string
        error_code: string | null
        error_message: string | null
        next_retry_at: string | null
        last_retry_at: string | null
        trigger_source: string
        triggered_by: string | null
        created_at: string | null
      }>
    }>(`/ucp/events/${eventId}/deliveries`, { params: { limit } }).then((r) => r.data),

  scanDueRetries: () =>
    api.post<{
      scanned: number
      replayed: Array<{ id: number; event_id: string; pipeline_run_id: string | null }>
    }>('/ucp/events/scan-retries').then((r) => r.data),
}

/* ── Phase 3-4: 外部账号流水线 ── */

export interface ExternalAccount {
  id: number
  system_code: string
  employee_id: string
  employee_name: string | null
  employee_mobile_masked: string | null
  external_user_id: string
  external_account_name: string | null
  status: 'PENDING' | 'ACTIVE' | 'DISABLED' | 'DELETED' | 'FAILED'
  last_action: string | null
  last_pipeline_run_id: string | null
  last_event_id: string | null
  last_error_code: string | null
  last_error_message: string | null
  retry_count: number
  extra: Record<string, unknown> | null
  created_at: string | null
  updated_at: string | null
  activated_at: string | null
  disabled_at: string | null
  deleted_at: string | null
}

export interface ExternalAccountAudit {
  id: number
  account_id: number
  system_code: string
  employee_id: string
  external_user_id: string | null
  action: string
  result: 'SUCCESS' | 'FAILED' | 'SKIPPED'
  trigger_source: string
  pipeline_run_id: string | null
  event_id: string | null
  approval_id: number | null
  operator: string | null
  request_payload: Record<string, unknown> | null
  response_payload: Record<string, unknown> | null
  error_code: string | null
  error_message: string | null
  created_at: string | null
}

export const externalAccountApi = {
  list: (params?: {
    system_code?: string
    employee_id?: string
    status?: string
    limit?: number
    offset?: number
  }) =>
    api
      .get<Paginated<ExternalAccount>>('/ucp/external-accounts', { params })
      .then((r) => extractItems(r.data)),

  get: (accountId: number) =>
    api.get<ExternalAccount>(`/ucp/external-accounts/${accountId}`).then((r) => r.data),

  listAudits: (accountId: number, limit = 50, offset = 0) =>
    api
      .get<Paginated<ExternalAccountAudit>>(
        `/ucp/external-accounts/${accountId}/audits`,
        { params: { limit, offset } },
      )
      .then((r) => extractItems(r.data)),

    runAction: (req: {
      system_code: string
      action: string
      employee_id?: string
      employee_name?: string
      employee_mobile?: string
      external_user_id?: string
      department?: string
      pipeline_code?: string
    }) =>
      api
        .post<{
          status: string
          data: Array<{
            account_id: number
            external_user_id: string
            action: string
            simulated: boolean
          }>
          row_count: number
          error_code: string | null
          error_message: string | null
        }>('/ucp/external-accounts/run', req)
        .then((r) => r.data),
}

/* ── Phase 3-5: 高风险动作审批 ── */

export interface ApprovalApprover {
  user_id: string
  user_name?: string
}

export interface ApprovalRequest {
  id: number
  request_code: string
  business_type: string
  business_key: string
  business_summary: string | null
  action: string
  action_payload: Record<string, unknown> | null
  approval_mode: 'SINGLE' | 'ANY' | 'ALL'
  confirmation_type: 'NONE' | 'SIMPLE' | 'TOKEN'
  confirmation_token: string | null
  approvers: ApprovalApprover[]
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'
  current_step: number
  total_steps: number
  approved_count: number
  rejected_count: number
  trigger_source: string
  triggered_by: string | null
  pipeline_run_id: string | null
  event_id: string | null
  executed_at: string | null
  execution_result: string | null
  execution_error: string | null
  expires_at: string | null
  reason: string | null
  created_at: string | null
  updated_at: string | null
  completed_at: string | null
  steps?: ApprovalStep[]
  actions?: ApprovalActionLog[]
}

export interface ApprovalStep {
  id: number
  request_id: number
  step_index: number
  approver_id: string
  approver_name: string | null
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SKIPPED'
  action_at: string | null
  comment: string | null
  transferred_to: string | null
  created_at: string | null
}

export interface ApprovalActionLog {
  id: number
  request_id: number
  step_id: number | null
  action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'TRANSFER' | 'WITHDRAW' | 'EXPIRE' | 'EXECUTE'
  operator_id: string | null
  operator_name: string | null
  comment: string | null
  extra: Record<string, unknown> | null
  created_at: string | null
}

export const approvalApi = {
  submit: (req: {
    business_type: string
    business_key: string
    business_summary?: string
    action: string
    action_payload?: Record<string, unknown>
    approvers: ApprovalApprover[]
    approval_mode?: 'SINGLE' | 'ANY' | 'ALL'
    confirmation_type?: 'NONE' | 'SIMPLE' | 'TOKEN'
    reason?: string
    expires_in_hours?: number
    pipeline_run_id?: string
    event_id?: string
  }) =>
    api.post<ApprovalRequest>('/ucp/approvals', req).then((r) => r.data),

  list: (params?: {
    status?: string
    business_type?: string
    approver_id?: string
    pipeline_run_id?: string
    limit?: number
    offset?: number
  }) =>
    api
      .get<Paginated<ApprovalRequest>>('/ucp/approvals', { params })
      .then((r) => extractItems(r.data)),

  getDetail: (id: number) =>
    api.get<ApprovalRequest>(`/ucp/approvals/${id}`).then((r) => r.data),

  myTodo: () =>
    api.get<{ count: number }>('/ucp/approvals/my-todo').then((r) => r.data),

  doAction: (
    id: number,
    req: {
      action: 'APPROVE' | 'REJECT' | 'TRANSFER' | 'WITHDRAW' | 'EXECUTE'
      comment?: string
      to_user_id?: string
      to_user_name?: string
      confirmation_token?: string
    },
  ) => api.post<ApprovalRequest>(`/ucp/approvals/${id}/action`, req).then((r) => r.data),

  scanExpired: () =>
    api
      .post<{
        expired_count: number
        items: Array<{ id: number; request_code: string; business_type: string }>
      }>('/ucp/approvals/scan-expired')
      .then((r) => r.data),
}

export const controlledWriteApi = { execute: (requestId: number, confirmation_token?: string) => api.post(`/ucp/write-operations/${requestId}/execute`, { confirmation_token }).then(r => r.data) }

/* ── Phase 3-6: OA 组织架构同步 ── */

export interface OaSyncRun {
  id: number
  run_code: string
  trigger_type: 'SCHEDULED' | 'EVENT' | 'MANUAL'
  source_system: string
  target_system: string
  status: 'PENDING' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'RUNNING'
  total_orgs: number
  created_count: number
  updated_count: number
  moved_count: number
  deleted_count: number
  unchanged_count: number
  approval_pending_count: number
  error_message: string | null
  triggered_by: string | null
  event_id: string | null
  pipeline_run_id: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string | null
}

export interface OaSyncRecord {
  id: number
  run_id: number
  org_code: string
  org_name: string
  parent_org_code: string | null
  source_status: string | null
  source_path: string | null
  target_org_id: string | null
  target_status: string | null
  diff_type: 'CREATED' | 'UPDATED' | 'DELETED' | 'MOVED' | 'UNCHANGED'
  diff_detail: Record<string, { old: unknown; new: unknown }> | null
  process_status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'SKIPPED' | 'APPROVAL_PENDING'
  process_error: string | null
  approval_id: number | null
  synced_at: string | null
  created_at: string | null
  updated_at: string | null
}

export const oaSyncApi = {
  listRuns: (params?: { status?: string; limit?: number; offset?: number }) =>
    api
      .get<Paginated<OaSyncRun>>('/ucp/oa-sync/runs', { params })
      .then((r) => extractItems(r.data)),

  getRun: (id: number) =>
    api.get<OaSyncRun>(`/ucp/oa-sync/runs/${id}`).then((r) => r.data),

  listRecords: (
    runId: number,
    params?: { diff_type?: string; process_status?: string; limit?: number; offset?: number },
  ) =>
    api
      .get<Paginated<OaSyncRecord>>(`/ucp/oa-sync/runs/${runId}/records`, { params })
      .then((r) => extractItems(r.data)),

  trigger: (req: {
    trigger_type?: 'SCHEDULED' | 'EVENT' | 'MANUAL'
    high_risk_approvers?: ApprovalApprover[]
    approval_mode?: 'SINGLE' | 'ANY' | 'ALL'
    source_orgs?: Array<Record<string, unknown>>
    target_orgs?: Array<Record<string, unknown>>
  }) =>
    api
      .post<OaSyncRun & { approvals: Record<string, number> }>('/ucp/oa-sync/trigger', req)
      .then((r) => r.data),
}

// ===== Phase 3-7: 适配器注册类型与 API =====

export interface AdapterDefinition {
  id: number
  adapter_code: string
  adapter_type: string
  name: string
  description: string | null
  schema: Record<string, unknown>
  sample_payload: Record<string, unknown> | unknown[] | null
  version: string
  is_active: boolean
  created_by: string
  created_at: string | null
  updated_at: string | null
}

// ===== Phase 5-4: 结构化 schema (categories 分组) =====

export interface SchemaField {
  name: string
  type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'
  required?: boolean
  default?: unknown
  help?: string
  group_key?: string
  enum?: unknown[]
  // 后端可能附加
  [k: string]: unknown
}

export interface SchemaCategory {
  key: string
  label: string
  fields: SchemaField[]
}

export interface AdapterSchema {
  adapter_code: string | null
  adapter_type: string | null
  version: string | null
  categories: SchemaCategory[]
}

export const adapterRegistryApi = {
  list: (params?: { adapter_type?: string; is_active?: boolean; keyword?: string; limit?: number; offset?: number }) =>
    api
      .get<{ total: number; items: AdapterDefinition[] }>('/ucp/adapter-registry', { params })
      .then((r) => r.data.items),
  get: (code: string) =>
    api.get<AdapterDefinition>(`/ucp/adapter-registry/${code}`).then((r) => r.data),
  getSchema: (code: string) =>
    api.get<AdapterSchema>(`/ucp/adapter-registry/${code}/schema`).then((r) => r.data),
  register: (req: {
    adapter_code: string
    adapter_type: string
    name: string
    description?: string
    schema?: Record<string, unknown>
    sample_payload?: Record<string, unknown> | unknown[]
    version?: string
  }) => api.post<AdapterDefinition>('/ucp/adapter-registry', req).then((r) => r.data),
  activate: (code: string, is_active: boolean) =>
    api
      .post<AdapterDefinition>(`/ucp/adapter-registry/${code}/activate`, { is_active })
      .then((r) => r.data),
  remove: (code: string) =>
    api.delete<{ deleted: string }>(`/ucp/adapter-registry/${code}`).then((r) => r.data),
}

// Phase 5-4: 把 adapterRegistry 入口直接挂到 ucpApi 对象字面量尾部
// 在文件最后一行用 Object.assign 合并(类型安全)

// ===== Phase 3-8: 流水线模板 =====

export interface PipelineNode {
  id: string
  type: 'CONNECTOR' | 'TRANSFORM' | 'BRANCH' | 'LOOP'
  x: number
  y: number
  label: string
  config: Record<string, unknown>
}

export interface PipelineEdge {
  from: string
  to: string
  condition?: string
}

export interface PipelineTemplate {
  id: number
  template_code: string
  name: string
  description: string | null
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  version: string
  created_by: string
  created_at: string | null
  updated_at: string | null
}

export interface PipelineTemplateVersion {
  id: number
  template_id: number
  version: string
  nodes: PipelineNode[]
  edges: PipelineEdge[]
  change_note: string | null
  created_by: string
  created_at: string | null
}

export interface NodeTypeMeta {
  type: PipelineNode['type']
  label: string
  color: string
  icon: string
  config_schema: Record<string, string>
}

export const pipelineTemplateApi = {
  list: (params?: { keyword?: string; limit?: number; offset?: number }) =>
    api
      .get<{ total: number; items: PipelineTemplate[] }>('/ucp/pipeline-templates', { params })
      .then((r) => r.data.items),
  get: (code: string) =>
    api.get<PipelineTemplate>(`/ucp/pipeline-templates/${code}`).then((r) => r.data),
  create: (req: {
    template_code: string
    name: string
    description?: string
    nodes?: PipelineNode[]
    edges?: PipelineEdge[]
    version?: string
  }) => api.post<PipelineTemplate>('/ucp/pipeline-templates', req).then((r) => r.data),
  update: (
    code: string,
    req: {
      name?: string
      description?: string
      nodes?: PipelineNode[]
      edges?: PipelineEdge[]
      version?: string
      change_note?: string
    },
  ) => api.patch<PipelineTemplate>(`/ucp/pipeline-templates/${code}`, req).then((r) => r.data),
  versions: (code: string) =>
    api
      .get<{ items: PipelineTemplateVersion[] }>(`/ucp/pipeline-templates/${code}/versions`)
      .then((r) => r.data.items),
  rollback: (code: string, target_version_id: number) =>
    api
      .post<PipelineTemplate>(`/ucp/pipeline-templates/${code}/rollback`, {
        target_version_id,
      })
      .then((r) => r.data),
  remove: (code: string) =>
    api.delete<{ deleted: string }>(`/ucp/pipeline-templates/${code}`).then((r) => r.data),
  nodeTypes: () =>
    api
      .get<{ node_types: NodeTypeMeta[]; node_count_limit: number }>(
        '/ucp/pipeline-templates/_meta/node-types',
      )
      .then((r) => r.data),
}

// ===== Phase 3-9: 运行监控 =====

export interface MonitorSummary {
  window_hours: number
  pipeline_total: number
  pipeline_success: number
  pipeline_partial: number
  pipeline_failed: number
  pipeline_running: number
  avg_duration_ms: number
  fail_rate: number
  events_total: number
  events_failed: number
  dead_letters: number
  pending_approvals: number
}

export interface TrendBucket {
  bucket: string
  total: number
  success: number
  failed: number
  avg_duration_ms: number
}

export interface RecentRun {
  id: number
  pipeline_run_id: string
  pipeline_code: string
  status: string
  trigger_type: string
  triggered_by: string | null
  duration_ms: number | null
  created_at: string | null
  started_at: string | null
  finished_at: string | null
}

export interface MonitorAlert {
  level: 'CRITICAL' | 'WARN' | 'INFO'
  type: string
  message: string
  ref_id: string
  created_at: string | null
}

export interface PipelineStat {
  pipeline_code: string
  total: number
  success: number
  failed: number
  fail_rate: number
}

export const monitorApi = {
  // Phase 5-3: 透传 system_id / resource_id 过滤
  summaryRaw: (params: { hours?: number; system_id?: number; resource_id?: number } = {}) =>
    api.get<MonitorSummary>('/ucp/monitor/summary', { params }).then((r) => r.data),
  summary: (hours = 24) =>
    api.get<MonitorSummary>('/ucp/monitor/summary', { params: { hours } }).then((r) => r.data),
  trend: (hours = 24, bucket: 'hour' | 'day' = 'hour', filter: { system_id?: number; resource_id?: number } = {}) =>
    api
      .get<{ items: TrendBucket[]; bucket: string; window_hours: number }>(
        '/ucp/monitor/trend',
        { params: { hours, bucket, ...filter } },
      )
      .then((r) => r.data.items),
  statusDistribution: (hours = 24, filter: { system_id?: number; resource_id?: number } = {}) =>
    api
      .get<{ distribution: Record<string, number> }>('/ucp/monitor/status-distribution', {
        params: { hours, ...filter },
      })
      .then((r) => r.data.distribution),
  recentRuns: (limit = 20, filter: { system_id?: number; resource_id?: number } = {}) =>
    api
      .get<{ items: RecentRun[] }>('/ucp/monitor/recent-runs', { params: { limit, ...filter } })
      .then((r) => r.data.items),
  alertsRaw: (limit = 50, filter: { system_id?: number; resource_id?: number } = {}) =>
    api
      .get<{ items: MonitorAlert[] }>('/ucp/monitor/alerts', { params: { limit, ...filter } })
      .then((r) => r.data.items),
  alerts: (limit = 50) =>
    api
      .get<{ items: MonitorAlert[] }>('/ucp/monitor/alerts', { params: { limit } })
      .then((r) => r.data.items),
  pipelineStats: (hours = 24, limit = 10, filter: { system_id?: number; resource_id?: number } = {}) =>
    api
      .get<{ items: PipelineStat[] }>('/ucp/monitor/pipeline-stats', {
        params: { hours, limit, ...filter },
      })
      .then((r) => r.data.items),
}

/* ── Phase 4: 告警规则配置 ── */

export interface AlertRuleItem {
  id: number
  rule_code: string
  rule_name: string
  rule_type: string
  threshold_value: number
  threshold_unit: string | null
  target_filter: Record<string, any> | null
  is_active: number
  notify_channels: string | null
  notify_receivers: string[] | null
  cooldown_minutes: number
  description: string | null
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

export interface AlertLogItem {
  id: number
  rule_id: number | null
  rule_code: string | null
  alert_level: string
  alert_type: string
  message: string
  ref_id: string | null
  current_value: number | null
  threshold_value: number | null
  notify_status: string | null
  resolved_at: string | null
  created_at: string | null
}

export const alertRuleApi = {
  list: (ruleType?: string) =>
    api.get<{ items: AlertRuleItem[]; total: number }>('/ucp/alert-rules', { params: ruleType ? { rule_type: ruleType } : {} }).then((r) => r.data),
  create: (payload: { rule_code: string; rule_name: string; rule_type: string; threshold_value: number; threshold_unit?: string; target_filter?: Record<string, any>; notify_channels?: string; notify_receivers?: string[]; cooldown_minutes?: number; description?: string }) =>
    api.post<AlertRuleItem>('/ucp/alert-rules', payload).then((r) => r.data),
  update: (ruleId: number, payload: Record<string, any>) =>
    api.patch<AlertRuleItem>(`/ucp/alert-rules/${ruleId}`, payload).then((r) => r.data),
  delete: (ruleId: number) =>
    api.delete<{ deleted: boolean }>(`/ucp/alert-rules/${ruleId}`).then((r) => r.data),
  logs: (limit?: number) =>
    api.get<{ items: AlertLogItem[]; total: number }>('/ucp/alert-logs', { params: { limit } }).then((r) => r.data),
}

/* ── Phase 5-E: API 模板库 ── */

export interface ApiTemplateItem {
  id: number
  template_code: string
  template_name: string
  description: string | null
  category: string
  system_type: string | null
  method: string
  base_url: string | null
  path: string | null
  content_type: string | null
  timeout_seconds: number | null
  headers_config: any[] | null
  query_config: any[] | null
  body_template: Record<string, any> | null
  auth_type: string | null
  data_path: string | null
  total_path: string | null
  next_cursor_path: string | null
  pagination_type: string
  page_param: string | null
  page_size_param: string | null
  rate_limit_qps: number | null
  rate_limit_concurrency: number | null
  retry_max: number | null
  retry_backoff: string | null
  field_mappings: any[] | null
  error_code_map: Record<string, any> | null
  sample_response: Record<string, any> | null
  allowed_domains: string[] | null
  tags: string[] | null
  version: string
  is_published: boolean
  is_active: boolean
  created_by: string | null
  created_at: string | null
  updated_at: string | null
}

export const apiTemplateApi = {
  list: (params?: { category?: string; system_type?: string; keyword?: string; is_published?: boolean; limit?: number; offset?: number }) =>
    api.get<{ total: number; items: ApiTemplateItem[] }>('/ucp/api-templates', { params }).then((r) => r.data),
  get: (code: string) =>
    api.get<ApiTemplateItem>(`/ucp/api-templates/${code}`).then((r) => r.data),
  create: (payload: Record<string, any>) =>
    api.post<ApiTemplateItem>('/ucp/api-templates', payload).then((r) => r.data),
  update: (code: string, payload: Record<string, any>) =>
    api.patch<ApiTemplateItem>(`/ucp/api-templates/${code}`, payload).then((r) => r.data),
  copy: (sourceCode: string, newCode: string, newName: string) =>
    api.post<ApiTemplateItem>(`/ucp/api-templates/${sourceCode}/copy`, { new_code: newCode, new_name: newName }).then((r) => r.data),
  delete: (code: string) =>
    api.delete<{ deleted: boolean }>(`/ucp/api-templates/${code}`).then((r) => r.data),
  versions: (code: string) =>
    api.get<{ items: any[] }>(`/ucp/api-templates/${code}/versions`).then((r) => r.data),
  rollback: (code: string, versionId: number) =>
    api.post<ApiTemplateItem>(`/ucp/api-templates/${code}/rollback`, { version_id: versionId }).then((r) => r.data),
  previewOpenApi: (payload: { document: Record<string, any>; allowed_domains: string[]; code_prefix?: string }) =>
    api.post<{ operations: any[]; rejected: any[] }>('/ucp/api-templates/openapi/preview', payload).then((r) => r.data),
  importOpenApi: (payload: { document: Record<string, any>; allowed_domains: string[]; selected_operation_ids: string[]; code_prefix?: string }) =>
    api.post<{ items: ApiTemplateItem[]; rejected: any[] }>('/ucp/api-templates/openapi/import', payload).then((r) => r.data),
  approvePublish: (code: string) =>
    api.post<ApiTemplateItem>(`/ucp/api-templates/${code}/approve-publish`).then((r) => r.data),
  importTemplate: (payload: Record<string, any>) =>
    api.post<ApiTemplateItem>('/ucp/api-templates/import', payload).then((r) => r.data),
  exportTemplate: (code: string) =>
    api.get<{ format: string; content: any }>(`/ucp/api-templates/${code}/export`).then((r) => r.data),
  testEngine: (payload: { template?: any; context?: Record<string, any> }) =>
    api.post<{ input: any; context_keys: string[]; output: any }>('/ucp/template-engine/test', payload).then((r) => r.data),
  /** Phase 5: 测试执行 API 模板（含 SSRF 校验、脱敏、样例保存） */
  testApiTemplate: (payload: { template?: any; context?: Record<string, any>; save_sample?: boolean }) =>
    api.post<{ request: any; response_sample: any[]; total: number; context_used: string[] }>('/ucp/api-templates/test', payload).then((r) => r.data),
}

/* ── Phase 6-A: 集成资产目录 ── */

export interface AssetCatalog {
  systems: { total: number; active: number }
  resources: { total: number; active: number }
  credentials: { total: number; active: number }
  pipelines: { total: number; active: number }
  templates: { total: number }
  events_24h: number
}

export const assetCatalogApi = {
  catalog: () =>
    api.get<AssetCatalog>('/ucp/assets/catalog').then((r) => r.data),
  list: (params: { asset_type: string; domain?: string; keyword?: string; limit?: number; offset?: number }) =>
    api.get<{ total: number; items: any[] }>('/ucp/assets', { params }).then((r) => r.data),
  setTag: (payload: { asset_type: string; asset_id: number; tag_key: string; tag_value: string }) =>
    api.post<Record<string, any>>('/ucp/assets/tags', payload).then((r) => r.data),
  removeTag: (assetType: string, assetId: number, tagKey: string) =>
    api.delete<{ deleted: boolean }>('/ucp/assets/tags', { params: { asset_type: assetType, asset_id: assetId, tag_key: tagKey } }).then((r) => r.data),
}

/* ── Phase 6-B: 依赖拓扑 ── */

export const topologyApi = {
  get: (params?: { system_id?: number; resource_id?: number }) =>
    api.get<{ nodes: any[]; edges: any[] }>('/ucp/topology', { params }).then((r) => r.data),
  impact: (targetType: string, targetId: number) =>
    api.get<{ target: any; affected_pipelines: any[]; affected_resources: any[]; affected_systems: any[] }>(
      '/ucp/topology/impact', { params: { target_type: targetType, target_id: targetId } },
    ).then((r) => r.data),
}

/* ── Phase 6-C: SLA 管理 ── */

export interface SlaConfigItem {
  id: number
  sla_code: string
  sla_name: string | null
  target_type: string
  target_id: number
  success_rate_target: number | null
  p95_duration_ms_max: number | null
  p99_duration_ms_max: number | null
  recovery_time_minutes: number | null
  window_hours: number
  is_active: boolean
  created_by: string | null
  created_at: string | null
}

export interface SlaDashboard {
  total: number
  met: number
  not_met: number
  items: any[]
}

export const slaApi = {
  listConfigs: () =>
    api.get<{ items: SlaConfigItem[] }>('/ucp/sla/configs').then((r) => r.data),
  createConfig: (payload: { sla_code: string; sla_name?: string; target_type: string; target_id: number; success_rate_target?: number; p95_duration_ms_max?: number; p99_duration_ms_max?: number; recovery_time_minutes?: number; window_hours?: number }) =>
    api.post<SlaConfigItem>('/ucp/sla/configs', payload).then((r) => r.data),
  updateConfig: (slaId: number, payload: Record<string, any>) =>
    api.patch<SlaConfigItem>(`/ucp/sla/configs/${slaId}`, payload).then((r) => r.data),
  deleteConfig: (slaId: number) =>
    api.delete<{ deleted: boolean }>(`/ucp/sla/configs/${slaId}`).then((r) => r.data),
  calculate: (slaId: number) =>
    api.post<Record<string, any>>(`/ucp/sla/configs/${slaId}/calculate`).then((r) => r.data),
  records: (slaId: number, limit?: number) =>
    api.get<{ items: any[] }>(`/ucp/sla/configs/${slaId}/records`, { params: { limit } }).then((r) => r.data),
  dashboard: () =>
    api.get<SlaDashboard>('/ucp/sla/dashboard').then((r) => r.data),
}

/* ── Phase 6-D: 变更管理 ── */

export const changeApi = {
  list: (params?: { status?: string; change_type?: string; limit?: number; offset?: number }) =>
    api.get<{ items: any[] }>('/ucp/changes', { params }).then((r) => r.data),
  create: (payload: { change_type: string; change_target_id: number; change_target_code: string; change_summary?: string; risk_level?: string; reason?: string }) =>
    api.post<Record<string, any>>('/ucp/changes', payload).then((r) => r.data),
  publish: (changeId: number) =>
    api.post<Record<string, any>>(`/ucp/changes/${changeId}/publish`).then((r) => r.data),
  rollback: (changeId: number) =>
    api.post<Record<string, any>>(`/ucp/changes/${changeId}/rollback`).then((r) => r.data),
}

export const migrationApi = {
  preview: (payload: { legacy_adapter_codes: string[]; target_adapter_code: string }) =>
    api.post('/ucp/migrations/adapter/preview', payload).then((r) => r.data),
  confirm: (payload: { resource_id: number; target_adapter_code: string }) =>
    api.post('/ucp/migrations/adapter/confirm', payload).then((r) => r.data),
  publish: (changeId: number) =>
    api.post('/ucp/migrations/adapter/publish', { change_id: changeId }).then((r) => r.data),
}

/* ── Phase 6-E: 治理评分 ── */

export const governanceScoreApi = {
  calculate: (assetType?: string, windowHours?: number) =>
    api.post<{ items: any[] }>('/ucp/governance/scores/calculate', null, { params: { asset_type: assetType, window_hours: windowHours } }).then((r) => r.data),
  list: (assetType?: string, limit?: number) =>
    api.get<{ items: any[] }>('/ucp/governance/scores', { params: { asset_type: assetType, limit } }).then((r) => r.data),
}

/* ── Phase 7-A: 主数据目录 ── */

export const masterDataApi = {
  listObjects: (params?: { object_type?: string; system_code?: string; keyword?: string; limit?: number; offset?: number }) =>
    api.get<{ total: number; items: any[] }>('/ucp/master-data/objects', { params }).then((r) => r.data),
  createObject: (payload: Record<string, any>) =>
    api.post<Record<string, any>>('/ucp/master-data/objects', payload).then((r) => r.data),
  updateObject: (code: string, payload: Record<string, any>) =>
    api.patch<Record<string, any>>(`/ucp/master-data/objects/${code}`, payload).then((r) => r.data),
}

/* ── Phase 7-B: ID 映射 ── */

export const idMappingApi = {
  list: (params?: { object_type?: string; external_system?: string; hr_id?: string; is_conflict?: boolean; limit?: number; offset?: number }) =>
    api.get<{ total: number; items: any[] }>('/ucp/master-data/mappings', { params }).then((r) => r.data),
  create: (payload: { object_type: string; hr_id: string; external_system: string; external_id: string; external_name?: string; mapping_type?: string }) =>
    api.post<Record<string, any>>('/ucp/master-data/mappings', payload).then((r) => r.data),
  update: (id: number, payload: Record<string, any>) =>
    api.patch<Record<string, any>>(`/ucp/master-data/mappings/${id}`, payload).then((r) => r.data),
  delete: (id: number) =>
    api.delete<{ deleted: boolean }>(`/ucp/master-data/mappings/${id}`).then((r) => r.data),
  checkConflicts: () =>
    api.post<{ total: number; conflicts: any[] }>('/ucp/master-data/mappings/check-conflicts').then((r) => r.data),
}

/* ── Phase 7-C: 差异检测 ── */

export const diffApi = {
  listJobs: () =>
    api.get<{ items: any[] }>('/ucp/diff/jobs').then((r) => r.data),
  createJob: (payload: { job_code: string; job_name: string; source_system: string; target_system: string; object_type: string; compare_fields?: string[]; key_field?: string; source_resource_id?: number; target_resource_id?: number; cron_expression?: string }) =>
    api.post<Record<string, any>>('/ucp/diff/jobs', payload).then((r) => r.data),
  updateJob: (id: number, payload: Record<string, any>) =>
    api.patch<Record<string, any>>(`/ucp/diff/jobs/${id}`, payload).then((r) => r.data),
  deleteJob: (id: number) =>
    api.delete<{ deleted: boolean }>(`/ucp/diff/jobs/${id}`).then((r) => r.data),
  runJob: (id: number) =>
    api.post<Record<string, any>>(`/ucp/diff/jobs/${id}/run`).then((r) => r.data),
  listRecords: (params?: { job_id?: number; run_code?: string; diff_type?: string; process_status?: string; limit?: number; offset?: number }) =>
    api.get<{ total: number; items: any[] }>('/ucp/diff/records', { params }).then((r) => r.data),
  trend: (days?: number) =>
    api.get<{ items: any[] }>('/ucp/diff/trend', { params: { days } }).then((r) => r.data),
}

/* ── Phase 7-D: 数据质量规则 ── */

export const qualityApi = {
  listRules: (params?: { rule_type?: string; object_type?: string; limit?: number }) =>
    api.get<{ total: number; items: any[] }>('/ucp/quality/rules', { params }).then((r) => r.data),
  createRule: (payload: { rule_code: string; rule_name: string; object_type: string; rule_type: string; resource_id?: number; system_code?: string; field_name?: string; rule_config?: Record<string, any>; severity?: string; cron_expression?: string; description?: string }) =>
    api.post<Record<string, any>>('/ucp/quality/rules', payload).then((r) => r.data),
  updateRule: (id: number, payload: Record<string, any>) =>
    api.patch<Record<string, any>>(`/ucp/quality/rules/${id}`, payload).then((r) => r.data),
  deleteRule: (id: number) =>
    api.delete<{ deleted: boolean }>(`/ucp/quality/rules/${id}`).then((r) => r.data),
  scan: (ruleId: number) =>
    api.post<Record<string, any>>(`/ucp/quality/rules/${ruleId}/scan`).then((r) => r.data),
  listIssues: (params?: { rule_id?: number; scan_run_code?: string; status?: string; limit?: number }) =>
    api.get<{ total: number; items: any[] }>('/ucp/quality/issues', { params }).then((r) => r.data),
}

/* ── Phase 7-E/F: 冲突 + 治理 ── */

export const conflictApi = {
  list: (params?: { source_type?: string; status?: string; object_type?: string; limit?: number; offset?: number }) =>
    api.get<{ total: number; items: any[] }>('/ucp/conflicts', { params }).then((r) => r.data),
  resolve: (id: number, payload: { resolution_strategy: string; resolution_detail?: Record<string, any> }) =>
    api.post<Record<string, any>>(`/ucp/conflicts/${id}/resolve`, payload).then((r) => r.data),
  sync: () =>
    api.post<{ counts: Record<string, number> }>('/ucp/conflicts/sync').then((r) => r.data),
}

export const governanceApi = {
  listTasks: (params?: { status?: string; assigned_to?: string; priority?: string; limit?: number; offset?: number }) =>
    api.get<{ total: number; items: any[] }>('/ucp/governance/tasks', { params }).then((r) => r.data),
  createTask: (payload: { task_name: string; source_type: string; source_id?: number; object_type?: string; object_key?: string; system_code?: string; priority?: string; assigned_to?: string; due_date?: string; description?: string }) =>
    api.post<Record<string, any>>('/ucp/governance/tasks', payload).then((r) => r.data),
  updateTask: (id: number, payload: Record<string, any>) =>
    api.patch<Record<string, any>>(`/ucp/governance/tasks/${id}`, payload).then((r) => r.data),
  generateReport: (reportPeriod?: string) =>
    api.post<Record<string, any>>('/ucp/governance/reports/generate', reportPeriod ? { report_period: reportPeriod } : {}).then((r) => r.data),
}

/* ── SSRF 安全规则 ── */

export const securityApi = {
  ssrfRules: () =>
    api.get<{ blocked_networks: string[]; blocked_host_patterns: string[] }>('/ucp/security/ssrf-rules').then((r) => r.data),
}

/* Phase 5-4: 把 adapterRegistry 入口并入 ucpApi */
;(ucpApi as any).adapterRegistryList = adapterRegistryApi.list
;(ucpApi as any).adapterSchema = adapterRegistryApi.getSchema

/* ── Account lifecycle rules ── */
export interface AccountLifecycleRule {
  rule_code: string
  rule_name: string
  internal_event_type: string
  target_system_code: string
  target_resource_code: string
  lifecycle_action: string
  retention_days: number
  approval_required: boolean
  status: number
  field_mapping: Record<string, any>
  filter_rule: Record<string, any>
}

export interface AccountLifecycleJob {
  job_code: string
  rule_id: number
  account_id: number | null
  action: string
  status: string
  scheduled_at: string
  retry_count: number
  last_error_message: string | null
}

export const accountLifecycleApi = {
  listRules: () => api.get<{ total: number; items: AccountLifecycleRule[] }>('/ucp/account-lifecycle-rules').then((r) => r.data),
  createRule: (payload: Record<string, any>) => api.post<AccountLifecycleRule>('/ucp/account-lifecycle-rules', payload).then((r) => r.data),
  setRuleEnabled: (code: string, enabled: boolean) => api.post<AccountLifecycleRule>(`/ucp/account-lifecycle-rules/${code}/${enabled ? 'enable' : 'disable'}`).then((r) => r.data),
  dryRun: (code: string, event: Record<string, any>) => api.post<Record<string, any>>(`/ucp/account-lifecycle-rules/${code}/dry-run`, { event }).then((r) => r.data),
  listJobs: () => api.get<{ total: number; items: AccountLifecycleJob[] }>('/ucp/account-lifecycle-jobs').then((r) => r.data),
  retryJob: (code: string) => api.post<AccountLifecycleJob>(`/ucp/account-lifecycle-jobs/${code}/retry`).then((r) => r.data),
}

export const accountLifecycleReleaseApi = {
  readiness: () => api.get<{ ready: boolean; checks: Array<{ key: string; ok: boolean; message: string; count?: number }> }>('/ucp/account-lifecycle-readiness').then((r) => r.data),
}
