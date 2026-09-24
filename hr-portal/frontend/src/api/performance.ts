import { api } from './client'

export interface PerformanceRoleGrant {
  code: string
  scope_type: string
  scope_ref: string
}

export interface PerformanceWorkbenchProject {
  project_id: number
  project_name: string
  cycle_ref?: string | null
  cycle_name: string
  cycle_start_at: string
  cycle_end_at: string
  project_status: string
  result_published?: boolean
  participation_roles?: string[]
}

export interface PerformanceWorkbenchTimelineNode {
  node_id: string
  node_name: string
  node_type: string
  node_order: number
  executor_label?: string | null
  start_at: string | null
  end_at: string | null
  status: string
}

export interface PerformanceWorkbenchTaskGroup {
  task_id?: number
  node_id: string
  node_type: string
  node_name: string
  pending_count: number
  completed_count: number
  overdue_count: number
  available_at: string | null
  due_at: string | null
  action_url: string
  participation_roles?: string[]
}

export interface PerformanceMemberProfile {
  employee_no: string
  display_name: string
  company_org?: string | null
  department_2?: string | null
  department_3?: string | null
  department_4?: string | null
  department_5?: string | null
  job_family: string | null
  job_category: string | null
  job_sequence: string | null
  position_level: string | null
  hire_date: string | null
  department: string | null
  employee_type: string | null
  employment_status: string | null
  visible_profile_fields?: string[]
}

export interface PerformanceWorkbenchTaskPerson extends PerformanceMemberProfile {
  task_id: number
  aggregate_task_id?: number | null
  status: string
  due_at: string | null
  reminder_target?: string | null
  direct_supervisor?: string | null
  hrbp?: string | null
  completion?: string | null
  visibility_role?: string
  visible_profile_fields?: string[]
}

export interface PerformanceReminderResult {
  accepted_task_ids: number[]
  skipped_task_ids: number[]
  delivery_status: 'recorded'
}

export type PerformanceReviewMemberContext = {
  task_id?: number
  aggregate_task_id?: number | null
  employee_no: string
  display_name?: string
  avatar_url?: string | null
  department?: string | null
  job_family?: string | null
  job_category?: string | null
  job_sequence?: string | null
  position_level?: string | null
  hire_date?: string | null
  employee_type?: string | null
  status?: string
  due_at?: string | null
}

export interface PerformanceReviewNode {
  task_id?: number
  node_id: string
  node_name: string
  node_type: string
  task_kind?: string
  entry_mode?: 'template_task' | 'route' | 'none'
  executor_label: string
  status: 'pending' | 'not_started' | 'overdue' | 'completed'
  start_at: string | null
  end_at: string | null
  action_url: string
  submitted_at?: string | null
  editable?: boolean
  form_schema?: SelfSummarySection[]
  answers?: Record<string, unknown>
}

export interface PerformanceReviewCategory {
  key: string
  label: string
  nodes: PerformanceReviewNode[]
}

export interface PerformanceReviewOverview {
  projects: Array<Pick<PerformanceWorkbenchProject, 'project_id' | 'project_name' | 'cycle_name' | 'cycle_start_at' | 'cycle_end_at'>>
  active_project: Pick<PerformanceWorkbenchProject, 'project_id' | 'project_name' | 'cycle_name' | 'cycle_start_at' | 'cycle_end_at'> | null
  template_name: string
  workflow_node_count?: number
  categories: PerformanceReviewCategory[]
}

export const performanceReviewApi = {
  async overview(projectId?: number, taskId?: number): Promise<PerformanceReviewOverview> {
    const { data } = await api.get<PerformanceReviewOverview>('/performance/review/overview', {
      params: projectId || taskId ? { ...(projectId ? { project_id: projectId } : {}), ...(taskId ? { task_id: taskId } : {}) } : undefined,
    })
    return data
  },
  async selfSummary(taskId: number | string, employeeNo?: string): Promise<SelfSummaryTask> {
    const { data } = await api.get<SelfSummaryTask>(`/performance/tasks/${encodeURIComponent(String(taskId))}/self-summary`, { params: employeeNo ? { employee_no: employeeNo } : undefined })
    return data
  },
  async saveSelfSummaryDraft(taskId: number | string, answers: Record<string, unknown>, version?: number, employeeNo?: string): Promise<SelfSummarySaveResult> {
    const { data } = await api.patch<SelfSummarySaveResult>(`/performance/tasks/${encodeURIComponent(String(taskId))}/self-summary/draft`, { answers, version }, { params: employeeNo ? { employee_no: employeeNo } : undefined })
    return data
  },
  async submitSelfSummary(taskId: number | string, answers: Record<string, unknown>, version?: number, employeeNo?: string): Promise<SelfSummarySaveResult> {
    const { data } = await api.post<SelfSummarySaveResult>(`/performance/tasks/${encodeURIComponent(String(taskId))}/self-summary/submit`, { answers, version }, { params: employeeNo ? { employee_no: employeeNo } : undefined })
    return data
  },
  async templateTask(taskId: number | string, employeeNo?: string): Promise<PerformanceTemplateTask> {
    const { data } = await api.get<PerformanceTemplateTask>(`/performance/tasks/${encodeURIComponent(String(taskId))}/template-task`, { params: employeeNo ? { employee_no: employeeNo } : undefined })
    return data
  },
  async saveTemplateTaskDraft(taskId: number | string, answers: Record<string, unknown>, version?: number, employeeNo?: string): Promise<SelfSummarySaveResult> {
    const { data } = await api.patch<SelfSummarySaveResult>(`/performance/tasks/${encodeURIComponent(String(taskId))}/template-task/draft`, { answers, version }, { params: employeeNo ? { employee_no: employeeNo } : undefined })
    return data
  },
  async submitTemplateTask(taskId: number | string, answers: Record<string, unknown>, version?: number, employeeNo?: string): Promise<SelfSummarySaveResult> {
    const { data } = await api.post<SelfSummarySaveResult>(`/performance/tasks/${encodeURIComponent(String(taskId))}/template-task/submit`, { answers, version }, { params: employeeNo ? { employee_no: employeeNo } : undefined })
    return data
  },
}

