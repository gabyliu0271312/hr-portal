import { mount, flushPromises } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import { createRouter, createMemoryHistory } from 'vue-router'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import PerformanceCalibrationWorkspace from './PerformanceCalibrationWorkspace.vue'
import CalibrationSingleTask from './CalibrationSingleTask.vue'
import CalibrationTaskHome from './CalibrationTaskHome.vue'
import CalibrationScopeContent from './CalibrationScopeContent.vue'
import CalibrationTaskSidebar from './CalibrationTaskSidebar.vue'
import { performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import { api } from '@/api/client'
import { performanceWorkbenchApi } from '@/api/performance'
import PerformanceReviewContent from '../PerformanceReviewContent.vue'
import PerformanceReviewScopeAnalysis from '../PerformanceReviewScopeAnalysis.vue'
import ProjectMemberListPanel from '../ProjectMemberListPanel.vue'
import CalibrationScopeAnalysis from './CalibrationScopeAnalysis.vue'
vi.mock('@/api/performanceCalibration', async importOriginal => {
  const original = await importOriginal<typeof import('@/api/performanceCalibration')>()
  return { ...original, performanceCalibrationApi: { ...original.performanceCalibrationApi, tasks: vi.fn() } }
})
const task = (key: string, project = 1): PerformanceCalibrationTaskScope => ({ scope_key: key, project_id: project, project_name: `项目${project}`, node_id: 'calibration', node_name: '校准', phase_id: `phase-${key}`, source_rule_id: `rule-${key}`, task_number: 3, scope_label: `范围${key}`, rule: { scope: 'PROJECT_ALL' } as any, status: 'pending', start_at: null, end_at: null, member_count: 1, can_complete: true, read_only: false })
const a = task('a'), b = task('b', 2)
async function setup(path = '/performance/review?calibration_filter=pending', slots = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/performance/review', component: { template: '<div />' } }] })
  await router.push(path); await router.isReady()
  const wrapper = mount(PerformanceCalibrationWorkspace, { attachTo: document.body, props: { cycleId: 1 }, slots, global: { plugins: [router, createPinia()], stubs: { CalibrationSingleTask: { props: ['scope', 'cycleId'], template: '<div class="single-task-stub" />' }, CalibrationScopeContent: { props: ['scope', 'cycleId', 'tab'], template: '<div class="scope-stub"><slot name="matrix" :scope="scope" /><slot name="report" :scope="scope" /></div>' } } } })
  await flushPromises()
  return { wrapper, router }
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(performanceCalibrationApi.tasks).mockResolvedValue({ tasks: [a, b], pending_member_count: 2 }) })
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })
describe('single calibration real content analysis routing', () => {
  const page = { items: [{ task_id: 1, employee_no: 'E1', display_name: '成员1', status: 'pending', due_at: null, ratings: { 'rating:grade': { label: '达预期' } } }], total: 1, rating_columns: [{ key: 'rating:grade', label: '绩效评级' }] }
  const mountSingle = () => mount(CalibrationSingleTask, { props: { scope: a, cycleId: 1 }, global: { stubs: { ProjectMemberListPanel: true, CalibrationTaskCompletion: true, ProjectPerformanceMatrix: { name: 'ProjectPerformanceMatrix', props: ['provider'], template: '<div class="scoped-matrix" />' }, ProjectStatisticsReportPanel: { name: 'ProjectStatisticsReportPanel', props: ['provider', 'allowExamples', 'allowComments'], template: '<div class="scoped-report" />' } } } })
  const selectTab = async (wrapper: ReturnType<typeof mountSingle>, label: string) => {
    const tab = wrapper.findAll('[role="tab"]').find(tab => tab.text() === label)
    expect(tab).toBeTruthy()
    await tab!.trigger('click'); await flushPromises()
  }
  beforeEach(() => {
    vi.spyOn(performanceWorkbenchApi, 'taskDistributionTips').mockResolvedValue({ enabled: false, total_people: 1, rated_people: 1, rules: [], lines: [] })
  })

  it('routes members, matrix and reports through the exact calibration scope, not review analysis', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: page })
    const wrapper = mountSingle(); await flushPromises()
    expect(wrapper.findComponent(PerformanceReviewContent).exists()).toBe(true)
    const provider = wrapper.getComponent(ProjectMemberListPanel).props('provider')!
    await provider({ page: 2, pageSize: 20, keyword: '成员', sortBy: 'employee_no', sortOrder: 'desc' })
    expect(get).toHaveBeenLastCalledWith('/performance/workbench/tasks/calibration/people', expect.objectContaining({ params: expect.objectContaining({ project_id: 1, scope_key: 'a', phase_id: 'phase-a', state: 'all', page: 2, page_size: 20, keyword: '成员', sort_by: 'employee_no', sort_order: 'desc' }) }))
    get.mockClear()
    await selectTab(wrapper, '矩阵分析')
    expect(wrapper.getComponent(CalibrationScopeAnalysis).props()).toMatchObject({ scope: a, cycleId: 1, tab: 'matrix' })
    expect(wrapper.find('.scoped-matrix').exists()).toBe(true)
    const matrix = await wrapper.getComponent({ name: 'ProjectPerformanceMatrix' }).props('provider')()
    expect(matrix.total).toBe(1)
    await selectTab(wrapper, '统计报表')
    expect(wrapper.getComponent(CalibrationScopeAnalysis).props('tab')).toBe('report')
    expect(wrapper.find('.scoped-report').exists()).toBe(true)
    expect(wrapper.getComponent({ name: 'ProjectStatisticsReportPanel' }).props('allowExamples')).toBe(false)
    expect(wrapper.getComponent({ name: 'ProjectStatisticsReportPanel' }).props('allowComments')).toBe(false)
    expect(wrapper.findComponent(PerformanceReviewScopeAnalysis).exists()).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith('/performance/workbench/tasks/calibration/people', expect.objectContaining({ params: { project_id: 1, phase_id: 'phase-a', scope_key: 'a', state: 'all', page: 1, page_size: 100 }, signal: expect.any(AbortSignal) }))
    wrapper.unmount()
  })

  it('shows scoped 403 on either analysis tab without falling back to general analysis', async () => {
    const get = vi.spyOn(api, 'get').mockRejectedValue({ response: { status: 403 } })
    const wrapper = mountSingle(); await flushPromises()
    await selectTab(wrapper, '矩阵分析')
    expect(wrapper.get('[role="alert"]').text()).toContain('无权查看当前校准范围的分析数据')
    await selectTab(wrapper, '统计报表')
    expect(wrapper.get('[role="alert"]').text()).toContain('无权查看当前校准范围的分析数据')
    expect(wrapper.findComponent(PerformanceReviewScopeAnalysis).exists()).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls.every(([url]) => url === '/performance/workbench/tasks/calibration/people')).toBe(true)
    wrapper.unmount()
  })

  it('destroys prior analysis on identity change and ignores its late response', async () => {
    let resolveOld!: (value: { data: typeof page }) => void
    const get = vi.spyOn(api, 'get').mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValue({ data: { ...page, items: [], total: 0 } })
    const wrapper = mountSingle(); await flushPromises()
    await selectTab(wrapper, '统计报表')
    const oldAnalysis = wrapper.getComponent(CalibrationScopeAnalysis).vm
    const oldSignal = get.mock.calls[0][1]!.signal!
    employeeSwitchEpoch.value++; await flushPromises()
    expect(wrapper.getComponent(CalibrationScopeAnalysis).vm).not.toBe(oldAnalysis)
    expect(oldSignal.aborted).toBe(true)
    resolveOld({ data: page }); await flushPromises()
    expect(wrapper.text()).toContain('当前合法校准范围暂无可用分析数据')
    expect(wrapper.find('.scoped-report').exists()).toBe(false)
    expect(get.mock.calls.every(([url, config]) => url === '/performance/workbench/tasks/calibration/people' && config?.params.scope_key === 'a')).toBe(true)
    wrapper.unmount()
  })

  it('replaces scope and ignores a late response while retaining the active analysis tab', async () => {
    let resolveOld!: (value: { data: typeof page }) => void
    const get = vi.spyOn(api, 'get').mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValue({ data: { ...page, items: [], total: 0 } })
    const wrapper = mountSingle(); await flushPromises()
    await selectTab(wrapper, '矩阵分析')
    const oldSignal = get.mock.calls[0][1]!.signal!
    await wrapper.setProps({ scope: { ...b, node_id: a.node_id, phase_id: a.phase_id } }); await flushPromises()
    expect(oldSignal.aborted).toBe(true)
    expect(get).toHaveBeenLastCalledWith('/performance/workbench/tasks/calibration/people', expect.objectContaining({ params: expect.objectContaining({ project_id: 2, scope_key: 'b', phase_id: 'phase-a' }) }))
    resolveOld({ data: page }); await flushPromises()
    expect(wrapper.text()).toContain('当前合法校准范围暂无可用分析数据')
    expect(wrapper.find('.scoped-matrix').exists()).toBe(false)
    await selectTab(wrapper, '成员列表')
    const provider = wrapper.getComponent(ProjectMemberListPanel).props('provider')!
    await provider({ page: 1, pageSize: 20 })
    expect(get).toHaveBeenLastCalledWith('/performance/workbench/tasks/calibration/people', expect.objectContaining({ params: expect.objectContaining({ project_id: 2, scope_key: 'b', phase_id: 'phase-a' }) }))
    wrapper.unmount()
  })
})

