import { api } from './client'

export interface PerformanceRoleGrant {
  code: string
  scope_type: string
  scope_ref: string
}

export interface PerformanceAccessContext {
  subject_type: 'PORTAL_USER' | 'SYSTEM_ACCOUNT'
  subject_id: number
  display_name: string
  account_type: string | null
  portal_entry_permissions: string[]
  role_grants?: PerformanceRoleGrant[]
  permission_codes: string[]
}

export const performanceApi = {
  async getAccessContext(): Promise<PerformanceAccessContext> {
    const { data } = await api.get<PerformanceAccessContext>('/performance/auth/context')
    return data
  },
}

export interface PerformanceTemplateCreateRequest {
  name: string
  description: string
  language: 'zh-CN'
  english_enabled: boolean
  calculation_enabled: boolean
  selected_rules: string[]
}

export interface PerformanceTemplateCreateResponse {
  template_id: number
  name: string
}
export interface PerformanceTemplateListItem {
  template_id: number
  name: string
  description: string
  status: 'DRAFT'
  created_at: string
}

export const performanceTemplateApi = {
  async list(): Promise<PerformanceTemplateListItem[]> {
    const { data } = await api.get<PerformanceTemplateListItem[]>('/performance/templates')
    return data
  },
  async create(payload: PerformanceTemplateCreateRequest): Promise<PerformanceTemplateCreateResponse> {
    const { data } = await api.post<PerformanceTemplateCreateResponse>('/performance/templates', payload)
    return data
  },
  async getWorkflow(id: number): Promise<PerformanceWorkflowResponse> {
    const { data } = await api.get<PerformanceWorkflowResponse>(`/performance/templates/${id}/workflow`)
    return data
  },
  async updateWorkflow(id: number, payload: { nodes: PerformanceWorkflowNode[] }): Promise<PerformanceWorkflowResponse> {
    const { data } = await api.patch<PerformanceWorkflowResponse>(`/performance/templates/${id}/workflow`, payload)
    return data
  },
}

export interface PerformanceWorkflowNode {
  node_id: string | null
  node_type: string
  name: string
  description: string
  order: number
  executor_types: string[]
  executor_label: string
  evaluation_type: 'SINGLE' | 'MULTI' | null
  include_final_result: boolean
  system: boolean
  allow_invite_other_executors: boolean
  invite_executor_scope: 'ALL' | 'PARTIAL'
  invite_executor_types: string[]
  require_previous_node_completion: boolean
  subject_confirm_required?: boolean
  calibration_reason_enabled?: boolean
  calibration_reason_required?: boolean
  appeal_prompt_content?: string
  appeal_reason_instruction?: string
  executor_config?: PerformanceExecutorConfig | null
}

export type PerformanceExecutorRoleType = 'REAL_LINE_MANAGER' | 'HRBP' | 'DEPARTMENT_HEAD' | 'SPECIFIED_PERSON'
export type PerformanceExecutorLevel = 'DIRECT_MANAGER' | 'LEVEL_1_MANAGER' | 'CURRENT_DEPARTMENT' | 'PARENT_DEPARTMENT' | 'LEVEL_1_DEPARTMENT'
export interface PerformanceExecutorPerson {
  employee_no: string
  display_name: string
}
export type PerformanceExecutorRole =
  | { type: 'REAL_LINE_MANAGER'; levels: Array<'DIRECT_MANAGER' | 'LEVEL_1_MANAGER'> }
  | { type: 'HRBP' }
  | { type: 'DEPARTMENT_HEAD'; levels: Array<'CURRENT_DEPARTMENT' | 'PARENT_DEPARTMENT' | 'LEVEL_1_DEPARTMENT'> }
  | { type: 'SPECIFIED_PERSON'; people: PerformanceExecutorPerson[] }
export interface PerformanceExecutorConfig {
  mode: 'MULTI_ROLE'
  roles: PerformanceExecutorRole[]
}

export interface PerformanceWorkflowResponse {
  template_id: number
  usage_summary: { cycle_count: number; project_count: number }
  editable_scope?: { workflow: boolean; data_write_settings: boolean; reference_and_prompt_content: boolean }
  nodes: PerformanceWorkflowNode[]
}

