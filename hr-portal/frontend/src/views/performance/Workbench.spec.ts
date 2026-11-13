import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { performanceApi, performanceNavigationApi, performanceWorkbenchApi, type PerformanceNavigationContext, type PerformanceWorkbenchProject, type PerformanceWorkbenchTaskGroup, type PerformanceWorkbenchTimelineNode } from '@/api/performance'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import Workbench from './Workbench.vue'

const push = vi.fn()
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push, replace }),
}))

const projects: PerformanceWorkbenchProject[] = [
  { project_id: 1, project_name: '项目一', cycle_ref: 'cycle-1', cycle_name: '2025周期', cycle_start_at: '2025-01-01', cycle_end_at: '2025-12-31', project_status: 'STARTED' },
  { project_id: 2, project_name: '项目二', cycle_ref: 'cycle-2', cycle_name: '2026周期', cycle_start_at: '2026-01-01', cycle_end_at: '2026-12-31', project_status: 'STARTED' },
]
const timeline: PerformanceWorkbenchTimelineNode[] = [
  { node_id: 'summary', node_name: '工作总结', node_type: 'work_summary', node_order: 1, start_at: null, end_at: null, status: 'in_progress' },
]
const pending: PerformanceWorkbenchTaskGroup[] = [
  { task_id: 11, node_id: 'summary', node_type: 'work_summary', node_name: '工作总结', pending_count: 1, completed_count: 0, overdue_count: 0, available_at: null, due_at: null, action_url: '/performance/review' },
]

const navigationOf = (cycleId = 1, overrides: Partial<PerformanceNavigationContext> = {}): PerformanceNavigationContext => ({
  cycles: [
    { cycle_id: 1, cycle_name: '2025周期', cycle_start_at: '2025-01-01', cycle_end_at: '2025-12-31' },
    { cycle_id: 2, cycle_name: '2026周期', cycle_start_at: '2026-01-01', cycle_end_at: '2026-12-31' },
  ],
  active_cycle: cycleId ? { cycle_id: cycleId, cycle_name: cycleId === 1 ? '2025周期' : '2026周期', cycle_start_at: cycleId === 1 ? '2025-01-01' : '2026-01-01', cycle_end_at: cycleId === 1 ? '2025-12-31' : '2026-12-31' } : null,
  can_review: true,
  can_manage: true,
  review_projects: [],
  ...overrides,
})

let pinia: Pinia
function mountView() {
  return mount(Workbench, {
    global: {
      plugins: [pinia],
      stubs: {
        'el-dropdown': { template: '<div><slot /><button class="select-cycle-two" @click="$emit(\'command\', 2)">切换周期</button><slot name="dropdown" /></div>', emits: ['command'] },
        'el-select': { template: '<button class="select-project-one" @click="$emit(\'change\', 1)">切换项目</button>', emits: ['change'] },
        'el-option': { template: '<span />', props: ['label', 'value'] },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<div><slot /></div>', props: ['command'] },
        'el-icon': { template: '<span><slot /></span>' },
        'el-button': { template: '<button><slot /></button>' },
      },
    },
  })
}

