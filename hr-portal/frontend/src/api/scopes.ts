import { api } from './client'

export interface ScopeSelection {
  id?: number
  node_id: number
  include_descendants: boolean
}

export type ScopeFilterField = 'employment_type' | 'employment_entity' | 'person'
export type ScopeFilterOp = 'eq' | 'neq'

export interface ScopeFilter {
  id?: number
  field_code: ScopeFilterField
  operator: ScopeFilterOp
  values: string[]
  order_index?: number
}

export interface ScopeTagItem {
  id: number
  name: string
  description: string | null
  dimension: 'cost_center' | 'org'
  org_scope_enabled: boolean
  org_scope_unlimited: boolean
  selections: ScopeSelection[]
  person_scope_enabled: boolean
  filters: ScopeFilter[]
  used_by_users: number
  created_at: string
  updated_at: string
}

export interface ScopePayload {
  name: string
  description?: string | null
  dimension: 'cost_center' | 'org'
  org_scope_enabled: boolean
  org_scope_unlimited: boolean
  selections: Omit<ScopeSelection, 'id'>[]
  person_scope_enabled: boolean
  filters: Omit<ScopeFilter, 'id'>[]
}

export const scopesApi = {
  list: (params: { dimension?: string } = {}) =>
    api.get<ScopeTagItem[]>('/scopes', { params }).then((r) => r.data),

  get: (id: number) => api.get<ScopeTagItem>(`/scopes/${id}`).then((r) => r.data),

  create: (body: ScopePayload) =>
    api.post<ScopeTagItem>('/scopes', body).then((r) => r.data),

  update: (id: number, body: ScopePayload) =>
    api.put<ScopeTagItem>(`/scopes/${id}`, body).then((r) => r.data),

  remove: (id: number) =>
    api.delete<{ ok: boolean }>(`/scopes/${id}`).then((r) => r.data),

  userTags: (user_id: number) =>
    api.get<ScopeTagItem[]>(`/scopes/_user/${user_id}`).then((r) => r.data),

  assignUserTags: (user_id: number, tag_ids: number[]) =>
    api
      .put<{ ok: boolean; count: number }>(`/scopes/_user/${user_id}`, { tag_ids })
      .then((r) => r.data),
}
