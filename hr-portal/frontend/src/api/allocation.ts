import { api } from './client'
import type { AggregationFunc, ColumnSetting, DefaultSplitRule, FilterLogic } from './reports'

export interface AllocationSchemeConfig {
  columns: string[]
  filters: any[]
  filter_logic?: FilterLogic | null
  sorts: any[]
  value_rules?: any[]
  column_settings?: Record<string, ColumnSetting>
  default_split_rule?: DefaultSplitRule
  aggregate?: boolean
  default_aggregation?: AggregationFunc
  aggregations?: Record<string, string>
  transpose?: any
  rounding_corrections?: any[]
}

export interface AllocationSchemeIn {
  name: string
  description?: string | null
  dataset_id: number
  result_table: string
  config: AllocationSchemeConfig
  is_active?: boolean
}

export interface AllocationSchemeOut {
  id: number
  name: string
  description: string | null
  table_name: string
  dataset_id: number
  dataset_name: string | null
  result_table: string
  result_table_label: string
  config: AllocationSchemeConfig
  is_active: boolean
  created_by: number | null
  created_at: string
  updated_at: string
  last_run: {
    period_ym: string
    status: string
    rows_written: number
    started_at: string
  } | null
}

export interface AllocationRunOut {
  id: number
  scheme_id: number
  period_ym: string
  status: string
  rows_written: number
  error_message: string | null
  triggered_by: number | null
  started_at: string
  finished_at: string | null
  warnings?: string[]
}

export interface ResultTableItem {
  table_name: string
  label: string
}

export const allocationApi = {
  listSchemes: () =>
    api.get<AllocationSchemeOut[]>('/allocation/schemes').then((r) => r.data),

  getScheme: (id: number) =>
    api.get<AllocationSchemeOut>(`/allocation/schemes/${id}`).then((r) => r.data),

  createScheme: (body: AllocationSchemeIn) =>
    api.post<AllocationSchemeOut>('/allocation/schemes', body).then((r) => r.data),

  updateScheme: (id: number, body: AllocationSchemeIn) =>
    api.put<AllocationSchemeOut>(`/allocation/schemes/${id}`, body).then((r) => r.data),

  deleteScheme: (id: number) =>
    api.delete<{ ok: boolean }>(`/allocation/schemes/${id}`).then((r) => r.data),

  runScheme: (id: number, extra_filters: any[]) =>
    api.post<AllocationRunOut>(`/allocation/schemes/${id}/run`, { extra_filters }).then((r) => r.data),

  listRuns: (id: number) =>
    api.get<AllocationRunOut[]>(`/allocation/schemes/${id}/runs`).then((r) => r.data),

  listResultTables: () =>
    api.get<ResultTableItem[]>('/allocation/result-tables').then((r) => r.data),
}