export interface PerformanceOtherPermissionPerson {
  employee_no: string
  display_name: string
}

export interface PerformanceOtherPermissionHrbpPermission {
  hrbp: PerformanceOtherPermissionPerson
  scope: string[]
  invisible_people: PerformanceOtherPermissionPerson[]
}

export interface PerformanceOtherPermissionSettings {
  hrbp_invisible_scope_enabled: boolean
  hrbp_invisible_people: PerformanceOtherPermissionPerson[]
  hrbp_permissions: PerformanceOtherPermissionHrbpPermission[]
  people_options: PerformanceOtherPermissionPerson[]
  organization_tree: PerformanceHrbpOrganizationNode[]
  manager_reminder_enabled: boolean
  manager_reminder_node_types: string[]
}

export interface PerformanceOtherPermissionHrbpPermissionPayload {
  hrbp: string
  scope: string[]
  invisible_people: string[]
}

export interface PerformanceOtherPermissionSettingsPayload {
  hrbp_invisible_scope_enabled?: boolean
  hrbp_invisible_people?: string[]
  hrbp_permissions?: PerformanceOtherPermissionHrbpPermissionPayload[]
  manager_reminder_enabled: boolean
  manager_reminder_node_types: string[]
}

export const performanceOtherPermissionSettingsApi = {
  async get(): Promise<PerformanceOtherPermissionSettings> {
    const { data } = await api.get<PerformanceOtherPermissionSettings>('/performance/permission-settings/other')
    return data
  },
  async update(payload: PerformanceOtherPermissionSettingsPayload): Promise<PerformanceOtherPermissionSettings> {
    const { data } = await api.patch<PerformanceOtherPermissionSettings>('/performance/permission-settings/other', payload)
    return data
  },
}

export interface PerformanceAssessmentMethodSettings {
  metric_assessment_enabled: boolean
}

export const performanceAssessmentMethodSettingsApi = {
  async get(): Promise<PerformanceAssessmentMethodSettings> {
    const { data } = await api.get<PerformanceAssessmentMethodSettings>('/performance/system-settings/assessment-method')
    return data
  },
  async update(payload: PerformanceAssessmentMethodSettings): Promise<PerformanceAssessmentMethodSettings> {
    const { data } = await api.patch<PerformanceAssessmentMethodSettings>('/performance/system-settings/assessment-method', payload)
    return data
  },
}

export interface PerformanceNotificationSettings {
  feishu_push_enabled: boolean
  email_enabled: boolean
  calibration_delivery_mode: 'realtime' | 'after_calibration'
  result_change_notification_scope: 'final_score_grade' | 'any_content'
  todo_task_notification_enabled: boolean
  progress_daily_notification_enabled: boolean
  stage_start_notification_enabled: boolean
}

export type PerformanceNotificationRuleKey =
  | 'todo_task_notification_enabled'
  | 'progress_daily_notification_enabled'
  | 'stage_start_notification_enabled'

export type PerformanceNotificationSettingsPayload = Partial<Pick<
  PerformanceNotificationSettings,
  | 'email_enabled'
  | 'calibration_delivery_mode'
  | 'result_change_notification_scope'
  | 'todo_task_notification_enabled'
  | 'progress_daily_notification_enabled'
  | 'stage_start_notification_enabled'
> >

export const performanceNotificationSettingsApi = {
  async get(): Promise<PerformanceNotificationSettings> {
    const { data } = await api.get<PerformanceNotificationSettings>('/performance/system-settings/notifications')
    return data
  },
  async update(payload: PerformanceNotificationSettingsPayload): Promise<PerformanceNotificationSettings> {
    const { data } = await api.patch<PerformanceNotificationSettings>('/performance/system-settings/notifications', payload)
    return data
  },
}

export interface PerformanceRoleListItem {
  id: number
  code: string
  name: string
  description: string | null
  is_system: boolean
  is_active: boolean
  updated_at: string
  function_permission_keys: string[]
}

export interface PerformanceRoleListPage {
  items: PerformanceRoleListItem[]
  total: number
  page: number
  page_size: number
}

export interface PerformanceRoleCreatePayload {
  name: string
  description?: string | null
  function_permission_keys?: string[]
}

