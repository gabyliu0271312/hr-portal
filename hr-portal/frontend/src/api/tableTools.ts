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

export interface TemplateIn {
  name: string
  description?: string | null
  merge_keys: string[]
  std_fields: string[]
  aggregate: string
  mappings: SourceMappingIn[]
}

export interface TemplateOut {
  id: number
  name: string
  description: string | null
  merge_keys: string[]
  std_fields: string[]
  aggregate: string
  version: number
  mapping_count: number
  created_by: number | null
}

export interface SourceMappingOut extends SourceMappingIn {
  id: number
}

export interface TemplateDetail extends TemplateOut {
  mappings: SourceMappingOut[]
}

export interface MappingDraft {
  mapping: SourceMappingIn
  available_sheets: string[]
  effective_headers: string[]
  low_confidence: { sheet: string; confidence: number; notes: string }[]
  warnings: string[]
}

export interface MergeResult {
  columns: string[]
  rows: Record<string, any>[]
  total_rows: number
  recognize_log: { sheet: string; file: string; mapping: string; score: number }[]
  anomalies: { type: string; key: any; detail: string; file?: string }[]
  stats: { files: number; records: number; persons: number; anomalies: number }
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

  aiDraft: (files: File[], businessContext: string): Promise<AiDraft> => {
    const fd = new FormData()
    files.forEach((f) => fd.append('files', f))
    fd.append('business_context', businessContext)
    return api.post('/table-tools/ai-draft', fd, { timeout: 300000 }).then((r) => r.data)
  },
}
