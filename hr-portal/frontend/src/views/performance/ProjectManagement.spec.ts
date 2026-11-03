import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { performanceApi, performanceNavigationApi, projectManagementApi, type PerformanceNavigationContext, type ProjectManagementOverview } from '@/api/performance'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'

const { routeQuery } = vi.hoisted(() => ({ routeQuery: {} as Record<string, string> }))
const push = vi.fn()
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ push, replace }),
}))

vi.mock('@/api/performance', async () => {
  const actual = await vi.importActual<typeof import('@/api/performance')>('@/api/performance')
  return { ...actual, projectManagementApi: { ...actual.projectManagementApi, overview: vi.fn(), members: vi.fn(), matrix: vi.fn() } }
})

import ProjectManagement from './ProjectManagement.vue'
import sidebarSource from '@/components/performance/PerformanceReviewCategorySidebar.vue?raw'
import lineTabsSource from '@/components/performance/PerformanceLineTabs.vue?raw'
import memberListPanelSource from '@/components/performance/ProjectMemberListPanel.vue?raw'
import layoutSource from '@/layouts/PerformanceLayout.vue?raw'
import { projectManagementApi as mockedApi } from '@/api/performance'

const overviewOf = (overrides: Partial<ProjectManagementOverview> = {}): ProjectManagementOverview => ({
  cycles: [
    { cycle_id: 1, cycle_name: '2026上半年', cycle_start_at: '2026-01-01', cycle_end_at: '2026-06-30' },
    { cycle_id: 2, cycle_name: '2026下半年', cycle_start_at: '2026-07-01', cycle_end_at: '2026-12-31' },
  ],
  active_cycle: { cycle_id: 1, cycle_name: '2026上半年', cycle_start_at: '2026-01-01', cycle_end_at: '2026-06-30' },
  projects: [
    { project_id: 3, project_name: '产品中心项目', project_ref: 'project:a', status: 'STARTED' },
    { project_id: 4, project_name: '研发中心项目', project_ref: 'project:b', status: 'STARTED' },
  ],
  hrbp_scope: [],
  category: { key: 'admin', label: '项目管理员' },
  ...overrides,
})

const navigationOf = (cycleId = 1, overrides: Partial<PerformanceNavigationContext> = {}): PerformanceNavigationContext => ({
  cycles: overviewOf().cycles,
  active_cycle: overviewOf().active_cycle,
  can_review: true,
  can_manage: true,
  review_projects: [],
  ...overrides,
  ...(cycleId === 2 ? { active_cycle: overviewOf().cycles[1] } : {}),
})

let pinia: Pinia

const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  provide() {
    return { tableRows: this.data }
  },
  template: '<table><thead><tr><slot /></tr></thead><tbody><tr><td><slot name="empty" /></td></tr></tbody></table>',
})

const ElTableColumnStub = defineComponent({
  inject: ['tableRows'],
  template: '<td><slot name="header" /><template v-for="row in tableRows"><slot :row="row" /></template></td>',
})

function mountView() {
  return mount(ProjectManagement, {
    global: {
      plugins: [pinia],
      stubs: {
        'el-icon': { template: '<span><slot /></span>' },
        'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<div><slot /></div>', props: ['command'] },
        ElTable: ElTableStub,
        ElTableColumn: ElTableColumnStub,
      },
    },
  })
}

