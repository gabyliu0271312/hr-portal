import { api } from './client'

// ──────────────────────────────────────────────
// CompareSpec types
// ──────────────────────────────────────────────

export interface Prefilter {
  column: string
  op: 'eq' | 'ne' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'between' | 'is_null' | 'is_not_null'
  value?: any
}

export interface DataSource {
  table: string
  period?: string | null
  prefilter: Prefilter[]
}

export interface OutputConfig {
  only_diff: boolean
  group_count_by?: string | null
  max_detail: number
}

export interface RosterSpec {
  direction: 'both' | 'only_in_a' | 'only_in_b'
  display_fields: string[]
}

export interface FieldPair {
  field_a: string
  field_b: string
  mode: 'exact' | 'trim' | 'numeric'
  tolerance?: number | null
}

export interface FieldSpec {
  pairs: FieldPair[]
}

export interface MetricDef {
  agg: 'sum' | 'count' | 'avg'
  field: string
}

export interface ToleranceDef {
  type: 'absolute' | 'percent'
  value: number
}

export interface AmountSpec {
  metric_a: MetricDef
  metric_b: MetricDef
  group_by: string[]
  tolerance: ToleranceDef
}

export interface CompareSpec {
  compare_type: 'roster' | 'field' | 'amount'
  source_a: DataSource
  source_b: DataSource
  join_keys: string[]
  output: OutputConfig
  roster?: RosterSpec | null
  field?: FieldSpec | null
  amount?: AmountSpec | null
}

// ──────────────────────────────────────────────
// Skill (数据对比配置)
// ──────────────────────────────────────────────

export interface SkillCreate {
  name: string
  description?: string | null
  instruction: string
  params: CompareSpec
  status?: 'draft' | 'active'
}

export interface SkillUpdate {
  name?: string | null
  description?: string | null
  instruction?: string | null
  params?: CompareSpec | null
  status?: 'draft' | 'active' | 'archived' | null
}

export interface SkillOut {
  id: number
  name: string
  description: string | null
  skill_type: string
  instruction: string
  params: CompareSpec
  status: string
  source: string
  last_run_at: string | null
  last_run_result: any | null
  run_count: number
  created_by: number | null
  created_at: string
  updated_at: string
}

// ──────────────────────────────────────────────
// Compare Result
// ──────────────────────────────────────────────

export interface CompareResultSummary {
  total_compared: number
  matched_count: number
  diff_count: number
  only_in_a_count: number
  only_in_b_count: number
  total_amount_a: number | null
  total_amount_b: number | null
  amount_diff: number | null
}

export interface CompareResult {
  compare_type: string
  table_a: string
  table_b: string
  period_a: string | null
  period_b: string | null
  status: string
  summary: CompareResultSummary
  details: Record<string, any>[]
  conclusion: string
  duration_ms: number | null
}

export interface SkillInvokeResponse {
  skill_id: number
  result: CompareResult
}

// ──────────────────────────────────────────────
// API
// ──────────────────────────────────────────────

export const dataCompareApi = {
  // 技能 CRUD
  listSkills: (params?: { skill_type?: string; status?: string; limit?: number; offset?: number }) =>
    api.get<{ items: SkillOut[]; total: number }>('/data-compare/skills', { params }).then(r => r.data),

  getSkill: (id: number) =>
    api.get<SkillOut>(`/data-compare/skills/${id}`).then(r => r.data),

  createSkill: (data: SkillCreate) =>
    api.post<SkillOut>('/data-compare/skills', data).then(r => r.data),

  updateSkill: (id: number, data: SkillUpdate) =>
    api.patch<SkillOut>(`/data-compare/skills/${id}`, data).then(r => r.data),

  deleteSkill: (id: number) =>
    api.delete(`/data-compare/skills/${id}`).then(r => r.data),

  // 执行
  invokeSkill: (id: number) =>
    api.post<SkillInvokeResponse>(`/data-compare/skills/${id}/invoke`).then(r => r.data),

  invokeAdhoc: (spec: CompareSpec) =>
    api.post<CompareResult>('/data-compare/invoke', spec).then(r => r.data),
}
