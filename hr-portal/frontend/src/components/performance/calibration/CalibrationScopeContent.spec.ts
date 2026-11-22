import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CalibrationScopeContent from './CalibrationScopeContent.vue'
import { performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import ProjectMemberListPanel from '../ProjectMemberListPanel.vue'
import PerformanceDistributionTips from '../PerformanceDistributionTips.vue'
vi.mock('@/api/performanceCalibration', async importOriginal => ({ ...await importOriginal<typeof import('@/api/performanceCalibration')>(), performanceCalibrationApi: { members: vi.fn(), distribution: vi.fn() } }))
const task = (key: string): PerformanceCalibrationTaskScope => ({ scope_key: key, project_id: key === 'A' ? 1 : 2, project_name: `项目${key}`, node_id: 'calibration', node_name: '校准', phase_id: `phase-${key}`, source_rule_id: `rule-${key}`, task_number: 1, scope_label: `范围${key}`, rule: null, status: 'pending', start_at: null, end_at: null, member_count: 1, can_complete: true, read_only: false })
const options = { global: { stubs: { ProjectMemberListPanel: { props: ['provider', 'reviewContext'], template: '<div><slot name="empty" /></div>' }, CalibrationTaskCompletion: true } } }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(performanceCalibrationApi.distribution).mockResolvedValue({ enabled: false, total_people: 1, rated_people: 0, rules: [], lines: [] }) })
describe('scoped member/content assembly', () => {
  it('binds provider, review context, and detail events to selected API task', async () => {
    const scope = task('A')
    const wrapper = mount(CalibrationScopeContent, { props: { scope, cycleId: 3, tab: 'members' }, ...options })
    const panel = wrapper.findComponent(ProjectMemberListPanel)
    const query = { page: 2, pageSize: 50, keyword: '成员' }
    await panel.props('provider')!(query)
    expect(performanceCalibrationApi.members).toHaveBeenLastCalledWith(scope, query)
    expect(panel.props('reviewContext')).toEqual({ nodeId: 'calibration', state: 'all', phaseId: 'phase-A' })
    const member = { employee_no: 'E1', task_id: 42, aggregate_task_id: 17, display_name: '成员', project_id: 1 }
    panel.vm.$emit('select-member', member)
    expect(wrapper.emitted('open-member')?.[0]?.[0]).toMatchObject({ member, node: { node_type: 'calibration', executor_role_code: 'assessment.calibrator', phase_id: 'phase-A', project_id: 1, scope_key: 'A' } })
    wrapper.unmount()
  })
  it('ignores late distribution from old task and reports failed distribution independently', async () => {
    let resolve: (value: any) => void = () => {}
    vi.mocked(performanceCalibrationApi.distribution).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = mount(CalibrationScopeContent, { props: { scope: task('A'), cycleId: 3, tab: 'members' }, ...options })
    vi.mocked(performanceCalibrationApi.distribution).mockRejectedValueOnce({ response: { status: 403 } })
    await wrapper.setProps({ scope: task('B') }); await flushPromises()
    resolve({ enabled: true, total_people: 99, rated_people: 99, rules: [], lines: [] }); await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('无权查看当前任务的分布')
    expect(wrapper.findComponent(PerformanceDistributionTips).exists()).toBe(false)
    wrapper.unmount()
  })
  it('labels absent analysis integration without rendering a success placeholder', () => {
    const wrapper = mount(CalibrationScopeContent, { props: { scope: task('A'), cycleId: 3, tab: 'matrix' }, ...options })
    expect(wrapper.text()).toContain('矩阵分析尚未接入当前校准任务')
    expect(wrapper.findComponent(ProjectMemberListPanel).exists()).toBe(false)
    wrapper.unmount()
  })
})
