import { api } from './client'

export type StandardFieldStatus = 'draft' | 'active' | 'deprecated' | 'archived'

export interface StandardFieldEnumValue {
  code: string
  name: string
  enabled: boolean
  sort_order: number
  [key: string]: unknown
}

export type StandardFieldValueDomain = Record<string, unknown> & { items?: StandardFieldEnumValue[] }

export interface StandardFieldBindingCandidateParams {
  keyword?: string
  table_name?: string
  dataset_id?: number
}

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
  value_domain: StandardFieldValueDomain | null
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

export type StandardFieldBindingStatus = 'unmapped' | 'suggested' | 'confirmed' | 'invalid'

export interface StandardFieldBindingRef {
  id: number
  standard_field_version_id: number | null
  table_column_id: number | null
  dataset_output_field_id: number | null
  status: StandardFieldBindingStatus
  binding_version: number
}

export interface StandardFieldDetail extends StandardFieldSummary {
  versions: StandardFieldVersion[]
  bindings: StandardFieldBindingRef[]
}

export interface StandardFieldBindingCandidate {
  target_kind: 'table_column' | 'dataset_output_field'
  target_id: number
  table_name: string | null
  dataset_id: number | null
  dataset_name: string | null
  alias: string | null
  column_code: string
  display_name: string
  source_field_id: string
  data_type: string
  is_sensitive: boolean
  existing_binding_id: number | null
  existing_binding_status: StandardFieldBindingStatus | null
}

export interface StandardFieldBinding extends StandardFieldBindingRef {
  standard_field_id: number
  standard_field_version_status: StandardFieldStatus | null
  observed_source_field_id: string | null
  observed_data_type: string | null
  revision: number
  confirmed_by: number | null
  confirmed_at: string | null
}

export interface StandardFieldBindingCreatePayload {
  target_kind: StandardFieldBindingCandidate['target_kind']
  target_id: number
  standard_field_version_id: number
  dataset_id?: number
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
  permission_domain?: string
  is_permission_anchor?: boolean
  owner_user_id?: number
  value_domain?: StandardFieldValueDomain | null
  category_ids?: number[]
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
  updateDisplayName(fieldId: number, payload: { display_name: string; expected_version: number; reason: string }) {
    return api.patch<StandardFieldDetail>(`/warehouse/standard-fields/${fieldId}/display-name`, payload).then(r => r.data)
  },
  bindingCandidates(fieldId: number, params: StandardFieldBindingCandidateParams = {}) {
    if (!params.dataset_id && !params.table_name?.trim()) return Promise.resolve<StandardFieldBindingCandidate[]>([])
    return api.get<StandardFieldBindingCandidate[]>(`/warehouse/standard-fields/${fieldId}/binding-candidates`, { params }).then(r => r.data)
  },
  createBinding(fieldId: number, payload: StandardFieldBindingCreatePayload) {
    return api.post<StandardFieldBinding>(`/warehouse/standard-fields/${fieldId}/bindings`, payload).then(r => r.data)
  },
  confirmBinding(fieldId: number, bindingId: number, payload: { expected_revision: number; reason: string }) {
    return api.post<StandardFieldBinding>(`/warehouse/standard-fields/${fieldId}/bindings/${bindingId}/confirm`, payload).then(r => r.data)
  },
  invalidateBinding(fieldId: number, bindingId: number, payload: { expected_revision: number; reason: string }) {
    return api.post<StandardFieldBinding>(`/warehouse/standard-fields/${fieldId}/bindings/${bindingId}/invalidate`, payload).then(r => r.data)
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
  remove(fieldId: number, expected_version: number, expected_revision: number) {
    return api.delete(`/warehouse/standard-fields/${fieldId}`, { params: { expected_version, expected_revision } })
  },
}
