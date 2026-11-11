import { api } from './client'

export interface PerformanceReconsiderationStatus {
  id: number | null
  version: number | null
  node_id: string
  window_open: boolean
  can_submit: boolean
  can_edit: boolean
  can_withdraw: boolean
  deadline_at: string | null
  withdrawn_at: string | null
  prompt: string
  instruction: string
  handler_label: string
  reason: string | null
  submitted_at: string | null
}

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

export interface PerformanceCycleNavigationItem {
  cycle_id: number
  cycle_name: string
  cycle_start_at: string
  cycle_end_at: string
}

export interface PerformanceNavigationContext {
  cycles: PerformanceCycleNavigationItem[]
  active_cycle: PerformanceCycleNavigationItem | null
  can_review: boolean
  can_manage: boolean
  review_projects: Array<Pick<PerformanceWorkbenchProject, 'project_id' | 'project_name' | 'cycle_name' | 'cycle_start_at' | 'cycle_end_at'>>
}

export const performanceNavigationApi = {
  async get(cycleId?: number): Promise<PerformanceNavigationContext> {
    const { data } = await api.get<PerformanceNavigationContext>('/performance/navigation', {
      params: cycleId ? { cycle_id: cycleId } : undefined,
    })
    return data
  },
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
  executor_role_code?: string | null
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
  standard_position?: string | null
  job_sequence: string | null
  position_level: string | null
  hire_date: string | null
  department: string | null
  employee_type: string | null
  employment_status: string | null
  visible_profile_fields?: string[]
}

export interface PerformanceTaskRatingValue {
  label: string
  color?: string | null
  foreground?: string | null
}

export interface PerformanceWorkbenchTaskPerson extends PerformanceMemberProfile {
  can_remind?: boolean
  rating_columns?: Array<{ key: string; label: string }>
  ratings?: Record<string, PerformanceTaskRatingValue | null>
  rating?: string | null
  rating_tone?: string | null
  phase_id?: string | null
  previous_position_level?: string | null
  task_id: number
  aggregate_task_id?: number | null
  status: string
  due_at: string | null
  reminder_target?: string | null
  direct_supervisor?: string | null
  hrbp?: string | null
  completion?: string | null
  evaluate_ratio?: PerformanceEvaluateRatio | null
  department_path?: string | null
  visibility_role?: string
  visible_profile_fields?: string[]
}

export interface PerformanceCalibrationCompletion {
  scope_version: string
  total_count: number
  completed_count: number
  missing_result_count: number
  can_complete: boolean
  completed: boolean
}

export interface PerformanceMemberReminderTask {
  task_id: number
  project_id: number
  employee_no: string
  display_name: string
  node_id: string
  node_name: string
  task_kind: string
  status: string
  due_at: string | null
  reminder_target?: string | null
  selectable: boolean
  can_authorize: false
}

export interface PerformanceReminderResult {
  accepted_task_ids: number[]
  skipped_task_ids: number[]
  failed_task_ids?: number[]
  preview_task_ids?: number[]
  delivery_status: 'success' | 'partial_success' | 'failed' | 'recorded' | 'preview_only'
  errors?: Array<{ task_id?: number; error: string }>
}

export interface ProjectManagementDepartmentMetric {
  completed_count: number
  total_count: number
  completion_rate: number
}

export interface ProjectManagementDepartmentRow {
  id?: string
  children?: ProjectManagementDepartmentRow[]
  department: string
  metrics: Record<string, ProjectManagementDepartmentMetric>
}

export interface ProjectManagementDepartmentCompletion {
  columns: Array<{ key: string; title: string }>
  rows: ProjectManagementDepartmentRow[]
}

export interface ProjectAuthorizationRecord {
  project_id?: number
  task_id?: number
  authorization_id?: number
  id: string
  initiator: string
  status: string
  authorized_person: string
  stages: string[]
  reviewees: string[]
  submitted_at: string
  can_revoke: boolean
}

export interface ProjectAuthorizationRecords {
  cycle_id: number
  authorization_records: ProjectAuthorizationRecord[]
  transfer_records: ProjectAuthorizationRecord[]
}

export interface ProjectCalibrationAuthorization {
  project_id: number
  task_ids: number[]
  task_people?: Array<{ task_id: number; employee_no: string; display_name: string; direct_supervisor_employee_no?: string; department_path?: string }>
  authorizations: Array<{ id: number; task_id: number; recipient: string }>
  id: string
  allow_authorize: boolean
  can_authorize: boolean
  can_revoke: boolean
  calibrator: string
  status: string
  scope: string
  authorized_count: number
  unauthorized_count: number | null
  distribution_rule: string | null
  distribution_info?: { force_distribution_enabled: boolean; mode: string; rules: PerformanceDistributionRule[]; lines: string[] }
  authorized_by: string | null
  authorized_at: string | null
}

export interface ProjectManagementReminderPerson extends PerformanceWorkbenchTaskPerson {
  project_id: number
  can_authorize: boolean
  project_name: string
  selectable: boolean
  task_map?: ProjectMemberTaskOption[]
}

export interface ReminderPeoplePage {
  items: ProjectManagementReminderPerson[]
  total: number
  page: number
  page_size: number
}

