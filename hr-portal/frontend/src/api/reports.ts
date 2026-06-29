import { api } from './client'
import type { ScopeStrategy } from '@/constants/scopeStrategy'

const AI_REPORT_EXPLAIN_TIMEOUT_MS = 130_000
const REPORT_RUN_MAX_PAGE_SIZE = 100

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
  factors: string[]
  /** @deprecated 旧单系数字段,仅用于读取兼容 */
  factor?: string
}

export type AggregationFunc = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct'
export type SplitMode = 'default' | 'none' | 'custom'
export type ReshapeConflictStrategy = AggregationFunc | 'first' | 'last' | 'join' | 'keep_all'

export interface ColumnSetting {
  display_name?: string
  hidden?: boolean
  aggregation?: AggregationFunc
  metric_filters?: FilterCond[]
  metric_filter_logic?: FilterLogic | null
  split_mode?: SplitMode
  split_factors?: string[]
  /** @deprecated 旧单系数字段,仅用于读取兼容 */
  split_factor?: string
}

export interface DefaultSplitRule {
  enabled: boolean
  factors?: string[]
  /** @deprecated 旧单系数字段,仅用于读取兼容 */
  factor?: string
}

/**
 * 从界面可见状态(每列拆分设置 + 默认拆分规则)派生数值拆分规则。
 *
 * 这是报表设计器与成本分摊方案设计器共用的「所见即所得」拆分派生逻辑:
 * value_rules 不再独立持久化回写,只由 column_settings + default_split_rule
 * 重新计算,避免历史脏规则反复复活(界面看不到却删不掉)。
 *
 * @param columnSettings 每列设置(含 split_mode / split_factors)
 * @param defaultSplitRule 默认拆分规则
 * @param measureCodes 参与拆分的指标列 code(物理指标,排除维度/计数指标)
 */
export function deriveValueRules(
  columnSettings: Record<string, ColumnSetting>,
  defaultSplitRule: DefaultSplitRule,
  measureCodes: string[],
): ValueRule[] {
  const factorsOf = (s: ColumnSetting) =>
    (s.split_factors ?? (s.split_factor ? [s.split_factor] : [])).filter(Boolean)
  const byTarget = new Map<string, string[]>()
  const defaultFactors = (defaultSplitRule.factors ?? []).filter(Boolean)
  if (defaultSplitRule.enabled && defaultFactors.length) {
    for (const measure of measureCodes) {
      const setting = columnSettings[measure] || {}
      if (setting.split_mode === 'none') continue
      const customFactors = factorsOf(setting)
      if (setting.split_mode === 'custom' && customFactors.length) {
        byTarget.set(measure, customFactors)
      } else {
        byTarget.set(measure, defaultFactors)
      }
    }
  }
  for (const measure of measureCodes) {
    const setting = columnSettings[measure] || {}
    if (setting.split_mode === 'none') byTarget.delete(measure)
    const customFactors = factorsOf(setting)
    if (setting.split_mode === 'custom' && customFactors.length) byTarget.set(measure, customFactors)
  }
  return [...byTarget.entries()].map(([target, factors]) => ({ target, factors }))
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

export type ListLookupOperator = 'union' | 'intersect' | 'except'
export type ListLookupSourceType = 'field_values' | 'filtered_rows'

export interface ListLookupResolver {
  enabled?: boolean
  match_field?: string
  return_field?: string
}

export interface ListLookupSource {
  id?: string
  name?: string
  type: ListLookupSourceType
  source_field?: string
  return_field?: string
  resolver?: ListLookupResolver
  filters?: FilterCond[]
  filter_logic?: FilterLogic | null
}

export interface ListLookupConfig {
  enabled: boolean
  operator: ListLookupOperator
  sources: ListLookupSource[]
  lookup: {
    target_field: string
  }
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
  list_lookup?: ListLookupConfig
}

export interface ReportAclItem {
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

export interface ReportItem {
  id: number
  name: string
  description: string | null
  table_name: string
  table_label: string | null
  dataset_id: number
  dataset_name: string | null
  config: ReportConfig
  owner_id: number | null
  owner_name: string | null
  is_published: boolean
  scope_strategy: ScopeStrategy | null
  last_run_at: string | null
  run_count: number
  created_at: string
  updated_at: string
  acl: ReportAclItem[]
  can_edit: boolean
  push_target_count?: number
  active_push_target_count?: number
}

export interface ReportPayload {
  name: string
  description?: string | null
  dataset_id: number
  config: ReportConfig
  is_published: boolean
  scope_strategy?: ScopeStrategy | null
  acl: ReportAclItem[]
}

export interface RunResult {
  columns: { code: string; label: string; data_type: string; is_sensitive: boolean }[]
  items: Record<string, any>[]
  total: number
  page: number
  page_size: number
  warnings?: string[]
}

export interface ReportConfigExplainPayload {
  report_id?: number | null
  report_name?: string
  description?: string | null
  columns: string[]
  filters: Record<string, any>[]
  sorts: Record<string, any>[]
  aggregate?: boolean
  aggregations?: Record<string, string>
  column_settings?: Record<string, ColumnSetting>
  question?: string | null
  history?: { role: 'user' | 'assistant'; content: string }[]
}

export interface ReportPushResult {
  target_id: number
  target_name: string
  ok: boolean
  rows: number
  message: string
}

export interface ReportPushColumn {
  code: string
  label: string
  data_type?: string
  is_sensitive?: boolean
}

export interface ReportConfigExplainResult {
  answer?: string | null
  summary: string
  field_count: number
  filter_count: number
  sort_count: number
  aggregation_count: number
  visible_fields: string[]
  warnings: string[]
  context_packet: Record<string, any>
  mode?: string
  trace_id?: string | null
}

export const reportsApi = {
  list: (params: { dataset_id?: number; keyword?: string } = {}) =>
    api.get<ReportItem[]>('/reports', { params }).then((r) => r.data),

  aclOptions: () =>
    api.get<AclOptions>('/reports/_acl-options').then((r) => r.data),

  get: (id: number) => api.get<ReportItem>(`/reports/${id}`).then((r) => r.data),

  create: (body: ReportPayload) =>
    api.post<ReportItem>('/reports', body).then((r) => r.data),

  update: (id: number, body: ReportPayload) =>
    api.put<ReportItem>(`/reports/${id}`, body).then((r) => r.data),

  remove: (id: number) =>
    api.delete<{ ok: boolean }>(`/reports/${id}`).then((r) => r.data),

  push: (id: number) =>
    api.post<ReportPushResult[]>(`/reports/${id}/push`).then((r) => r.data),

  pushColumns: (id: number) =>
    api.get<ReportPushColumn[]>(`/reports/${id}/push-columns`).then((r) => r.data),

  run: (id: number, page = 1, page_size = 50, filters: FilterCond[] = []) => {
    const safePageSize = Math.min(Math.max(Number(page_size) || 50, 1), REPORT_RUN_MAX_PAGE_SIZE)
    return api
      .post<RunResult>(`/reports/${id}/run`, { filters }, { params: { page, page_size: safePageSize } })
      .then((r) => r.data)
  },

  explainConfig: (body: ReportConfigExplainPayload) =>
    api
      .post<ReportConfigExplainResult>('/ai/capabilities/report.explain_config/answer', body, {
        timeout: AI_REPORT_EXPLAIN_TIMEOUT_MS,
      })
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