describe('PerformanceWorkbench project context', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    push.mockReset()
    replace.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(performanceApi, 'getAccessContext').mockResolvedValue({
      subject_type: 'PORTAL_USER',
      subject_id: 1,
      display_name: '测试用户',
      account_type: null,
      portal_entry_permissions: ['performance.app'],
      permission_codes: [],
      dev_admin_debug: false,
    })
    vi.spyOn(performanceNavigationApi, 'get').mockImplementation(async (cycleId) => navigationOf(cycleId || 1))
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigationOf(1))
    vi.spyOn(performanceWorkbenchApi, 'listProjects').mockImplementation(async (_keyword, cycleId) => cycleId === 2 ? [projects[1]] : [projects[0]])
    vi.spyOn(performanceWorkbenchApi, 'timeline').mockResolvedValue(timeline)
    vi.spyOn(performanceWorkbenchApi, 'tasks').mockImplementation(async (_projectId, state) => state === 'pending' ? pending : [])
    vi.spyOn(performanceWorkbenchApi, 'announcements').mockResolvedValue({ announcement_enabled: true, items: [] })
  })

  it.each(['pending', 'completed'] as const)('routes every %s todo to its exact submenu without opening a task', async (state) => {
    const nodes = [
      ['summary', 'work_summary', 'assessment.reviewee'],
      ['self', 'evaluation', 'assessment.reviewee'],
      ['manager', 'evaluation', 'assessment.line_manager'],
      ['manager-2', 'evaluation', 'assessment.dotted_manager'],
      ['invite', 'reviewer_360_invite', 'assessment.reviewee'],
      ['confirm', 'reviewer_360_confirm', 'assessment.line_manager'],
      ['feedback', 'evaluation', 'assessment.reviewer_360'],
      ['calibration', 'calibration', 'assessment.calibrator'],
      ['communication', 'result_communication', 'assessment.line_manager'],
      ['appeal', 'result_reconsideration', 'assessment.line_manager'],
      ['custom & node', 'evaluation', 'assessment.metric_evaluator'],
    ]
    const todos = nodes.map(([node_id, node_type, executor_role_code], index) => ({
      ...pending[0], node_id, node_type, executor_role_code, task_id: index + 20,
      action_url: `/performance/review?node=${node_id}`,
    }))
    vi.mocked(performanceWorkbenchApi.tasks).mockImplementation(async (_projectId, requestedState) => requestedState === state ? todos : [])
    const wrapper = mountView()
    await flushPromises()
    if (state === 'completed') await wrapper.findAll('.todo-tabs button')[1].trigger('click')
    const links = wrapper.findAll('.todo-item')
    expect(links).toHaveLength(nodes.length)
    for (const [index, link] of links.entries()) {
      const url = new URL(link.attributes('href')!, 'http://localhost')
      expect(url.pathname).toBe('/performance/review')
      expect(Object.fromEntries(url.searchParams)).toEqual({ cycle_id: '1', project_id: '1', node: nodes[index][0] })
      await link.trigger('click')
      expect(push).toHaveBeenLastCalledWith(`${url.pathname}${url.search}`)
    }
    push.mockClear()
    await links[0].trigger('click', { ctrlKey: true })
    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps the active cycle and project for both result entry points', async () => {
    vi.mocked(performanceWorkbenchApi.listProjects).mockResolvedValue([{ ...projects[1], result_published: true }])
    const context = usePerformanceProjectContextStore()
    context.setActiveCycleId(2)
    context.setActiveProjectId(2)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.quick-link').trigger('click')
    expect(push).toHaveBeenLastCalledWith({ name: 'PerformanceReview', query: { entry: 'results', cycle_id: '2', project_id: '2' } })
    await wrapper.get('.result-card button').trigger('click')
    expect(push).toHaveBeenLastCalledWith({ name: 'PerformanceReview', query: { entry: 'results', cycle_id: '2', project_id: '2' } })
    wrapper.unmount()
  })

  it('uses the project and cycle selected in performance review and keeps them in the URL', async () => {
    const context = usePerformanceProjectContextStore()
    context.setActiveCycleId(2)
    context.setActiveProjectId(2)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('.cycle-picker-text').text()).toBe('2026周期')
    expect(performanceWorkbenchApi.timeline).toHaveBeenCalledWith(2)
    expect(replace).toHaveBeenLastCalledWith({ query: { cycle_id: '2', project_id: '2' } })
    expect(wrapper.findAll('.timeline-node')).toHaveLength(1)
    expect(wrapper.get('.timeline-node').classes()).toContain('current')
  })

  it('marks timeline nodes from their time window, not from task state', async () => {
    vi.mocked(performanceWorkbenchApi.timeline).mockResolvedValue([
      { node_id: 'past', node_name: '已结束节点', node_type: 'work_summary', node_order: 1, start_at: '2026-01-01T00:00:00Z', end_at: '2026-02-01T00:00:00Z', status: 'ended' },
      { node_id: 'future', node_name: '未开始节点', node_type: 'evaluation', node_order: 2, start_at: '2026-12-01T00:00:00Z', end_at: '2027-01-01T00:00:00Z', status: 'not_started' },
    ])
    const wrapper = mountView()
    await flushPromises()

    const nodes = wrapper.findAll('.timeline-node')
    expect(nodes).toHaveLength(2)
    expect(nodes[0].classes()).toContain('ended')
    expect(nodes[1].classes()).not.toContain('ended')
    expect(nodes[1].classes()).not.toContain('current')
  })

  it('renders announcements returned by workbench settings for the active cycle', async () => {
    const context = usePerformanceProjectContextStore()
    context.setActiveCycleId(2)
    context.setActiveProjectId(2)
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValue({
      announcement_enabled: true,
      items: [{ id: 7, title: '绩效面谈指引', link: '/performance/review', cycle_label: '所有周期', require_ack: false, display_order: 0, updated_at: '2026-09-22T00:00:00Z' }],
    })
    const wrapper = mountView()
    await flushPromises()

    expect(performanceWorkbenchApi.announcements).toHaveBeenCalledWith('cycle-2')
    expect(wrapper.get('.announcement-link').text()).toContain('绩效面谈指引')
  })

  it('hides the announcement card when settings disable announcements', async () => {
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValue({ announcement_enabled: false, items: [] })
    const wrapper = mountView()
    await flushPromises()

    expect(performanceWorkbenchApi.announcements).toHaveBeenCalledWith('cycle-1')
    expect(wrapper.find('.announcement-card').exists()).toBe(false)
  })

  it('updates the shared project when the workbench selector changes', async () => {
    const context = usePerformanceProjectContextStore()
    vi.mocked(performanceWorkbenchApi.listProjects).mockResolvedValue(projects)
    context.setActiveProjectId(2)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.select-project-one').trigger('click')
    await flushPromises()

    expect(context.activeProjectId).toBe(1)
    expect(replace).toHaveBeenLastCalledWith({ query: { project_id: '1' } })
    expect(performanceWorkbenchApi.timeline).toHaveBeenCalledWith(1)
  })

  it('shows cached todos immediately while the project list refresh is pending', async () => {
    const context = usePerformanceProjectContextStore()
    context.setActiveProjectId(1)
    context.setWorkbenchProjects([projects[0]])
    context.setWorkbenchSnapshot(1, { timeline, pending, completed: [] })
    vi.mocked(performanceWorkbenchApi.listProjects).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    expect(wrapper.findAll('.todo-item')).toHaveLength(1)
    await flushPromises()
    expect(wrapper.get('.todo-name').text()).toBe('工作总结')
    wrapper.unmount()
  })

  it('renders the timeline as soon as it resolves even when pending tasks never resolve', async () => {
    let resolveTimeline!: (value: PerformanceWorkbenchTimelineNode[]) => void
    vi.mocked(performanceWorkbenchApi.timeline).mockReturnValue(new Promise(resolve => { resolveTimeline = resolve }))
    vi.mocked(performanceWorkbenchApi.tasks).mockImplementation(async (_projectId, state) => state === 'pending' ? new Promise(() => {}) : [])
    const wrapper = mountView()
    await flushPromises()
    resolveTimeline(timeline)
    await flushPromises()
    expect(wrapper.findAll('.timeline-node')).toHaveLength(1)
    expect(wrapper.get('.timeline-node').text()).toContain('工作总结')
    wrapper.unmount()
  })

  it('loads project data without waiting for announcements and isolates failed sections', async () => {
    vi.mocked(performanceWorkbenchApi.announcements).mockReturnValue(new Promise(() => {}))
    vi.mocked(performanceWorkbenchApi.timeline).mockRejectedValue(new Error('timeline'))
    const wrapper = mountView()
    await flushPromises()
    expect(performanceWorkbenchApi.tasks).toHaveBeenCalledWith(1, 'pending')
    expect(wrapper.findAll('.todo-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('部分工作台数据加载失败')
    wrapper.unmount()
  })

  it('drops an older cycle project response after switching cycles', async () => {
    let resolveFirst!: (value: PerformanceWorkbenchTimelineNode[]) => void
    vi.mocked(performanceWorkbenchApi.timeline).mockImplementation(projectId => projectId === 1
      ? new Promise(resolve => { resolveFirst = resolve })
      : Promise.resolve([{ ...timeline[0], node_name: '新周期节点' }]))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.select-cycle-two').trigger('click')
    await flushPromises()
    resolveFirst([{ ...timeline[0], node_name: '旧周期节点' }])
    await flushPromises()
    expect(wrapper.text()).toContain('新周期节点')
    expect(wrapper.text()).not.toContain('旧周期节点')
    expect(usePerformanceProjectContextStore().workbenchSnapshot(1)).toBeNull()
    wrapper.unmount()
  })

  it('switches the shared cycle from the workbench selector and reloads that cycle projects', async () => {
    const context = usePerformanceProjectContextStore()
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.select-cycle-two').trigger('click')
    await flushPromises()

    expect(context.activeCycleId).toBe(2)
    expect(performanceNavigationApi.get).toHaveBeenCalledWith(2)
    expect(performanceWorkbenchApi.listProjects).toHaveBeenLastCalledWith(undefined, 2)
    expect(wrapper.get('.cycle-picker-text').text()).toBe('2026周期')
  })
})
