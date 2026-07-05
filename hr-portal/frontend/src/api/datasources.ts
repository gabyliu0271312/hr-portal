import { api } from './client'

export interface DataSourceListItem {
  id: number
  table_name: string
  table_label: string
  source_type: string
  schedule: string
  settings: Record<string, any>
  has_secret: Record<string, boolean>
  is_active: boolean
  last_sync_at: string | null
  last_status: string
  last_rows: number | null
  last_message: string | null
}

export interface DataSourceUpdatePayload {
  source_type: string
  schedule: string
  settings: Record<string, any>
  secrets: Record<string, string>
  is_active: boolean
}

export interface TestResult {
  ok: boolean
  message: string
  token_preview?: string | null
}

export interface SyncResult {
  ok: boolean
  rows: number
  message: string
  started_at: string
  finished_at: string | null
}

export interface SyncRunItem {
  id: number
  started_at: string
  finished_at: string | null
  status: string
  rows: number | null
  message: string | null
  triggered_by: string
}

export const datasourcesApi = {
  list: () => api.get<DataSourceListItem[]>('/datasources').then((r) => r.data),
  get: (id: number) => api.get<DataSourceListItem>(`/datasources/${id}`).then((r) => r.data),
  create: (body: { table_name: string; table_label?: string; source_type?: string; schedule?: string; is_active?: boolean }) =>
    api.post<DataSourceListItem>('/datasources', body).then((r) => r.data),
  update: (id: number, body: DataSourceUpdatePayload) =>
    api.put<DataSourceListItem>(`/datasources/${id}`, body).then((r) => r.data),
  test: (id: number, body?: DataSourceUpdatePayload) =>
    api.post<TestResult>(`/datasources/${id}/test`, body ?? null).then((r) => r.data),
  sync: (id: number) =>
    api
      .post<SyncResult>(`/datasources/${id}/sync`, null, { timeout: 300_000 })
      .then((r) => r.data),
  runs: (id: number, limit = 20) =>
    api.get<SyncRunItem[]>(`/datasources/${id}/runs`, { params: { limit } }).then((r) => r.data),
}
