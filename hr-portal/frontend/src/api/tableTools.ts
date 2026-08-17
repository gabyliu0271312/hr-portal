import { api } from './client'

export interface SourceMappingIn {
  name: string
  match_signature: string[]
  sheet_kw?: string | null
  header_start: number
  header_end: number
  key_map: Record<string, string>
  column_map: Record<string, string>
  derived_fields: { target: string; expr: string; round?: number }[]
  derive_check?: { sum_of: string[]; equals_col: string; tol: number } | null
  skip_tokens: string[]
}

export type ResultSaveMode = 'none' | 'input_period' | 'field_period'

export interface TemplateIn {
  name: string
  description?: string | null
  merge_keys: string[]
  std_fields: string[]
  aggregate: string
  result_save_mode: ResultSaveMode
  result_period_field?: string | null
  mappings: SourceMappingIn[]
}

export interface TemplateOut {
  id: number
  name: string
  description: string | null
  merge_keys: string[]
  std_fields: string[]
  aggregate: string
  result_save_mode: ResultSaveMode
  result_period_field: string | null
  version: number
  mapping_count: number
  created_by: number | null
}

export interface SourceMappingOut extends SourceMappingIn {
  id: number
}

export interface KeyMapping {
  id: number
  template_id: number
  source_key: Record<string, any>
  canonical_merge_key: Record<string, any>
  enabled: boolean
}

export interface KeyMappingIn {
  source_key: Record<string, any>
  canonical_merge_key: Record<string, any>
  enabled?: boolean
}

export interface DwdRelation {
  id: number
  template_id: number
  name: string
  report_id: number
  left_fields: string[]
  right_fields: string[]
  select_fields: string[]
  missing_policy: string
  multiple_policy: string
  enabled: boolean
}

export interface DwdField {
  code: string
  label: string
  data_type: string
  is_sensitive: boolean
}

export interface DwdRelationSource {
  report_id: number
  report_name: string
  dataset_id: number
  dataset_name: string
  dataset_label: string | null
}

export interface TemplateDetail extends TemplateOut {
  mappings: SourceMappingOut[]
  key_mappings?: KeyMapping[]
}

export interface MappingDraft {
  mapping: SourceMappingIn
  available_sheets: string[]
  effective_headers: string[]
  low_confidence: { sheet: string; confidence: number; notes: string }[]
  warnings: string[]
}


export interface MergeResult {
  preview_token?: string
  columns: string[]
  rows: Record<string, any>[]
  total_rows: number
  recognize_log: { sheet: string; file: string; mapping: string; score: number }[]
  anomalies: { type: string; key: any; detail: string; file?: string }[]
  stats: { files: number; records: number; persons: number; anomalies: number }
  key_mapping_stats?: { configured: number; matched: number; unmatched: number }
  raw_key_traces?: Record<string, any>[]
  dwd_anomalies?: Record<string, any>[]
}

export interface MergeResultBatch {
  id: number
  period: string
  template_version: number
  row_count: number
  created_at: string
  updated_at: string
}

export interface SaveMergeResultResponse extends MergeResultBatch {
  inserted_count: number
  replaced_count: number
  total_count: number
}

export interface MergeResultBatchRows {
  batch: MergeResultBatch
  columns: string[]
  rows: Record<string, any>[]
  total_rows: number
}

export interface AiDraftMeta {
  sheets_found: number
  files: string[]
  low_confidence: { sheet: string; confidence: number; notes: string }[]
}

export interface AiDraft extends TemplateIn {
  mappings: (SourceMappingIn & { _confidence?: number; _notes?: string })[]
  _meta: AiDraftMeta
}

