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
  return { ...actual, projectManagementApi: { ...actual.projectManagementApi, overview: vi.fn(), members: vi.fn(), exportMembers: vi.fn(), matrix: vi.fn(), memberDetail: vi.fn(), cycleMembers: vi.fn(), cycleExportMembers: vi.fn() } }
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
    vi.mocked(mockedApi.exportMembers).mockReset()
    vi.mocked(mockedApi.matrix).mockReset()
    vi.mocked(mockedApi.memberDetail).mockReset()
    vi.mocked(mockedApi.cycleMembers).mockReset()
    vi.mocked(mockedApi.cycleExportMembers).mockReset()
    vi.mocked(mockedApi.cycleMembers).mockImplementation(async () => ({ items: [], total: 406, page: 1, page_size: 50, rating_columns: [] }))
    vi.mocked(mockedApi.cycleExportMembers).mockImplementation(async () => ({ items: [], total: 406, page: 1, page_size: 406, rating_columns: [] }))
    vi.mocked(mockedApi.members).mockResolvedValue({ items: [], total: 406, page: 1, page_size: 50 })
    vi.mocked(mockedApi.matrix).mockResolvedValue({
      source: 'template_final_result', dimension: 'rating', display_modes: ['name', 'count'], total: 406, completed_count: 403, pending_count: 3,
      ratings: [{ key: 'one', label: '1星', color: '#f54a45' }], pending_rows: [], completed_rows: [],
    })
    push.mockReset()
    replace.mockReset()
  })

  it.each(['success', 'failure', 'navigation-failure', 'cycle-change'] as const)('keeps member deletion consistent on %s', async scenario => {
    const { ElMessage } = await import('element-plus')
    const success = vi.spyOn(ElMessage, 'success').mockImplementation(() => ({ close: () => {} } as any))
    const failure = vi.spyOn(ElMessage, 'error').mockImplementation(() => ({ close: () => {} } as any))
    const warning = vi.spyOn(ElMessage, 'warning').mockImplementation(() => ({ close: () => {} } as any))
    let resolve!: () => void
    let reject!: (reason: unknown) => void
    const pending = new Promise<void>((done, fail) => { resolve = done; reject = fail })
    const remove = vi.spyOn(projectManagementApi, 'removeMember').mockReturnValue(pending as any)
    routeQuery.rootReviewId = '5'; routeQuery.member_project_id = '3'; routeQuery.employee_no = 'E1'
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mount(ProjectManagement, { global: { plugins: [pinia], stubs: {
      PerformanceReviewEvaluationDrawer: true, ProjectMemberListPanel: true, CompletionRatePanel: true,
    } } })
    try {
      await flushPromises()
      const drawer = wrapper.getComponent({ name: 'PerformanceReviewEvaluationDrawer' })
      const payload = { project_id: 3, employee_no: 'E1', root_review_id: 5 }
      const calls = vi.mocked(mockedApi.overview).mock.calls.length
      drawer.vm.$emit('delete', payload)
      drawer.vm.$emit('delete', payload)
      await flushPromises()
      expect(remove).toHaveBeenCalledOnce()
      expect(remove).toHaveBeenCalledWith(3, 'E1', 5)
      if (scenario === 'cycle-change') usePerformanceProjectContextStore().setNavigation(navigationOf(2))
      if (scenario === 'navigation-failure') replace.mockRejectedValueOnce(new Error('navigation'))
      if (scenario === 'failure') reject({ response: { data: { detail: { message: '无权删除' } } } })
      else resolve()
      await flushPromises()
      if (scenario === 'failure') {
        expect(failure).toHaveBeenCalledWith('无权删除')
        expect(success).not.toHaveBeenCalled()
        expect(drawer.props('modelValue')).toBe(true)
        expect(vi.mocked(mockedApi.overview).mock.calls.length).toBe(calls)
      } else {
        expect(success).toHaveBeenCalledWith('操作成功')
        expect(failure).not.toHaveBeenCalled()
        if (scenario === 'cycle-change') expect(vi.mocked(mockedApi.overview).mock.calls.length).toBe(calls)
        else {
          expect(wrapper.findComponent({ name: 'PerformanceReviewEvaluationDrawer' }).exists()).toBe(false)
          expect(vi.mocked(mockedApi.overview).mock.calls.length).toBe(calls + 1)
          if (scenario === 'navigation-failure') expect(warning).toHaveBeenCalled()
          else expect(replace).toHaveBeenLastCalledWith({ query: expect.not.objectContaining({ employee_no: 'E1' }) })
        }
      }
    } finally { wrapper.unmount(); remove.mockRestore(); success.mockRestore(); failure.mockRestore(); warning.mockRestore() }
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

    // 总览 tab 渲染完成率面板（8 张环节卡 + 完成率标题）与授权管理面板、其他面板（人员组管理）
    expect(wrapper.findComponent({ name: 'CompletionRatePanel' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AuthorizationManagementPanel' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('完成率')
    expect(wrapper.text()).toContain('授权管理')
    expect(wrapper.text()).toContain('其他')
    expect(wrapper.text()).toContain('人员组管理')
    expect(wrapper.text()).toContain('可将管理范围内的人员，添加进对应的人员组中')
    expect(wrapper.findAll('.grid-card')).toHaveLength(3)
    expect(wrapper.findAll('.completion-node-card')).toHaveLength(0)

    await tabs[1].trigger('click')
    expect(wrapper.findComponent({ name: 'ProjectMemberListPanel' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('406个结果')
    expect(wrapper.findComponent({ name: 'CompletionRatePanel' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'AuthorizationManagementPanel' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('人员组管理')
    expect(lineTabs[0].emitted('update:modelValue')).toEqual([['members']])
  })

  it('anchors the member table header below the sticky tabs per captured Feishu params', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ProjectMemberListPanel' }).exists()).toBe(true)
    // Tab 恢复 sticky（采集：ud__tabs pt-6 sticky z-30），表头/遮罩相对 Tab 区底减 8px 锁定（采集：header top 76px、mask top 56px）
    expect(wrapper.find('.line-tabs').classes()).toContain('sticky')
    expect(memberListPanelSource).toMatch(/--performance-table-sticky-top:\s*calc\(var\(--performance-tab-area-height\) - 28px\)/)
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

  it('exports every matching member from a later page with the selected columns and permits retry', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const all = Array.from({ length: 151 }, (_, index) => ({
      id: index + 1, employee_no: `E${index}`, display_name: `员工${index}`, avatar_url: null,
      rating: null, rating_tone: null, completion: '0/0', job_family: null, job_category: null,
      job_sequence: null, position_level: null, hire_date: null, department: null,
      employee_type: null, employment_status: null,
    }))
    vi.mocked(mockedApi.cycleMembers).mockImplementation(async (_id, _keyword, page = 1, size = 50) => ({ items: all.slice((page - 1) * size, page * size), total: all.length, page, page_size: size }))
    vi.mocked(mockedApi.cycleExportMembers).mockResolvedValue({ items: all, total: all.length, page: 1, page_size: all.length })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()
    const panel = wrapper.getComponent({ name: 'ProjectMemberListPanel' })
    panel.getComponent({ name: 'PerformanceManagementTable' }).vm.$emit('page-change', 2)
    await flushPromises()
    panel.getComponent({ name: 'ProjectMemberColumnDrawer' }).vm.$emit('confirm', ['name'])
    await flushPromises()
    const button = panel.getComponent({ name: 'PerformanceExportButton' })
    const loadRows = button.props('loadRows') as () => Promise<string[][]>
    expect(await loadRows()).toEqual([['姓名'], ...all.map(member => [member.display_name])])
    expect(mockedApi.cycleExportMembers).toHaveBeenLastCalledWith(1, undefined, undefined, undefined)
    button.vm.$emit('error', new Error('network'))
    await flushPromises()
    expect(panel.text()).toContain('导出失败，请稍后重试')
    expect(button.props('disabled')).toBe(false)
    button.vm.$emit('success')
    await flushPromises()
    expect(panel.text()).toContain('导出成功')
    wrapper.unmount()
  })

  it('opens scoped management details through the shared drawer with dynamic final ratings', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const member = { id: 71, root_review_id: 71, project_id: 3, employee_no: 'E1', display_name: '管理可见员工', can_view_detail: true, avatar_url: null, rating: null, rating_tone: null, completion: '0/0', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null, ratings: { 'rating:grade': { label: '3星+' }, 'rating:value': { label: 'A' } } }
    vi.mocked(mockedApi.cycleMembers).mockResolvedValue({ items: [member], total: 1, page: 1, page_size: 50, rating_columns: [{ key: 'rating:grade', label: '年度绩效' }, { key: 'rating:value', label: '价值贡献' }] })
    vi.mocked(mockedApi.cycleExportMembers).mockResolvedValue({ items: [member], total: 1, page: 1, page_size: 50 })
    const tabs = [
      { key: 'management-comm', kind: 'node' as const, node_id: 'comm', node_name: '绩效沟通', status: 'completed' as const, employee_no: 'E1', can_remind: false, form_schema: [{ id: 'advice', name: '发展建议', fields: [{ id: 'text', type: 'rich_text' as const, label: '发展建议' }] }], answers: { text: '沟通已提交内容' } },
      { key: 'management-final', kind: 'node' as const, node_id: 'final', node_name: '上级评估', status: 'completed' as const, employee_no: 'E1', can_remind: false, form_schema: [{ id: 'review', name: '绩效内容', fields: [{ id: 'text', type: 'rich_text' as const, label: '评估' }] }], answers: { text: '上级已提交内容' } },
    ]
    vi.mocked(mockedApi.memberDetail).mockResolvedValue({ task_id: 41, task_kind: 'result_communication', entry_mode: 'template_task', node_name: '绩效沟通', editable: false, submit_allowed: false, person: { employee_no: 'E1', display_name: '管理可见员工' }, form_schema: [], answers: {}, management_tabs: tabs, default_active_tab: 'management-comm' })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()
    const panel = wrapper.getComponent({ name: 'ProjectMemberListPanel' })
    expect(panel.findAll('.ui-table__sort-label').map(item => item.text())).toEqual(expect.arrayContaining(['年度绩效', '价值贡献']))
    expect(panel.findAll('.performance-rating-tag').map(item => item.text())).toEqual(['3星+', 'A'])
    const exported = await panel.getComponent({ name: 'PerformanceExportButton' }).props('loadRows')()
    expect(exported[1][exported[0].indexOf('年度绩效')]).toBe('3星+')
    panel.getComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', member)
    await flushPromises()
    expect(mockedApi.memberDetail).toHaveBeenCalledWith(3, 'E1', 71)
    expect(document.body.textContent).toContain('沟通已提交内容')
    expect(document.body.querySelector('.performance-drawer__mask')).toBeNull()
    expect(document.body.querySelector('.performance-review-completion-notice__edit')).toBeNull()
    const drawerTabs = Array.from(document.body.querySelectorAll('.performance-drawer .line-tab'))
    ;(drawerTabs[1] as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.textContent).toContain('上级已提交内容')
    expect(replace).toHaveBeenLastCalledWith({ query: expect.objectContaining({ rootReviewId: '71', member_project_id: '3', activeTab: 'management-final' }) })
    Object.assign(routeQuery, { cycle_id: '1', rootReviewId: '71', member_project_id: '3', employee_no: 'E1', activeTab: 'management-final' })
    ;(document.body.querySelector('.performance-drawer__outside') as HTMLElement).click()
    await flushPromises()
    expect(replace).toHaveBeenLastCalledWith({ query: { cycle_id: '1' } })
    wrapper.unmount()
    const reopened = mountView()
    await flushPromises()
    expect(mockedApi.memberDetail).toHaveBeenLastCalledWith(3, 'E1', 71)
    expect(document.body.textContent).toContain('上级已提交内容')
    expect(document.body.querySelector('.performance-drawer__panel')).not.toBeNull()
    reopened.unmount()
  })

  it('keeps the main matrix tab active when the matrix opens a member drawer', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    vi.mocked(mockedApi.memberDetail).mockResolvedValue({ task_id: 41, task_kind: 'result_communication', entry_mode: 'template_task', node_name: '绩效沟通', editable: false, submit_allowed: false, person: { employee_no: 'E1', display_name: '管理可见员工' }, form_schema: [], answers: {}, reference_tabs: [], management_tabs: [] })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[2].trigger('click')
    await flushPromises()
    const matrix = wrapper.getComponent({ name: 'ProjectPerformanceMatrix' })
    matrix.vm.$emit('open-member', { project_id: 3, employee_no: 'E1', root_review_id: 71, can_view_detail: true })
    await flushPromises()
    expect(mockedApi.memberDetail).toHaveBeenCalledWith(3, 'E1', 71)
    expect(replace).toHaveBeenLastCalledWith({ query: expect.objectContaining({ rootReviewId: '71', member_project_id: '3' }) })
    expect(document.body.querySelector('.performance-drawer__panel')).not.toBeNull()
    const activeTab = wrapper.findAll('.line-tab').find(tab => tab.classes().includes('active'))
    expect(activeTab?.text()).toBe('矩阵分析')
    expect(wrapper.findComponent({ name: 'ProjectPerformanceMatrix' }).exists()).toBe(true)
    wrapper.unmount()
  })

  it('restores the main tab to 成员列表 for a shared deep link without an origin tab', async () => {
    Object.assign(routeQuery, { cycle_id: '1', rootReviewId: '71', member_project_id: '3', employee_no: 'E1' })
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    vi.mocked(mockedApi.memberDetail).mockResolvedValue({ task_id: 41, task_kind: 'result_communication', entry_mode: 'template_task', node_name: '绩效沟通', editable: false, submit_allowed: false, person: { employee_no: 'E1', display_name: '管理可见员工' }, form_schema: [], answers: {}, reference_tabs: [], management_tabs: [] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('.line-tab').find(tab => tab.classes().includes('active'))?.text()).toBe('成员列表')
    expect(mockedApi.memberDetail).toHaveBeenCalledWith(3, 'E1', 71)
    wrapper.unmount()
  })

  it('does not open member details without the server-provided capability', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()
    wrapper.getComponent({ name: 'ProjectMemberListPanel' }).vm.$emit('select-member', { employee_no: 'E1', task_id: 999 })
    await flushPromises()
    expect(mockedApi.memberDetail).not.toHaveBeenCalled()
    expect(document.body.querySelector('.performance-drawer__panel')).toBeNull()
    wrapper.unmount()
  })

  it('keeps member headers when the member list is empty', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    vi.mocked(mockedApi.cycleMembers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.ui-table__sort-label').map(item => item.text())).toEqual(['姓名', '绩效评级', '360° 评估率', '直属上级', '序列', '职级', '入职日期', '所属部门'])
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

it('renders the 其他 group with a 人员组管理 card whose 查看 does not navigate yet', async () => {
  pinia = createPinia(); setActivePinia(pinia)
  usePerformanceProjectContextStore().setNavigation(navigationOf(1))
  vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
  const wrapper = mountView()
  await flushPromises()
  const panels = wrapper.findAllComponents({ name: 'AuthorizationManagementPanel' })
  expect(panels).toHaveLength(2)
  expect(panels[1].props('title')).toBe('其他')
  const other = panels[1].findAll('.auth-card')
  expect(other).toHaveLength(1)
  expect(other[0].text()).toContain('人员组管理')
  expect(other[0].text()).toContain('可将管理范围内的人员，添加进对应的人员组中')
  const pushCallsBefore = push.mock.calls.length
  await other[0].find('.text-button').trigger('click')
  await flushPromises()
  expect(push.mock.calls.length).toBe(pushCallsBefore)
  wrapper.unmount()
})


describe('authorization workspaces', () => {
  it('navigates after a real authorization and stays on members when every task was skipped', async () => {
    const { default: Dialog } = await import('@/components/performance/PerformanceTaskDelegationDialog.vue')
    pinia = createPinia(); setActivePinia(pinia)
    usePerformanceProjectContextStore().setNavigation(navigationOf(1))
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()
    push.mockClear()
    wrapper.getComponent(Dialog).vm.$emit('completed', 0, '', undefined, 2)
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    wrapper.getComponent(Dialog).vm.$emit('completed', 1, '', 21, 0)
    await flushPromises()
    expect(push).toHaveBeenCalledWith({ name: 'PerformanceAuthorizationRecords', query: { cycle_id: '1', highlight_id: '21', highlight_tab: 'authorization' } })
    wrapper.unmount()
  })

  it('locates the authorization ID on its page and scrolls the actual highlighted table row', async () => {
    const { default: Records } = await import('./ProjectAuthorizationRecords.vue')
    routeQuery.cycle_id = '1'; routeQuery.highlight_id = '21'; routeQuery.highlight_tab = 'transfer'
    const rows = Array.from({ length: 12 }, (_, index) => ({ id: String(100 + index), authorization_id: index === 11 ? 21 : 30 + index, initiator: '发起人', authorized_person: `接收人${index}`, status: '已转交', stages: ['上级评估'], reviewees: ['员工一'], submitted_at: '2026-11-01T00:00:00Z', can_revoke: false }))
    rows[0].id = '21'
    const records = vi.spyOn(projectManagementApi, 'authorizationRecords').mockResolvedValue({ cycle_id: 1, authorization_records: [], transfer_records: rows })
    const scroll = vi.fn()
    const previous = HTMLElement.prototype.scrollIntoView
    HTMLElement.prototype.scrollIntoView = scroll
    const wrapper = mount(Records, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    expect(wrapper.get('.ui-table__row.is-highlighted').text()).toContain('接收人11')
    expect(wrapper.text()).not.toContain('接收人0')
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest' })
    wrapper.unmount(); records.mockRestore(); HTMLElement.prototype.scrollIntoView = previous
    delete routeQuery.cycle_id; delete routeQuery.highlight_id; delete routeQuery.highlight_tab
  })

  it('splits delegation candidate requests into at most 200 distinct task IDs', async () => {
    const { api } = await import('@/api/client')
    const post = vi.spyOn(api, 'post').mockImplementation(async (_url, body: any) => ({ data: body.task_ids.map((task_id: number) => ({ project_id: 3, task_id, candidates: [] })) }))
    const result = await projectManagementApi.delegationCandidatesBatch(3, [...Array.from({ length: 201 }, (_, index) => index + 1), 1])
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[0][1]).toEqual({ project_id: 3, task_ids: Array.from({ length: 200 }, (_, index) => index + 1) })
    expect(post.mock.calls[1][1]).toEqual({ project_id: 3, task_ids: [201] })
    expect(result).toHaveLength(201)
    post.mockClear()
    expect(await projectManagementApi.delegationCandidatesBatch(3, [])).toEqual([])
    expect(post).not.toHaveBeenCalled()
    post.mockRestore()
  })

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
  const candidates = vi.spyOn(projectManagementApi, 'delegationCandidatesBatch').mockResolvedValue([
    { project_id: 3, task_id: 11, candidates: [{ employee_no: 'R1', display_name: '接收人' }] },
    { project_id: 3, task_id: 12, candidates: [{ employee_no: 'R1', display_name: '接收人' }] },
  ])
  const wrapper = mount(Calibration, { attachTo: document.body, global: { plugins: [pinia] } })
  await flushPromises()
  expect(wrapper.text()).toContain('校准人')
  const action = wrapper.findAll('.actions button').find(button => button.text() === '协助授权')!
  await action.trigger('click'); await flushPromises()
  expect(wrapper.getComponent(Dialog).props('tasks')).toEqual([{ project_id: 3, task_id: 11 }, { project_id: 3, task_id: 12 }])
  expect(candidates).toHaveBeenCalledWith(3, [11, 12])
  expect(document.querySelector<HTMLInputElement>('input[name="authorization-distribution"][value="NONE"]')?.disabled).toBe(true)
  wrapper.getComponent(Dialog).vm.$emit('completed', 2, 'preview_only')
  await flushPromises()
  expect(wrapper.text()).toContain('已授权 2 个任务')
  expect(wrapper.text()).not.toContain('测试模式')
  wrapper.unmount(); loaded.mockRestore(); candidates.mockRestore(); delete routeQuery.cycle_id
})
