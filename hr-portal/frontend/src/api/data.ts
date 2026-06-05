import { api } from './client'

export interface DataPage<T = Record<string, any>> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface ColumnInfo {
  code: string
  label: string
  data_type: string
  is_pk_part: boolean
  is_sensitive: boolean
  is_visible: boolean
  display_order: number
  auto_discovered: boolean
  enum_options: string[] | null
  agg_role: string
  is_computed: boolean
}

export const dataApi = {
  query: (
    table: string,
    params: {
      page?: number
      page_size?: number
      period_ym?: string
      keyword?: string
      filters?: Record<string, string>
    } = {}
  ) => {
    const p: Record<string, any> = { ...params }
    if (params.filters) p.filters = JSON.stringify(params.filters)
    return api.get<DataPage>(`/data/${table}`, { params: p }).then((r) => r.data)
  },

  columns: (table: string) =>
    api.get<ColumnInfo[]>(`/data/${table}/columns`).then((r) => r.data),

  distinct: (table: string, column: string, labelExtra?: string, limit = 500) =>
    api
      .get<{ value: string; extra: string | null }[]>(`/data/${table}/distinct`, {
        params: { column, label_extra: labelExtra, limit },
      })
      .then((r) => r.data),

  updateRow: (table: string, rowId: number, values: Record<string, any>) =>
    api.patch<{ ok: boolean }>(`/data/${table}/${rowId}`, { values }).then((r) => r.data),

  createRow: (table: string, values: Record<string, any>) =>
    api.post<{ ok: boolean; id: number }>(`/data/${table}`, { values }).then((r) => r.data),

  bulkUpdate: (table: string, rowIds: number[], values: Record<string, any>) =>
    api
      .patch<{ ok: boolean; updated: number }>(`/data/${table}/bulk`, {
        row_ids: rowIds,
        values,
      })
      .then((r) => r.data),
}

export interface TreeNode {
  id: number
  code: string
  name: string
  parent_id: number | null
  level: number
  is_leaf: boolean
  is_active: boolean
  children: TreeNode[]
}

export const treesApi = {
  costCenter: (include_inactive = false) =>
    api
      .get<TreeNode[]>('/trees/cost-center', { params: { include_inactive } })
      .then((r) => r.data),
  org: (include_inactive = false) =>
    api.get<TreeNode[]>('/trees/org', { params: { include_inactive } }).then((r) => r.data),
}

export interface DistinctValue {
  value: string
  active_count: number
  total_count: number
}

export interface PersonItem {
  value: string
  label: string
  department: string | null
  active: boolean
}

export const distinctApi = {
  employmentTypes: (include_inactive = false) =>
    api
      .get<DistinctValue[]>('/trees/employment-type', { params: { include_inactive } })
      .then((r) => r.data),
  employmentEntities: (include_inactive = false) =>
    api
      .get<DistinctValue[]>('/trees/employment-entity', { params: { include_inactive } })
      .then((r) => r.data),
  persons: (params: { include_inactive?: boolean; keyword?: string; limit?: number } = {}) =>
    api.get<PersonItem[]>('/trees/persons', { params }).then((r) => r.data),
}
