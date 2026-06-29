import { api } from './client'

export type PushType = 'external_db' | 'http_push' | 'api_expose' | 'db_expose' | 'feishu_sheet'

export interface PushTargetIn {
  source_table: string
  name: string
  description?: string | null
  push_type: PushType
  settings: Record<string, any>
  secrets: Record<string, string>
  field_mappings: { source: string; target: string }[]
  is_active?: boolean
  schedule?: string
}

export interface PushTargetOut {
  id: number
  source_table: string
  name: string
  description: string | null
  push_type: PushType
  settings: Record<string, any>
  field_mappings: { source: string; target: string }[]
  is_active: boolean
  last_push_at: string | null
  last_status: string
  last_rows: number | null
  last_message: string | null
  created_at: string
  updated_at: string
}

export interface PushRunOut {
  id: number
  status: string
  rows: number | null
  message: string | null
  started_at: string | null
  finished_at: string | null
  triggered_by: string
}

export const pushTargetsApi = {
  list: (source_table?: string) =>
    api.get<PushTargetOut[]>('/push-targets', { params: source_table ? { source_table } : {} })
      .then((r) => r.data),

  get: (id: number) =>
    api.get<PushTargetOut>(`/push-targets/${id}`).then((r) => r.data),

  create: (body: PushTargetIn) =>
    api.post<PushTargetOut>('/push-targets', body).then((r) => r.data),

  update: (id: number, body: PushTargetIn) =>
    api.put<PushTargetOut>(`/push-targets/${id}`, body).then((r) => r.data),

  remove: (id: number) =>
    api.delete<{ ok: boolean }>(`/push-targets/${id}`).then((r) => r.data),

  run: (id: number, period_ym = '') =>
    api.post<{ ok: boolean; rows?: number; message?: string }>(
      `/push-targets/${id}/run`, { period_ym }
    ).then((r) => r.data),

  runs: (id: number) =>
    api.get<PushRunOut[]>(`/push-targets/${id}/runs`).then((r) => r.data),

  reveal: (id: number) =>
    api.get<Record<string, string>>(`/push-targets/${id}/reveal`).then((r) => r.data),
}
