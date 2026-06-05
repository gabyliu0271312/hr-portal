import { api } from './client'

export interface FilterCond {
  column: string
  op: string
  value: any
}

export interface SortCond {
  column: string
  order: 'asc' | 'desc'
}

export interface ValueRule {
  target: string
  factor: string
}

export interface TransposeRule {
  source_col: string
  dim_updates: Record<string, string>
  target_cols: string[]
}

export interface TransposeConfig {
  enabled: boolean
  drop_zero_measures: boolean
  rules: TransposeRule[]
}

export interface ReportConfig {
  columns: string[]
  filters: FilterCond[]
  sorts: SortCond[]
  value_rules?: ValueRule[]
  aggregate?: boolean
  aggregations?: Record<string, string>
  transpose?: TransposeConfig
  rounding_corrections?: { group_by: string; target_cols: string[] }[]
}

export interface ReportItem {
  id: number
  name: string
  description: string | null
  table_name: string
  table_label: string | null
  dataset_id: number | null
  dataset_name: string | null
  config: ReportConfig
  owner_id: number | null
  owner_name: string | null
  is_published: boolean
  last_run_at: string | null
  run_count: number
  created_at: string
  updated_at: string
}

export interface ReportPayload {
  name: string
  description?: string | null
  table_name?: string
  dataset_id?: number | null
  config: ReportConfig
  is_published: boolean
}

export interface RunResult {
  columns: { code: string; label: string; data_type: string; is_sensitive: boolean }[]
  items: Record<string, any>[]
  total: number
  page: number
  page_size: number
}

export const reportsApi = {
  list: (params: { table_name?: string; keyword?: string } = {}) =>
    api.get<ReportItem[]>('/reports', { params }).then((r) => r.data),

  get: (id: number) => api.get<ReportItem>(`/reports/${id}`).then((r) => r.data),

  create: (body: ReportPayload) =>
    api.post<ReportItem>('/reports', body).then((r) => r.data),

  update: (id: number, body: ReportPayload) =>
    api.put<ReportItem>(`/reports/${id}`, body).then((r) => r.data),

  remove: (id: number) =>
    api.delete<{ ok: boolean }>(`/reports/${id}`).then((r) => r.data),

  run: (id: number, page = 1, page_size = 50) =>
    api
      .post<RunResult>(`/reports/${id}/run`, null, { params: { page, page_size } })
      .then((r) => r.data),

  exportCsvUrl: (id: number) => `/api/v1/reports/${id}/export.csv`,
  exportXlsxUrl: (id: number) => `/api/v1/reports/${id}/export.xlsx`,
}