export type PerformanceReviewMemberContext = {
  task_id?: number | null
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
  draft_choice?: 'use' | 'discard'
  task_id?: number
  node_id: string
  node_name: string
  node_type: string
  task_kind?: string
  entry_mode?: 'template_task' | 'route' | 'none'
  executor_label: string
  executor_role_code?: string | null
  phase_id?: string | null
  show_status?: boolean
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

export interface PerformanceReview360InvitedReviewer {
  employee_no: string
  display_name: string
  department: string | null
  job_family: string | null
  job_category: string | null
  job_sequence: string | null
  position_level: string | null
  status: 'invited' | 'pending' | 'completed'
  source_label: string
  invited_at: string | null
  due_at: string | null
}

export interface PerformanceReview360InviteList {
  items: PerformanceReview360InvitedReviewer[]
  total: number
  minimum_invited_count: number
  maximum_invited_count: number | null
  maximum_invite_mode: string
  second_prompt_enabled: boolean
  second_prompt_count: number | null
  second_prompt_mode: string
  exclude_default_invite_from_limit: boolean
}

export interface PerformanceReview360InviteCandidate {
  employee_no: string
  display_name: string
  department: string | null
  job_family: string | null
  job_category: string | null
  job_sequence: string | null
  position_level: string | null
  employment_status: string | null
}

export interface PerformanceReview360InviteCandidates {
  items: PerformanceReview360InviteCandidate[]
  total: number
}

export interface PerformanceReview360InviteSubmitResult {
  accepted_count: number
  already_invited: string[]
  rejected: string[]
}

export const performanceReview360InviteApi = {
  async list(projectId: number | string, keyword?: string): Promise<PerformanceReview360InviteList> {
    const { data } = await api.get<PerformanceReview360InviteList>(`/performance/review-360/invites/projects/${projectId}`, {
      params: keyword ? { keyword } : undefined,
    })
    return data
  },
  async candidates(projectId: number | string, keyword?: string): Promise<PerformanceReview360InviteCandidates> {
    const { data } = await api.get<PerformanceReview360InviteCandidates>(`/performance/review-360/invites/projects/${projectId}/candidates`, {
      params: keyword ? { keyword } : undefined,
    })
    return data
  },
  async submit(projectId: number | string, employeeNos: string[]): Promise<PerformanceReview360InviteSubmitResult> {
    const { data } = await api.post<PerformanceReview360InviteSubmitResult>(`/performance/review-360/invites/projects/${projectId}`, { employee_nos: employeeNos })
    return data
  },
  async revoke(projectId: number | string, employeeNo: string): Promise<{ revoked: string }> {
    const { data } = await api.delete<{ revoked: string }>(`/performance/review-360/invites/projects/${projectId}/${encodeURIComponent(employeeNo)}`)
    return data
  },
}

export interface PerformanceReview360FeedbackItem {
  task_id: number
  employee_no: string
  display_name: string
  department: string | null
  job_sequence: string | null
  position_level: string | null
  status: 'pending' | 'completed' | 'overdue' | 'rejected'
  source_label: string
  relationship: string
  due_at: string | null
  can_giveup?: boolean
}

export interface PerformanceReview360FeedbackList {
  items: PerformanceReview360FeedbackItem[]
  total: number
  node_id: string | null
  allow_voluntary_evaluation: boolean
  voluntary_evaluation_enabled?: boolean
  voluntary_evaluation_disabled_reason?: string | null
}

export interface PerformanceReview360VoluntaryCandidate {
  employee_no: string
  display_name: string
  department: string | null
  job_sequence: string | null
}

export interface PerformanceReview360VoluntaryCandidates {
  items: PerformanceReview360VoluntaryCandidate[]
  total: number
}

export interface PerformanceReview360VoluntaryResult {
  task_id: number
  target_employee_no: string
}

export const performanceReview360FeedbackApi = {
  async list(projectId: number | string, keyword?: string, nodeId?: string): Promise<PerformanceReview360FeedbackList> {
    const { data } = await api.get<PerformanceReview360FeedbackList>(`/performance/review-360/feedback/projects/${projectId}`, {
      params: { ...(keyword ? { keyword } : {}), ...(nodeId ? { node_id: nodeId } : {}) },
    })
    return data
  },
  async candidates(projectId: number | string, keyword?: string, nodeId?: string): Promise<PerformanceReview360VoluntaryCandidates> {
    const { data } = await api.get<PerformanceReview360VoluntaryCandidates>(`/performance/review-360/feedback/projects/${projectId}/candidates`, {
      params: { ...(keyword ? { keyword } : {}), ...(nodeId ? { node_id: nodeId } : {}) },
    })
    return data
  },
  async start(projectId: number | string, targetEmployeeNo: string, nodeId?: string): Promise<PerformanceReview360VoluntaryResult> {
    const { data } = await api.post<PerformanceReview360VoluntaryResult>(`/performance/review-360/feedback/projects/${projectId}/voluntary`, { target_employee_no: targetEmployeeNo, ...(nodeId ? { node_id: nodeId } : {}) })
    return data
  },
  async giveup(projectId: number | string, taskId: number | string, nodeId?: string): Promise<PerformanceReview360VoluntaryResult> {
    const { data } = await api.post<PerformanceReview360VoluntaryResult>(`/performance/review-360/feedback/projects/${projectId}/giveup`, { task_id: Number(taskId), ...(nodeId ? { node_id: nodeId } : {}) })
    return data
  },
}

export const performanceReviewApi = {
  async discardTaskDraft(taskId: number | string, kind: string, version: number, employeeNo?: string): Promise<{ version: number }> {
    const endpoint = kind === 'work_summary' ? 'self-summary' : 'template-task'
    const { data } = await api.delete(`/performance/tasks/${encodeURIComponent(String(taskId))}/${endpoint}/draft`, { data: { version }, params: employeeNo ? { employee_no: employeeNo } : undefined })
    return data
  },
  async overview(projectId?: number, taskId?: number, cycleId?: number): Promise<PerformanceReviewOverview> {
    const { data } = await api.get<PerformanceReviewOverview>('/performance/review/overview', {
      params: projectId || taskId || cycleId ? { ...(projectId ? { project_id: projectId } : {}), ...(taskId ? { task_id: taskId } : {}), ...(cycleId ? { cycle_id: cycleId } : {}) } : undefined,
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
  async saveTemplateTaskDraft(taskId: number | string, answers: Record<string, unknown>, version?: number, employeeNo?: string, resultVersion?: number | null): Promise<SelfSummarySaveResult> {
    const { data } = await api.patch<SelfSummarySaveResult>(`/performance/tasks/${encodeURIComponent(String(taskId))}/template-task/draft`, { answers, version, ...(resultVersion === undefined ? {} : { result_version: resultVersion }) }, { params: employeeNo ? { employee_no: employeeNo } : undefined })
    return data
  },
  async submitTemplateTask(taskId: number | string, answers: Record<string, unknown>, version?: number, employeeNo?: string, resultVersion?: number | null): Promise<SelfSummarySaveResult> {
    const { data } = await api.post<SelfSummarySaveResult>(`/performance/tasks/${encodeURIComponent(String(taskId))}/template-task/submit`, { answers, version, ...(resultVersion === undefined ? {} : { result_version: resultVersion }) }, { params: employeeNo ? { employee_no: employeeNo } : undefined })
    return data
  },
}

export interface PerformanceOtherPermissionPerson {
  employee_no: string
  display_name: string
  department?: string | null
}

export interface PerformanceOtherPermissionHrbpPermission {
  hrbp: PerformanceOtherPermissionPerson
  scope: string[]
  invisible_people: PerformanceOtherPermissionPerson[]
}

export interface PerformanceOtherPermissionSettings {
  hrbp_invisible_scope_enabled: boolean
  hrbp_invisible_people: PerformanceOtherPermissionPerson[]
  hrbp_invisible_rules: PerformanceAudienceGroup[]
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
  hrbp_invisible_rules?: PerformanceAudienceGroup[]
  hrbp_permissions?: PerformanceOtherPermissionHrbpPermissionPayload[]
  manager_reminder_enabled?: boolean
  manager_reminder_node_types?: string[]
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

export interface PerformanceOtherSettings {
  calibration_authorization_outside_direct_reports_enabled: boolean
  calibration_import_enabled: boolean
  performance_coefficient_enabled: boolean
  reviewer_360_tags_enabled: boolean
  manual_result_opening_enabled: boolean
  overdue_single_submission_enabled: boolean
  overdue_voluntary_360_submission_enabled: boolean
  cycle_overdue_submission_override_enabled: boolean
  authorization_prompt_zh: string
  authorization_prompt_en: string
  transfer_prompt_zh: string
  transfer_prompt_en: string
}

export interface PerformanceReviewer360Tag {
  id: string
  name_zh: string
  name_en: string
  description_zh: string
  description_en: string
}

export interface PerformanceReviewer360Tags {
  tags: PerformanceReviewer360Tag[]
  version: number
}

export const performanceReviewer360TagsApi = {
  async get(): Promise<PerformanceReviewer360Tags> {
    const { data } = await api.get<PerformanceReviewer360Tags>('/performance/system-settings/other/reviewer-360-tags')
    return data
  },
  async update(payload: PerformanceReviewer360Tags): Promise<PerformanceReviewer360Tags> {
    const { data } = await api.put<PerformanceReviewer360Tags>('/performance/system-settings/other/reviewer-360-tags', payload)
    return data
  },
}

export const performanceOtherSettingsApi = {
  async get(): Promise<PerformanceOtherSettings> {
    const { data } = await api.get<PerformanceOtherSettings>('/performance/system-settings/other')
    return data
  },
  async update(payload: Partial<PerformanceOtherSettings>): Promise<PerformanceOtherSettings> {
    const { data } = await api.patch<PerformanceOtherSettings>('/performance/system-settings/other', payload)
    return data
  },
}

export interface PerformanceTodoNotificationRule {
  frequency: 'specified' | 'daily' | 'weekly'
  interval: number
  days_before: number[]
  day_kind: 'calendar_day' | 'working_day'
  weekdays: number[]
  time: string
  timezone: string
  suppress_non_working_days: boolean
}

export interface PerformanceNotificationSettings {
  feishu_push_enabled: boolean
  email_enabled: boolean
  calibration_delivery_mode: 'realtime' | 'after_calibration'
  result_change_notification_scope: 'final_score_grade' | 'any_content'
  todo_task_notification_enabled: boolean
  todo_task_rule?: PerformanceTodoNotificationRule
  progress_daily_notification_enabled: boolean
  progress_daily_rule?: PerformanceTodoNotificationRule
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
  | 'todo_task_rule'
  | 'progress_daily_notification_enabled'
  | 'progress_daily_rule'
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
  role_type: 'MANAGEMENT' | 'ASSESSMENT'
  member_source: string | null
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

export interface PerformanceRoleUpdatePayload {
  name?: string
  description?: string | null
  function_permission_keys?: string[]
}

export const performanceRoleApi = {
  async list(keyword = '', page = 1, pageSize = 10, roleType: PerformanceRoleListItem['role_type'] = 'MANAGEMENT'): Promise<PerformanceRoleListPage> {
    const { data } = await api.get<PerformanceRoleListPage>('/performance/permission-settings/roles', {
      params: { keyword: keyword || undefined, role_type: roleType, page, page_size: pageSize },
    })
    return data
  },
  async get(id: number): Promise<PerformanceRoleListItem> {
    const { data } = await api.get<PerformanceRoleListItem>(`/performance/permission-settings/roles/${id}`)
    return data
  },
  async create(payload: PerformanceRoleCreatePayload): Promise<PerformanceRoleListItem> {
    const { data } = await api.post<PerformanceRoleListItem>('/performance/permission-settings/roles', payload)
    return data
  },
  async update(id: number, payload: PerformanceRoleUpdatePayload): Promise<PerformanceRoleListItem> {
    const { data } = await api.patch<PerformanceRoleListItem>(`/performance/permission-settings/roles/${id}`, payload)
    return data
  },
  async updateStatus(id: number, isActive: boolean): Promise<PerformanceRoleListItem> {
    const { data } = await api.patch<PerformanceRoleListItem>(`/performance/permission-settings/roles/${id}/status`, { is_active: isActive })
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/performance/permission-settings/roles/${id}`)
  },
}
export interface PerformanceUserAuthorization {
  user_id: number
  display_name: string
  login_name: string
  employee_no: string
  role_ids: number[]
  roles: Array<{ id: number; name: string; function_permission_keys: string[] }>
  updated_at: string
  updated_by?: string | null
}

export interface PerformanceUserAuthorizationOptions {
  users: Array<{ value: string; label: string; employee_no: string }>
  roles: Array<{ id: number; name: string; function_permission_keys: string[] }>
}

const userAuthorizationPath = '/performance/permission-settings/roles/user-authorizations'
export const performanceUserAuthorizationApi = {
  async list(keyword = '', page = 1, pageSize = 10): Promise<{ items: PerformanceUserAuthorization[]; total: number; page: number; page_size: number }> {
    const { data } = await api.get(userAuthorizationPath, { params: { keyword: keyword || undefined, page, page_size: pageSize } })
    return data
  },
  async exportAll(keyword = ''): Promise<{ items: PerformanceUserAuthorization[]; total: number }> {
    const { data } = await api.get(userAuthorizationPath + '/export', { params: { keyword: keyword || undefined } })
    return data
  },
  async options(): Promise<PerformanceUserAuthorizationOptions> {
    const { data } = await api.get(userAuthorizationPath + '/options')
    return data
  },
  async save(userId: number, roleIds: number[], edit = false): Promise<PerformanceUserAuthorization> {
    const payload = { user_id: userId, role_ids: roleIds }
    const { data } = edit ? await api.put(`${userAuthorizationPath}/${userId}`, payload) : await api.post(userAuthorizationPath, payload)
    return data
  },
  async revoke(userId: number): Promise<void> {
    await api.delete(`${userAuthorizationPath}/${userId}`)
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
  configured?: boolean
  can_remind?: boolean
  can_open_result?: boolean
  openable_count?: number
  reconsidered_count?: number
  reminder_title?: string | null
  reminder_description?: string | null
}

export interface ProjectManagementOverview {
  cycles: ProjectManagementCycle[]
  active_cycle: ProjectManagementCycle | null
  has_management_access?: boolean
  projects: ProjectManagementProject[]
  completion_nodes?: ProjectManagementCompletionNode[]
  hrbp_scope: string[]
  category: { key: string; label: string }
}

export interface ProjectMemberTaskOption {
  task_id: number
  stage_id?: string | null
  stage_key: string
  stage_label: string
  role_key: string | null
  role_label: string | null
  handler_ref: string
  handler_name?: string | null
  can_authorize?: boolean
}

export interface PerformanceTaskDelegationTarget {
  task_id: number
  project_id: number
  employee_no?: string
  display_name?: string
  task_map?: ProjectMemberTaskOption[]
}

export interface PerformanceEvaluateRatioPerson {
  name: string
  dimission: boolean
}

export interface PerformanceEvaluateRatio {
  completion: string
  evaluated: PerformanceEvaluateRatioPerson[]
  pending: PerformanceEvaluateRatioPerson[]
  dimission_count: number
  invite_stage: 'not_started' | 'in_progress' | 'ended'
}

export interface ProjectMember extends PerformanceMemberProfile {
  can_remind?: boolean
  root_review_id?: number
  project_id?: number
  can_view_detail?: boolean
  rating_columns?: Array<{ key: string; label: string }>
  ratings?: Record<string, PerformanceTaskRatingValue | null>
  direct_supervisor?: string | null
  department_path?: string | null
  id: number
  avatar_url: string | null
  rating: string | null
  rating_tone: string | null
  completion: string | null
  task_id?: number | null
  can_authorize?: boolean
  task_map?: ProjectMemberTaskOption[]
  evaluate_ratio?: PerformanceEvaluateRatio | null
}

export interface ProjectMemberPage {
  rating_columns?: Array<{ key: string; label: string }>
  items: ProjectMember[]
  total: number
  page: number
  page_size: number
}

export interface RevieweeSearchOption {
  value: string
  label: string
  sub_label?: string | null
  department?: string | null
  is_permitted: boolean
  reason?: string | null
}

export interface RevieweeSearchResult {
  items: RevieweeSearchOption[]
}

export interface RevieweeConflictStage {
  stage_key: string
  stage_label: string
}

export interface RevieweeConflictResult {
  employee_no: string
  conflicts: RevieweeConflictStage[]
  okr_requires_notice: boolean
}

export interface ProjectMatrixPerson {
  employee_no: string
  display_name: string
  employment_status: string | null
  can_view_detail?: boolean
  project_id?: number
  root_review_id?: number
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
  dimension: 'department' | 'team' | 'sequence' | 'level' | 'tenure'
  rowLabel: string
  showSummary: true
  totalParticipants: number
  ratings: ProjectMatrixRating[]
  distribution: Record<string, number>
  heatLevels?: Record<string, 1 | 2 | 3>
  departments: Array<{ id: string; name: string; counts: Record<string, number>; heatLevels?: Record<string, 1 | 2 | 3>; children?: never[] }>
}

export interface ProjectReportComparisonData {
  source: 'api'
  total: number
  ratings: ProjectMatrixRating[]
  counts: number[][]
  heatLevels: number[][]
}

export interface PerformanceResultOpeningPerson {
  employee_no: string
  display_name: string
  project_id: number
  project_name: string
  can_open: boolean
  unavailable_reason: string | null
  ratings?: Record<string, PerformanceTaskRatingValue | null>
  completion?: string
  direct_supervisor?: string | null
  hrbp?: string | null
  job_sequence?: string | null
  hire_date?: string | null
  department?: string | null
  organization_path?: string | null
  previous_position_level?: string | null
  employee_type?: string | null
  visible_profile_fields?: string[]
}

export interface PerformanceResultOpeningPage {
  rating_columns?: Array<{ key: string; label: string }>
  items: PerformanceResultOpeningPerson[]
  total: number
  page: number
  page_size: number
}

export interface PerformanceResultOpeningResponse {
  accepted_employee_nos: string[]
  skipped_employee_nos: string[]
  skipped_reasons: Record<string, string>
  notification_status: 'pending_integration'
}

export const projectManagementApi = {
  async overview(cycleId?: number): Promise<ProjectManagementOverview> {
    const { data } = await api.get<ProjectManagementOverview>('/performance/project-management/overview', {
      params: cycleId ? { cycle_id: cycleId } : undefined,
    })
    return data
  },
  async departmentCompletion(cycleId: number): Promise<ProjectManagementDepartmentCompletion> {
    const { data } = await api.get<ProjectManagementDepartmentCompletion>('/performance/project-management/department-completion', { params: { cycle_id: cycleId } })
    return data
  },
  async reminderPeople(cycleId: number, nodeKey: string, keyword = '', page = 1, pageSize = 50, department?: string): Promise<ReminderPeoplePage> {
    const { data } = await api.get<ReminderPeoplePage>('/performance/project-management/reminder-people', { params: { cycle_id: cycleId, node_key: nodeKey, keyword: keyword || undefined, department: department || undefined, page, page_size: pageSize } })
    return data
  },
  async remindCycleTasks(cycleId: number, nodeKey: string, taskIds: number[], department?: string, skipRecentlyReminded = false): Promise<PerformanceReminderResult> {
    const merged: PerformanceReminderResult = { accepted_task_ids: [], skipped_task_ids: [], failed_task_ids: [], preview_task_ids: [], delivery_status: 'failed', errors: [] }
    for (let index = 0; index < taskIds.length; index += 500) {
      const batch = taskIds.slice(index, index + 500)
      try {
        const { data } = await api.post<PerformanceReminderResult>('/performance/project-management/remind', { cycle_id: cycleId, node_key: nodeKey, department: department || undefined, skip_recently_reminded: skipRecentlyReminded || undefined, task_ids: batch })
        merged.accepted_task_ids.push(...data.accepted_task_ids)
        merged.skipped_task_ids.push(...data.skipped_task_ids)
        merged.failed_task_ids!.push(...(data.failed_task_ids || []))
        merged.preview_task_ids!.push(...(data.preview_task_ids || []))
        merged.errors!.push(...(data.errors || []))
      } catch {
        merged.failed_task_ids!.push(...taskIds.slice(index))
        merged.errors!.push({ error: '发送结果未确认，请核对通知日志后再重试' })
        break
      }
    }
    merged.delivery_status = merged.preview_task_ids!.length && !merged.accepted_task_ids.length
      ? 'preview_only'
      : merged.accepted_task_ids.length ? (merged.failed_task_ids!.length || merged.skipped_task_ids.length ? 'partial_success' : 'success') : 'failed'
    return merged
  },
  async delegationCandidates(projectId: number, taskId: number): Promise<Array<{ employee_no: string; display_name: string; department_path?: string; direct_supervisor_employee_no?: string }>> {
    const { data } = await api.get(`/performance/projects/${projectId}/tasks/${taskId}/delegation-candidates`)
    return data
  },
  async delegationCandidatesBatch(projectId: number, taskIds: number[]): Promise<Array<{ project_id: number; task_id: number; candidates: Array<{ employee_no: string; display_name: string; department_path?: string; direct_supervisor_employee_no?: string }> }>> {
    const uniqueTaskIds = [...new Set(taskIds)]
    const result: Array<{ project_id: number; task_id: number; candidates: Array<{ employee_no: string; display_name: string; department_path?: string; direct_supervisor_employee_no?: string }> }> = []
    for (let index = 0; index < uniqueTaskIds.length; index += 200) {
      const { data } = await api.post('/performance/projects/delegation-candidates/batch', { project_id: projectId, task_ids: uniqueTaskIds.slice(index, index + 200) })
      result.push(...data)
    }
    return result
  },
  async authorizeTask(projectId: number, taskId: number, action: 'AUTHORIZE' | 'TRANSFER', recipientEmployeeNo: string, reason: string, options?: { scope_mode?: 'PARTIAL' | 'ALL'; scope_kind?: string; selected_employee_nos?: string[]; department_paths?: string[]; distribution_mode?: string; allow_reauthorize?: boolean; notify_original: boolean; no_origin_reviewer_authorize?: boolean; idempotency_key?: string }): Promise<{ id?: number; task_id: number; status?: string; notification_status?: 'preview_only' | string; idempotent?: boolean; skipped?: boolean }> {
    const { data } = await api.post(`/performance/projects/${projectId}/tasks/${taskId}/delegations`, { action, recipient_employee_no: recipientEmployeeNo, reason, ...options })
    return data
  },
  async revokeTaskAuthorization(projectId: number, taskId: number, authorizationId: number): Promise<void> {
    await api.delete(`/performance/projects/${projectId}/tasks/${taskId}/delegations/${authorizationId}`)
  },
  async authorizationRecords(cycleId: number): Promise<ProjectAuthorizationRecords> {
    const { data } = await api.get<ProjectAuthorizationRecords>('/performance/project-management/authorization-records', { params: { cycle_id: cycleId } })
    return data
  },
  async calibrationAuthorization(cycleId: number): Promise<{ cycle_id: number; cycle_name: string; start_at?: string | null; end_at?: string | null; items: ProjectCalibrationAuthorization[] }> {
    const { data } = await api.get('/performance/project-management/calibration-authorization', { params: { cycle_id: cycleId } })
    return data
  },
  async cycleMembers(cycleId: number, keyword?: string, page = 1, pageSize = 50, sortBy?: string, sortOrder?: 'asc' | 'desc'): Promise<ProjectMemberPage> {
    const { data } = await api.get<ProjectMemberPage>(`/performance/project-management/cycles/${cycleId}/members`, { params: { keyword, page, page_size: pageSize, sort_by: sortBy, sort_order: sortOrder } })
    return data
  },
  async cycleExportMembers(cycleId: number, keyword?: string, sortBy?: string, sortOrder?: 'asc' | 'desc'): Promise<ProjectMemberPage> {
    const { data } = await api.get<ProjectMemberPage>(`/performance/project-management/cycles/${cycleId}/members/export`, { params: { keyword, sort_by: sortBy, sort_order: sortOrder } })
    return data
  },
  async members(projectId: number | string, keyword?: string, page = 1, pageSize = 50, sortBy?: string, sortOrder?: 'asc' | 'desc', matrixLevel?: string, matrixRating?: string): Promise<ProjectMemberPage> {
    const { data } = await api.get<ProjectMemberPage>(`/performance/projects/${encodeURIComponent(String(projectId))}/members`, {
      params: { ...(keyword ? { keyword } : {}), ...(sortBy && sortOrder ? { sort_by: sortBy, sort_order: sortOrder } : {}), ...(matrixLevel && matrixRating ? { matrix_level: matrixLevel, matrix_rating: matrixRating } : {}), page, page_size: pageSize },
    })
    return data
  },
  async exportMembers(projectId: number | string, keyword?: string, sortBy?: string, sortOrder?: 'asc' | 'desc'): Promise<ProjectMemberPage> {
    const { data } = await api.get<ProjectMemberPage>(`/performance/projects/${encodeURIComponent(String(projectId))}/members/export`, {
      params: { ...(keyword ? { keyword } : {}), ...(sortBy && sortOrder ? { sort_by: sortBy, sort_order: sortOrder } : {}) },
    })
    return data
  },
  async memberDetail(projectId: number | string, employeeNo: string, rootReviewId?: number): Promise<PerformanceManagementDetail> {
    const { data } = await api.get<PerformanceManagementDetail>(`/performance/projects/${encodeURIComponent(String(projectId))}/members/${encodeURIComponent(employeeNo)}/detail`, { params: rootReviewId ? { root_review_id: rootReviewId } : undefined })
    return data
  },
  async calibrationCompletionPreview(projectId: number, nodeId: string, phaseId?: string | null): Promise<PerformanceCalibrationCompletion> {
    const { data } = await api.post<PerformanceCalibrationCompletion>(`/performance/projects/${projectId}/calibration-completion/preview`, { node_id: nodeId, ...(phaseId ? { phase_id: phaseId } : {}) })
    return data
  },
  async calibrationCompletionConfirm(projectId: number, nodeId: string, scopeVersion: string, phaseId?: string | null): Promise<PerformanceCalibrationCompletion> {
    const { data } = await api.post<PerformanceCalibrationCompletion>(`/performance/projects/${projectId}/calibration-completion/confirm`, { node_id: nodeId, scope_version: scopeVersion, ...(phaseId ? { phase_id: phaseId } : {}) })
    return data
  },
  async memberReminderTasks(projectId: number, employeeNo: string, context: { source_task_id?: number; node_id?: string; task_id?: number } = {}): Promise<{ items: PerformanceMemberReminderTask[]; total: number; can_remind: boolean }> {
    const { data } = await api.get(`/performance/projects/${projectId}/members/${encodeURIComponent(employeeNo)}/reminder-tasks`, { params: context })
    return data
  },
  async memberRemindBatch(projectId: number, employeeNo: string, context: { source_task_id?: number; node_id?: string; task_ids: number[]; skip_recently_reminded: boolean }): Promise<PerformanceReminderResult> {
    const { data } = await api.post<PerformanceReminderResult>(`/performance/projects/${projectId}/members/${encodeURIComponent(employeeNo)}/remind-batch`, context)
    return data
  },
  async memberReminderPreview(projectId: number | string, employeeNo: string, nodeId: string, taskId: number): Promise<PerformanceReminderPreview> {
    const { data } = await api.get<PerformanceReminderPreview>(`/performance/projects/${encodeURIComponent(String(projectId))}/members/${encodeURIComponent(employeeNo)}/reminder-preview`, { params: { node_id: nodeId, task_id: taskId } })
    return data
  },
  async memberRemind(projectId: number | string, employeeNo: string, nodeId: string, taskId: number): Promise<PerformanceReminderResult> {
    const { data } = await api.post<PerformanceReminderResult>(`/performance/projects/${encodeURIComponent(String(projectId))}/members/${encodeURIComponent(employeeNo)}/remind`, { node_id: nodeId, task_id: taskId })
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
  async openingPeople(cycleId: number, keyword = '', page = 1, pageSize = 50): Promise<PerformanceResultOpeningPage> {
    const { data } = await api.get<PerformanceResultOpeningPage>(`/performance/cycles/${cycleId}/result-opening/people`, { params: { keyword: keyword || undefined, page, page_size: pageSize } })
    return data
  },
  async openResults(cycleId: number, employeeNos: string[]): Promise<PerformanceResultOpeningResponse> {
    const { data } = await api.post<PerformanceResultOpeningResponse>(`/performance/cycles/${cycleId}/result-opening/open`, { employee_nos: employeeNos })
    return data
  },
  async myResults(projectId: number): Promise<{ project_id: number; employee_no: string; content_page_name?: string; results: Array<{ task_id: number; field_id: string; option_id: string; label: string }>; contents?: PerformanceResultContent[]; regions?: PerformanceResultRegion[] }> {
    const { data } = await api.get(`/performance/workbench/projects/${projectId}/results`)
    return data
  },
  async resultReconsideration(projectId: number | string): Promise<PerformanceReconsiderationStatus> {
    const { data } = await api.get(`/performance/projects/${encodeURIComponent(String(projectId))}/result-reconsiderations`)
    return data
  },
  async submitResultReconsideration(projectId: number | string, reason: string, version?: number | null): Promise<PerformanceReconsiderationStatus> {
    const { data } = await api.post(`/performance/projects/${encodeURIComponent(String(projectId))}/result-reconsiderations`, { reason, ...(version == null ? {} : { version }) })
    return data
  },
  async editResultReconsideration(projectId: number | string, reason: string, version: number): Promise<PerformanceReconsiderationStatus> {
    const { data } = await api.patch(`/performance/projects/${encodeURIComponent(String(projectId))}/result-reconsiderations`, { reason, version })
    return data
  },
  async withdrawResultReconsideration(projectId: number | string, version: number): Promise<PerformanceReconsiderationStatus> {
    const { data } = await api.post(`/performance/projects/${encodeURIComponent(String(projectId))}/result-reconsiderations/withdraw`, { version })
    return data
  },
  async levelStatistics(cycleId: number, dimension: 'department' | 'team' | 'sequence' | 'level' | 'tenure' = 'level'): Promise<ProjectStatisticsReport> {
    const { data } = await api.get<ProjectStatisticsReport>('/performance/project-management/statistics', { params: { cycle_id: cycleId, dimension } })
    return data
  },
  async selfFinalComparison(cycleId: number): Promise<ProjectReportComparisonData> {
    const { data } = await api.get<ProjectReportComparisonData>('/performance/project-management/self-final-comparison', { params: { cycle_id: cycleId } })
    return data
  },
  async revieweeSearch(projectId: number | string, keyword: string): Promise<RevieweeSearchResult> {
    const { data } = await api.get<RevieweeSearchResult>(`/performance/projects/${encodeURIComponent(String(projectId))}/reviewees/search`, { params: { keyword: keyword.trim() || undefined } })
    return data
  },
  async revieweeConflictCheck(projectId: number | string, employeeNo: string): Promise<RevieweeConflictResult> {
    const { data } = await api.post<RevieweeConflictResult>(`/performance/projects/${encodeURIComponent(String(projectId))}/reviewees/conflict-check`, { employee_no: employeeNo })
    return data
  },
  async addReviewee(projectId: number | string, employeeNo: string, visibleAddOkrNotice = false): Promise<RevieweeSearchOption> {
    const { data } = await api.post<RevieweeSearchOption>(`/performance/projects/${encodeURIComponent(String(projectId))}/reviewees`, { employee_no: employeeNo, visible_add_okr_notice: visibleAddOkrNotice })
    return data
  },
  async removeMember(projectId: number | string, employeeNo: string, rootReviewId?: number): Promise<{ code: number; data: object; msg: string }> {
    const { data } = await api.delete<{ code: number; data: object; msg: string }>(`/performance/projects/${encodeURIComponent(String(projectId))}/members/${encodeURIComponent(employeeNo)}`, { params: rootReviewId ? { root_review_id: rootReviewId } : undefined })
    return data
  },
}

export type PerformanceTemplateOption = { id: string; code?: string; label: string; name?: string; color?: string; placeholder?: string; description?: string; required?: boolean; foreground?: string }
export type PerformanceTemplateField = {
  id: string
  type: 'rich_text' | 'rating' | 'tag_with_followup' | 'single_select'
  label: string
  required?: boolean
  placeholder?: string
  options?: PerformanceTemplateOption[]
  display_mode?: '标签样式' | '下拉样式'
  hide_name?: boolean
  allow_unknown?: boolean
  description?: string
  hide_description?: boolean
  default_all?: boolean
  readonly?: boolean
  /** 只读预览示例值（对齐飞书 entrySetting/permission 的 read 态渲染）：
     评级取示例档位 id、tag 取全选、文本取占位文案；真实填写时忽略 */
  previewValue?: unknown
}
export type PerformanceTemplateElement = { kind: 'field'; id: string } | { kind: 'prompt'; id: string; prompt: PerformancePromptValue }
export type PerformanceTemplateSection = { id: string; name: string; description?: string; allow_multiple?: boolean; fields: PerformanceTemplateField[]; elements?: PerformanceTemplateElement[] }
export type PerformanceOkrStatus = 'unset' | 'normal' | 'risk' | 'extended' | (string & {})
export type PerformanceOkrKeyResult = {
  id: string
  content: string
  weight?: number | null
  percent?: number | null
  status?: PerformanceOkrStatus | null
}
export type PerformanceOkrObjective = {
  id: string
  content: string
  weight?: number | null
  percent?: number | null
  status?: PerformanceOkrStatus | null
  key_results: PerformanceOkrKeyResult[]
}
export type PerformanceOkrView = {
  source: string
  okr_id: string
  period_id?: string | null
  period_label: string
  objectives: PerformanceOkrObjective[]
}
export type EmployeeOkrResponse = {
  enabled: boolean
  source?: string | null
  employee_no: string
  okr?: PerformanceOkrView | null
  okrs?: PerformanceOkrView[]
}
export type PerformanceReferenceTab = {
  key: string
  /** node=引用其他环节内容；okr=内置 OKR 参考内容（数据来自 OKR 数据源） */
  kind?: 'node' | 'okr'
  node_id: string
  node_name: string
  task_id?: number | null
  employee_no: string
  status: 'not_started' | 'pending' | 'overdue' | 'completed'
  task_kind?: string
  deadline_at?: string | null
  submitted_by?: string | null
  submitted_at?: string | null
  answer_submissions?: Array<{ display_name: string; submitted_at: string }>
  final_result_locked?: boolean
  form_schema: PerformanceTemplateSection[]
  answers: Record<string, unknown>
  can_remind: boolean
  /** kind='okr' 时下发的被评估人 OKR（无数据/未启用数据源为 null） */
  okr?: PerformanceOkrView | null
  okrs?: PerformanceOkrView[]
}
export type PerformanceResultContent = { task_id: number; form_schema: SelfSummarySection[]; answers: Record<string, unknown> }
export type PerformanceResultRegion = {
  key: string
  kind: 'result' | 'reference'
  title: string
  contents: PerformanceResultContent[]
  reference_kind?: 'node' | 'okr'
  status?: string
  okr?: PerformanceOkrView | null
  okrs?: PerformanceOkrView[]
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
export const FINAL_RESULT_LOCKED_MESSAGE = '当前结果已完成校准，你无法再次修改'
export type PerformanceTemplateTask = {
  management_tabs?: PerformanceReferenceTab[]
  default_active_tab?: string
  root_review_id?: number
  opened_at?: string | null
  project_id?: number
  node_id?: string
  return_view?: 'node' | 'drawer' | 'page'
  has_draft?: boolean
  draft_answers?: Record<string, unknown>
  task_id: string | number
  task_kind: string
  entry_mode: 'template_task' | 'route' | 'none'
  node_name: string
  content_page_name?: string
  deadline_at?: string | null
  editable: boolean
  submit_allowed: boolean
  final_result_locked?: boolean
  submitted_at?: string | null
  answer_submissions?: Array<{ display_name: string; submitted_at: string }>
  result_version?: number | null
  draft_base_result_version?: number | null
  version?: number
  can_giveup?: boolean
  person: SelfSummaryPerson
  form_schema: SelfSummarySection[]
  answers: Record<string, unknown>
  prompts?: PerformancePromptValue[]
  calibration_notice?: string | null
  reconsideration_reason?: string | null
  reconsideration_closed?: boolean
  /** 结果复议处理：模板节点「显示绩效结果并允许修改」开关透传 */
  show_result_and_modify?: boolean | null
  /** 结果复议处理：处理人「是否保持复议前结果」选择（keep=保持原结果 隐藏绩效结果 / change=变更结果 展示，默认 change） */
  keep_result?: 'keep' | 'change' | null
  reference_tabs?: PerformanceReferenceTab[]
  /** 评估人（handler）视角复用被评估人管理详情：其他环节进度与催办/填写入口 */
  stage_views?: PerformanceStageView[]
  cycle?: { name: string; start_at?: string | null; end_at?: string | null }
}
export type PerformanceStageView = {
  node_id: string
  node_type: string
  node_name: string
  key: string
  status: 'completed' | 'overdue' | 'pending' | 'not_started'
  task_id: number | null
  task_kind?: string | null
  deadline_at?: string | null
  submitted_at?: string | null
  empty: boolean
  can_fill: boolean
  final_result_locked?: boolean
  reminder_target?: string | null
  anonymous: boolean
}
export type PerformanceManagementDetail = Omit<PerformanceTemplateTask, 'task_id'> & {
  task_id: string | number | null
  stage_views?: PerformanceStageView[]
  cycle?: { name: string; start_at?: string | null; end_at?: string | null }
}
export type PerformanceReminderPreview = {
  title: string
  description: string
  stage_label: string
  deadline_at?: string | null
  cycle_name: string
  cycle_start_at?: string | null
  cycle_end_at?: string | null
  reminder_name: string
  stage_type: string
  assessee_name: string
}
export type SelfSummaryTask = PerformanceTemplateTask
export type SelfSummarySaveResult = { answers: Record<string, unknown>; version?: number; result_version?: number | null; draft_base_result_version?: number | null; answer_submissions?: Array<{ display_name: string; submitted_at: string }>; submitted_at?: string | null; editable?: boolean; submit_allowed?: boolean; reconsideration_closed?: boolean }

export const performanceWorkbenchApi = {
  async listProjects(keyword?: string, cycleId?: number): Promise<PerformanceWorkbenchProject[]> {
    const { data } = await api.get<PerformanceWorkbenchProject[]>('/performance/workbench/projects', {
      params: { ...(keyword ? { keyword } : {}), ...(cycleId ? { cycle_id: cycleId } : {}) },
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
  async taskPeople(projectId: number, nodeId: string, state: 'pending' | 'completed' | 'all', keyword?: string, phaseId?: string | null): Promise<PerformanceWorkbenchTaskPerson[]> {
    const { data } = await api.get<PerformanceWorkbenchTaskPerson[]>(`/performance/workbench/tasks/${encodeURIComponent(nodeId)}/people`, { params: { project_id: projectId, state, ...(keyword ? { keyword } : {}), ...(phaseId ? { phase_id: phaseId } : {}) } })
    return data
  },
  async taskDistributionTips(projectId: number, nodeId: string, phaseId?: string | null): Promise<PerformanceDistributionTips> {
    const { data } = await api.get<PerformanceDistributionTips>(`/performance/workbench/tasks/${encodeURIComponent(nodeId)}/distribution-tips`, { params: { project_id: projectId, ...(phaseId ? { phase_id: phaseId } : {}) } })
    return data
  },
}

export interface PerformanceDistributionTips {
  enabled: boolean
  total_people: number
  rated_people: number
  rules: Array<{
    assessment_item_id: string
    assessment_label: string
    conditions: Array<{
      control_mode: 'HARD' | 'SOFT'
      grades: string[]
      operator: string
      value: number
      unit: 'PERCENT' | 'PEOPLE'
      rounding: string
      target_people: number
      current_people: number
      diff: number
      violated: boolean
    }>
  }>
  lines: string[]
}

export interface PerformanceAccessContext {
  subject_type: 'PORTAL_USER' | 'SYSTEM_ACCOUNT' | 'EMPLOYEE'
  subject_id: number
  display_name: string
  account_type: string | null
  portal_entry_permissions: string[]
  role_grants?: PerformanceRoleGrant[]
  permission_codes: string[]
  dev_admin_debug?: boolean
  effective_employee_no?: string | null
  operator_user_id?: number | null
  switch_session_id?: string | null
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
  deletable: boolean
  delete_reason: string
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
  level_descriptions?: Record<string, string>
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
  async remove(id: number): Promise<void> {
    await api.delete(`/performance/review-questions/${id}`)
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

export interface PerformanceMetricTemplateDimension {
  id: string
  name: string
  description: string
  need_weight: boolean
  weight: number | null
  metric_type_ids: number[]
  allow_reviewee_add_metrics: boolean
  reviewee_add_method: 'library' | 'library_or_custom'
  reviewee_scoring_method: 'manual'
  reviewee_min_one_metric: boolean
  review_rule_mode: 'same' | 'different'
  review_rule_id: number | null
}

export interface PerformanceTemplateCreateRequest {
  name: string
  description: string
  language: 'zh-CN'
  english_enabled: boolean
  audience_settings_enabled?: boolean
  template_kind?: 'performance' | 'metric'
  score_method?: 'manual' | 'dimension_sum' | 'dimension_weighted' | 'custom_formula'
  dimensions?: PerformanceMetricTemplateDimension[]
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
  updated_at?: string
  updated_by?: string
  template_id: number
  name: string
  description: string
  status: 'DRAFT' | 'active' | 'inactive'
  created_at: string
}

export const performanceTemplateApi = {
  async peopleOptions(): Promise<PerformanceExecutorPerson[]> {
    const { data } = await api.get<PerformanceExecutorPerson[]>('/performance/templates/people/options')
    return data
  },
  async list(kind?: 'performance' | 'metric'): Promise<PerformanceTemplateListItem[]> {
    const { data } = await api.get<PerformanceTemplateListItem[]>('/performance/templates', kind ? { params: { template_kind: kind } } : undefined)
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
  async get(id: number, kind?: 'performance' | 'metric'): Promise<PerformanceTemplateDetail> {
    const { data } = await api.get<PerformanceTemplateDetail>(`/performance/templates/${id}`, kind ? { params: { template_kind: kind } } : undefined)
    return data
  },
  async update(id: number, payload: PerformanceTemplateCreateRequest & { configuration_completed?: boolean }): Promise<PerformanceTemplateDetail> {
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

export interface PerformancePromptValue {
  title: string
  content: string
  color: string
  scope: 'all' | 'cycle'
  showIcon?: boolean
  allowView?: boolean
  onlyWhenFilling?: boolean
}

export interface PerformanceTemplateContentItem {
  kind?: 'rating' | 'fill' | 'prompt'
  prompt?: PerformancePromptValue
  ratingOptionId?: string
  ratingDisplayMode?: '标签样式' | '下拉样式'
  id: string
  label: string
  hint: string
  richText?: string
  questionType?: 'text' | 'tag' | 'single'
  tagOptionId?: string
  defaultAll?: boolean
  settings?: {
    mode?: 'fill' | 'hidden' | 'view'
    required?: boolean
    hideName?: boolean
    hideDescription?: boolean
    levelRulesEnabled?: boolean
    allowMultiple?: boolean
    allowView?: boolean
  }
  options?: Array<{ id: string; code?: string; label: string; name?: string; description?: string; color?: string; placeholder?: string }>
}

export interface PerformanceReferenceDisplaySettings {
  allowView?: boolean
  hideName?: boolean
  hideDescription?: boolean
  onlyWhenFilling?: boolean
}

export interface PerformanceTemplateContent {
  id?: string
  type: 'work_summary' | 'rating' | 'custom' | 'reference' | 'prompt'
  prompt?: PerformancePromptValue
  name: string
  description: string
  items: PerformanceTemplateContentItem[]
  content_id?: string
  content_slot?: 'fill' | 'reference' | 'adjustment' | 'view'
  reference_kind?: 'node' | 'more'
  reference_value?: string
  reference_source_content_id?: string
  reference_settings?: {
    /** 引用视图自身的页面名称，只作用于该引用，不写回来源环节。 */
    page_name?: string
    content_settings?: Record<string, { root?: PerformanceReferenceDisplaySettings; items?: Record<string, PerformanceReferenceDisplaySettings> }>
  }
  settings?: {
    hideDescription?: boolean
    allowMultiple?: boolean
    allowView?: boolean
    allowUnknown?: boolean
    mode?: string
    required?: boolean
    /** 只读预览的示例评级档位（REA read 态展示「3星 符合预期」） */
    sampleOptionId?: string
  }
  ratingOptionId?: string
  ratingDisplayMode?: '标签样式' | '下拉样式'
  questionType?: 'text' | 'tag' | 'single'
  tagOptionId?: string
  defaultAll?: boolean
  options?: Array<{ id: string; code?: string; label: string; name?: string; description?: string; color?: string; placeholder?: string }>
}

export type PerformanceCalibrationItemSettings = { allowModify?: boolean; hideName?: boolean; hideDescription?: boolean; levelRulesEnabled?: boolean }
export type PerformanceCalibrationSettings = Record<string, {
  settings?: { hideDescription?: boolean }
  items?: Record<string, PerformanceCalibrationItemSettings>
}>

export interface PerformanceWorkflowNode {
  node_id: string | null
  content_page_name?: string | null
  node_type: string
  name: string
  description: string
  order: number
  executor_types: string[]
  executor_label: string
  executor_role_code?: string | null
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
  calibration_settings?: PerformanceCalibrationSettings
  appeal_prompt_content?: string
  appeal_reason_instruction?: string
  /** 结果复议处理：显示绩效结果并允许修改（REA 复议 final 面板勾选，默认 true） */
  show_result_and_modify?: boolean
  executor_config?: PerformanceExecutorConfig | null
  content?: PerformanceTemplateContent[]
  content_region_order?: string[] | null
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

export interface PerformanceRefActivityProject {
  project_id: number
  project_name: string
  status: string
}

export interface PerformanceRefSemesterActivity {
  semester_id: number
  semester_name: string
  activities: PerformanceRefActivityProject[]
}

export interface PerformanceWorkflowResponse {
  template_id: number
  usage_summary: { cycle_count: number; project_count: number }
  editable_scope?: { workflow: boolean; data_write_settings: boolean; reference_and_prompt_content: boolean }
  content_library?: PerformanceTemplateContent[]
  distribution_assessment_options?: PerformanceDistributionAssessmentOption[]
  ref_semester_activity?: PerformanceRefSemesterActivity[]
  nodes: PerformanceWorkflowNode[]
}

export type PerformanceCyclePeriodType = 'YEAR' | 'HALF_YEAR' | 'QUARTER' | 'BIMONTH' | 'MONTH' | 'CUSTOM'
export type PerformanceCyclePeriodSubtype = 'H1' | 'H2' | `Q${1 | 2 | 3 | 4}` | `B${1 | 2 | 3 | 4 | 5 | 6}` | `M${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}` | 'CUSTOM'
export type PerformanceCycleLockRule = 'IMMEDIATE' | 'SCHEDULED'
export type PerformanceCycleSyncMode = 'MANUAL' | 'AUTO_DAILY'
export type PerformanceCycleLeaverMode = 'CREATE_TASK' | 'REPORT_ONLY'

export type PerformanceAudienceField = '' | 'department' | 'employee_type' | 'hire_date' | 'employee' | 'employment_status' | 'departure_date' | 'job_family' | 'job_category' | 'position_level' | 'standard_position' | 'directLeader' | 'superior'
export type PerformanceAudienceOperator = 'include' | 'exclude' | 'before' | 'not_before' | 'after' | 'not_after'
export interface PerformanceAudienceCondition {
  field: PerformanceAudienceField
  operator: PerformanceAudienceOperator
  values: string[]
}
export interface PerformanceAudienceGroup {
  conditions: PerformanceAudienceCondition[]
}
export interface PerformanceAudienceRules {
  groups: PerformanceAudienceGroup[]
}

export interface PerformanceCycleProjectShell {
  id: number
  project_ref: string
  name: string
  description: string | null
  administrators: string[]
  data_managers?: Array<'PROJECT_ADMIN' | 'HRBP'>
  scope_limited?: boolean
  scope_employee_nos?: string[]
  scope_rules?: PerformanceAudienceRules
  status: string
  evaluated_count: number
  configuration_completed?: boolean
  template_id?: number | null
  start_at?: string | null
  end_at?: string | null
  evaluator_rules?: PerformanceAudienceRules
  flow_settings?: PerformanceProjectFlowSettings
  node_meta?: Record<string, { name: string; node_type: string }>
  start_blocked_reason?: string
}

export interface PerformanceCalibrationCondition {
  field: 'department' | 'employee' | 'hire_date' | 'calibrator_relation'
  operator: 'INCLUDE' | 'EXCLUDE' | 'before' | 'not_before' | 'after' | 'not_after'
  values: string[]
}

export interface PerformanceCalibrationConditionGroup {
  conditions: PerformanceCalibrationCondition[]
}

export interface PerformanceProjectFlowRule {
  rule_id?: string
  subject_type: 'PERSON'
  operator: 'INCLUDE' | 'EXCLUDE'
  scope: 'PROJECT_ALL' | 'RULE'
  allow_authorize: boolean
  subject_source?: 'RULE'
  subject_groups?: PerformanceCalibrationConditionGroup[]
  scope_groups?: PerformanceCalibrationConditionGroup[]
  description?: string
  distribution_rules?: PerformanceDistributionRule[]
}

export interface PerformanceProjectNodeTime {
  start_at: string
  end_at: string
  appeal_deadline?: string
  phase_times?: Record<string, { start_at: string; end_at: string }>
}

export interface PerformanceCalibrationAssignment {
  role_code: 'assessment.calibrator'
  evaluated_count: number
  assigned_count: number
  unassigned_count: number
  phases: Array<{ phase_id: string; assignments: Array<{ handler_ref: string; employee_no: string; allow_authorize: boolean }> }>
}

export type PerformanceDistributionMode = 'UNIFIED' | 'BY_CALIBRATION_SCOPE'
export type PerformanceDistributionControlMode = 'HARD' | 'SOFT'
export type PerformanceDistributionOperator = 'EQ' | 'LT' | 'LTE' | 'GT' | 'GTE'
export type PerformanceDistributionUnit = 'PERCENT' | 'PEOPLE'
export type PerformanceDistributionRounding = 'ROUND' | 'CEIL' | 'FLOOR' | 'NONE'
export interface PerformanceDistributionCondition {
  control_mode: PerformanceDistributionControlMode
  grade_codes: string[]
  operator: PerformanceDistributionOperator
  value: number
  unit: PerformanceDistributionUnit
}
export type PerformanceDistributionScopeRuleType = 'DEPARTMENT' | 'DEPARTMENT_LEVEL' | 'POSITION_LEVEL'
export interface PerformanceDistributionScopeRule {
  type: PerformanceDistributionScopeRuleType
  values: string[]
}
export interface PerformanceDistributionExecutionScope {
  calibration_scope: boolean
  department: boolean
  other_dimension: boolean
  rules: PerformanceDistributionScopeRule[]
}
export interface PerformanceDistributionRule {
  assessment_item_id: string
  min_people_operator: PerformanceDistributionOperator
  min_people_count: number
  conditions: PerformanceDistributionCondition[]
  rounding_method: PerformanceDistributionRounding
  execution_scope?: PerformanceDistributionExecutionScope
}
export interface PerformanceDistributionSettings {
  mode: PerformanceDistributionMode
  rules: PerformanceDistributionRule[]
  scope_configured: boolean
}
export interface PerformanceDistributionAssessmentOption {
  id: string
  label: string
  description?: string
  grade_options: Array<{ value: string; label: string; legacy_value?: string }>
}

export interface PerformanceProjectFlowSettings {
  node_settings: Record<string, {
    invite?: {
      default_invite: 'DIRECT_SUBORDINATES' | 'NONE'
      minimum_invited_count: number
      maximum_invited_count?: number | null
      maximum_invite_mode?: 'SUGGESTED' | 'LIMIT'
      second_prompt_enabled?: boolean
      second_prompt_count?: number | null
      second_prompt_mode?: 'SUGGESTED' | 'LIMIT'
      exclude_default_invite_from_limit: boolean
      recommended_invite: string[]
      allow_voluntary_evaluation: boolean
      allow_voluntary_okr_access?: boolean
    }
    calibration?: {
      force_distribution_enabled: boolean
      distribution?: PerformanceDistributionSettings
      phases: Array<{ phase_id?: string; rules: PerformanceProjectFlowRule[] }>
    }
    result_view?: {
      automatic_enabled: boolean
      manual_enabled: boolean
      automatic_rule: 'PREVIOUS_AND_START' | 'PREVIOUS_IMMEDIATE'
    }
    result_reconsideration?: { handler_employee_nos: string[] }
  }>
  node_times: Record<string, PerformanceProjectNodeTime>
}

export interface PerformanceProjectPayload {
  name: string
  description: string | null
  administrators: string[]
  data_managers?: Array<'PROJECT_ADMIN' | 'HRBP'>
  scope_limited?: boolean
  scope_employee_nos?: string[]
  scope_rules?: PerformanceAudienceRules
  template_id?: number | null
  start_at?: string | null
  end_at?: string | null
  evaluator_rules?: PerformanceAudienceRules
  flow_settings?: PerformanceProjectFlowSettings
}

export type PerformanceProjectCopyPayload = Partial<Pick<PerformanceProjectPayload,
  'name' | 'description' | 'administrators' | 'data_managers' | 'scope_limited' | 'scope_rules'
>> & {
  target_cycle_id?: number
}

export interface PerformanceCalibrationOperation {
  operation: 'add_rule' | 'delete_rule' | 'add_phase' | 'delete_phase'
  node_id: string
  phase_id: string
  rule_id?: string
}

export interface PerformanceProjectEditingPolicy {
  server_now: string
  can_edit_result_opening: boolean
  calibration_nodes: Record<string, {
    can_edit_distribution: boolean
    distribution_disabled_reason: string | null
    can_edit_rule_content: boolean
    can_edit_phase_content: boolean
    phases: Record<string, { can_delete: boolean; delete_disabled_reason: string | null }>
  }>
}

export type PerformanceProjectPatch = Partial<PerformanceProjectPayload> & {
  calibration_operations?: PerformanceCalibrationOperation[]
  calibration_base_digest?: string
  notify_calibrators?: boolean
  configuration_completed?: boolean
}

export interface PerformanceProject extends PerformanceCycleProjectShell {
  calibration_base_digest?: string
  editing_policy?: PerformanceProjectEditingPolicy
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
  snapshot_lock_at: string | null
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
  project_manager_employee_no: string | null
  hrbp_employee_no: string | null
  employee_type: string | null
  employment_status: string | null
  job_family: string | null
  job_category: string | null
  standard_position?: string | null
  position_level: string | null
  hire_date: string | null
  departure_date: string | null
  is_manually_maintained: boolean
  direct_supervisor_name?: string | null
  hrbp_name?: string | null
  has_change?: boolean
}

export interface PerformanceCyclePersonPage {
  items: PerformanceCyclePerson[]
  total: number
  offset: number
  limit: number
}

export interface PerformancePersonChangeItem {
  employee_no: string | null
  field: string
  label: string
  before: string | null
  after: string | null
}

export interface PerformancePersonChangeRecord {
  event_id: number
  event_at: string
  event_type: string
  actor_type: string
  actor_ref: string
  changes: PerformancePersonChangeItem[]
}

export interface PerformancePersonInfoUpdateResult {
  changed: PerformancePersonChangeItem[]
  person: PerformanceCyclePerson
}

export interface PerformanceCycleDepartmentItem {
  department_name: string
  parent_department: string | null
  people_count: number
}

export interface PerformanceCycleDepartmentPage {
  items: PerformanceCycleDepartmentItem[]
  total: number
  offset: number
  limit: number
}

export interface PerformanceCycle {
  id: number
  cycle_ref: string
  name: string
  language: 'zh-CN'
  period_year: number
  period_type: PerformanceCyclePeriodType
  period_subtype: PerformanceCyclePeriodSubtype | null
  template_id: number | null
  template_ids?: number[]
  used_template_ids?: number[]
  leaver_range_editable?: boolean
  leaver_range_editable_reason?: string | null
  start_at: string
  end_at: string
  lock_rule: PerformanceCycleLockRule
  lock_at: string | null
  pre_lock_sync_mode: PerformanceCycleSyncMode
  leaver_enabled: boolean
  leaver_start_date: string | null
  leaver_end_date: string | null
  leaver_participation_mode: PerformanceCycleLeaverMode
  overdue_submission_enabled: boolean
  overdue_submission_scope: 'EVALUATION' | 'ALL'
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
  async listPeoplePage(id: number, params: { keyword?: string; offset?: number; limit?: number }): Promise<PerformanceCyclePersonPage> {
    const { data } = await api.get<PerformanceCyclePersonPage>(`/performance/cycles/${id}/people/page`, { params })
    return data
  },
  async listDepartmentsPage(id: number, params: { keyword?: string; offset?: number; limit?: number }): Promise<PerformanceCycleDepartmentPage> {
    const { data } = await api.get<PerformanceCycleDepartmentPage>(`/performance/cycles/${id}/departments/page`, { params })
    return data
  },
  async importProjectManagers(id: number, people: Array<{ target_employee_no: string; manager_employee_no: string }>, reason: string): Promise<PerformanceCyclePerson[]> {
    const { data } = await api.patch<PerformanceCyclePerson[]>(`/performance/cycles/${id}/people/project-managers`, { reason, people })
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
  async listPersonChangeRecords(id: number, employeeNo: string): Promise<PerformancePersonChangeRecord[]> {
    const { data } = await api.get<PerformancePersonChangeRecord[]>(`/performance/cycles/${id}/people/${encodeURIComponent(employeeNo)}/change-records`)
    return data
  },
  async updatePersonInfo(id: number, employeeNo: string, updateFields: Array<'job_family' | 'position_level' | 'direct_supervisor' | 'department'>): Promise<PerformancePersonInfoUpdateResult> {
    const { data } = await api.post<PerformancePersonInfoUpdateResult>(`/performance/cycles/${id}/people/${encodeURIComponent(employeeNo)}/update-info`, { update_fields: updateFields })
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/performance/cycles/${id}`)
  },
}

export interface PerformanceEvaluatorOptions {
  organization_tree: PerformanceHrbpOrganizationNode[]
  people: Array<{ value: string; label: string }>
  employee_types: Array<{ value: string; label: string }>
  hire_date_range?: { min: string | null; max: string | null }
  employment_statuses?: Array<{ value: string; label: string }>
  job_families?: Array<{ value: string; label: string }>
  job_categories?: Array<{ value: string; label: string }>
  position_levels?: Array<{ value: string; label: string }>
  standard_positions?: Array<{ value: string; label: string }>
  departure_date_range?: { min: string | null; max: string | null }
}

export type PerformanceProjectTemplate = Pick<PerformanceTemplateListItem, 'template_id' | 'name' | 'description' | 'status'>

export interface PerformanceEvaluatorPreviewPayload {
  project_id?: number | null
  evaluator_rules: PerformanceAudienceRules
  scope_rules?: PerformanceAudienceRules
  group_index?: number | null
  list_kind?: 'matched' | 'task' | 'report_only'
}
export interface PerformanceEvaluatorPreviewSummary {
  matched_count: number
  task_generation_count: number
  report_count: number
  report_only_count: number
  group_counts: number[]
}
export interface PerformanceEvaluatorPreviewPerson {
  employee_no: string
  display_name: string
  direct_supervisor: string | null
  company_org: string | null
  department: string | null
  department_2: string | null
  department_3: string | null
  job_family: string | null
  job_category: string | null
  standard_position: string | null
  employment_status?: string | null
  live_employment_status?: string | null
  status: 'task' | 'report_only'
  report_only: boolean
}
export interface PerformanceEvaluatorPreviewPeoplePage {
  items: PerformanceEvaluatorPreviewPerson[]
  total: number
  page: number
  page_size: number
}

export const performanceProjectApi = {
  async previewEvaluators(cycleId: number, payload: PerformanceEvaluatorPreviewPayload): Promise<PerformanceEvaluatorPreviewSummary> {
    const { data } = await api.post<PerformanceEvaluatorPreviewSummary>(`/performance/cycles/${cycleId}/evaluator-preview`, payload)
    return data
  },
  async previewEvaluatorPeople(cycleId: number, payload: PerformanceEvaluatorPreviewPayload, keyword = '', page = 1, pageSize = 50): Promise<PerformanceEvaluatorPreviewPeoplePage> {
    const { data } = await api.post<PerformanceEvaluatorPreviewPeoplePage>(`/performance/cycles/${cycleId}/evaluator-preview/people`, payload, { params: { ...(keyword ? { keyword } : {}), page, page_size: pageSize } })
    return data
  },
  async getTemplateWorkflow(cycleId: number, templateId: number): Promise<Pick<PerformanceWorkflowResponse, 'template_id' | 'nodes' | 'distribution_assessment_options'>> {
    const { data } = await api.get(`/performance/cycles/${cycleId}/project-templates/${templateId}/workflow`)
    return data
  },
  async listTemplates(cycleId: number): Promise<PerformanceProjectTemplate[]> {
    const { data } = await api.get<PerformanceProjectTemplate[]>(`/performance/cycles/${cycleId}/project-templates`)
    return data
  },
  async calibrationPreview(id: number, payload: PerformanceProjectPayload): Promise<Record<string, PerformanceCalibrationAssignment | null>> {
    const { data } = await api.post(`/performance/projects/${id}/calibration-preview`, payload)
    return data
  },
  async list(cycleId: number, keyword?: string, page = 1, pageSize = 20): Promise<PerformanceProjectPage> {
    const { data } = await api.get<PerformanceProjectPage>(`/performance/cycles/${cycleId}/projects`, {
      params: { ...(keyword ? { keyword } : {}), page, page_size: pageSize },
    })
    return data
  },
  async listEvaluatorOptions(cycleId: number): Promise<PerformanceEvaluatorOptions> {
    const { data } = await api.get<PerformanceEvaluatorOptions>(`/performance/cycles/${cycleId}/evaluator-options`)
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
  async update(id: number, payload: PerformanceProjectPatch): Promise<PerformanceProject> {
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
  async copy(id: number, payload?: PerformanceProjectCopyPayload): Promise<PerformanceProject> {
    const { data } = await api.post<PerformanceProject>(`/performance/projects/${id}/copy`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/performance/projects/${id}`)
  },
}

export const performanceOkrApi = {
  async taskOkr(taskId: number | string): Promise<EmployeeOkrResponse> {
    const { data } = await api.get<EmployeeOkrResponse>(`/performance/okr/tasks/${encodeURIComponent(String(taskId))}/okr`, { params: { include_periods: true } })
    return data
  },
}

/* ===== 人员组管理（focus-people，REA 实测对齐） ===== */

export interface PerformanceFocusGroup {
  id: number
  cycle_ref: string
  tab: 'semester' | 'project'
  name: string
  en_name: string
  description: Record<string, string>
  followee_user_ids: string[]
  view_permission: number
  scope_setting_mode: number
  scope: Array<Array<Record<string, unknown>>> | null
  show_group_tag: boolean
  tag_color: string | null
  text_color: string | null
  bg_color: string | null
  is_communicate_time: boolean
  start_time: string | null
  end_time: string | null
  employee_nos: string[]
  scope_mode: string
  project_ref: string | null
  activity_ids: string[]
  activity_names: string[]
  roles_of_managing_scope: string[]
  created_by_type: string | null
  created_by_ref: string | null
  updated_by_type: string | null
  updated_by_ref: string | null
  created_at: string
  updated_at: string
}

export interface PerformanceFocusGroupPayload {
  name: string
  en_name?: string
  tab: 'semester' | 'project'
  description?: Record<string, string>
  followee_user_ids?: string[]
  view_permission?: number
  scope_setting_mode?: number
  scope?: Array<Array<Record<string, unknown>>> | null
  show_group_tag?: boolean
  tag_color?: string | null
  text_color?: string | null
  bg_color?: string | null
  is_communicate_time?: boolean
  start_time?: string | null
  end_time?: string | null
  employee_nos: string[]
  scope_mode: string
  project_ref?: string | null
  activity_ids?: string[]
  roles_of_managing_scope?: string[]
}

export interface PerformanceFocusGroupOptions extends PerformanceEvaluatorOptions {
  fields: Array<{ key: string; label: string; operators: string[]; option_source: string }>
  people: Array<{ value: string; label: string; sub_label?: string; department?: string | null; email?: string | null }>
  api_document_url: string | null
  communication_enabled: boolean
}

export interface PerformanceResolveScopePayload {
  scopes: Array<Array<Record<string, unknown>>>
  user_group_id?: string
}

export interface PerformanceResolveScopeResult {
  task_id: string | null
  status: number | null
  selected_count?: number | null
  selected?: string[] | null
  scopes?: Array<{ selected?: string[] | null }>
  /** 逐组人数（组间「或」，每组独立匹配） */
  group_counts?: number[]
  /** 逐组人员行（与 FocusGroupPeopleDialog 表格行同构） */
  group_peoples?: PerformanceFocusGroupChangePerson[][]
}

export interface PerformanceFocusGroupPage {
  total: number
  items: PerformanceFocusGroup[]
}

export interface PerformanceFocusGroupPriorityCheck {
  data: boolean
}

/** 人员组规则 → 飞书 scopes 载荷（新建页与「添加人员范围」弹窗共用同一转换）。
 * 不完整条件（未选字段或值空）与全空组会被剔除，避免中间态（如刚添加空条件组）
 * 触发后端「暂不支持人员范围维度」校验失败；完整规则始终按组携带。 */
export function toFeishuScopes(groups: PerformanceAudienceGroup[]) {
  const fields: Record<string, string> = {
    department: 'department', employee: 'employee', employee_type: 'employeeType', directLeader: 'directLeader', superior: 'superior',
    job_family: 'category', position_level: 'level', job_category: 'sequenceLevel', hire_date: 'joinDate', departure_date: 'dimissionTime', employment_status: 'dimissionStatus',
  }
  const operators: Record<string, string> = { include: 'eq', exclude: 'neq', before: 'lt', not_before: 'ge', after: 'gt', not_after: 'le' }
  return groups
    .map(group => group.conditions
      .filter(condition => condition.field && condition.values.length > 0)
      .map((condition, index) => ({
        key: fields[condition.field as keyof typeof fields] || condition.field,
        condition: operators[condition.operator as keyof typeof operators] || condition.operator,
        value: condition.values,
        id: String(index + 1),
        fe_extra: '',
        __id__: `condition_${index + 1}`,
      })))
    .filter(group => group.length > 0)
}

/** 规则是否完整（至少一条已填字段与值的条件），用于计数与提交校验。 */
export function hasCompleteScopeRule(groups: PerformanceAudienceGroup[]) {
  return groups.some(group => group.conditions.some(condition => condition.field && condition.values.length > 0))
}

export interface PerformanceFocusGroupMember {
  value: string
  label: string
  sub_label?: string
  department?: string | null
  /** 部门路径（/ 分隔），末级部门由前端 leaf_department 取末段 */
  organization_ref?: string | null
  email?: string | null
  display_name?: string | null
  direct_supervisor_employee_no?: string | null
  direct_supervisor_name?: string | null
  department_2?: string | null
  department_5?: string | null
  job_family?: string | null
  job_category?: string | null
  /** 序列：与绩效评估「上级评估」同逻辑，职位族-职位类（format_job_sequence） */
  job_sequence?: string | null
  /** 添加人 / 添加时间：老成员缺失时为 null（前端显示 --） */
  added_by?: string | null
  added_at?: string | null
}

export interface PerformanceFocusGroupMembers {
  group_id: number
  employee_nos: string[]
  people: PerformanceFocusGroupMember[]
  /** 分页过滤后的成员总数（未分页时为 people.length） */
  total?: number
}

export interface PerformanceFocusGroupChangeLogItem {
  id: string
  event_id: number
  operator: string
  change_type: '新增' | '移除'
  condition: string
  user_ids: string[]
  count: number
  changed_at: string
}

export interface PerformanceFocusGroupChangeLogPage {
  total: number
  items: PerformanceFocusGroupChangeLogItem[]
}

export interface PerformanceFocusGroupChangePerson {
  employee_no: string
  display_name: string
  direct_supervisor_name?: string | null
  /** 部门路径（/ 分隔），末级部门由前端 leaf_department 取末段（与 PerformancePeopleListPanel 同源） */
  organization_ref?: string | null
  /** 一级部门（花名册 department 物理列，label 即「一级部门」） */
  department?: string | null
  department_2?: string | null
  job_family?: string | null
  job_category?: string | null
  /** 序列：与绩效评估「上级评估」同逻辑，职位族-职位类（format_job_sequence） */
  job_sequence?: string | null
}

export interface PerformanceFocusGroupChangePersonPage {
  total: number
  items: PerformanceFocusGroupChangePerson[]
}

export interface PerformanceFocusGroupOverviewItem {
  id: number
  name: string
  tab: 'semester' | 'project'
  count: number
  scope_setting_mode: number
  activity_names: string[]
}

export interface PerformanceFocusGroupOverview {
  can_show: boolean
  groups: PerformanceFocusGroupOverviewItem[]
}

export const performanceFocusGroupApi = {
  async members(cycleId: number, groupId: number, params?: { current?: number; size?: number; keyword?: string }): Promise<PerformanceFocusGroupMembers> {
    const { data } = await api.get<PerformanceFocusGroupMembers>(`/performance/cycles/${cycleId}/focus-groups/${groupId}/members`, {
      params: params && (params.current || params.size || params.keyword) ? { current: params.current, size: params.size, ...(params.keyword ? { keyword: params.keyword } : {}) } : undefined,
    })
    return data
  },
  async overview(cycleId: number): Promise<PerformanceFocusGroupOverview> {
    const { data } = await api.get<PerformanceFocusGroupOverview>(`/performance/cycles/${cycleId}/focus-groups/overview`)
    return data
  },
  async updateMembers(cycleId: number, groupId: number, employeeNos: string[]): Promise<PerformanceFocusGroupMembers> {
    const { data } = await api.patch<PerformanceFocusGroupMembers>(`/performance/cycles/${cycleId}/focus-groups/${groupId}/members`, { employee_nos: employeeNos })
    return data
  },
  async changeLog(cycleId: number, groupId: number, current = 1, size = 10): Promise<PerformanceFocusGroupChangeLogPage> {
    const { data } = await api.get<PerformanceFocusGroupChangeLogPage>(`/performance/cycles/${cycleId}/focus-groups/${groupId}/change-log`, {
      params: { current, size },
    })
    return data
  },
  async changePeople(cycleId: number, groupId: number, eventId: number, userIds: string[], current = 1, size = 10, keyword = ''): Promise<PerformanceFocusGroupChangePersonPage> {
    const { data } = await api.get<PerformanceFocusGroupChangePersonPage>(`/performance/cycles/${cycleId}/focus-groups/${groupId}/change-log/${eventId}/people`, {
      params: { user_ids: userIds.join(','), current, size, ...(keyword ? { keyword } : {}) },
    })
    return data
  },
  async get(cycleId: number, groupId: number): Promise<PerformanceFocusGroup> {
    const { data } = await api.get<PerformanceFocusGroup>(`/performance/cycles/${cycleId}/focus-groups/${groupId}`)
    return data
  },
  async options(cycleId: number): Promise<PerformanceFocusGroupOptions> {
    const { data } = await api.get<PerformanceFocusGroupOptions>(`/performance/cycles/${cycleId}/focus-groups/options`)
    return data
  },
  async searchPeople(cycleId: number, keyword: string): Promise<PerformanceFocusGroupOptions['people']> {
    const { data } = await api.post<PerformanceFocusGroupOptions['people']>(`/performance/cycles/${cycleId}/focus-groups/people/query`, { keyword, exclude_dismissed: false })
    return data
  },
  async resolveScope(cycleId: number, payload: PerformanceResolveScopePayload, taskId = '-1'): Promise<PerformanceResolveScopeResult> {
    const { data } = await api.post<PerformanceResolveScopeResult>(`/performance/cycles/${cycleId}/focus-groups/resolve-scope`, payload, { params: { task_id: taskId } })
    return data
  },
  async priorityCheck(cycleId: number): Promise<boolean> {
    const { data } = await api.get<PerformanceFocusGroupPriorityCheck>(`/performance/cycles/${cycleId}/focus-groups/priority-check`)
    return data.data
  },
  async list(cycleId: number, params: { tab: 'semester' | 'project'; current?: number; size?: number; keyword?: string }): Promise<PerformanceFocusGroupPage> {
    const { data } = await api.get<PerformanceFocusGroupPage>(`/performance/cycles/${cycleId}/focus-groups`, { params })
    return data
  },
  async create(cycleId: number, payload: PerformanceFocusGroupPayload): Promise<PerformanceFocusGroup> {
    const { data } = await api.post<PerformanceFocusGroup>(`/performance/cycles/${cycleId}/focus-groups`, payload)
    return data
  },
  async update(cycleId: number, groupId: number, payload: PerformanceFocusGroupPayload): Promise<PerformanceFocusGroup> {
    const { data } = await api.patch<PerformanceFocusGroup>(`/performance/cycles/${cycleId}/focus-groups/${groupId}`, payload)
    return data
  },
  async remove(cycleId: number, groupId: number): Promise<void> {
    await api.delete(`/performance/cycles/${cycleId}/focus-groups/${groupId}`)
  },
}
