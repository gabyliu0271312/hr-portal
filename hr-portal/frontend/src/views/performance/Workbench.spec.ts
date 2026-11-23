import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { performanceApi, performanceNavigationApi, performanceWorkbenchApi, type PerformanceNavigationContext, type PerformanceWorkbenchProject, type PerformanceWorkbenchTaskGroup, type PerformanceWorkbenchTimelineNode } from '@/api/performance'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import Workbench from './Workbench.vue'
import WorkbenchAnnouncementAckDialog from '@/components/performance/WorkbenchAnnouncementAckDialog.vue'

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
  it.each([
    ['普通员工', false, false, [], null],
    ['管理者', true, false, [], null],
    ['HRBP', false, false, ['hrbp'], 'hrbp'],
    ['项目管理员', false, false, ['project_admin'], 'project_admin'],
    ['双角色', false, false, ['project_admin', 'hrbp'], 'hrbp'],
    ['管理者兼HRBP及关注人', true, true, ['hrbp'], 'hrbp'],
    ['仅关注结果资格', false, true, [], null],
  ] as const)('按%s资格显示入口并精确跳转周期目标', async (_label, team, focus, roles, role) => {
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigationOf(1, { can_view_team_results: team, can_view_focus_results: focus, management_roles: [...roles] }))
    context.setActiveProjectId(99)
    const wrapper = mountView()
    await flushPromises()
    const groups = wrapper.findAll('.quick-group')
    expect(groups.map(group => group.get('.quick-group-label').text())).toEqual([
      '我的绩效', ...(focus ? ['重点关注人员'] : []), ...(team ? ['我管理的团队'] : []), ...(role ? ['我支持的团队'] : []),
    ])
    for (const [label, node] of [['重点关注人员', '__focus-results__'], ['我管理的团队', '__team-results__']]) {
      const group = groups.find(item => item.get('.quick-group-label').text() === label)
      if (!group) continue
      await group.get('button').trigger('click')
      expect(push).toHaveBeenLastCalledWith({ name: 'PerformanceReview', query: { cycle_id: '1', node, tab: 'members' } })
    }
    if (role) {
      const links = groups.find(item => item.text().includes('我支持的团队'))!.findAll('button')
      for (const [index, tab] of ['overview', 'members'].entries()) {
        await links[index].trigger('click')
        expect(push).toHaveBeenLastCalledWith({ name: 'PerformanceProjectManagement', query: { cycle_id: '1', management_role: role, tab } })
      }
    }
    wrapper.unmount()
  })

  it('切周期加载及失败时不沿用旧快捷入口权限', async () => {
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigationOf(1, { can_view_team_results: true, can_view_focus_results: true, management_roles: ['hrbp'] }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('.quick-group')).toHaveLength(4)
    let rejectNavigation!: (cause: Error) => void
    vi.mocked(performanceNavigationApi.get).mockReturnValueOnce(new Promise((_resolve, reject) => { rejectNavigation = reject }))
    await wrapper.get('.select-cycle-two').trigger('click')
    expect(wrapper.findAll('.quick-group')).toHaveLength(1)
    rejectNavigation(new Error('navigation failed'))
    await flushPromises()
    expect(wrapper.findAll('.quick-group')).toHaveLength(1)
    context.resetIdentity()
    await flushPromises()
    expect(wrapper.findAll('.quick-group')).toHaveLength(1)
    wrapper.unmount()
  })

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
    vi.spyOn(performanceWorkbenchApi, 'acknowledge').mockResolvedValue({ acknowledged: true })
    vi.spyOn(performanceWorkbenchApi, 'announcementImage').mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
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

  it('covers all cycle projects without a project selector and retains exact result and todo identities', async () => {
    const context = usePerformanceProjectContextStore()
    vi.mocked(performanceWorkbenchApi.listProjects).mockResolvedValue(projects.map(project => ({ ...project, result_published: true })))
    vi.mocked(performanceWorkbenchApi.tasks).mockImplementation(async (projectId, state) => [{ ...pending[0], task_id: Number(projectId) * 10, node_name: state === 'pending' ? '待完成环节' : '已完成环节' }])
    context.setActiveProjectId(2)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.select-project-one').exists()).toBe(false)
    expect(wrapper.find('.project-title').exists()).toBe(false)
    expect(wrapper.findAll('.timeline-card')).toHaveLength(1)
    expect(wrapper.findAll('.timeline-node')).toHaveLength(1)
    expect(wrapper.findAll('.result-card')).toHaveLength(2)
    for (const stateIndex of [0, 1]) {
      await wrapper.findAll('.todo-tabs button')[stateIndex].trigger('click')
      const links = wrapper.findAll('.todo-item')
      expect(links).toHaveLength(2)
      for (const [index, link] of links.entries()) {
        expect(link.text()).toContain(projects[index].project_name)
        const url = new URL(link.attributes('href')!, 'http://localhost')
        expect(Object.fromEntries(url.searchParams)).toEqual({ cycle_id: '1', project_id: String(index + 1), node: 'summary' })
        await link.trigger('click')
        expect(push).toHaveBeenLastCalledWith(`${url.pathname}${url.search}`)
      }
    }
    await wrapper.findAll('.result-card button')[0].trigger('click')
    expect(push).toHaveBeenLastCalledWith({ name: 'PerformanceReview', query: { entry: 'results', cycle_id: '1', project_id: '1' } })
    expect(context.workbenchSnapshot(1)?.pending).toHaveLength(1)
    expect(context.workbenchSnapshot(2)?.pending).toHaveLength(1)
    wrapper.unmount()
  })

  it('selects the first actual launch rather than project id or node timing and retains every todo', async () => {
    vi.mocked(performanceWorkbenchApi.listProjects).mockResolvedValue([
      { ...projects[0], project_started_at: '2026-11-10T09:00:00+08:00' },
      { ...projects[1], project_started_at: '2026-11-01T02:00:00Z' },
    ])
    vi.mocked(performanceWorkbenchApi.timeline).mockImplementation(async projectId => [{ ...timeline[0], node_name: `项目${projectId}流程`, start_at: projectId === 1 ? '2026-01-01T00:00:00Z' : '2026-02-01T00:00:00Z' }])
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('.timeline-card')).toHaveLength(1)
    expect(wrapper.get('.timeline-card').text()).toContain('项目2流程')
    expect(wrapper.find('.project-title').exists()).toBe(false)
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
    wrapper.unmount()
  })

  it('places unknown launches after known dates and breaks ties by project id', async () => {
    const context = usePerformanceProjectContextStore()
    context.setWorkbenchProjects([{ ...projects[1], project_started_at: null }, { ...projects[0], project_started_at: '2026-11-01T00:00:00Z' }])
    context.setWorkbenchSnapshot(1, { timeline: [{ ...timeline[0], node_name: '已知启动' }], pending: [], completed: [] })
    context.setWorkbenchSnapshot(2, { timeline: [{ ...timeline[0], node_name: '未知启动' }], pending: [], completed: [] })
    vi.mocked(performanceWorkbenchApi.listProjects).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    expect(wrapper.get('.timeline-card').text()).toContain('已知启动')
    context.setWorkbenchProjects([{ ...projects[1] }, { ...projects[0] }])
    wrapper.unmount()
    const next = mountView()
    expect(next.get('.timeline-card').text()).toContain('已知启动')
    next.unmount()
  })

  it('does not start project requests after leaving while navigation is pending', async () => {
    const store = usePerformanceProjectContextStore()
    store.resetIdentity()
    let resolve!: (value: PerformanceNavigationContext) => void
    vi.mocked(performanceNavigationApi.get).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = mountView()
    wrapper.unmount()
    resolve(navigationOf(1))
    await flushPromises()
    expect(performanceWorkbenchApi.listProjects).not.toHaveBeenCalled()
    expect(performanceWorkbenchApi.timeline).not.toHaveBeenCalled()
    expect(performanceWorkbenchApi.tasks).not.toHaveBeenCalled()
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

  it('keeps every cached project todo visible while the project list refresh is pending', async () => {
    const context = usePerformanceProjectContextStore()
    context.setWorkbenchProjects(projects)
    for (const project of projects) context.setWorkbenchSnapshot(project.project_id, { timeline, pending, completed: [] })
    vi.mocked(performanceWorkbenchApi.listProjects).mockReturnValue(new Promise(() => {}))
    const wrapper = mountView()
    expect(wrapper.findAll('.todo-item')).toHaveLength(2)
    expect(wrapper.findAll('.timeline-node')).toHaveLength(1)
    wrapper.unmount()
  })

  it('does not refill workbench caches after invalidation while projects are loading', async () => {
    let resolveProjects!: (value: PerformanceWorkbenchProject[]) => void
    vi.mocked(performanceWorkbenchApi.listProjects).mockReturnValueOnce(new Promise(done => { resolveProjects = done }))
    const wrapper = mountView()
    await flushPromises()
    const context = usePerformanceProjectContextStore()
    context.invalidate()
    resolveProjects(projects)
    await flushPromises()
    expect(context.workbenchProjects).toBeNull()
    expect(wrapper.findAll('.todo-item')).toHaveLength(0)
    expect(performanceWorkbenchApi.timeline).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows an empty cycle without starting project requests', async () => {
    vi.mocked(performanceWorkbenchApi.listProjects).mockResolvedValue([])
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('当前周期暂无相关绩效项目')
    expect(performanceWorkbenchApi.tasks).not.toHaveBeenCalled()
    expect(performanceWorkbenchApi.timeline).not.toHaveBeenCalled()
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

  const notice = (id: number, overrides = {}) => ({ id, title: `公告${id}`, link: '/performance/review', description: `正文${id}`, cycle_label: '所有周期', require_ack: true, display_order: id, updated_at: '2026-11-23T00:00:00Z', ...overrides })

  it('兼容旧feed未带acknowledged，按顺序确认并保留已知悉列表', async () => {
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValue({ announcement_enabled: true, items: [notice(2), notice(1), notice(3, { acknowledged: true })] })
    let resolveAck!: (value: { acknowledged: boolean }) => void
    vi.mocked(performanceWorkbenchApi.acknowledge).mockReturnValueOnce(new Promise(resolve => { resolveAck = resolve }))
    const wrapper = mountView()
    await flushPromises()
    let ack = wrapper.getComponent(WorkbenchAnnouncementAckDialog)
    expect(ack.props('announcement').id).toBe(1)
    ack.vm.$emit('acknowledge')
    ack.vm.$emit('acknowledge')
    await flushPromises()
    expect(ack.props('submitting')).toBe(true)
    expect(performanceWorkbenchApi.acknowledge).toHaveBeenCalledTimes(1)
    expect(performanceWorkbenchApi.acknowledge).toHaveBeenCalledWith(1, 'cycle-1')
    resolveAck({ acknowledged: true })
    await flushPromises()
    ack = wrapper.getComponent(WorkbenchAnnouncementAckDialog)
    expect(ack.props('announcement').id).toBe(2)
    ack.vm.$emit('acknowledge')
    await flushPromises()
    expect(wrapper.findComponent(WorkbenchAnnouncementAckDialog).exists()).toBe(false)
    expect(wrapper.findAll('.announcement-link')).toHaveLength(3)
    expect(wrapper.findAll('.announcement-ack-status')).toHaveLength(3)
    wrapper.unmount()
  })

  it('确认失败保持当前公告，可重试且拒绝失败结果推进', async () => {
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValue({ announcement_enabled: true, items: [notice(1), notice(2)] })
    vi.mocked(performanceWorkbenchApi.acknowledge).mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce({ acknowledged: false })
    const wrapper = mountView()
    await flushPromises()
    wrapper.getComponent(WorkbenchAnnouncementAckDialog).vm.$emit('acknowledge')
    await flushPromises()
    expect(wrapper.getComponent(WorkbenchAnnouncementAckDialog).props('error')).toBe('知悉失败，请重试')
    wrapper.getComponent(WorkbenchAnnouncementAckDialog).vm.$emit('acknowledge')
    await flushPromises()
    expect(wrapper.getComponent(WorkbenchAnnouncementAckDialog).props('announcement').id).toBe(1)
    wrapper.getComponent(WorkbenchAnnouncementAckDialog).vm.$emit('acknowledge')
    await flushPromises()
    expect(wrapper.getComponent(WorkbenchAnnouncementAckDialog).props('announcement').id).toBe(2)
    wrapper.unmount()
  })

  it('公告加载失败提供重试，停用feed即使有items也不显示', async () => {
    vi.mocked(performanceWorkbenchApi.announcements).mockRejectedValueOnce(new Error('failed')).mockResolvedValueOnce({ announcement_enabled: false, items: [notice(1)] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.announcement-card').text()).toContain('公告加载失败')
    await wrapper.get('.announcement-card button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.announcement-card').exists()).toBe(false)
    expect(wrapper.findComponent(WorkbenchAnnouncementAckDialog).exists()).toBe(false)
    wrapper.unmount()
  })

  it('无项目仍以cycle_id请求feed并使用后端resolved周期确认', async () => {
    vi.mocked(performanceWorkbenchApi.listProjects).mockResolvedValue([])
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValue({ announcement_enabled: true, cycle_ref: 'resolved-cycle', items: [notice(1)] })
    const wrapper = mountView()
    await flushPromises()
    expect(performanceWorkbenchApi.announcements).toHaveBeenCalledWith(undefined, 1)
    wrapper.getComponent(WorkbenchAnnouncementAckDialog).vm.$emit('acknowledge')
    await flushPromises()
    expect(performanceWorkbenchApi.acknowledge).toHaveBeenCalledWith(1, 'resolved-cycle')
    wrapper.unmount()
  })

  it('无具体周期不要求确认但保留公告列表', async () => {
    usePerformanceProjectContextStore().setNavigation(navigationOf(0))
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValue({ announcement_enabled: true, items: [notice(1)] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.announcement-link').exists()).toBe(true)
    expect(wrapper.findComponent(WorkbenchAnnouncementAckDialog).exists()).toBe(false)
    expect(performanceWorkbenchApi.acknowledge).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('周期切换立即清除弹窗并忽略旧feed迟响应', async () => {
    let resolveOld!: (value: Awaited<ReturnType<typeof performanceWorkbenchApi.announcements>>) => void
    vi.mocked(performanceWorkbenchApi.announcements).mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve })).mockResolvedValue({ announcement_enabled: true, items: [notice(2)] })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.select-cycle-two').trigger('click')
    await flushPromises()
    resolveOld({ announcement_enabled: true, cycle_ref: 'cycle-1', items: [notice(1)] })
    await flushPromises()
    expect(wrapper.getComponent(WorkbenchAnnouncementAckDialog).props('announcement').id).toBe(2)
    expect(wrapper.findAll('.announcement-link').map(link => link.text())).toEqual([expect.stringContaining('公告2')])
    wrapper.unmount()
  })

  it('旧周期确认成功不污染新周期同公告的未确认状态', async () => {
    let resolveAck!: (value: { acknowledged: boolean }) => void
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValue({ announcement_enabled: true, items: [notice(1)] })
    vi.mocked(performanceWorkbenchApi.acknowledge).mockReturnValueOnce(new Promise(resolve => { resolveAck = resolve }))
    const wrapper = mountView()
    await flushPromises()
    wrapper.getComponent(WorkbenchAnnouncementAckDialog).vm.$emit('acknowledge')
    await wrapper.get('.select-cycle-two').trigger('click')
    await flushPromises()
    expect(wrapper.getComponent(WorkbenchAnnouncementAckDialog).props('submitting')).toBe(false)
    resolveAck({ acknowledged: true })
    await flushPromises()
    expect(wrapper.getComponent(WorkbenchAnnouncementAckDialog).props('announcement').acknowledged).toBeUndefined()
    wrapper.getComponent(WorkbenchAnnouncementAckDialog).vm.$emit('acknowledge')
    await flushPromises()
    expect(performanceWorkbenchApi.acknowledge).toHaveBeenLastCalledWith(1, 'cycle-2')
    wrapper.unmount()
  })

  it('身份失效后立即清空弹窗并丢弃迟到确认', async () => {
    let resolveAck!: (value: { acknowledged: boolean }) => void
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValue({ announcement_enabled: true, items: [notice(1)] })
    vi.mocked(performanceWorkbenchApi.acknowledge).mockReturnValueOnce(new Promise(resolve => { resolveAck = resolve }))
    const wrapper = mountView()
    await flushPromises()
    wrapper.getComponent(WorkbenchAnnouncementAckDialog).vm.$emit('acknowledge')
    usePerformanceProjectContextStore().resetIdentity()
    await flushPromises()
    expect(wrapper.findComponent(WorkbenchAnnouncementAckDialog).exists()).toBe(false)
    resolveAck({ acknowledged: true })
    await flushPromises()
    expect(wrapper.find('.announcement-link').exists()).toBe(false)
    wrapper.unmount()
  })

  it('重新进入读取后端已确认状态，原公告内容更新仍不重弹', async () => {
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValueOnce({ announcement_enabled: true, items: [notice(1)] })
    const first = mountView()
    await flushPromises()
    first.getComponent(WorkbenchAnnouncementAckDialog).vm.$emit('acknowledge')
    await flushPromises()
    first.unmount()
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValueOnce({ announcement_enabled: true, items: [notice(1, { acknowledged: true, title: '更新后的公告' })] })
    const reopened = mountView()
    await flushPromises()
    expect(reopened.findComponent(WorkbenchAnnouncementAckDialog).exists()).toBe(false)
    expect(reopened.get('.announcement-link').text()).toContain('更新后的公告')
    expect(reopened.get('.announcement-ack-status').text()).toBe('已知悉')
    reopened.unmount()
  })

  it('无项目且旧mock无法解析具体周期时不弹出', async () => {
    vi.mocked(performanceWorkbenchApi.listProjects).mockResolvedValue([])
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValue({ announcement_enabled: true, items: [notice(1)] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.announcement-link').exists()).toBe(true)
    expect(wrapper.findComponent(WorkbenchAnnouncementAckDialog).exists()).toBe(false)
    wrapper.unmount()
  })

  it('周期切换后的旧图片迟响应不生成或回填URL', async () => {
    const create = vi.fn(() => 'blob:new-cycle')
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
    let resolveImage!: (value: Blob) => void
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValueOnce({ announcement_enabled: true, items: [notice(1, { image_id: 9 })] }).mockResolvedValue({ announcement_enabled: true, items: [notice(2)] })
    vi.mocked(performanceWorkbenchApi.announcementImage).mockReturnValueOnce(new Promise(resolve => { resolveImage = resolve }))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.select-cycle-two').trigger('click')
    await flushPromises()
    resolveImage(new Blob(['old'], { type: 'image/png' }))
    await flushPromises()
    expect(create).not.toHaveBeenCalled()
    expect(wrapper.getComponent(WorkbenchAnnouncementAckDialog).props('imageUrl')).toBe('')
    expect(wrapper.getComponent(WorkbenchAnnouncementAckDialog).props('announcement').id).toBe(2)
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('图片blob失败可重试且离开时回收URL', async () => {
    const create = vi.fn(() => 'blob:announcement')
    const revoke = vi.fn()
    vi.stubGlobal('URL', class extends URL { static createObjectURL = create; static revokeObjectURL = revoke })
    vi.mocked(performanceWorkbenchApi.announcements).mockResolvedValue({ announcement_enabled: true, items: [notice(1, { image_id: 9 })] })
    vi.mocked(performanceWorkbenchApi.announcementImage).mockRejectedValueOnce(new Error('image failed'))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.getComponent(WorkbenchAnnouncementAckDialog).props('imageError')).toBe(true)
    wrapper.getComponent(WorkbenchAnnouncementAckDialog).vm.$emit('retryImage')
    await flushPromises()
    expect(performanceWorkbenchApi.announcementImage).toHaveBeenLastCalledWith(9, 'cycle-1')
    expect(wrapper.getComponent(WorkbenchAnnouncementAckDialog).props('imageUrl')).toBe('blob:announcement')
    wrapper.unmount()
    expect(revoke).toHaveBeenCalledWith('blob:announcement')
    vi.unstubAllGlobals()
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
