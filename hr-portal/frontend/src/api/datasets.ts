import { api } from './client'
import type { ScopeStrategy } from '@/constants/scopeStrategy'

export interface DatasetTableItem {
  id?: number
  table_name: string
  alias: string
  table_label?: string | null
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

export interface AclRoleOption {
  id: number
  name: string
}

export interface AclUserOption {
  id: number
  login_name: string
  display_name: string
}

export interface AclOptions {
  roles: AclRoleOption[]
  users: AclUserOption[]
}

export interface DatasetItem {
  id: number
  name: string
  description: string | null
  is_active: boolean
  warehouse_layer?: string | null
  scope_strategy: ScopeStrategy | null
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
  scope_strategy?: ScopeStrategy | null
  tables: DatasetTableItem[]
  relations: DatasetRelationItem[]
  acl: DatasetAclItem[]
}

export interface DatasetCalculatedField {
  id: number
  dataset_id: number
  code: string
  label: string
  description: string | null
  formula: string
  formula_display: string | null
  data_type: string
  agg_role: 'dimension' | 'measure'
  depends_on: string[]
  used_functions: string[]
  is_sensitive: boolean
  is_active: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface DatasetCalculatedFieldPayload {
  code?: string | null
  label: string
  description?: string | null
  formula: string
  formula_display?: string | null
  data_type: string
  agg_role: 'dimension' | 'measure'
  is_sensitive?: boolean
  is_active?: boolean
}

export const datasetsApi = {
  list: () => api.get<DatasetItem[]>('/datasets').then((r) => r.data),

  aclOptions: () =>
    api.get<AclOptions>('/datasets/_acl-options').then((r) => r.data),

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

  ensureSingleTableDataset: (tableName: string) =>
    api.post<DatasetItem>('/datasets/_single-table', { table_name: tableName }).then((r) => r.data),

  calculatedFields: (id: number) =>
    api.get<DatasetCalculatedField[]>(`/datasets/${id}/calculated-fields`).then((r) => r.data),

  createCalculatedField: (id: number, body: DatasetCalculatedFieldPayload) =>
    api.post<DatasetCalculatedField>(`/datasets/${id}/calculated-fields`, body).then((r) => r.data),

  updateCalculatedField: (datasetId: number, fieldId: number, body: DatasetCalculatedFieldPayload) =>
    api.put<DatasetCalculatedField>(`/datasets/${datasetId}/calculated-fields/${fieldId}`, body).then((r) => r.data),

  removeCalculatedField: (datasetId: number, fieldId: number) =>
    api.delete<{ ok: boolean }>(`/datasets/${datasetId}/calculated-fields/${fieldId}`).then((r) => r.data),

  // P4-03: 数据集输出字段配置
  outputFields: (id: number) =>
    api.get<DatasetOutputField[]>(`/datasets/${id}/output-fields`).then((r) => r.data),

  updateOutputField: (datasetId: number, fieldId: number, body: DatasetOutputFieldUpdate) =>
    api.put<DatasetOutputField>(`/datasets/${datasetId}/output-fields/${fieldId}`, body).then((r) => r.data),
}

export interface DatasetOutputField {
  id: number
  dataset_id: number
  source_alias: string
  source_column: string
  output_code: string
  output_label: string
  data_type: string
  agg_role: 'dimension' | 'measure'
  is_sensitive: boolean
  is_visible: boolean
  display_order: number
  description: string | null
}

export interface DatasetOutputFieldUpdate {
  output_label?: string
  agg_role?: string
  description?: string
  is_visible?: boolean
}
