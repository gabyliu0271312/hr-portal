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

export interface DisplayConfig {
  template: 'auto' | 'roster' | 'field' | 'amount'
  title?: string | null
  subtitle?: string | null
  columns: string[]
  highlight_columns: string[]
  hidden_columns: string[]
  primary_metric?: string | null
  show_context: boolean
  show_explanation: boolean
  sort_by?: string | null
  sort_order: 'asc' | 'desc'
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
  display?: DisplayConfig | null
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
  display?: DisplayConfig | null
}

export interface SkillInvokeResponse {
  skill_id: number
  result: CompareResult
}

export interface SkillGenerateResponse {
  params: CompareSpec
  summary: string
}

// ──────────────────────────────────────────────
// Phase 2: Task (对比任务) + Run (执行记录)
// ──────────────────────────────────────────────

export interface TaskCreate {
  name: string
  skill_id?: number | null
  description?: string | null
  enabled?: boolean
  cron_expression?: string | null
}

export interface TaskUpdate {
  name?: string | null
  description?: string | null
  enabled?: boolean | null
  cron_expression?: string | null
}

export interface TaskOut {
  id: number
  skill_id: number | null
  name: string
  description: string | null
  compare_type: string
  table_a: string
  table_b: string
  join_keys: string[]
  enabled: boolean
  cron_expression: string | null
  scheduled_job_id: number | null
  last_run_at: string | null
  last_status: string | null
  last_diff_count: number
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface RunOut {
  id: number
  task_id: number
  trigger_type: string
  status: string
  diff_count: number
  summary: Record<string, any> | null
  duration_ms: number | null
  error_message: string | null
  triggered_by: number | null
  started_at: string
  finished_at: string | null
}

export interface RunDetail extends RunOut {
  detail: Record<string, any> | null
  execution_sql: string | null
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

  generateSkill: (data: { instruction: string; name?: string | null }) =>
    api.post<SkillGenerateResponse>('/data-compare/skills/generate', data).then(r => r.data),

  updateSkill: (id: number, data: SkillUpdate) =>
    api.patch<SkillOut>(`/data-compare/skills/${id}`, data).then(r => r.data),

  deleteSkill: (id: number) =>
    api.delete(`/data-compare/skills/${id}`).then(r => r.data),

  // 执行
  invokeSkill: (id: number) =>
    api.post<SkillInvokeResponse>(`/data-compare/skills/${id}/invoke`).then(r => r.data),

  invokeAdhoc: (spec: CompareSpec) =>
    api.post<CompareResult>('/data-compare/invoke', spec).then(r => r.data),

  // Phase 2: 任务 CRUD
  listTasks: (params?: { enabled?: boolean; limit?: number; offset?: number }) =>
    api.get<{ items: TaskOut[]; total: number }>('/data-compare/tasks', { params }).then(r => r.data),

  getTask: (id: number) =>
    api.get<TaskOut>(`/data-compare/tasks/${id}`).then(r => r.data),

  createTask: (data: TaskCreate) =>
    api.post<TaskOut>('/data-compare/tasks', data).then(r => r.data),

  updateTask: (id: number, data: TaskUpdate) =>
    api.patch<TaskOut>(`/data-compare/tasks/${id}`, data).then(r => r.data),

  deleteTask: (id: number) =>
    api.delete(`/data-compare/tasks/${id}`).then(r => r.data),

  // Phase 2: 任务执行
  runTask: (id: number) =>
    api.post<RunOut>(`/data-compare/tasks/${id}/run`).then(r => r.data),

  // Phase 2: 执行记录
  listRuns: (taskId: number, params?: { limit?: number; offset?: number }) =>
    api.get<{ items: RunOut[]; total: number }>(`/data-compare/tasks/${taskId}/runs`, { params }).then(r => r.data),

  getRun: (runId: number) =>
    api.get<RunDetail>(`/data-compare/runs/${runId}`).then(r => r.data),
}