export const performanceRoleApi = {
  async list(keyword = '', page = 1, pageSize = 10): Promise<PerformanceRoleListPage> {
    const { data } = await api.get<PerformanceRoleListPage>('/performance/permission-settings/roles', {
      params: { keyword: keyword || undefined, page, page_size: pageSize },
    })
    return data
  },
  async create(payload: PerformanceRoleCreatePayload): Promise<PerformanceRoleListItem> {
    const { data } = await api.post<PerformanceRoleListItem>('/performance/permission-settings/roles', payload)
    return data
  },
}
export interface PerformanceSubjectVisibilityFieldOption {
  key: string
  label: string
}

export interface PerformanceSubjectVisibilityRole {
  role_key: string
  role_name: string
  visible_labels: string[]
  visible_fields: string[]
}

export interface PerformanceSubjectVisibilityPage {
  items: PerformanceSubjectVisibilityRole[]
  total: number
  page: number
  page_size: number
  field_options: PerformanceSubjectVisibilityFieldOption[]
}

export const performanceSubjectVisibilityApi = {
  async list(page = 1, pageSize = 10): Promise<PerformanceSubjectVisibilityPage> {
    const { data } = await api.get<PerformanceSubjectVisibilityPage>('/performance/permission-settings/subject-visibility', { params: { page, page_size: pageSize } })
    return data
  },
  async update(roleKey: string, visibleFields: string[]): Promise<PerformanceSubjectVisibilityRole> {
    const { data } = await api.patch<PerformanceSubjectVisibilityRole>(`/performance/permission-settings/subject-visibility/${encodeURIComponent(roleKey)}`, { visible_fields: visibleFields })
    return data
  },
}

export interface PerformanceWorkbenchSetting {
  announcement_enabled: boolean
}

export interface PerformanceWorkbenchEntry {
  id: number
  title: string
  status: 'active' | 'inactive'
  link: string
  icon: string | null
  visibility: string
  display_order: number
  created_at: string
  updated_at: string
}