describe('ProjectManagement', () => {
  beforeEach(() => {
    Object.keys(routeQuery).forEach(key => delete routeQuery[key])
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigationOf(1))
    vi.spyOn(performanceApi, 'getAccessContext').mockResolvedValue({ subject_type: 'PORTAL_USER', subject_id: 1, display_name: '测试用户', account_type: null, portal_entry_permissions: ['performance.app'], permission_codes: [] })
    vi.spyOn(performanceNavigationApi, 'get').mockImplementation(async cycleId => navigationOf(cycleId || 1))
    vi.mocked(mockedApi.overview).mockReset()
    vi.mocked(mockedApi.members).mockReset()
    vi.mocked(mockedApi.matrix).mockReset()
    vi.mocked(mockedApi.members).mockResolvedValue({ items: [], total: 406, page: 1, page_size: 50 })
    vi.mocked(mockedApi.matrix).mockResolvedValue({
      source: 'template_final_result', dimension: 'rating', display_modes: ['name', 'count'], total: 406, completed_count: 403, pending_count: 3,
      ratings: [{ key: 'one', label: '1星', color: '#f54a45' }], pending_rows: [], completed_rows: [],
    })
    push.mockReset()
    replace.mockReset()
  })

  it('opens the reminder route with all eligible tasks selected and a viewport bottom action bar', async () => {
    const { default: Reminder } = await import('./ProjectManagementReminder.vue')
    routeQuery.cycle_id = '1'
    routeQuery.node_key = 'manager-review'
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const tasks = Array.from({ length: 151 }, (_, index) => ({ task_id: index + 1, project_id: 3, project_name: '测试项目', can_authorize: false, employee_no: `E${index}`, display_name: `测试成员${index}`, status: 'pending', selectable: index !== 0, due_at: null, job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }))
    const people = vi.spyOn(projectManagementApi, 'reminderPeople').mockImplementation(async (_cycle, _node, _keyword, page = 1, pageSize = 50) => ({ items: tasks.slice((page - 1) * pageSize, page * pageSize), total: tasks.length, page, page_size: pageSize }))
    const wrapper = mount(Reminder, { attachTo: document.body })
    try {
      await flushPromises()
      const table = wrapper.getComponent({ name: 'PerformanceManagementTable' })
      expect(table.props('selectedKeys')).toHaveLength(150)
      expect(wrapper.findAll('tbody input[type="checkbox"]')[0].attributes('disabled')).toBeDefined()
      const bar = document.body.querySelector('.selection-bar--viewport')!
      expect(bar.parentElement).toBe(document.body)
      expect(bar.textContent).toContain('催办')
      expect(bar.textContent).toContain('已选择 150 条')
      expect(wrapper.find('.selection-bar').exists()).toBe(false)
      ;(bar.querySelector('.selection-bar__clear') as HTMLButtonElement).click()
      await flushPromises()
      await wrapper.findAll('tbody input[type="checkbox"]')[1].setValue(true)
      await flushPromises()
      expect(table.props('selectedKeys')).toEqual(['2'])
      expect(document.body.querySelector('.selection-bar--viewport')?.textContent).toContain('已选择 1 条')
    } finally {
      wrapper.unmount()
      people.mockRestore()
    }
  })

  it('keeps the collapsed submenu above sticky tabs but below the app header', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.sidebar-collapse').trigger('click')
    await wrapper.get('.category-toggle').trigger('mouseenter')

    expect(wrapper.get('.sidebar-flyout').findAll('.flyout-node').map(node => node.text())).toEqual(['周期概览', '产品中心项目', '研发中心项目'])
    expect(wrapper.get('.review-sidebar').classes()).toContain('is-collapsed')
    const sidebarZ = Number(sidebarSource.match(/\.review-sidebar\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
    const tabsZ = Number(lineTabsSource.match(/\.line-tabs\.sticky \.line-tabs-holder\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
    const headerZ = Number(layoutSource.match(/\.performance-header\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
    expect(sidebarZ).toBeGreaterThan(tabsZ)
    expect(sidebarZ).toBeLessThan(headerZ)
    wrapper.unmount()
  })

  it('renders the admin category with cycle overview first and involved projects', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()

    expect(mockedApi.overview).toHaveBeenCalledWith(1)
    const labels = wrapper.findAll('.review-node').map(item => item.text())
    expect(labels).toEqual(['周期概览', '产品中心项目', '研发中心项目'])
    const categoryToggle = wrapper.find('.category-toggle')
    expect(categoryToggle.text()).toContain('项目管理员')
    expect(wrapper.find('.review-node em').exists()).toBe(false)
  })

  it('shows empty state when no involved cycle exists', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({ cycles: [], active_cycle: null, projects: [] }))
    usePerformanceProjectContextStore().setNavigation(navigationOf(0, { cycles: [], active_cycle: null }))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无可管理的周期')
    expect(wrapper.text()).toContain('当前没有你作为项目管理员参与的已启动项目')
  })

  it('shows error state with retry and keeps selection on failure', async () => {
    vi.mocked(mockedApi.overview).mockRejectedValueOnce(new Error('network'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('项目管理加载失败')
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    await wrapper.find('.error-state button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('周期概览')
  })

  it('switches cycle via the top filter and reloads projects', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValueOnce(overviewOf())
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({
      active_cycle: { cycle_id: 2, cycle_name: '2026下半年', cycle_start_at: '2026-07-01', cycle_end_at: '2026-12-31' },
      projects: [{ project_id: 5, project_name: '运营中心项目', project_ref: 'project:c', status: 'STARTED' }],
    }))
    const wrapper = mountView()
    await flushPromises()

    const sidebar = wrapper.findComponent({ name: 'PerformanceReviewCategorySidebar' })
    expect(sidebar.props('filterOptions')).toEqual([
      { value: 1, label: '2026上半年' },
      { value: 2, label: '2026下半年' },
    ])
    expect(sidebar.props('activeFilterValue')).toBe(1)
    expect(sidebar.props('showNodeStatus')).toBe(false)
    sidebar.vm.$emit('select-filter', 2)
    await flushPromises()

    expect(mockedApi.overview).toHaveBeenLastCalledWith(2)
    expect(replace).toHaveBeenCalled()
    const labels = wrapper.findAll('.review-node').map(item => item.text())
    expect(labels).toEqual(['周期概览', '运营中心项目'])
  })

  it('uses the shared active cycle and redirects when management access is absent', async () => {
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigationOf(1, { can_manage: false }))
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()

    expect(replace).toHaveBeenCalledWith('/performance/workbench')
    expect(mockedApi.overview).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('switches the shared cycle through the project-management selector', async () => {
    const context = usePerformanceProjectContextStore()
    vi.mocked(mockedApi.overview).mockResolvedValueOnce(overviewOf()).mockResolvedValue(overviewOf({
      active_cycle: overviewOf().cycles[1],
      projects: [{ project_id: 5, project_name: '运营中心项目', project_ref: 'project:c', status: 'STARTED' }],
    }))
    const wrapper = mountView()
    await flushPromises()
    wrapper.findComponent({ name: 'PerformanceReviewCategorySidebar' }).vm.$emit('select-filter', 2)
    await flushPromises()

    expect(context.activeCycleId).toBe(2)
    expect(performanceNavigationApi.get).toHaveBeenCalledWith(2)
    expect(mockedApi.overview).toHaveBeenLastCalledWith(2)
  })

  it('renders only categories with nodes in the shared management sidebar', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({ category: { key: 'admin', label: '项目管理员' }, projects: [] }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('.category-toggle')).toHaveLength(1)
  })

  it('renders the cycle overview title above the line tabs with 总览 active', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.page-title-text').text()).toBe('周期概览')
    expect(wrapper.find('.page-title-text').element.previousElementSibling).toBeNull()

    const tabs = wrapper.findAll('.line-tab')
    expect(tabs.map(item => item.text())).toEqual(['总览', '成员列表', '矩阵分析', '统计报表'])
    expect(tabs[0].classes()).toContain('active')
    expect(wrapper.find('.line-tabs').classes()).toContain('sticky')

    const lineTabs = wrapper.findAllComponents({ name: 'PerformanceLineTabs' })
    expect(lineTabs).toHaveLength(1)

    // 总览 tab 渲染完成率面板（8 张环节卡 + 完成率标题）与授权管理面板
    expect(wrapper.findComponent({ name: 'CompletionRatePanel' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AuthorizationManagementPanel' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('完成率')
    expect(wrapper.text()).toContain('授权管理')
    expect(wrapper.findAll('.grid-card')).toHaveLength(2)
    expect(wrapper.findAll('.completion-node-card')).toHaveLength(0)

    await tabs[1].trigger('click')
    expect(wrapper.findComponent({ name: 'ProjectMemberListPanel' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('406个结果')
    expect(wrapper.findComponent({ name: 'CompletionRatePanel' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'AuthorizationManagementPanel' }).exists()).toBe(false)
    expect(lineTabs[0].emitted('update:modelValue')).toEqual([['members']])
  })

  it('anchors the member table header below the sticky tabs per captured Feishu params', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ProjectMemberListPanel' }).exists()).toBe(true)
    // Tab 恢复 sticky（采集：ud__tabs pt-6 sticky z-30），表头/遮罩相对 Tab 区底锁定（采集：header top 76px、mask top 56px）
    expect(wrapper.find('.line-tabs').classes()).toContain('sticky')
    expect(memberListPanelSource).toMatch(/--performance-table-sticky-top:\s*var\(--performance-tab-area-height\)/)
    expect(memberListPanelSource).toMatch(/\.card-sticky-mask\s*\{[^}]*top:\s*calc\(var\(--performance-table-sticky-top, 0px\) - 20px\)/)
  })

  it('renders real completion data and hides reminder actions for a not-started node', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({
      completion_nodes: [
        { key: 'work-summary', title: '填写工作总结', status: 'not_started', completed_count: 0, total_count: 406, completion_rate: null, deadline_at: '2099-07-10T15:59:00Z' },
        { key: 'self-review', title: '自评', status: 'active', can_remind: true, completed_count: 101, total_count: 406, completion_rate: 24.88, deadline_at: '2099-07-20T15:59:00Z' },
      ],
    }))
    const wrapper = mountView()
    await flushPromises()

    const cards = wrapper.findAll('.completion-node-card')
    expect(cards[0].find('.card-progress').text()).toBe('未开始')
    expect(cards[0].text()).toContain('完成情况：0/406')
    expect(cards[0].find('.text-button').exists()).toBe(false)
    expect(cards[1].find('.card-progress').text()).toBe('24.88%')
    expect(cards[1].text()).toContain('完成情况：101/406')
    expect(cards[1].text()).toContain('截止时间：2099-07-20 23:59（GMT+8）')
    expect(cards[1].find('.text-button').text()).toBe('去催办')
  })

  it('opens the shared task overlay for cycle-wide result opening', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({
      completion_nodes: [{ key: 'view-result', title: '查看绩效结果', status: 'not_started', completed_count: 0, total_count: 2, completion_rate: 0, deadline_at: null }],
    }))
    const people = vi.spyOn(projectManagementApi, 'openingPeople').mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.completion-node-card .node-action').trigger('click')
    expect(wrapper.findComponent({ name: 'PerformanceReminderPanel' }).props('mode')).toBe('open-result')
    expect(wrapper.findComponent({ name: 'PerformanceReminderPanel' }).props('context')).toMatchObject({ cycleId: 1, projectId: 0 })
    wrapper.unmount()
    people.mockRestore()
  })

  it('navigates to the scoped reminder route with the clicked department cell data', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const dept = vi.spyOn(projectManagementApi, 'departmentCompletion').mockResolvedValue({ columns: [{ key: 'manager-review', title: '上级评估' }], rows: [{ id: '公司/研发', department: '研发', metrics: { 'manager-review': { completion_rate: 60, completed_count: 3, total_count: 5 } } }] })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.segment').trigger('click')
    await wrapper.findAll('.segment')[1].trigger('click')
    await flushPromises()
    await wrapper.get('.rate-link').trigger('click')
    expect(push).toHaveBeenCalledWith(expect.objectContaining({
      name: 'PerformanceProjectReminder',
      query: expect.objectContaining({ node_key: 'manager-review', department: '公司/研发', completion_rate: '60.00', completed: '3', total: '5', view: 'by-org' }),
    }))
    wrapper.unmount()
    dept.mockRestore()
  })

  it('keeps member headers when the member list is empty', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    vi.mocked(mockedApi.members).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.performance-sort-header .sort-header-label').map(item => item.text())).toEqual(['姓名', '绩效评级', '360° 评估率', '直属上级', '序列', '职级', '入职日期', '所属部门'])
    expect(wrapper.text()).toContain('暂无成员')
    expect(wrapper.findAll('.member-name')).toHaveLength(0)
  })

  it('opens the statistics preview with the current cycle and no new report request', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[3].trigger('click')
    await flushPromises()
    const report = wrapper.findComponent({ name: 'ProjectStatisticsReportPanel' })
    expect(report.props('cycleId')).toBe(1)
    expect(report.props('cycleName')).toBe('2026上半年')
    expect(wrapper.text()).toContain('模拟数据')
    expect(wrapper.findAll('[data-report-section]')).toHaveLength(9)
    expect(mockedApi.members).not.toHaveBeenCalled()
    expect(mockedApi.overview).toHaveBeenCalledTimes(1)
    await wrapper.findAll('.line-tab')[2].trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ProjectPerformanceMatrix' }).exists()).toBe(true)
    expect(mockedApi.matrix).toHaveBeenCalledWith(3)
    expect(wrapper.text()).toContain('待完成评估')
    wrapper.unmount()
  })

  it('selects a project menu item and marks it active', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()

    const projectNode = wrapper.findAll('.review-node')[1]
    await projectNode.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.review-node')[1].classes()).toContain('active')
    expect(wrapper.text()).toContain('产品中心项目')
    expect(wrapper.text()).toContain('后续迭代中开发')
  })
})


