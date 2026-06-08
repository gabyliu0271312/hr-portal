import { api } from './client'

export interface FilterCond {
  column: string
  op: string
  value: any
  visible?: boolean
  locked?: boolean
  __index?: number
}

export interface FilterLogic {
  mode?: 'and' | 'custom'
  expression?: string
}

export interface SortCond {
  column: string
  order: 'asc' | 'desc'
}

export interface ValueRule {
  target: string
  factor: string
}

export type AggregationFunc = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct'
export type SplitMode = 'default' | 'none' | 'custom'
export type ReshapeConflictStrategy = AggregationFunc | 'first' | 'last' | 'join' | 'keep_all'

export interface ColumnSetting {
  display_name?: string
  hidden?: boolean
  aggregation?: AggregationFunc
  split_mode?: SplitMode
  split_factor?: string
}

export interface DefaultSplitRule {
  enabled: boolean
  factor?: string
}

export interface TransposeRule {
  source_col: string
  dim_updates: Record<string, string>
  target_cols: string[]
}

export interface ColumnToRowConfig {
  enabled: boolean
  source_cols: string[]
  group_by?: string[]
  item_label?: string
  value_label?: string
  conflict_strategy?: ReshapeConflictStrategy
}

export interface RowToColumnConfig {
  enabled: boolean
  group_by: string[]
  pivot_col: string
  value_col: string
  pivot_values?: { value: string; label?: string }[]
  fill_value?: string
  conflict_strategy?: Exclude<ReshapeConflictStrategy, 'keep_all'>
}

export interface TransposeConfig {
  enabled: boolean
  drop_zero_measures: boolean
  rules: TransposeRule[]
  column_to_row?: ColumnToRowConfig
  row_to_column?: RowToColumnConfig
}

export interface ReportConfig {
  columns: string[]
  filters: FilterCond[]
  sorts: SortCond[]
  value_rules?: ValueRule[]
  column_settings?: Record<string, ColumnSetting>
  default_split_rule?: DefaultSplitRule
  aggregate?: boolean
  default_aggregation?: AggregationFunc
  aggregations?: Record<string, string>
  transpose?: TransposeConfig
  rounding_corrections?: { group_by: string | string[]; target_cols?: string[] }[]
  filter_logic?: FilterLogic | null
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

  run: (id: number, page = 1, page_size = 50, filters: FilterCond[] = []) =>
    api
      .post<RunResult>(`/reports/${id}/run`, { filters }, { params: { page, page_size } })
      .then((r) => r.data),

  exportCsvUrl: (id: number, filters: FilterCond[] = []) => {
    const qs = filters.length ? `?runtime_filters=${encodeURIComponent(JSON.stringify(filters))}` : ''
    return `/api/v1/reports/${id}/export.csv${qs}`
  },
  exportXlsxUrl: (id: number, filters: FilterCond[] = []) => {
    const qs = filters.length ? `?runtime_filters=${encodeURIComponent(JSON.stringify(filters))}` : ''
    return `/api/v1/reports/${id}/export.xlsx${qs}`
  },
}