export type PerformanceCyclePeriodType = 'YEAR' | 'HALF_YEAR' | 'QUARTER' | 'BIMONTH' | 'MONTH' | 'CUSTOM'
export type PerformanceCyclePeriodSubtype = 'H1' | 'H2' | `Q${1 | 2 | 3 | 4}` | `B${1 | 2 | 3 | 4 | 5 | 6}` | `M${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}` | 'CUSTOM'
export type PerformanceCycleLockRule = 'IMMEDIATE' | 'SCHEDULED'
export type PerformanceCycleSyncMode = 'MANUAL' | 'AUTO_DAILY'
export type PerformanceCycleLeaverMode = 'CREATE_TASK' | 'REPORT_ONLY'

export interface PerformanceCycleProjectShell {
  id: number
  project_ref: string
  name: string
  description: string | null
  administrators: string[]
  status: string
  evaluated_count: number
}

export interface PerformanceCyclePerson {
  employee_no: string
  display_name: string
  organization_ref: string | null
  direct_manager_employee_no: string | null
  hrbp_employee_no: string | null
  employment_status: string | null
  departure_date: string | null
  is_manually_maintained: boolean
}

export interface PerformanceCycle {
  id: number
  cycle_ref: string
  name: string
  language: 'zh-CN'
  period_year: number
  period_type: PerformanceCyclePeriodType
  period_subtype: PerformanceCyclePeriodSubtype | null
  start_at: string
  end_at: string
  lock_rule: PerformanceCycleLockRule
  lock_at: string | null
  pre_lock_sync_mode: PerformanceCycleSyncMode
  leaver_enabled: boolean
  leaver_start_date: string | null
  leaver_end_date: string | null
  leaver_participation_mode: PerformanceCycleLeaverMode
  status: 'DRAFT' | 'LOCKED'
  people_count: number
  department_count: number
  project_count: number
  projects: PerformanceCycleProjectShell[]
}

export interface PerformanceCyclePage {
  items: PerformanceCycle[]
  total: number
  page: number
  page_size: number
}

export type PerformanceCyclePayload = Omit<PerformanceCycle, 'id' | 'cycle_ref' | 'status' | 'people_count' | 'department_count' | 'project_count' | 'projects'>

export const performanceCycleApi = {
  async list(keyword?: string, page = 1, pageSize = 20): Promise<PerformanceCyclePage> {
    const { data } = await api.get<PerformanceCyclePage>('/performance/cycles', { params: { ...(keyword ? { keyword } : {}), page, page_size: pageSize } })
    return data
  },
  async get(id: number): Promise<PerformanceCycle> {
    const { data } = await api.get<PerformanceCycle>(`/performance/cycles/${id}`)
    return data
  },
  async create(payload: PerformanceCyclePayload): Promise<PerformanceCycle> {
    const { data } = await api.post<PerformanceCycle>('/performance/cycles', payload)
    return data
  },
  async update(id: number, payload: Partial<PerformanceCyclePayload>): Promise<PerformanceCycle> {
    const { data } = await api.patch<PerformanceCycle>(`/performance/cycles/${id}`, payload)
    return data
  },
  async listPeople(id: number): Promise<PerformanceCyclePerson[]> {
    const { data } = await api.get<PerformanceCyclePerson[]>(`/performance/cycles/${id}/people`)
    return data
  },
  async refreshPeople(id: number, reason: string): Promise<PerformanceCycle> {
    const { data } = await api.patch<PerformanceCycle>(`/performance/cycles/${id}/people`, { reason })
    return data
  },
  async updatePerson(id: number, person: Partial<PerformanceCyclePerson> & Pick<PerformanceCyclePerson, 'employee_no'>, reason: string): Promise<PerformanceCycle> {
    const { data } = await api.patch<PerformanceCycle>(`/performance/cycles/${id}/people/manual`, { reason, people: [person] })
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/performance/cycles/${id}`)
  },
}