it('routes authorization views to distinct full-screen pages for the selected cycle', async () => {
  pinia = createPinia(); setActivePinia(pinia)
  usePerformanceProjectContextStore().setNavigation(navigationOf(1))
  vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
  const wrapper = mountView()
  await flushPromises()
  const buttons = wrapper.findAll('.auth-card .text-button')
  await buttons[0].trigger('click')
  await flushPromises()
  expect(push).toHaveBeenCalledWith({ name: 'PerformanceAuthorizationRecords', query: { cycle_id: '1' } })
  await buttons[1].trigger('click')
  await flushPromises()
  expect(push).toHaveBeenCalledWith({ name: 'PerformanceCalibrationAuthorization', query: { cycle_id: '1' } })
  wrapper.unmount()
})


describe('authorization workspaces', () => {
  it('reads scoped authorization rows and revokes through the real API contract', async () => {
    const { default: Records } = await import('./ProjectAuthorizationRecords.vue')
    routeQuery.cycle_id = '1'
    const records = vi.spyOn(projectManagementApi, 'authorizationRecords').mockResolvedValue({ cycle_id: 1, authorization_records: [{ id: '1', project_id: 3, task_id: 11, authorization_id: 21, initiator: '发起人', authorized_person: '被授权人', status: '已授权', stages: ['上级评估'], reviewees: ['员工一'], submitted_at: '2026-11-01T00:00:00Z', can_revoke: true }], transfer_records: [] })
    const revoking = vi.spyOn(projectManagementApi, 'revokeTaskAuthorization').mockResolvedValue(undefined)
    const wrapper = mount(Records)
    await flushPromises()
    expect(records).toHaveBeenCalledWith(1)
    expect(wrapper.text()).toContain('被授权人')
    await wrapper.get('.text-action').trigger('click'); await flushPromises()
    expect(document.querySelector('.performance-confirm-dialog')).not.toBeNull()
    expect(revoking).not.toHaveBeenCalled()
    ;(document.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click(); await flushPromises()
    expect(revoking).toHaveBeenCalledWith(3, 11, 21)
    expect(wrapper.text()).toContain('已保存和提交内容保留')
    wrapper.unmount(); records.mockRestore(); revoking.mockRestore(); delete routeQuery.cycle_id
  })

  it('shows authorization read failure rather than stale or fabricated rows', async () => {
    const { default: Records } = await import('./ProjectAuthorizationRecords.vue')
    routeQuery.cycle_id = '1'
    const records = vi.spyOn(projectManagementApi, 'authorizationRecords').mockRejectedValue(new Error('denied'))
    const wrapper = mount(Records)
    await flushPromises()
    expect(wrapper.text()).toContain('授权记录加载失败')
    expect(wrapper.findAll('.text-action')).toHaveLength(0)
    wrapper.unmount(); records.mockRestore(); delete routeQuery.cycle_id
  })
})


it('opens the shared delegation dialog from calibration authorization with real task references', async () => {
  const { default: Calibration } = await import('./ProjectCalibrationAuthorization.vue')
  const { default: Dialog } = await import('@/components/performance/PerformanceTaskDelegationDialog.vue')
  pinia = createPinia(); setActivePinia(pinia)
  usePerformanceProjectContextStore().setNavigation(navigationOf(1))
  routeQuery.cycle_id = '1'
  const loaded = vi.spyOn(projectManagementApi, 'calibrationAuthorization').mockResolvedValue({ cycle_id: 1, cycle_name: '2026上半年', items: [{ id: 'cal:1', project_id: 3, task_ids: [11, 12], authorizations: [], calibrator: '校准人', status: '待校准', scope: '全部下级', authorized_count: 2, unauthorized_count: 2, allow_authorize: true, distribution_rule: null, authorized_by: null, authorized_at: null }] })
  const candidates = vi.spyOn(projectManagementApi, 'delegationCandidates').mockResolvedValue([{ employee_no: 'R1', display_name: '接收人' }])
  const wrapper = mount(Calibration, { attachTo: document.body, global: { plugins: [pinia] } })
  await flushPromises()
  expect(wrapper.text()).toContain('校准人')
  const action = wrapper.findAll('.actions button').find(button => button.text() === '协助授权')!
  await action.trigger('click'); await flushPromises()
  expect(wrapper.getComponent(Dialog).props('tasks')).toEqual([{ project_id: 3, task_id: 11 }, { project_id: 3, task_id: 12 }])
  expect(candidates).toHaveBeenCalledWith(3, 11)
  expect(candidates).toHaveBeenCalledWith(3, 12)
  expect(document.querySelector<HTMLInputElement>('input[name="authorization-distribution"][value="NONE"]')?.disabled).toBe(true)
  wrapper.getComponent(Dialog).vm.$emit('completed', 2, 'preview_only')
  await flushPromises()
  expect(wrapper.text()).toContain('已授权 2 个任务')
  expect(wrapper.text()).not.toContain('测试模式')
  wrapper.unmount(); loaded.mockRestore(); candidates.mockRestore(); delete routeQuery.cycle_id
})
