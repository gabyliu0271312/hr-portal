import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CalibrationAllPeople from './CalibrationAllPeople.vue'
import ProjectMemberListPanel from '../ProjectMemberListPanel.vue'
import CalibrationScopeAnalysis from './CalibrationScopeAnalysis.vue'
import { performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'

const scope = (key: string, projectId = 1): PerformanceCalibrationTaskScope => ({ scope_key: key, project_id: projectId, project_name: '项目', node_id: 'calibration', node_name: '校准', phase_id: 'phase', source_rule_id: key, task_number: 1, scope_label: '项目全员', rule: null, status: 'pending', start_at: null, end_at: null, member_count: 1, can_complete: true, read_only: false })
const member = (projectId: number, scopeKey: string) => ({ id: projectId, task_id: projectId, project_id: projectId, node_id: 'calibration', phase_id: 'phase', scope_key: scopeKey, employee_no: 'E1', display_name: '同一员工', status: 'completed', due_at: null, avatar_url: null, rating: null, rating_tone: null, completion: '0/0', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null })
afterEach(() => vi.restoreAllMocks())

describe('all authorized calibration people', () => {
  it('renders only the selected existing member or aggregate analysis panel', async () => {
    const load = vi.spyOn(performanceCalibrationApi, 'members')
    const tasks = [scope('a'), scope('b', 2)]
    const wrapper = mount(CalibrationAllPeople, { props: { tasks, cycleId: 1 }, global: { stubs: { ProjectMemberListPanel: true, CalibrationScopeAnalysis: true } } })
    expect(wrapper.findComponent(ProjectMemberListPanel).exists()).toBe(true)
    expect(wrapper.getComponent(ProjectMemberListPanel).props('variant')).toBe('embedded')
    expect(wrapper.findComponent(CalibrationScopeAnalysis).exists()).toBe(false)
    await wrapper.setProps({ tab: 'matrix' })
    expect(wrapper.findComponent(ProjectMemberListPanel).exists()).toBe(false)
    const analysis = wrapper.getComponent(CalibrationScopeAnalysis)
    expect(analysis.props()).toMatchObject({ scopes: tasks, cycleId: 1, tab: 'matrix' })
    const payload = { node: { project_id: 2, node_id: 'calibration', phase_id: 'phase', scope_key: 'b' }, member: member(2, 'b') }
    analysis.vm.$emit('open-member', payload)
    expect(wrapper.emitted('open-member')?.[0]?.[0]).toEqual(payload)
    await wrapper.setProps({ tab: 'report' })
    expect(wrapper.getComponent(CalibrationScopeAnalysis).props('tab')).toBe('report')
    expect(load).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('deduplicates overlapping rules within one project while retaining another project and detail context', async () => {
    const scopes = [scope('a'), scope('b'), scope('c', 2)]
    vi.spyOn(performanceCalibrationApi, 'members').mockImplementation(async task => ({ items: [member(task.project_id, task.scope_key)], total: 1, rating_columns: [] }))
    const wrapper = mount(CalibrationAllPeople, { props: { tasks: scopes, cycleId: 1 }, global: { stubs: { ProjectMemberListPanel: true } } })
    const panel = wrapper.getComponent(ProjectMemberListPanel)
    const data = await panel.props('provider')!({ page: 1, pageSize: 50 })
    expect(data.items.map(row => row.project_id)).toEqual([1, 2])
    expect(data.total).toBe(2)
    panel.vm.$emit('select-member', data.items[1])
    expect(wrapper.emitted('open-member')?.[0]?.[0]).toMatchObject({ node: { node_type: 'calibration', project_id: 2, scope_key: 'c' }, member: { project_id: 2, employee_no: 'E1' } })
    expect(performanceCalibrationApi.members).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it('does not return a partial aggregation if a later scope fails or its total changes', async () => {
    const load = vi.spyOn(performanceCalibrationApi, 'members').mockResolvedValueOnce({ items: [member(1, 'a')], total: 1, rating_columns: [] }).mockRejectedValueOnce(new Error('scope revoked'))
    const wrapper = mount(CalibrationAllPeople, { props: { tasks: [scope('a'), scope('b')], cycleId: 1 }, global: { stubs: { ProjectMemberListPanel: true } } })
    await expect(wrapper.getComponent(ProjectMemberListPanel).props('provider')!({ page: 1, pageSize: 50 })).rejects.toThrow('scope revoked')
    load.mockReset().mockResolvedValueOnce({ items: [member(1, 'a')], total: 2, rating_columns: [] }).mockResolvedValueOnce({ items: [member(1, 'a')], total: 1, rating_columns: [] })
    await expect(wrapper.getComponent(ProjectMemberListPanel).props('provider')!({ page: 1, pageSize: 50 })).rejects.toThrow('CALIBRATION_PEOPLE_INCOMPLETE')
    wrapper.unmount()
  })

  it('rejects a late old-cycle aggregation after context changes', async () => {
    let resolve!: (value: any) => void
    vi.spyOn(performanceCalibrationApi, 'members').mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = mount(CalibrationAllPeople, { props: { tasks: [scope('a')], cycleId: 1 }, global: { stubs: { ProjectMemberListPanel: true } } })
    const pending = wrapper.getComponent(ProjectMemberListPanel).props('provider')!({ page: 1, pageSize: 50 })
    const rejected = expect(pending).rejects.toThrow('CALIBRATION_SCOPE_CHANGED')
    await wrapper.setProps({ cycleId: 2 })
    resolve({ items: [member(1, 'a')], total: 1, rating_columns: [] })
    await rejected
    await flushPromises()
    wrapper.unmount()
  })
})
