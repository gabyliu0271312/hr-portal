import { api } from './client'
import type { PerformanceCalibrationCompletion, PerformanceDistributionTips, PerformanceProjectFlowRule, PerformanceWorkbenchTaskPeoplePage, PerformanceWorkbenchTaskPerson, ProjectMember, PerformanceReviewNode } from './performance'

export interface PerformanceCalibrationTaskScope {
  scope_key: string
  project_id: number
  project_name: string
  node_id: string
  node_name: string
  phase_id: string | null
  source_rule_id: string | null
  task_number: number
  scope_label: string
  rule: PerformanceProjectFlowRule | null
  people_options?: Array<{ employee_no: string; display_name: string }>
  status: 'pending' | 'completed' | 'overdue'
  start_at: string | null
  end_at: string | null
  member_count: number
  can_complete: boolean
  blocked_reason?: PerformanceCalibrationCompletion['blocked_reason']
  read_only: boolean
  history_ambiguous?: boolean
}
export interface CalibrationPeopleQuery {
  keyword?: string
  page: number
  pageSize: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}
export type CalibrationMember = ProjectMember & { aggregate_task_id?: number | null; phase_id?: string | null; node_id: string; scope_key: string; status: string; due_at: string | null }
export function calibrationMember(scope: PerformanceCalibrationTaskScope, person: PerformanceWorkbenchTaskPerson): CalibrationMember {
  return { ...person, id: person.task_id, project_id: scope.project_id, node_id: scope.node_id, phase_id: scope.phase_id, scope_key: scope.scope_key, avatar_url: null, rating: person.rating ?? null, rating_tone: person.rating_tone ?? null, completion: person.completion ?? '0/0' }
}
export function calibrationReviewNode(scope: PerformanceCalibrationTaskScope): PerformanceReviewNode & { project_id: number; scope_key: string } {
  return { project_id: scope.project_id, scope_key: scope.scope_key, node_id: scope.node_id, node_name: scope.node_name, node_type: 'calibration', task_kind: 'calibration', executor_role_code: 'assessment.calibrator', executor_label: '校准人', phase_id: scope.phase_id, status: scope.status, start_at: scope.start_at, end_at: scope.end_at, editable: !scope.read_only, action_url: '/performance/review' }
}
const scopeParams = (scope: PerformanceCalibrationTaskScope) => ({ project_id: scope.project_id, scope_key: scope.scope_key, ...(scope.phase_id ? { phase_id: scope.phase_id } : {}) })
const completionPayload = (scope: PerformanceCalibrationTaskScope) => ({ node_id: scope.node_id, scope_key: scope.scope_key, ...(scope.phase_id ? { phase_id: scope.phase_id } : {}) })
export const performanceCalibrationApi = {
  async tasks(cycleId: number): Promise<{ tasks: PerformanceCalibrationTaskScope[]; pending_member_count: number }> {
    const { data } = await api.get('/performance/review/calibration-tasks', { params: { cycle_id: cycleId } })
    return data
  },
  async people(scope: PerformanceCalibrationTaskScope, query: CalibrationPeopleQuery): Promise<PerformanceWorkbenchTaskPeoplePage> {
    const { data } = await api.get<PerformanceWorkbenchTaskPeoplePage>(`/performance/workbench/tasks/${encodeURIComponent(scope.node_id)}/people`, { params: { ...scopeParams(scope), state: 'all', keyword: query.keyword, page: query.page, page_size: query.pageSize, sort_by: query.sortBy, sort_order: query.sortOrder } })
    return data
  },
  async members(scope: PerformanceCalibrationTaskScope, query: CalibrationPeopleQuery) {
    const data = await this.people(scope, query)
    return { ...data, items: data.items.map(person => calibrationMember(scope, person)) }
  },
  async distribution(scope: PerformanceCalibrationTaskScope): Promise<PerformanceDistributionTips> {
    const { data } = await api.get<PerformanceDistributionTips>(`/performance/workbench/tasks/${encodeURIComponent(scope.node_id)}/distribution-tips`, { params: scopeParams(scope) })
    return data
  },
  async preview(scope: PerformanceCalibrationTaskScope): Promise<PerformanceCalibrationCompletion> {
    const { data } = await api.post<PerformanceCalibrationCompletion>(`/performance/projects/${scope.project_id}/calibration-completion/preview`, completionPayload(scope))
    return data
  },
  async confirm(scope: PerformanceCalibrationTaskScope, scopeVersion: string): Promise<PerformanceCalibrationCompletion> {
    const { data } = await api.post<PerformanceCalibrationCompletion>(`/performance/projects/${scope.project_id}/calibration-completion/confirm`, { ...completionPayload(scope), scope_version: scopeVersion })
    return data
  },
}
