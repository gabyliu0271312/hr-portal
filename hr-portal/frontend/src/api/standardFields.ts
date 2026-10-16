import { api } from './client'

export type StandardFieldStatus = 'draft' | 'active' | 'deprecated' | 'archived'

export interface StandardFieldVersion {
  id: number
  standard_field_id: number
  version: number
  revision: number
  field_name: string
  business_definition: string
  data_type: string
  grain_level: string | null
  permission_domain: string
  is_permission_anchor: boolean
  owner_user_id: number
  category_ids: number[]
  status: StandardFieldStatus
  created_by: number
  approved_by: number | null
  approved_at: string | null
  approval_reason: string | null
  status_reason: string | null
  status_changed_by: number | null
  status_changed_at: string | null
  created_at: string
  updated_at: string
}

export interface StandardFieldSummary {
  id: number
  field_code: string
  current_active_version_id: number | null
  latest_version: StandardFieldVersion
}

export interface StandardFieldDetail extends StandardFieldSummary {
  versions: StandardFieldVersion[]
  bindings: Array<{
    id: number
    standard_field_version_id: number | null
    table_column_id: number | null
    dataset_output_field_id: number | null
    status: 'unmapped' | 'suggested' | 'confirmed' | 'invalid'
    binding_version: number
  }>
}

export interface StandardFieldListResponse {
  items: StandardFieldSummary[]
  total: number
}

export interface StandardFieldDefinitionPayload {
  field_code?: string
  field_name: string
  business_definition: string
  data_type: string
  grain_level?: string | null
  permission_domain: string
  is_permission_anchor: boolean
  owner_user_id: number
  value_domain?: Record<string, unknown> | null
  category_ids: number[]
  expected_version?: number
  expected_revision?: number
}

export const standardFieldsApi = {
  list(params: { keyword?: string; status?: StandardFieldStatus; offset?: number; limit?: number } = {}) {
    return api.get<StandardFieldListResponse>('/warehouse/standard-fields', { params }).then(r => r.data)
  },
  get(id: number) {
    return api.get<StandardFieldDetail>(`/warehouse/standard-fields/${id}`).then(r => r.data)
  },
  create(payload: StandardFieldDefinitionPayload) {
    return api.post<StandardFieldDetail>('/warehouse/standard-fields', payload).then(r => r.data)
  },
  createVersion(fieldId: number, payload: StandardFieldDefinitionPayload) {
    return api.post<StandardFieldVersion>(`/warehouse/standard-fields/${fieldId}/versions`, payload).then(r => r.data)
  },
  updateVersion(fieldId: number, versionId: number, payload: StandardFieldDefinitionPayload) {
    return api.put<StandardFieldVersion>(`/warehouse/standard-fields/${fieldId}/versions/${versionId}`, payload).then(r => r.data)
  },
  approve(fieldId: number, versionId: number, expected_revision: number, reason: string) {
    return api.post<StandardFieldVersion>(`/warehouse/standard-fields/${fieldId}/versions/${versionId}/approve`, { expected_revision, reason }).then(r => r.data)
  },
  deprecate(fieldId: number, versionId: number, expected_revision: number, reason: string) {
    return api.post<StandardFieldVersion>(`/warehouse/standard-fields/${fieldId}/versions/${versionId}/deprecate`, { expected_revision, reason }).then(r => r.data)
  },
  archive(fieldId: number, versionId: number, expected_revision: number, reason: string) {
    return api.post<StandardFieldVersion>(`/warehouse/standard-fields/${fieldId}/versions/${versionId}/archive`, { expected_revision, reason }).then(r => r.data)
  },
  remove(fieldId: number, expected_version: number, expected_revision: number) {
    return api.delete(`/warehouse/standard-fields/${fieldId}`, { params: { expected_version, expected_revision } })
  },
}