export const tableToolsApi = {
  listTemplates: (): Promise<TemplateOut[]> =>
    api.get('/table-tools/templates').then((r) => r.data),

  getTemplate: (id: number): Promise<TemplateDetail> =>
    api.get(`/table-tools/templates/${id}`).then((r) => r.data),

  createTemplate: (payload: TemplateIn): Promise<TemplateOut> =>
    api.post('/table-tools/templates', payload).then((r) => r.data),

  updateTemplate: (id: number, payload: TemplateIn): Promise<TemplateOut> =>
    api.put(`/table-tools/templates/${id}`, payload).then((r) => r.data),

  deleteTemplate: (id: number): Promise<void> =>
    api.delete(`/table-tools/templates/${id}`).then(() => undefined),

  mappingDraft: (templateId: number, file: File, sheetName?: string): Promise<MappingDraft> => {
    const fd = new FormData()
    fd.append('file', file)
    if (sheetName) fd.append('sheet_name', sheetName)
    return api.post(`/table-tools/templates/${templateId}/mapping-draft`, fd).then((r) => r.data)
  },
  mappingDrafts: (templateId: number, files: File[], businessContext: string): Promise<{ mappings: SourceMappingIn[]; low_confidence: MappingDraft['low_confidence']; warnings: string[] }> => {
    const fd = new FormData()
    files.forEach((file) => fd.append('files', file))
    fd.append('business_context', businessContext)
    return api.post(`/table-tools/templates/${templateId}/mapping-drafts`, fd, { timeout: 300000 }).then((r) => r.data)
  },
  createMappings: (templateId: number, mappings: SourceMappingIn[]): Promise<{ mappings: SourceMappingOut[] }> =>
    api.post(`/table-tools/templates/${templateId}/mappings/batch`, { mappings }).then((r) => r.data),
  createMapping: (templateId: number, payload: SourceMappingIn): Promise<SourceMappingOut> =>
    api.post(`/table-tools/templates/${templateId}/mappings`, payload).then((r) => r.data),

  updateMapping: (templateId: number, mappingId: number, payload: SourceMappingIn): Promise<SourceMappingOut> =>
    api.put(`/table-tools/templates/${templateId}/mappings/${mappingId}`, payload).then((r) => r.data),

  deleteMapping: (templateId: number, mappingId: number): Promise<void> =>
    api.delete(`/table-tools/templates/${templateId}/mappings/${mappingId}`).then(() => undefined),

  listKeyMappings: (templateId: number): Promise<KeyMapping[]> =>
    api.get(`/table-tools/templates/${templateId}/key-mappings`).then((r) => r.data),
  createKeyMapping: (templateId: number, payload: KeyMappingIn): Promise<KeyMapping> =>
    api.post(`/table-tools/templates/${templateId}/key-mappings`, payload).then((r) => r.data),
  updateKeyMapping: (templateId: number, mappingId: number, payload: KeyMappingIn): Promise<KeyMapping> =>
    api.put(`/table-tools/templates/${templateId}/key-mappings/${mappingId}`, payload).then((r) => r.data),
  deleteKeyMapping: (templateId: number, mappingId: number): Promise<void> =>
    api.delete(`/table-tools/templates/${templateId}/key-mappings/${mappingId}`).then(() => undefined),

  listDwdSources: (): Promise<DwdRelationSource[]> =>
    api.get('/table-tools/dwd-relation-sources').then((r) => r.data),
  listDwdFields: (reportId: number): Promise<DwdField[]> =>
    api.get(`/table-tools/reports/${reportId}/dwd-fields`).then((r) => r.data),
  listDwdRelations: (templateId: number): Promise<DwdRelation[]> =>
    api.get(`/table-tools/templates/${templateId}/dwd-relations`).then((r) => r.data),
  createDwdRelation: (templateId: number, payload: Omit<DwdRelation, 'id' | 'template_id'>): Promise<DwdRelation> =>
    api.post(`/table-tools/templates/${templateId}/dwd-relations`, payload).then((r) => r.data),
  updateDwdRelation: (templateId: number, relationId: number, payload: Omit<DwdRelation, 'id' | 'template_id'>): Promise<DwdRelation> =>
    api.put(`/table-tools/templates/${templateId}/dwd-relations/${relationId}`, payload).then((r) => r.data),
  deleteDwdRelation: (templateId: number, relationId: number): Promise<void> =>
    api.delete(`/table-tools/templates/${templateId}/dwd-relations/${relationId}`).then(() => undefined),
  applyDwdRelation: (templateId: number, relationId: number, files: File[]): Promise<MergeResult & { dwd_anomalies: Record<string, any>[] }> => {
    const fd = new FormData()
    files.forEach((file) => fd.append('files', file))
    return api.post(`/table-tools/templates/${templateId}/dwd-relations/${relationId}/apply`, fd, { timeout: 300000 }).then((r) => r.data)
  },

  runMerge: (templateId: number, files: File[]): Promise<MergeResult> => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    return api.post(`/table-tools/templates/${templateId}/merge`, fd, {
      timeout: 300000,
    }).then((r) => r.data)
  },

  downloadMerge: async (templateId: number, files: File[]): Promise<void> => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    const resp = await api.post(`/table-tools/templates/${templateId}/download`, fd, {
      responseType: 'blob',
      timeout: 300000,
    })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = url
    a.download = 'merged_result.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  },

  saveResultBatch: (templateId: number, previewToken: string, period?: string): Promise<SaveMergeResultResponse> =>
    api.post(`/table-tools/templates/${templateId}/result-batches/save`, { preview_token: previewToken, ...(period ? { period } : {}) }).then((r) => r.data),
  listResultBatches: (templateId: number): Promise<MergeResultBatch[]> =>
    api.get(`/table-tools/templates/${templateId}/result-batches`).then((r) => r.data),
  getResultBatchRows: (templateId: number, batchId: number, page = 1): Promise<MergeResultBatchRows> =>
    api.get(`/table-tools/templates/${templateId}/result-batches/${batchId}/rows`, { params: { page, page_size: 100 } }).then((r) => r.data),
  downloadResultBatch: async (templateId: number, batch: MergeResultBatch): Promise<void> => {
    const resp = await api.get(`/table-tools/templates/${templateId}/result-batches/${batch.id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(resp.data)
    const a = document.createElement('a')
    a.href = url
    a.download = `merged_result_${batch.period}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
  },

  aiDraft: (files: File[], businessContext: string): Promise<AiDraft> => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    fd.append('business_context', businessContext)
    return api.post('/table-tools/ai-draft', fd, { timeout: 300000 }).then((r) => r.data)
  },
}
