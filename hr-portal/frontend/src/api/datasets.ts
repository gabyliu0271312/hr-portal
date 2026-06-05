import { api } from './client'

export interface DatasetTableItem {
  id?: number
  table_name: string
  alias: string
}

export interface JoinKey {
  left: string
  right: string
}

export interface DatasetRelationItem {
  id?: number
  left_alias: string
  right_alias: string
  join_type: 'inner' | 'left' | 'right' | 'full'
  cardinality: '1:1' | '1:N' | 'N:1'
  keys: JoinKey[]
}

export interface DatasetAclItem {
  id?: number
  role_id: number | null
  user_id: number | null
}

export interface DatasetItem {
  id: number
  name: string
  description: string | null
  is_active: boolean
  created_by: number | null
  tables: DatasetTableItem[]
  relations: DatasetRelationItem[]
  acl: DatasetAclItem[]
  referenced_by_reports: number
  created_at: string
  updated_at: string
}

export interface DatasetPayload {
  name: string
  description?: string | null
  is_active?: boolean
  tables: DatasetTableItem[]
  relations: DatasetRelationItem[]
  acl: DatasetAclItem[]
}

export const datasetsApi = {
  list: () => api.get<DatasetItem[]>('/datasets').then((r) => r.data),

  get: (id: number) => api.get<DatasetItem>(`/datasets/${id}`).then((r) => r.data),

  create: (body: DatasetPayload) =>
    api.post<DatasetItem>('/datasets', body).then((r) => r.data),

  update: (id: number, body: DatasetPayload) =>
    api.put<DatasetItem>(`/datasets/${id}`, body).then((r) => r.data),

  remove: (id: number) =>
    api.delete<{ ok: boolean }>(`/datasets/${id}`).then((r) => r.data),

  integrity: (id: number) =>
    api.get<{ ok: boolean; issues: string[] }>(`/datasets/${id}/integrity`).then((r) => r.data),

  visibleTables: () =>
    api.get<{ table_name: string; label: string }[]>('/datasets/_visible-tables').then((r) => r.data),
}