export interface PerformanceWorkbenchAnnouncement {
  id: number
  title: string
  status: 'active' | 'inactive'
  link: string
  cycle_label: string
  cycle_ref: string | null
  visibility: string
  visibility_role: string | null
  require_ack: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface PerformanceWorkbenchAnnouncementFeedItem {
  id: number
  title: string
  link: string
  cycle_label: string
  require_ack: boolean
  display_order: number
  updated_at: string
}

export interface PerformanceWorkbenchAnnouncementFeed {
  announcement_enabled: boolean
  items: PerformanceWorkbenchAnnouncementFeedItem[]
}

export interface PerformanceWorkbenchPage<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface PerformanceWorkbenchEntryPayload {
  title: string
  link: string
  icon?: string | null
  visibility?: string
  status?: 'active' | 'inactive'
  display_order?: number
}

export interface PerformanceWorkbenchAnnouncementPayload {
  title: string
  link: string
  cycle_label?: string
  cycle_ref?: string | null
  visibility?: string
  visibility_role?: 'HRBP' | 'REAL_LINE_MANAGER' | null
  require_ack?: boolean
  status?: 'active' | 'inactive'
  display_order?: number
}

export const performanceWorkbenchSettingsApi = {
  async get(): Promise<PerformanceWorkbenchSetting> {
    const { data } = await api.get<PerformanceWorkbenchSetting>('/performance/workbench-settings')
    return data
  },
  async update(payload: PerformanceWorkbenchSetting): Promise<PerformanceWorkbenchSetting> {
    const { data } = await api.patch<PerformanceWorkbenchSetting>('/performance/workbench-settings', payload)
    return data
  },
  async listEntries(keyword = '', status?: 'active' | 'inactive', page = 1, pageSize = 10): Promise<PerformanceWorkbenchPage<PerformanceWorkbenchEntry>> {
    const { data } = await api.get<PerformanceWorkbenchPage<PerformanceWorkbenchEntry>>('/performance/workbench-settings/entries', { params: { keyword: keyword || undefined, status, page, page_size: pageSize } })
    return data
  },
  async createEntry(payload: PerformanceWorkbenchEntryPayload): Promise<PerformanceWorkbenchEntry> {
    const { data } = await api.post<PerformanceWorkbenchEntry>('/performance/workbench-settings/entries', payload)
    return data
  },
  async updateEntry(id: number, payload: Partial<PerformanceWorkbenchEntryPayload>): Promise<PerformanceWorkbenchEntry> {
    const { data } = await api.patch<PerformanceWorkbenchEntry>(`/performance/workbench-settings/entries/${id}`, payload)
    return data
  },
  async updateEntryStatus(id: number, status: 'active' | 'inactive'): Promise<PerformanceWorkbenchEntry> {
    const { data } = await api.post<PerformanceWorkbenchEntry>(`/performance/workbench-settings/entries/${id}/status`, { status })
    return data
  },
  async removeEntry(id: number): Promise<void> {
    await api.delete(`/performance/workbench-settings/entries/${id}`)
  },
  async listAnnouncements(keyword = '', status?: 'active' | 'inactive', page = 1, pageSize = 10): Promise<PerformanceWorkbenchPage<PerformanceWorkbenchAnnouncement>> {
    const { data } = await api.get<PerformanceWorkbenchPage<PerformanceWorkbenchAnnouncement>>('/performance/workbench-settings/announcements', { params: { keyword: keyword || undefined, status, page, page_size: pageSize } })
    return data
  },
  async createAnnouncement(payload: PerformanceWorkbenchAnnouncementPayload): Promise<PerformanceWorkbenchAnnouncement> {
    const { data } = await api.post<PerformanceWorkbenchAnnouncement>('/performance/workbench-settings/announcements', payload)
    return data
  },
  async updateAnnouncement(id: number, payload: Partial<PerformanceWorkbenchAnnouncementPayload>): Promise<PerformanceWorkbenchAnnouncement> {
    const { data } = await api.patch<PerformanceWorkbenchAnnouncement>(`/performance/workbench-settings/announcements/${id}`, payload)
    return data
  },
  async updateAnnouncementStatus(id: number, status: 'active' | 'inactive'): Promise<PerformanceWorkbenchAnnouncement> {
    const { data } = await api.post<PerformanceWorkbenchAnnouncement>(`/performance/workbench-settings/announcements/${id}/status`, { status })
    return data
  },
  async removeAnnouncement(id: number): Promise<void> {
    await api.delete(`/performance/workbench-settings/announcements/${id}`)
  },
}

export interface ProjectManagementCycle {
  cycle_id: number
  cycle_name: string
  cycle_start_at: string
  cycle_end_at: string
}

export interface ProjectManagementProject {
  project_id: number
  project_name: string
  project_ref: string
  status: string
}

export interface ProjectManagementCompletionNode {
  key: string
  title: string
  status: 'active' | 'completed' | 'not_started' | 'overdue' | 'unavailable'
  completed_count: number
  total_count: number
  completion_rate: number | null
  deadline_at: string | null
}

export interface ProjectManagementOverview {
  cycles: ProjectManagementCycle[]
  active_cycle: ProjectManagementCycle | null
  projects: ProjectManagementProject[]
  completion_nodes?: ProjectManagementCompletionNode[]
  hrbp_scope: string[]
  category: { key: string; label: string }
}

export interface ProjectMember extends PerformanceMemberProfile {
  id: number
  avatar_url: string | null
  rating: string | null
  rating_tone: string | null
  completion: string | null
}

export interface ProjectMemberPage {
  items: ProjectMember[]
  total: number
  page: number
  page_size: number
}

export interface ProjectMatrixPerson {
  employee_no: string
  display_name: string
  employment_status: string | null
}

export interface ProjectMatrixRating {
  key: string
  label: string
  color: string | null
}

export interface ProjectMatrixCell {
  count: number
  people: ProjectMatrixPerson[]
}

export interface ProjectMatrixRow {
  level: string
  total: number
  cells: Record<string, ProjectMatrixCell>
}

export interface ProjectMatrix {
  source: string
  dimension: string
  display_modes: Array<'name' | 'count'>
  total: number
  completed_count: number
  pending_count: number
  ratings: ProjectMatrixRating[]
  pending_rows: ProjectMatrixRow[]
  completed_rows: ProjectMatrixRow[]
}

export interface ProjectStatisticsReport {
  source: 'api'
  dimension: 'level' | 'tenure'
  rowLabel: '岗位职级' | '司龄'
  showSummary: true
  totalParticipants: number
  ratings: ProjectMatrixRating[]
  distribution: Record<string, number>
  heatLevels?: Record<string, 1 | 2 | 3>
  departments: Array<{ id: string; name: string; counts: Record<string, number>; heatLevels?: Record<string, 1 | 2 | 3>; children?: never[] }>
}

export const projectManagementApi = {
  async overview(cycleId?: number): Promise<ProjectManagementOverview> {
    const { data } = await api.get<ProjectManagementOverview>('/performance/project-management/overview', {
      params: cycleId ? { cycle_id: cycleId } : undefined,
    })
    return data
  },
  async members(projectId: number | string, keyword?: string, page = 1, pageSize = 50, sortBy?: string, sortOrder?: 'asc' | 'desc'): Promise<ProjectMemberPage> {
    const { data } = await api.get<ProjectMemberPage>(`/performance/projects/${encodeURIComponent(String(projectId))}/members`, {
      params: { ...(keyword ? { keyword } : {}), ...(sortBy && sortOrder ? { sort_by: sortBy, sort_order: sortOrder } : {}), page, page_size: pageSize },
    })
    return data
  },
  async matrix(projectId: number | string): Promise<ProjectMatrix> {
    const { data } = await api.get<ProjectMatrix>(`/performance/projects/${encodeURIComponent(String(projectId))}/matrix`)
    return data
  },
  async remindTasks(projectId: number | string, nodeId: string, taskIds: number[]): Promise<PerformanceReminderResult> {
    const { data } = await api.post<PerformanceReminderResult>(`/performance/projects/${encodeURIComponent(String(projectId))}/reminder-tasks/remind`, { node_id: nodeId, task_ids: taskIds })
    return data
  },
  async levelStatistics(cycleId: number, dimension: 'level' | 'tenure' = 'level'): Promise<ProjectStatisticsReport> {
    const { data } = await api.get<ProjectStatisticsReport>('/performance/project-management/statistics', { params: { cycle_id: cycleId, dimension } })
    return data
  },
}

export type PerformanceTemplateOption = { id: string; label: string; color?: string; placeholder?: string; description?: string; required?: boolean }
export type PerformanceTemplateField = {
  id: string
  type: 'rich_text' | 'rating' | 'tag_with_followup'
  label: string
  required?: boolean
  placeholder?: string
  options?: PerformanceTemplateOption[]
  display_mode?: '标签样式' | '下拉样式'
}
export type PerformanceTemplateSection = { id: string; name: string; description?: string; allow_multiple?: boolean; fields: PerformanceTemplateField[] }
export type PerformanceReferenceTab = {
  key: string
  node_id: string
  node_name: string
  task_id?: number | null
  employee_no: string
  status: 'not_started' | 'pending' | 'overdue' | 'completed'
  submitted_at?: string | null
  form_schema: PerformanceTemplateSection[]
  answers: Record<string, unknown>
  can_remind: boolean
}
export type SelfSummaryOption = PerformanceTemplateOption
export type SelfSummaryField = PerformanceTemplateField
export type SelfSummarySection = PerformanceTemplateSection
export type SelfSummaryProfileField = { key: string; label: string; value: string }
export type SelfSummaryPerson = {
  employee_no: string
  display_name: string
  department?: string | null
  direct_supervisor_name?: string | null
  visibility_role?: string
  profile_fields?: SelfSummaryProfileField[]
}
export type PerformanceTemplateTask = {
  task_id: string | number
  task_kind: string
  entry_mode: 'template_task' | 'route' | 'none'
  node_name: string
  deadline_at?: string | null
  editable: boolean
  submit_allowed: boolean
  submitted_at?: string | null
  version?: number
  person: SelfSummaryPerson
  form_schema: SelfSummarySection[]
  answers: Record<string, unknown>
  reference_tabs?: PerformanceReferenceTab[]
}
export type SelfSummaryTask = PerformanceTemplateTask
export type SelfSummarySaveResult = { answers: Record<string, unknown>; version?: number; submitted_at?: string | null; editable?: boolean; submit_allowed?: boolean }

export const performanceWorkbenchApi = {
  async listProjects(keyword?: string): Promise<PerformanceWorkbenchProject[]> {
    const { data } = await api.get<PerformanceWorkbenchProject[]>('/performance/workbench/projects', {
      params: keyword ? { keyword } : undefined,
    })
    return data
  },
  async announcements(cycleRef?: string | null): Promise<PerformanceWorkbenchAnnouncementFeed> {
    const { data } = await api.get<PerformanceWorkbenchAnnouncementFeed>('/performance/workbench/announcements', {
      params: cycleRef ? { cycle_ref: cycleRef } : undefined,
    })
    return data
  },
  async timeline(projectId: number): Promise<PerformanceWorkbenchTimelineNode[]> {
    const { data } = await api.get<PerformanceWorkbenchTimelineNode[]>(`/performance/workbench/projects/${projectId}/timeline`)
    return data
  },
  async tasks(projectId: number, state: 'pending' | 'completed'): Promise<PerformanceWorkbenchTaskGroup[]> {
    const { data } = await api.get<PerformanceWorkbenchTaskGroup[]>('/performance/workbench/tasks', { params: { project_id: projectId, state } })
    return data
  },
  async taskPeople(projectId: number, nodeId: string, state: 'pending' | 'completed' | 'all', keyword?: string): Promise<PerformanceWorkbenchTaskPerson[]> {
    const { data } = await api.get<PerformanceWorkbenchTaskPerson[]>(`/performance/workbench/tasks/${encodeURIComponent(nodeId)}/people`, { params: { project_id: projectId, state, ...(keyword ? { keyword } : {}) } })
    return data
  },
}

export interface PerformanceAccessContext {
  subject_type: 'PORTAL_USER' | 'SYSTEM_ACCOUNT'
  subject_id: number
  display_name: string
  account_type: string | null
  portal_entry_permissions: string[]
  role_grants?: PerformanceRoleGrant[]
  permission_codes: string[]
  dev_admin_debug?: boolean
}

export const performanceApi = {
  async getAccessContext(): Promise<PerformanceAccessContext> {
    const { data } = await api.get<PerformanceAccessContext>('/performance/auth/context')
    return data
  },
}

export interface PerformanceReviewRuleOption {
  id: number
  name: string
  review_type: '评级' | '评分' | '评分映射等级型'
  status: 'active' | 'inactive'
  created_at: string
  updated_at: string
  remark: string
  creator: string
  config_summary: Record<string, unknown>
  is_used: boolean
  deletable: boolean
}

export interface PerformanceReviewRuleDetail extends PerformanceReviewRuleOption {
  config: Record<string, unknown>
}

export interface PerformanceReviewQuestion {
  id: number
  language: string
  name: string
  description: string
  type: 'regular' | 'okr' | 'bonus' | 'deduction'
  is_sub_question: boolean
  parent_question_id: number | null
  rule_id: number
  display_mode: '标签样式' | '下拉样式'
  remark: string
  created_at: string
  updated_at: string
  rule: PerformanceReviewRuleDetail
}

export interface PerformanceReviewSubQuestionOption {
  id: number | string
  name: string
  rule_id: number
  rule_name: string
  review_type: '评级' | '评分'
  grade_participates_in_calculation: boolean
  score_min: number | null
  score_max: number | null
}

export interface PerformanceReviewQuestionPayload {
  language: 'zh-CN'
  name: string
  description: string
  type: 'regular' | 'okr' | 'bonus' | 'deduction'
  is_sub_question: boolean
  parent_question_id: number | null
  rule_id: number
  display_mode: '标签样式' | '下拉样式'
  remark: string
}

export interface PerformanceReviewRulePayload {
  name: string
  review_type: '评级' | '评分' | '评分映射等级型'
  config: Record<string, unknown>
  remark: string
}

export const performanceReviewRuleApi = {
  async list(): Promise<PerformanceReviewRuleOption[]> {
    const { data } = await api.get<{ items: PerformanceReviewRuleOption[] }>('/performance/review-rules')
    return data.items
  },
  async get(id: number): Promise<PerformanceReviewRuleDetail> {
    const { data } = await api.get<PerformanceReviewRuleDetail>(`/performance/review-rules/${id}`)
    return data
  },
  async create(payload: PerformanceReviewRulePayload): Promise<PerformanceReviewRuleDetail> {
    const { data } = await api.post<PerformanceReviewRuleDetail>('/performance/review-rules', payload)
    return data
  },
  async update(id: number, payload: PerformanceReviewRulePayload): Promise<PerformanceReviewRuleDetail> {
    const { data } = await api.patch<PerformanceReviewRuleDetail>(`/performance/review-rules/${id}`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/performance/review-rules/${id}`)
  },
}

export const performanceReviewQuestionApi = {
  async list(reviewType?: PerformanceReviewRuleOption['review_type']): Promise<PerformanceReviewQuestion[]> {
    const { data } = await api.get<{ items: PerformanceReviewQuestion[] }>('/performance/review-questions', {
      params: reviewType ? { review_type: reviewType } : undefined,
    })
    return data.items
  },
  async listSubQuestionOptions(calculationRule: 'none' | 'condition'): Promise<PerformanceReviewSubQuestionOption[]> {
    const { data } = await api.get<{ items: PerformanceReviewSubQuestionOption[] }>('/performance/review-questions/sub-question-options', {
      params: { calculation_rule: calculationRule },
    })
    return data.items
  },
  async get(id: number): Promise<PerformanceReviewQuestion> {
    const { data } = await api.get<PerformanceReviewQuestion>(`/performance/review-questions/${id}`)
    return data
  },
  async create(payload: PerformanceReviewQuestionPayload): Promise<PerformanceReviewQuestion> {
    const { data } = await api.post<PerformanceReviewQuestion>('/performance/review-questions', payload)
    return data
  },
  async update(id: number, payload: PerformanceReviewQuestionPayload): Promise<PerformanceReviewQuestion> {
    const { data } = await api.patch<PerformanceReviewQuestion>(`/performance/review-questions/${id}`, payload)
    return data
  },
}

export interface PerformanceTagFillQuestionTag {
  id: string
  name: string
  description: string
  prompt: string
}

export interface PerformanceTagFillQuestion {
  id: string
  language: string
  name: string
  description: string
  creator: string
  createdAt: string
  updatedAt: string
  remark: string
  tags: PerformanceTagFillQuestionTag[]
}

export interface PerformanceTagFillQuestionOption {
  id: string
  name: string
  description: string
  tags: PerformanceTagFillQuestionTag[]
}

export interface PerformanceTagFillQuestionPayload {
  language: 'zh-CN'
  name: string
  description: string
  remark: string
  tags: PerformanceTagFillQuestionTag[]
}

interface PerformanceTagFillQuestionWire {
  id: number
  language: string
  name: string
  description: string
  creator: string
  created_at: string
  updated_at: string
  remark: string
  tags: PerformanceTagFillQuestionTag[]
}

function mapTagFillQuestion(item: PerformanceTagFillQuestionWire): PerformanceTagFillQuestion {
  return {
    id: String(item.id),
    language: item.language,
    name: item.name,
    description: item.description,
    creator: item.creator,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    remark: item.remark,
    tags: item.tags,
  }
}

export const performanceTagFillQuestionApi = {
  async list(keyword = '', page = 1, pageSize = 10): Promise<{ items: PerformanceTagFillQuestion[]; total: number }> {
    const { data } = await api.get<{ items: PerformanceTagFillQuestionWire[]; total: number }>('/performance/tagged-fill-in-questions', {
      params: { offset: (page - 1) * pageSize, limit: pageSize, question_type: 'tag_text', keyword },
    })
    return { items: data.items.map(mapTagFillQuestion), total: data.total }
  },
  async options(): Promise<PerformanceTagFillQuestionOption[]> {
    const { data } = await api.get<{ items: Array<{ id: number; name: string; description: string; tags: PerformanceTagFillQuestionTag[] }> }>('/performance/tagged-fill-in-questions/options', {
      params: { question_type: 'tag_text' },
    })
    return data.items.map((item) => ({ ...item, id: String(item.id) }))
  },
  async get(id: string): Promise<PerformanceTagFillQuestion> {
    const { data } = await api.get<PerformanceTagFillQuestionWire>(`/performance/tagged-fill-in-questions/${id}`)
    return mapTagFillQuestion(data)
  },
  async create(payload: PerformanceTagFillQuestionPayload): Promise<PerformanceTagFillQuestion> {
    const { data } = await api.post<PerformanceTagFillQuestionWire>('/performance/tagged-fill-in-questions', payload)
    return mapTagFillQuestion(data)
  },
  async update(id: string, payload: PerformanceTagFillQuestionPayload): Promise<PerformanceTagFillQuestion> {
    const { data } = await api.put<PerformanceTagFillQuestionWire>(`/performance/tagged-fill-in-questions/${id}`, payload)
    return mapTagFillQuestion(data)
  },
  async remove(id: string): Promise<void> {
    await api.delete(`/performance/tagged-fill-in-questions/${id}`)
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

export interface PerformanceTemplateDetail extends PerformanceTemplateCreateRequest {
  template_id: number
  status: 'DRAFT' | 'active' | 'inactive'
  created_at: string
  updated_at: string
}

export interface PerformanceTemplateListItem {
  template_id: number
  name: string
  description: string
  status: 'DRAFT' | 'active' | 'inactive'
  created_at: string
}

export const performanceTemplateApi = {
  async list(): Promise<PerformanceTemplateListItem[]> {
    const { data } = await api.get<PerformanceTemplateListItem[]>('/performance/templates')
    return data
  },
  async updateStatus(id: number, status: 'active' | 'inactive'): Promise<PerformanceTemplateListItem> {
    const { data } = await api.patch<PerformanceTemplateListItem>(`/performance/templates/${id}/status`, { status })
    return data
  },
  async create(payload: PerformanceTemplateCreateRequest): Promise<PerformanceTemplateCreateResponse> {
    const { data } = await api.post<PerformanceTemplateCreateResponse>('/performance/templates', payload)
    return data
  },
  async get(id: number): Promise<PerformanceTemplateDetail> {
    const { data } = await api.get<PerformanceTemplateDetail>(`/performance/templates/${id}`)
    return data
  },
  async update(id: number, payload: PerformanceTemplateCreateRequest): Promise<PerformanceTemplateDetail> {
    const { data } = await api.patch<PerformanceTemplateDetail>(`/performance/templates/${id}`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/performance/templates/${id}`)
  },
  async getWorkflow(id: number): Promise<PerformanceWorkflowResponse> {
    const { data } = await api.get<PerformanceWorkflowResponse>(`/performance/templates/${id}/workflow`)
    return data
  },
  async updateWorkflow(id: number, payload: { nodes: PerformanceWorkflowNode[]; content_library?: PerformanceTemplateContent[] }): Promise<PerformanceWorkflowResponse> {
    const { data } = await api.patch<PerformanceWorkflowResponse>(`/performance/templates/${id}/workflow`, payload)
    return data
  },
}

export interface PerformanceTemplateContentItem {
  id: string
  label: string
  hint: string
  richText?: string
  settings?: {
    mode?: 'fill' | 'hidden'
    required?: boolean
    hideDescription?: boolean
    allowMultiple?: boolean
  }
  options?: Array<{ id: string; label: string; color?: string; placeholder?: string }>
}

export interface PerformanceTemplateContent {
  id?: string
  type: 'work_summary' | 'rating' | 'custom' | 'reference'
  name: string
  description: string
  items: PerformanceTemplateContentItem[]
  content_id?: string
  content_slot?: 'fill' | 'reference' | 'adjustment' | 'view'
  reference_kind?: 'node' | 'more'
  reference_value?: string
  settings?: {
    hideDescription?: boolean
    allowMultiple?: boolean
    mode?: string
    required?: boolean
  }
  ratingOptionId?: string
  ratingDisplayMode?: '标签样式' | '下拉样式'
  questionType?: 'text' | 'tag'
  tagOptionId?: string
  defaultAll?: boolean
  options?: Array<{ id: string; label: string; color?: string; placeholder?: string }>
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
  content?: PerformanceTemplateContent[]
  content_bindings?: Record<string, string[]>
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
  content_library?: PerformanceTemplateContent[]
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

export interface PerformanceProjectFlowRule {
  subject_type: 'PERSON'
  operator: 'INCLUDE' | 'EXCLUDE'
  scope: 'PROJECT_ALL'
  allow_authorize: boolean
}

export interface PerformanceProjectNodeTime {
  start_at: string
  end_at: string
  appeal_deadline?: string
}

export interface PerformanceProjectFlowSettings {
  node_settings: Record<string, {
    invite?: {
      default_invite: 'DIRECT_SUBORDINATES' | 'NONE'
      minimum_invited_count: number
      exclude_default_invite_from_limit: boolean
      recommended_invite: string[]
      allow_voluntary_evaluation: boolean
    }
    calibration?: {
      force_distribution_enabled: boolean
      phases: Array<{ rules: PerformanceProjectFlowRule[] }>
    }
    result_view?: { opening_mode: 'AUTOMATIC' | 'MANUAL' }
    result_reconsideration?: { handler: string | null }
  }>
  node_times: Record<string, PerformanceProjectNodeTime>
}

export interface PerformanceProjectPayload {
  name: string
  description: string | null
  administrators: string[]
  template_id?: number | null
  start_at?: string | null
  end_at?: string | null
  evaluator_rules?: {
    groups: Array<{
      conditions: Array<{ field: 'department' | 'employee_type' | 'employee'; operator: 'include' | 'exclude'; values: string[] }>
    }>
  }
  flow_settings?: PerformanceProjectFlowSettings
}

export interface PerformanceProject extends PerformanceCycleProjectShell {
  cycle_ref: string
  template_id: number | null
  start_at: string | null
  end_at: string | null
  evaluator_rules: NonNullable<PerformanceProjectPayload['evaluator_rules']>
  flow_settings: PerformanceProjectFlowSettings
}

export interface PerformanceProjectPage {
  items: PerformanceProject[]
  total: number
  page: number
  page_size: number
}

export interface PerformanceHrbpPersonOption {
  value: string
  label: string
}

export interface PerformanceHrbpOrganizationNode {
  value: string
  label: string
  level: number
  children: PerformanceHrbpOrganizationNode[]
}

export interface PerformanceHrbpOptions {
  people: PerformanceHrbpPersonOption[]
  organization_tree: PerformanceHrbpOrganizationNode[]
  invisible_people: PerformanceHrbpPersonOption[]
}

export interface PerformanceHrbpPermissionPerson {
  employee_no: string
  display_name: string
}

export interface PerformanceHrbpPermission {
  id: number
  hrbp: PerformanceHrbpPermissionPerson
  scope: string[]
  invisible_people: PerformanceHrbpPermissionPerson[]
}

export interface PerformanceHrbpPermissionPayload {
  hrbp: string
  scope: string[]
  invisible_people: string[]
}

export interface PerformanceCyclePerson {
  employee_no: string
  display_name: string
  company_org: string | null
  department: string | null
  department_2: string | null
  department_3: string | null
  department_4: string | null
  department_5: string | null
  organization_ref: string | null
  direct_supervisor_employee_no: string | null
  hrbp_employee_no: string | null
  employee_type: string | null
  employment_status: string | null
  job_family: string | null
  job_category: string | null
  position_level: string | null
  hire_date: string | null
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
  status: 'DRAFT' | 'active' | 'inactive' | 'LOCKED'
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
  async listHrbpOptions(id: number): Promise<PerformanceHrbpOptions> {
    const { data } = await api.get<PerformanceHrbpOptions>(`/performance/cycles/${id}/hrbp-options`)
    return data
  },
  async listHrbpPermissions(id: number): Promise<PerformanceHrbpPermission[]> {
    const { data } = await api.get<PerformanceHrbpPermission[]>(`/performance/cycles/${id}/hrbp-permissions`)
    return data
  },
  async createHrbpPermission(id: number, payload: PerformanceHrbpPermissionPayload): Promise<PerformanceHrbpPermission> {
    const { data } = await api.post<PerformanceHrbpPermission>(`/performance/cycles/${id}/hrbp-permissions`, payload)
    return data
  },
  async updateHrbpPermission(id: number, permissionId: number, payload: PerformanceHrbpPermissionPayload): Promise<PerformanceHrbpPermission> {
    const { data } = await api.patch<PerformanceHrbpPermission>(`/performance/cycles/${id}/hrbp-permissions/${permissionId}`, payload)
    return data
  },
  async removeHrbpPermission(id: number, permissionId: number): Promise<void> {
    await api.delete(`/performance/cycles/${id}/hrbp-permissions/${permissionId}`)
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

export const performanceProjectApi = {
  async list(cycleId: number, keyword?: string, page = 1, pageSize = 20): Promise<PerformanceProjectPage> {
    const { data } = await api.get<PerformanceProjectPage>(`/performance/cycles/${cycleId}/projects`, {
      params: { ...(keyword ? { keyword } : {}), page, page_size: pageSize },
    })
    return data
  },
  async listEvaluatorOptions(cycleId: number): Promise<{ departments: Array<{ value: string; label: string }>; employee_types: Array<{ value: string; label: string }>; employees: Array<{ value: string; label: string }> }> {
    const { data } = await api.get(`/performance/cycles/${cycleId}/evaluator-options`)
    return data
  },
  async create(cycleId: number, payload: PerformanceProjectPayload): Promise<PerformanceProject> {
    const { data } = await api.post<PerformanceProject>(`/performance/cycles/${cycleId}/projects`, payload)
    return data
  },
  async get(id: number): Promise<PerformanceProject> {
    const { data } = await api.get<PerformanceProject>(`/performance/projects/${id}`)
    return data
  },
  async update(id: number, payload: PerformanceProjectPayload): Promise<PerformanceProject> {
    const { data } = await api.patch<PerformanceProject>(`/performance/projects/${id}`, payload)
    return data
  },
  async backfillWorkflowNodes(id: number, node_times: Record<string, PerformanceProjectNodeTime>): Promise<{ project_id: number; created_node_ids: string[] }> {
    const { data } = await api.post(`/performance/projects/${id}/workflow-nodes/backfill`, { node_times })
    return data
  },
  async start(id: number): Promise<PerformanceProject> {
    const { data } = await api.post<PerformanceProject>(`/performance/projects/${id}/start`)
    return data
  },
  async copy(id: number): Promise<PerformanceProject> {
    const { data } = await api.post<PerformanceProject>(`/performance/projects/${id}/copy`)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/performance/projects/${id}`)
  },
}
