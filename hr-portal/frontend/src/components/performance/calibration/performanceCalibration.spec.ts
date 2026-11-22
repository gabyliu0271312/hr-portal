import { describe, expect, it, vi } from 'vitest'
import { calibrationMember, calibrationReviewNode, performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import { api } from '@/api/client'
vi.mock('@/api/client', () => ({ api: { get: vi.fn(), post: vi.fn() } }))
const scope: PerformanceCalibrationTaskScope = { scope_key: 'scope-1', project_id: 8, project_name: '项目A', node_id: 'review/calibrate', node_name: '校准', phase_id: 'phase-1', source_rule_id: 'rule-1', task_number: 3, scope_label: '项目全员', rule: null, status: 'pending', start_at: null, end_at: null, member_count: 2, can_complete: true, read_only: false }
describe('calibration scoped API adapter', () => {
  it('retains stable runtime role and exact project/node/phase/scope for review details', () => {
    expect(calibrationReviewNode(scope)).toMatchObject({ node_type: 'calibration', task_kind: 'calibration', executor_role_code: 'assessment.calibrator', project_id: 8, node_id: 'review/calibrate', phase_id: 'phase-1', scope_key: 'scope-1' })
  })
  it('passes scope before server paging and sorting; maps fields without dropping schema', async () => {
    const page = { items: [{ task_id: 17, employee_no: 'E1', display_name: '甲', status: 'pending', due_at: null, column_values: { 'rating:item': 'A' }, ratings: { 'rating:item': { label: 'A' } }, visible_profile_fields: ['department'] }], total: 90, rating_columns: [{ key: 'rating:item', label: '等级' }], allowed_column_keys: ['name'] }
    vi.mocked(api.get).mockResolvedValueOnce({ data: page })
    const result = await performanceCalibrationApi.members(scope, { page: 2, pageSize: 50, keyword: '甲', sortBy: 'name', sortOrder: 'asc' })
    expect(api.get).toHaveBeenLastCalledWith('/performance/workbench/tasks/review%2Fcalibrate/people', { params: { project_id: 8, scope_key: 'scope-1', phase_id: 'phase-1', state: 'all', page: 2, page_size: 50, keyword: '甲', sort_by: 'name', sort_order: 'asc' } })
    expect(result.allowed_column_keys).toEqual(['name'])
    expect(result.items[0]).toMatchObject({ id: 17, task_id: 17, project_id: 8, node_id: scope.node_id, phase_id: scope.phase_id, scope_key: scope.scope_key, column_values: page.items[0].column_values, ratings: page.items[0].ratings })
  })
  it('binds completion to a single task and confirmed scope version', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { completed: true } })
    await performanceCalibrationApi.preview(scope)
    expect(api.post).toHaveBeenLastCalledWith('/performance/projects/8/calibration-completion/preview', { node_id: scope.node_id, phase_id: scope.phase_id, scope_key: scope.scope_key })
    await performanceCalibrationApi.confirm(scope, 'version-A')
    expect(api.post).toHaveBeenLastCalledWith('/performance/projects/8/calibration-completion/confirm', { node_id: scope.node_id, phase_id: scope.phase_id, scope_key: scope.scope_key, scope_version: 'version-A' })
  })
})