describe('calibration workspace route and scope isolation', () => {
  it.each(['pending', 'completed', 'overdue'] as const)('keeps the existing direct single-task UI for %s, including old fullscreen links', async status => {
    vi.mocked(performanceCalibrationApi.tasks).mockResolvedValueOnce({ tasks: [{ ...a, status }], pending_member_count: 1 })
    const { wrapper } = await setup('/performance/review?calibration_open=1&calibration_scope=a&calibration_filter=completed')
    expect(wrapper.findComponent(CalibrationSingleTask).props('scope')).toMatchObject({ scope_key: 'a', status })
    expect(wrapper.findComponent(CalibrationTaskHome).exists()).toBe(false)
    expect(document.querySelector('.calibration-fullscreen')).toBeNull()
    wrapper.unmount()
  })
  it('does not change multi-task mode when a status filter leaves one task', async () => {
    vi.mocked(performanceCalibrationApi.tasks).mockResolvedValueOnce({ tasks: [a, { ...b, status: 'completed' }], pending_member_count: 1 })
    const { wrapper } = await setup('/performance/review?calibration_filter=pending')
    expect(wrapper.findComponent(CalibrationTaskHome).exists()).toBe(true)
    expect(wrapper.findComponent(CalibrationSingleTask).exists()).toBe(false)
    expect(wrapper.findAll('[data-scope]')).toHaveLength(1)
    wrapper.unmount()
  })
  it('keeps an invalid single-task scope link rejected instead of widening to the sole valid task', async () => {
    vi.mocked(performanceCalibrationApi.tasks).mockResolvedValueOnce({ tasks: [a], pending_member_count: 1 })
    const { wrapper } = await setup('/performance/review?calibration_open=1&calibration_scope=forged')
    expect(wrapper.findComponent(CalibrationSingleTask).exists()).toBe(false)
    expect(document.body.textContent).toContain('此校准任务已失效')
    wrapper.unmount()
  })
  it('restores direct fullscreen scope/tab and passes exact API scope into analysis slots', async () => {
    const { wrapper } = await setup('/performance/review?calibration_open=1&calibration_scope=b&calibration_tab=matrix', { matrix: '<p class="scope-slot">矩阵插槽</p>' })
    const content = wrapper.findComponent(CalibrationScopeContent)
    expect(content.props()).toMatchObject({ scope: b, cycleId: 1, tab: 'matrix' })
    expect(document.querySelector('.scope-slot')).not.toBeNull()
    wrapper.unmount()
  })
  it('opens from real task trigger, preserves filter on Escape return and restores focus', async () => {
    const { wrapper, router } = await setup()
    const trigger = wrapper.find('.rule-summary')
    ;(trigger.element as HTMLElement).focus()
    await trigger.trigger('click'); await flushPromises()
    expect(router.currentRoute.value.query).toMatchObject({ calibration_open: '1', calibration_scope: 'a', calibration_filter: 'pending' })
    const panel = document.querySelector<HTMLElement>('.performance-dialog')!
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(router.currentRoute.value.query.calibration_open).toBeUndefined()
    expect(router.currentRoute.value.query.calibration_filter).toBe('pending')
    expect(document.activeElement).toBe(trigger.element)
    wrapper.unmount()
  })
  it('shows a visible return action and ignores fullscreen Escape while a scope submission is busy', async () => {
    const { wrapper, router } = await setup('/performance/review?calibration_open=1&calibration_scope=a')
    expect(document.querySelector('.performance-dialog__header')?.textContent).toContain('返回')
    expect(document.querySelector('.calibration-workspace-dialog .performance-dialog__close')).toBeNull()
    expect(document.querySelector('.calibration-back')).not.toBeNull()
    wrapper.findComponent(CalibrationScopeContent).vm.$emit('busy', true); await flushPromises()
    const panel = document.querySelector<HTMLElement>('.performance-dialog')!
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
    expect(router.currentRoute.value.query.calibration_open).toBe('1')
    wrapper.findComponent(CalibrationScopeContent).vm.$emit('busy', false); await flushPromises()
    const back = [...document.querySelectorAll<HTMLButtonElement>('.performance-dialog__header button')].find(button => button.textContent?.trim() === '返回')!
    back.click(); await flushPromises()
    expect(router.currentRoute.value.query.calibration_open).toBeUndefined()
    wrapper.unmount()
  })
  it('selects tasks from their entire navigation item and keyboard, not only the range label', async () => {
    const { wrapper, router } = await setup('/performance/review?calibration_open=1&calibration_scope=a')
    const sidebar = wrapper.getComponent(CalibrationTaskSidebar)
    await sidebar.findAll('.calibration-task-nav__task')[1].find('small').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.query.calibration_scope).toBe('b')
    await sidebar.findAll('.calibration-task-nav__task')[0].trigger('keydown', { key: 'Enter' }); await flushPromises()
    expect(router.currentRoute.value.query.calibration_scope).toBe('a')
    await sidebar.findAll('.calibration-task-nav__task')[1].find('.rule-summary').trigger('click'); await flushPromises()
    expect(sidebar.emitted('select')).toEqual([['b'], ['a'], ['b']])
    wrapper.unmount()
  })
  it('keeps three aggregate tabs in the route without displaying completion or distribution', async () => {
    const { wrapper, router } = await setup('/performance/review?calibration_open=1&calibration_scope=__all__', { 'all-people': '<p class="all-slot">聚合成员</p>' })
    const tabs = [...document.querySelectorAll<HTMLButtonElement>('.calibration-fullscreen [role="tab"]')]
    expect(tabs.map(tab => tab.textContent)).toEqual(['成员列表', '矩阵分析', '统计报表'])
    tabs[1].click(); await flushPromises()
    expect(router.currentRoute.value.query.calibration_tab).toBe('matrix')
    tabs[2].click(); await flushPromises()
    expect(router.currentRoute.value.query.calibration_tab).toBe('report')
    expect(wrapper.findComponent(CalibrationScopeContent).exists()).toBe(false)
    expect(document.body.textContent).not.toContain('完成校准')
    expect(document.body.textContent).not.toContain('强制分布')
    wrapper.unmount()
  })
  it('selects aggregate slot using only authorized tasks and never displays task completion', async () => {
    const { wrapper, router } = await setup('/performance/review?calibration_open=1&calibration_scope=a', { 'all-people': '<p class="all-slot">聚合成员</p>' })
    wrapper.findComponent(CalibrationTaskSidebar).vm.$emit('select', '__all__'); await flushPromises()
    expect(router.currentRoute.value.query.calibration_scope).toBe('__all__')
    expect(document.body.textContent).toContain('聚合成员')
    expect(wrapper.findComponent(CalibrationScopeContent).exists()).toBe(false)
    wrapper.unmount()
  })
  it('drops old tasks immediately during identity changes and ignores late prior-cycle response', async () => {
    const { wrapper } = await setup()
    let resolveOld: (value: any) => void = () => {}
    vi.mocked(performanceCalibrationApi.tasks).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve }))
    await wrapper.setProps({ cycleId: 2 })
    expect(wrapper.findComponent(CalibrationTaskHome).exists()).toBe(false)
    vi.mocked(performanceCalibrationApi.tasks).mockResolvedValueOnce({ tasks: [b], pending_member_count: 1 })
    employeeSwitchEpoch.value++; await flushPromises()
    resolveOld({ tasks: [a], pending_member_count: 99 }); await flushPromises()
    expect(wrapper.findComponent(CalibrationSingleTask).props('scope')).toEqual(b)
    expect(wrapper.findComponent(CalibrationTaskHome).exists()).toBe(false)
    wrapper.unmount()
  })
  it('uses the real cycle name and shared minute-level Shanghai time in task navigation', async () => {
    vi.mocked(performanceCalibrationApi.tasks).mockResolvedValueOnce({ tasks: [{ ...a, end_at: '2026-11-22T01:02:59Z' }, b], pending_member_count: 2 })
    const { wrapper } = await setup('/performance/review?calibration_open=1&calibration_scope=a')
    const context = usePerformanceProjectContextStore()
    context.cycles = [{ cycle_id: 1, cycle_name: '2026年度绩效', cycle_start_at: '', cycle_end_at: '' }]
    await flushPromises()
    const sidebar = wrapper.findComponent(CalibrationTaskSidebar)
    expect(sidebar.text()).toContain('2026年度绩效')
    expect(sidebar.text()).toContain('2026-11-22 09:02（GMT+8）')
    expect(sidebar.text()).not.toContain('09:02:59')
    wrapper.unmount()
  })
  it('keeps forged scope unavailable and does not fall back to a wider valid task', async () => {
    const { wrapper } = await setup('/performance/review?calibration_open=1&calibration_scope=forged')
    expect(document.body.textContent).toContain('此校准任务已失效或你没有访问权限')
    expect(wrapper.findComponent(CalibrationScopeContent).exists()).toBe(false)
    wrapper.unmount()
  })
})
