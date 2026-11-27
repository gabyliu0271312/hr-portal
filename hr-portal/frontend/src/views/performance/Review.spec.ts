import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import { ElTableColumn } from 'element-plus'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { performanceReview360InviteApi, performanceReview360FeedbackApi, performanceNavigationApi, performanceReviewApi, performanceWorkbenchApi, projectManagementApi, resultViewApi, type PerformanceNavigationContext, type PerformanceReviewOverview } from '@/api/performance'
import { performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import { api } from '@/api/client'
import PerformanceCalibrationWorkspace from '@/components/performance/calibration/PerformanceCalibrationWorkspace.vue'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'

const push = vi.fn()
const replace = vi.fn()
const resolve = vi.fn(({ path, query }: { path: string; query: Record<string, string | undefined> }) => ({ href: `${path}?${new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString()}` }))
let routeQuery = {} as Record<string, string>
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ push, replace, resolve }),
}))

import Review from './Review.vue'
import SelfSummaryTask from './SelfSummaryTask.vue'
import PerformanceDialogShell from '@/components/performance/PerformanceDialogShell.vue'
import PerformanceResultScopeView from '@/components/performance/PerformanceResultScopeView.vue'
import PerformanceReviewContent from '@/components/performance/PerformanceReviewContent.vue'
import PerformanceTabbedSurface, { performanceAnalysisTabs } from '@/components/performance/PerformanceTabbedSurface.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'
import PerformanceReviewScopeAnalysis from '@/components/performance/PerformanceReviewScopeAnalysis.vue'
import ProjectPerformanceMatrix from '@/components/performance/ProjectPerformanceMatrix.vue'
import ProjectStatisticsReportPanel from '@/components/performance/ProjectStatisticsReportPanel.vue'
import ProjectReportDistribution from '@/components/performance/ProjectReportDistribution.vue'
import ProjectReportComparison from '@/components/performance/ProjectReportComparison.vue'
import MatrixPeopleDialog from '@/components/performance/MatrixPeopleDialog.vue'
import { reportNotesApi } from '@/api/performanceReportNotes'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import ProjectMemberListPanel from '@/components/performance/ProjectMemberListPanel.vue'
import PerformanceReview360FeedbackPanel from '@/components/performance/PerformanceReview360FeedbackPanel.vue'
import PerformanceReview360InvitePanel from '@/components/performance/PerformanceReview360InvitePanel.vue'
import PerformanceMemberReminderDialog from '@/components/performance/PerformanceMemberReminderDialog.vue'
import PerformanceReviewEvaluationDrawer from '@/components/performance/PerformanceReviewEvaluationDrawer.vue'
import PerformanceEvaluateRatioPopover from '@/components/performance/PerformanceEvaluateRatioPopover.vue'
import PerformanceMemberIdentity from '@/components/performance/PerformanceMemberIdentity.vue'
import PerformanceTaskStatus from '@/components/performance/PerformanceTaskStatus.vue'
import { normalizePerformanceTaskStatus, performanceTaskStatusLabel } from '@/components/performance/performanceTaskStatus'
import performanceLayoutSource from '@/layouts/PerformanceLayout.vue?raw'
import reviewSource from './Review.vue?raw'
import reviewContentSource from '@/components/performance/PerformanceReviewContent.vue?raw'
import sidebarSource from '@/components/performance/PerformanceReviewCategorySidebar.vue?raw'

const overview: PerformanceReviewOverview = {
  projects: [{ project_id: 1, project_name: '绩效项目', cycle_name: '2026年全年', cycle_start_at: '2026-01-01', cycle_end_at: '2026-12-31' }],
  active_project: { project_id: 1, project_name: '绩效项目', cycle_name: '2026年全年', cycle_start_at: '2026-01-01', cycle_end_at: '2026-12-31' },
  template_name: '半年度绩效评估模板',
  categories: [
    { key: 'mine', label: '我的绩效', nodes: [{ task_id: 11, node_id: 'summary', node_name: '工作总结环节', node_type: 'work_summary', task_kind: 'work_summary', entry_mode: 'template_task', executor_label: '被评估人', status: 'pending', start_at: null, end_at: null, action_url: '/performance/review?node=summary' }] },
    { key: 'others', label: '给他人的评估', nodes: [{ node_id: 'review-360', node_name: '360°评估', node_type: 'evaluation', executor_label: '360°评估人', status: 'overdue', start_at: null, end_at: null, action_url: '/performance/review?node=review-360' }] },
    { key: 'team', label: '我团队的绩效', nodes: [{ node_id: 'calibration', node_name: '校准环节', node_type: 'calibration', executor_label: '在项目配置时指定', status: 'not_started', start_at: null, end_at: null, action_url: '/performance/review?node=calibration' }] },
    { key: 'other', label: '其他事项', nodes: [{ node_id: 'appeal', node_name: '结果复议处理环节', node_type: 'result_reconsideration', executor_label: '', status: 'pending', start_at: null, end_at: null, action_url: '/performance/review?node=appeal' }] },
  ],
}

const resultOverview = (): PerformanceReviewOverview => {
  const value = structuredClone(overview)
  value.categories[0].nodes.push({ node_id: 'view-result', node_name: '查看绩效结果', node_type: 'result_view', executor_label: '被评估人', status: 'pending', start_at: null, end_at: null, action_url: '/performance/review?node=view-result' })
  return value
}

const navigationOf = (cycleId = 1, overrides: Partial<PerformanceNavigationContext> = {}): PerformanceNavigationContext => ({
  cycles: [
    { cycle_id: 1, cycle_name: '2025周期', cycle_start_at: '2025-01-01', cycle_end_at: '2025-12-31' },
    { cycle_id: 2, cycle_name: '2026周期', cycle_start_at: '2026-01-01', cycle_end_at: '2026-12-31' },
  ],
  active_cycle: cycleId ? { cycle_id: cycleId, cycle_name: cycleId === 1 ? '2025周期' : '2026周期', cycle_start_at: cycleId === 1 ? '2025-01-01' : '2026-01-01', cycle_end_at: cycleId === 1 ? '2025-12-31' : '2026-12-31' } : null,
  can_review: true,
  can_manage: true,
  review_projects: [overview.projects[0]],
  ...overrides,
})

const calibrationScope = (overrides: Partial<PerformanceCalibrationTaskScope> = {}): PerformanceCalibrationTaskScope => ({ scope_key: 'scope-rule-2', project_id: 1, project_name: '绩效项目', node_id: 'calibration', node_name: '校准', phase_id: 'phase-2', source_rule_id: 'rule-2', task_number: 2, scope_label: '项目全员', rule: null, status: 'pending', start_at: null, end_at: null, member_count: 2, can_complete: true, read_only: false, ...overrides })
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
  return mount(Review, {
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

describe('PerformanceReview', () => {
  it('adds team and focus result entries and opens the scoped readonly view', async () => {
    pinia = createPinia()
    setActivePinia(pinia)
    Object.keys(routeQuery).forEach(key => delete routeQuery[key])
    push.mockReset()
    replace.mockReset()
    const navigation = navigationOf(1, { can_view_team_results: true, can_view_focus_results: true })
    usePerformanceProjectContextStore().setNavigation(navigation)
    vi.spyOn(performanceNavigationApi, 'get').mockResolvedValue(navigation)
    vi.spyOn(performanceReviewApi, 'overview').mockResolvedValue(structuredClone(overview))
    vi.spyOn(performanceReviewApi, 'navigation').mockResolvedValue({ projects: structuredClone(overview.projects), overviews: [structuredClone(overview)] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('查看团队绩效结果')
    expect(wrapper.text()).toContain('关注人员的绩效结果')
    const teamNode = wrapper.findAll('button').find(button => button.text().includes('查看团队绩效结果'))!
    await teamNode.trigger('click')
    await flushPromises()
    const scoped = wrapper.getComponent(PerformanceResultScopeView)
    expect(scoped.props()).toMatchObject({ kind: 'team', cycleId: 1 })
    wrapper.unmount()
  })

  it.each(['team', 'focus'] as const)('从%s快捷入口进入成员列表且不补入项目参数', async kind => {
    routeQuery.node = kind === 'team' ? '__team-results__' : '__focus-results__'
    routeQuery.tab = 'members'
    routeQuery.cycle_id = '1'
    routeQuery.project_id = '999'
    usePerformanceProjectContextStore().setNavigation(navigationOf(1, { can_view_team_results: true, can_view_focus_results: true }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.getComponent(PerformanceResultScopeView).props('kind')).toBe(kind)
    expect(replace).toHaveBeenCalledWith({ query: { cycle_id: '1', node: routeQuery.node, tab: 'members' } })
    expect(replace.mock.calls.some(([target]) => target?.query?.project_id)).toBe(false)
    wrapper.unmount()
  })

  it('拒绝无结果范围资格的直接入口且不回退首节点', async () => {
    routeQuery.node = '__team-results__'
    routeQuery.tab = 'members'
    usePerformanceProjectContextStore().setNavigation(navigationOf(1))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent(PerformanceResultScopeView).exists()).toBe(false)
    expect(wrapper.text()).toContain('当前评估环节不存在或无权查看')
    expect(performanceReviewApi.overview).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('结果页签从URL初始化、响应前进后退并限制关注总览', async () => {
    routeQuery = reactive({ tab: 'members' })
    const wrapper = mount(PerformanceResultScopeView, {
      props: { kind: 'team', cycleId: 1 },
      global: { stubs: { PerformanceLineTabs: true, PerformanceReviewEvaluationDrawer: true } },
    })
    expect((wrapper.vm as any).activeTab).toBe('members')
    routeQuery.tab = 'matrix'
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as any).activeTab).toBe('matrix')
    ;(wrapper.vm as any).selectTab('reports')
    expect(push).toHaveBeenLastCalledWith({ query: { cycle_id: '1', node: '__team-results__', tab: 'reports' } })
    await wrapper.setProps({ kind: 'focus' })
    routeQuery.tab = 'overview'
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as any).activeTab).toBe('members')
    routeQuery.tab = 'invalid'
    await wrapper.vm.$nextTick()
    expect((wrapper.vm as any).activeTab).toBe('members')
    wrapper.unmount()
  })

  it('switches the real team completion panel to scoped departments and forwards department reminders', async () => {
    routeQuery = reactive({ tab: 'overview' })
    vi.spyOn(resultViewApi, 'overview').mockResolvedValue({ kind: 'team', cycle: navigationOf(1).active_cycle!, projects: [], member_count: 2, completion_nodes: [] })
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { columns: [{ key: 'self-review', title: '自评' }], rows: [{ id: '公司/部门A', department: '部门A', metrics: { 'self-review': { completion_rate: 50, completed_count: 1, total_count: 2 } } }] } })
    const wrapper = mount(PerformanceResultScopeView, { props: { kind: 'team', cycleId: 1 }, global: { plugins: [pinia], stubs: { PerformanceReviewEvaluationDrawer: true, PerformanceMemberReminderDialog: true } } })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '按部门')!.trigger('click')
    await flushPromises()
    expect(get).toHaveBeenCalledWith('/performance/project-management/department-completion', { params: { cycle_id: 1, result_kind: 'team' } })
    expect(wrapper.get('.department-table').text()).toContain('部门A')
    expect(wrapper.get('.department-table').text()).toContain('50.00%')
    await wrapper.get('.rate-link').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'PerformanceProjectReminder', query: { cycle_id: '1', node_key: 'self-review', department: '公司/部门A', source: 'team-results' } })
    await wrapper.findAll('button').find(button => button.text() === '全部')!.trigger('click')
    expect(wrapper.find('.department-table').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows department loading failures and clears old department data when the cycle changes', async () => {
    routeQuery = reactive({ tab: 'overview' })
    vi.spyOn(resultViewApi, 'overview').mockImplementation(async (_kind, cycleId) => ({ kind: 'team', cycle: navigationOf(cycleId).active_cycle!, projects: [], member_count: 1, completion_nodes: [] }))
    const provider = vi.spyOn(resultViewApi, 'departmentCompletion').mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ columns: [], rows: [] })
    const wrapper = mount(PerformanceResultScopeView, { props: { kind: 'team', cycleId: 1 }, global: { plugins: [pinia], stubs: { PerformanceReviewEvaluationDrawer: true, PerformanceMemberReminderDialog: true } } })
    await flushPromises()
    const clickMode = (label: string) => wrapper.findAll('button').find(button => button.text() === label)!.trigger('click')
    await clickMode('按部门')
    await flushPromises()
    expect(wrapper.text()).toContain('组织完成率加载失败')
    await clickMode('全部')
    await clickMode('按部门')
    await flushPromises()
    expect(wrapper.text()).not.toContain('组织完成率加载失败')
    await wrapper.setProps({ cycleId: 2 })
    await flushPromises()
    expect(wrapper.find('.department-table').exists()).toBe(false)
    await clickMode('按部门')
    await flushPromises()
    expect(provider).toHaveBeenLastCalledWith('team', 2)
    wrapper.unmount()
  })

  it.each(['team', 'focus'] as const)('renders real %s members with response columns, paging and complete ordered export', async kind => {
    routeQuery = reactive({ tab: 'members' })
    vi.spyOn(resultViewApi, 'overview').mockResolvedValue({ kind, cycle: navigationOf(1).active_cycle!, projects: [], member_count: 105, completion_nodes: [] })
    const schema = { columns: [{ key: 'name', label: '姓名', locked: true, sortable: true }, { key: 'department', label: '部门', sortable: true }], allowed_column_keys: ['name', 'department'], default_column_keys: ['name', 'department'], locked_column_keys: ['name'], sort_keys: ['name', 'department'] }
    const members = Array.from({ length: 105 }, (_, index) => ({ id: index + 1, root_review_id: index + 1, project_id: 3, employee_no: `E${index}`, display_name: `成员${index}`, department: '研发部', column_values: { name: `成员${index}`, department: '研发部' }, can_view_detail: true } as any))
    const get = vi.spyOn(api, 'get').mockImplementation(async (_url, config) => {
      const { page, page_size, keyword, sort_order } = config!.params
      const rows = members.filter(member => !keyword || member.display_name.includes(keyword))
      if (sort_order === 'desc') rows.reverse()
      return { data: { ...schema, items: rows.slice((page - 1) * page_size, page * page_size), total: rows.length, page, page_size } }
    })
    const wrapper = mount(PerformanceResultScopeView, { props: { kind, cycleId: 1 }, global: { plugins: [pinia], stubs: { PerformanceReviewEvaluationDrawer: true, PerformanceMemberReminderDialog: true } } })
    await flushPromises()
    const panel = wrapper.getComponent(ProjectMemberListPanel)
    const table = panel.getComponent({ name: 'PerformanceManagementTable' })
    expect(table.props('columns').map((column: { key: string }) => column.key)).toEqual(['name', 'department'])
    expect(table.props()).toMatchObject({ selectable: false, showSelectionBar: false, total: 105 })
    expect(wrapper.text()).toContain('成员0')
    expect(wrapper.text()).toContain('研发部')
    table.vm.$emit('page-change', 2)
    await flushPromises()
    expect(get).toHaveBeenLastCalledWith(`/performance/result-views/${kind}/members`, { params: expect.objectContaining({ cycle_id: 1, page: 2, page_size: 50 }) })
    expect(table.props('rows')[0].display_name).toBe('成员50')
    table.vm.$emit('sort-change', { key: 'name', order: 'desc' })
    await flushPromises()
    expect(table.props('rows')[0].display_name).toBe('成员104')
    const exportRows = panel.getComponent({ name: 'PerformanceExportButton' }).props('loadRows') as () => Promise<string[][]>
    const exported = await exportRows()
    expect(exported).toHaveLength(106)
    expect(exported[0]).toEqual(['姓名', '部门'])
    expect(exported[1]).toEqual(['成员104', '研发部'])
    expect(exported[105]).toEqual(['成员0', '研发部'])
    expect(get).toHaveBeenLastCalledWith(`/performance/result-views/${kind}/members`, { params: expect.objectContaining({ page: 2, page_size: 100, sort_by: 'name', sort_order: 'desc' }) })
    const toolbar = panel.getComponent({ name: 'PerformanceListToolbar' })
    toolbar.vm.$emit('update:keyword', '成员104')
    await wrapper.vm.$nextTick()
    toolbar.vm.$emit('search')
    await flushPromises()
    expect((await exportRows()).slice(1)).toEqual([['成员104', '研发部']])
    get.mockRejectedValueOnce(new Error('page failed'))
    await expect(exportRows()).rejects.toThrow('page failed')
    wrapper.unmount()
  })

  it.each(['empty', 'forbidden', 'incomplete-export'] as const)('handles result member %s without silently exporting partial rows', async state => {
    routeQuery = reactive({ tab: 'members' })
    vi.spyOn(resultViewApi, 'overview').mockResolvedValue({ kind: 'team', cycle: navigationOf(1).active_cycle!, projects: [], member_count: 1, completion_nodes: [] })
    const schema = { columns: [{ key: 'name', label: '姓名', locked: true }], allowed_column_keys: ['name'], default_column_keys: ['name'], locked_column_keys: ['name'], sort_keys: ['name'] }
    const members = vi.spyOn(resultViewApi, 'members').mockResolvedValue({ ...schema, items: [], total: state === 'incomplete-export' ? 1 : 0, page: 1, page_size: 50 })
    if (state === 'forbidden') members.mockRejectedValue({ response: { status: 403 } })
    const wrapper = mount(PerformanceResultScopeView, { props: { kind: 'team', cycleId: 1 }, global: { plugins: [pinia], stubs: { PerformanceReviewEvaluationDrawer: true, PerformanceMemberReminderDialog: true } } })
    await flushPromises()
    const panel = wrapper.getComponent(ProjectMemberListPanel)
    if (state === 'forbidden') expect(panel.text()).toContain('你没有当前成员范围的访问权限')
    else if (state === 'empty') expect(panel.text()).toContain('暂无成员')
    else {
      const exportRows = panel.getComponent({ name: 'PerformanceExportButton' }).props('loadRows') as () => Promise<string[][]>
      await expect(exportRows()).rejects.toThrow('INCOMPLETE_MEMBER_EXPORT')
    }
    wrapper.unmount()
  })

  it.each(['overview', 'members', 'matrix', 'reports'])('keeps the %s result tab inside one shared white surface', async tab => {
    routeQuery = reactive({ tab })
    vi.spyOn(resultViewApi, 'overview').mockResolvedValue({ kind: 'team', cycle: navigationOf(1).active_cycle!, projects: [], member_count: 0, completion_nodes: [] })
    const wrapper = mount(PerformanceResultScopeView, {
      props: { kind: 'team', cycleId: 1 },
      global: { plugins: [pinia], stubs: {
        CompletionRatePanel: true, ProjectMemberListPanel: true, ProjectPerformanceMatrix: true, ProjectStatisticsReportPanel: true,
        PerformanceReviewEvaluationDrawer: true, PerformanceMemberReminderDialog: true,
      } },
    })
    await flushPromises()
    expect(wrapper.findAll('.tabbed-surface-card')).toHaveLength(1)
    expect(wrapper.getComponent(PerformanceTabbedSurface).props('tabs')).toEqual([{ key: 'overview', label: '总览' }, ...performanceAnalysisTabs])
    expect(wrapper.getComponent(PerformanceLineTabs).props()).toMatchObject({ sticky: true, flush: false })
    expect(wrapper.find('.surface-card .line-tabs-holder').exists()).toBe(false)
    const content = wrapper.get('.tabbed-surface-card').findComponent({ name: { overview: 'CompletionRatePanel', members: 'ProjectMemberListPanel', matrix: 'ProjectPerformanceMatrix', reports: 'ProjectStatisticsReportPanel' }[tab] })
    if (tab === 'members') expect(content.props('variant')).toBe('review')
    else expect(content.attributes('embedded') === 'true' || content.props('embedded') === true).toBe(true)
    wrapper.unmount()
  })

  it.each(['team', 'focus'] as const)('forwards %s member reconsideration editing and reminders with the original result context', async kind => {
    routeQuery = reactive({ cycle_id: '1', node: kind === 'team' ? '__team-results__' : '__focus-results__', tab: 'members' })
    vi.spyOn(resultViewApi, 'overview').mockResolvedValue({ kind, cycle: navigationOf(1).active_cycle!, projects: [], member_count: 1, completion_nodes: [] })
    const wrapper = mount(PerformanceResultScopeView, {
      props: { kind, cycleId: 1 },
      global: { stubs: { PerformanceLineTabs: true, PerformanceReviewEvaluationDrawer: true, PerformanceMemberReminderDialog: true } },
    })
    await flushPromises()
    await (wrapper.vm as any).openMember({ project_id: 3, employee_no: 'E001', root_review_id: 15, display_name: '成员', can_view_detail: true })
    const drawer = wrapper.getComponent(PerformanceReviewEvaluationDrawer)
    drawer.vm.$emit('update:active-tab', 'management-appeal')
    await flushPromises()
    expect(replace).toHaveBeenLastCalledWith({ query: expect.objectContaining({ member_project_id: '3', rootReviewId: '15', employee_no: 'E001', activeTab: 'management-appeal' }) })
    push.mockClear()
    drawer.vm.$emit('edit', { task_id: 81, employee_no: 'E001', task_kind: 'result_reconsideration', node_id: 'appeal', draft_choice: 'use' })
    await flushPromises()
    expect(push).toHaveBeenCalledWith({ path: '/performance/review/template-task', query: {
      task_id: '81', employee_no: 'E001', project_id: '3', cycle_id: '1', node: 'appeal', return_entry: kind, return_tab: 'members', return_root_review_id: '15', draft_choice: 'use',
    } })
    drawer.vm.$emit('remind', { task_id: 82, node_id: 'appeal', employee_no: 'E001', can_remind: true })
    await flushPromises()
    expect(wrapper.getComponent(PerformanceMemberReminderDialog).props()).toMatchObject({ modelValue: true, context: { projectId: 3, cycleId: 1, employeeNo: 'E001', nodeId: 'appeal', targetTaskId: 82 } })
    wrapper.unmount()
  })

  it.each(['team', 'focus'] as const)('restores the %s member and reconsideration tab from the return URL', async kind => {
    routeQuery = reactive({ cycle_id: '1', node: kind === 'team' ? '__team-results__' : '__focus-results__', tab: 'members', member_project_id: '3', employee_no: 'E001', rootReviewId: '15', activeTab: 'management-appeal' })
    vi.spyOn(resultViewApi, 'overview').mockResolvedValue({ kind, cycle: navigationOf(1).active_cycle!, projects: [], member_count: 1, completion_nodes: [] })
    const wrapper = mount(PerformanceResultScopeView, { props: { kind, cycleId: 1 }, global: { stubs: { PerformanceLineTabs: true, PerformanceReviewEvaluationDrawer: true } } })
    await flushPromises()
    expect(wrapper.getComponent(PerformanceReviewEvaluationDrawer).props()).toMatchObject({ modelValue: true, employeeNo: 'E001', projectId: 3, activeTab: 'management-appeal' })
    wrapper.unmount()
  })

  it('keeps equal node ids from two projects separately reachable and opens the real task', async () => {
    const projects = [overview.projects[0], { ...overview.projects[0], project_id: 2, project_name: '第二项目' }]
    const projectOverview = (projectId: number): PerformanceReviewOverview => ({
      ...structuredClone(overview), projects, active_project: projects[projectId - 1], template_name: `项目${projectId}模板`,
      categories: [{ key: 'mine', label: '我的绩效', nodes: [{ ...overview.categories[0].nodes[0], task_id: projectId * 11 }] }],
    })
    usePerformanceProjectContextStore().setNavigation(navigationOf(1, { review_projects: projects, can_view_team_results: true, can_view_focus_results: true }))
    vi.mocked(performanceReviewApi.navigation).mockResolvedValue({ projects, overviews: [projectOverview(1), projectOverview(2)] })
    vi.mocked(performanceReviewApi.overview).mockImplementation(async projectId => projectOverview(projectId || 1))
    const wrapper = mountView()
    await flushPromises()
    expect(performanceReviewApi.navigation).toHaveBeenCalledWith(1)
    expect(wrapper.find('.project-picker').exists()).toBe(false)
    expect(wrapper.findAll('.cycle-picker')).toHaveLength(1)
    expect(wrapper.findAll('.review-node').filter(node => node.text().includes('工作总结环节')).map(node => node.text())).toEqual(['工作总结环节待完成', '工作总结环节待完成'])
    expect(wrapper.findAll('.review-node .node-label').map(node => node.text()).join(' ')).not.toMatch(/绩效项目|第二项目|2026年全年/)
    for (const projectId of [2, 1]) {
      await wrapper.findAll('.review-node').filter(node => node.text().includes('工作总结环节'))[projectId - 1].trigger('click')
      await flushPromises()
      expect(usePerformanceProjectContextStore().activeProjectId).toBe(projectId)
      expect(wrapper.findAll('.review-node.active')).toHaveLength(1)
      expect(wrapper.get('.review-node.active .node-label').text()).toBe('工作总结环节')
      await wrapper.get('.primary-button').trigger('click')
      expect(push).toHaveBeenLastCalledWith(`/performance/review/self-summary?task_id=${projectId * 11}&project_id=${projectId}&node=summary`)
      expect(replace).toHaveBeenCalledWith({ query: expect.objectContaining({ project_id: String(projectId), node: 'summary' }) })
    }
    await wrapper.get('.sidebar-collapse').trigger('click')
    await wrapper.get('.category-toggle').trigger('click')
    expect(wrapper.findAll('.flyout-node')).toHaveLength(2)
    expect(wrapper.findAll('.flyout-node').map(node => node.text())).toEqual(['工作总结环节', '工作总结环节'])
    await wrapper.findAll('.flyout-node')[1].trigger('click')
    await flushPromises()
    expect(usePerformanceProjectContextStore().activeProjectId).toBe(2)
    expect(wrapper.get('.review-node.active .node-label').text()).toBe('工作总结环节')
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)
    expect(wrapper.findAll('.review-node').filter(node => node.text().includes('查看团队绩效结果'))).toHaveLength(1)
    expect(wrapper.findAll('.review-node').filter(node => node.text().includes('关注人员的绩效结果'))).toHaveLength(1)
    wrapper.unmount()
  })

  it('fixes category order across project subsets and inserts result-only team before other', async () => {
    const projects = [overview.projects[0], { ...overview.projects[0], project_id: 2 }]
    const projectOverview = (projectId: number): PerformanceReviewOverview => ({
      ...structuredClone(overview), projects, active_project: projects[projectId - 1],
      categories: projectId === 1 ? [overview.categories[3]] : [overview.categories[1], overview.categories[0]],
    })
    usePerformanceProjectContextStore().setNavigation(navigationOf(1, { review_projects: projects, can_view_team_results: true }))
    vi.mocked(performanceReviewApi.navigation).mockResolvedValue({ projects, overviews: [projectOverview(1), projectOverview(2)] })
    vi.mocked(performanceReviewApi.overview).mockImplementation(async projectId => projectOverview(projectId || 1))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('.category-label').map(item => item.text())).toEqual(['我的绩效', '给他人的评估', '我团队的绩效', '其他事项'])
    wrapper.unmount()
  })

  it('aggregates cross-project and same-project 360 nodes into one expanded and collapsed menu without hiding other evaluations', async () => {
    const projects = [overview.projects[0], { ...overview.projects[0], project_id: 2, project_name: '第二项目' }]
    const feedback = { ...overview.categories[1].nodes[0], executor_role_code: 'assessment.reviewer_360' }
    const projectOverview = (projectId: number): PerformanceReviewOverview => ({
      ...structuredClone(overview), projects, active_project: projects[projectId - 1],
      categories: [{ key: 'others', label: '给他人的评估', nodes: [
        { ...feedback, node_id: 'first-360' },
        { ...feedback, node_id: 'second-360' },
        ...(projectId === 1 ? [{ ...feedback, node_id: 'metric', node_name: '指标评价', executor_role_code: 'assessment.metric_evaluator' }] : []),
      ] }],
    })
    Object.assign(routeQuery, { project_id: '2', node: 'second-360' })
    usePerformanceProjectContextStore().setNavigation(navigationOf(1, { review_projects: projects }))
    vi.mocked(performanceReviewApi.navigation).mockResolvedValue({ projects, overviews: [projectOverview(1), projectOverview(2)] })
    vi.mocked(performanceReviewApi.overview).mockImplementation(async projectId => projectOverview(projectId || 2))
    const list = vi.spyOn(performanceReview360FeedbackApi, 'list')
    list.mockResolvedValue({ items: [], total: 0, node_id: 'first-360', allow_voluntary_evaluation: false })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findAll('.review-node .node-label').map(item => item.text())).toEqual(['360°评估', '指标评价'])
    expect(wrapper.get('.review-node.active .node-label').text()).toBe('360°评估')
    expect(wrapper.getComponent(PerformanceReviewContent).props('feedbackSources')).toHaveLength(4)
    const panel = wrapper.getComponent(PerformanceReview360FeedbackPanel)
    panel.vm.$emit('open-task', { task_id: 99, employee_no: 'E2', display_name: '同事', status: 'pending', project_id: 1, node_id: 'second-360' })
    await flushPromises()
    expect(push).toHaveBeenLastCalledWith('/performance/review/template-task?task_id=99&project_id=1&node=second-360&employee_no=E2')
    expect(replace).toHaveBeenCalledWith({ query: expect.objectContaining({ project_id: '1', node: 'second-360' }) })
    expect(wrapper.get('.review-node.active .node-label').text()).toBe('360°评估')
    await wrapper.get('.sidebar-collapse').trigger('click')
    await wrapper.get('.category-toggle').trigger('click')
    expect(wrapper.findAll('.flyout-node').map(item => item.text())).toEqual(['360°评估', '指标评价'])
    wrapper.unmount()
  })

  it.each([
    ['单来源未开始', ['not_started'], true],
    ['同项目多来源全部未开始', ['not_started', 'not_started'], true],
    ['未开始与待完成混合', ['not_started', 'pending'], false],
    ['未开始与已完成混合', ['not_started', 'completed'], false],
    ['已开始无任务', ['pending'], false],
  ] as const)('%s时正确区分360未开始空态与无任务空态', async (_label, statuses, notStarted) => {
    const scheduled = structuredClone(overview)
    scheduled.categories = [{ key: 'others', label: '给他人的评估', nodes: statuses.map((status, index) => ({
      ...overview.categories[1].nodes[0], node_id: `feedback-${index}`, executor_role_code: 'assessment.reviewer_360',
      task_kind: 'evaluation', status, start_at: '2099-01-01T00:00:00Z',
    })) }]
    routeQuery.node = 'feedback-0'
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(scheduled)
    const list = vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({
      items: [], total: 0, node_id: 'feedback-0', voluntary_evaluation_enabled: true,
      allow_voluntary_evaluation: false, voluntary_evaluation_disabled_reason: '360°评估尚未开始，无法发起自愿评估',
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent(PerformanceReview360FeedbackPanel).exists()).toBe(!notStarted)
    expect(wrapper.find('button[aria-label="自愿评估"]').exists()).toBe(!notStarted)
    expect(wrapper.find('.primary-button').exists()).toBe(false)
    if (notStarted) {
      expect(wrapper.get('.state-illustration img').attributes('src')).toBe('/performance-not-started.svg')
      expect(wrapper.get('.review-panel').text()).toBe('暂未启动')
      expect(wrapper.get('.review-body').classes()).not.toContain('review-body--workspace')
      expect(list).not.toHaveBeenCalled()
    } else {
      expect(wrapper.get('.review-panel').text()).toContain('暂无 360° 评估邀请，可以自愿评估其他同事')
      expect(wrapper.text()).not.toContain('暂未启动')
      expect(list).toHaveBeenCalled()
    }
    wrapper.unmount()
  })

  it.each(['not_started', 'pending', 'completed'] as const)('跨项目聚合以全部来源而非选中节点判断未开始（另一来源%s）', async status => {
    const projects = [overview.projects[0], { ...overview.projects[0], project_id: 2, project_name: '第二项目' }]
    usePerformanceProjectContextStore().setNavigation(navigationOf(1, { review_projects: projects }))
    routeQuery.node = 'feedback-1'
    const navigationOverviews = projects.map((project, index) => ({
      ...structuredClone(overview), projects, active_project: project,
      categories: [{ key: 'others', label: '给他人的评估', nodes: [{
        ...overview.categories[1].nodes[0], node_id: `feedback-${index + 1}`, executor_role_code: 'assessment.reviewer_360',
        status: index === 1 ? status : 'not_started',
      }] }],
    }))
    vi.mocked(performanceReviewApi.navigation).mockResolvedValue({ projects, overviews: navigationOverviews })
    vi.mocked(performanceReviewApi.overview).mockImplementation(async projectId => ({
      ...structuredClone(overview), projects, active_project: projects[(projectId || 1) - 1],
      categories: [{ key: 'others', label: '给他人的评估', nodes: [{
        ...overview.categories[1].nodes[0], node_id: `feedback-${projectId || 1}`, executor_role_code: 'assessment.reviewer_360',
        status: projectId === 2 ? status : 'not_started',
      }] }],
    }))
    const list = vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [], total: 0, node_id: 'feedback-2', allow_voluntary_evaluation: false })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.getComponent(PerformanceReviewContent).props('node')?.status).toBe('not_started')
    if (status === 'not_started') {
      expect(wrapper.get('.review-panel').text()).toBe('暂未启动')
      expect(list).not.toHaveBeenCalled()
    } else {
      expect(wrapper.findComponent(PerformanceReview360FeedbackPanel).exists()).toBe(true)
      expect(list).toHaveBeenCalledWith(1, undefined, 'feedback-1')
      expect(list).toHaveBeenCalledWith(2, undefined, 'feedback-2')
    }
    wrapper.unmount()
  })

  it('360从已开始切回未开始时卸载列表和自愿评估按钮', async () => {
    vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [], total: 0, node_id: 'feedback', voluntary_evaluation_enabled: true, allow_voluntary_evaluation: true })
    const node = { ...overview.categories[1].nodes[0], executor_role_code: 'assessment.reviewer_360', status: 'pending' as const }
    const wrapper = mount(PerformanceReviewContent, { props: { loading: false, error: '', templateName: '', projectId: 1, node }, global: { plugins: [pinia] } })
    await flushPromises()
    expect(wrapper.find('button[aria-label="自愿评估"]').exists()).toBe(true)
    await wrapper.setProps({ node: { ...node, status: 'not_started' } })
    await flushPromises()
    expect(wrapper.get('.review-panel').text()).toBe('暂未启动')
    expect(wrapper.findComponent(PerformanceReview360FeedbackPanel).exists()).toBe(false)
    expect(wrapper.find('button[aria-label="自愿评估"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('aggregates feedback rows and voluntary candidates while retaining their real project and node', async () => {
    const sources = [
      { project_id: 1, node_id: 'first-360', project_name: '项目一', node_name: '360°评估' },
      { project_id: 2, node_id: 'second-360', project_name: '项目二', node_name: '360°评估' },
    ]
    const list = vi.spyOn(performanceReview360FeedbackApi, 'list').mockImplementation(async projectId => ({
      items: [{ task_id: Number(projectId) * 10, employee_no: 'E2', display_name: '同事', department: null, job_sequence: null, position_level: null, status: 'pending', source_label: '邀请', relationship: '', due_at: null }],
      total: 1, node_id: sources[Number(projectId) - 1].node_id, allow_voluntary_evaluation: true,
    }))
    const candidates = vi.spyOn(performanceReview360FeedbackApi, 'candidates').mockResolvedValue({ items: [{ employee_no: 'E3', display_name: '同名候选人', department: null, job_sequence: null }], total: 1 })
    const start = vi.spyOn(performanceReview360FeedbackApi, 'start').mockResolvedValue({ task_id: 55, target_employee_no: 'E3' })
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'first-360', sources }, global: { plugins: [pinia] } })
    await flushPromises()
    expect(list).toHaveBeenCalledWith(1, undefined, 'first-360')
    expect(list).toHaveBeenCalledWith(2, undefined, 'second-360')
    const table = wrapper.findComponent({ name: 'PerformanceManagementTable' })
    expect(table.props('rows')).toHaveLength(2)
    table.vm.$emit('row-click', table.props('rows')[1])
    expect(wrapper.emitted('open-task')?.[0]?.[0]).toMatchObject({ task_id: 20, project_id: 2, node_id: 'second-360' })
    ;(wrapper.vm as unknown as { openVoluntaryDialog: () => void }).openVoluntaryDialog()
    await flushPromises()
    expect(candidates).toHaveBeenCalledWith(1, undefined, 'first-360')
    expect(candidates).toHaveBeenCalledWith(2, undefined, 'second-360')
    const select = wrapper.findComponent({ name: 'PerformancePersonSelect' })
    expect(select.props('options')).toHaveLength(2)
    select.vm.$emit('update:modelValue', select.props('options')[1].value)
    await flushPromises()
    Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.trim() === '前往评估')!.click()
    await flushPromises()
    expect(start).toHaveBeenCalledWith(2, 'E3', 'second-360')
    expect(wrapper.emitted('open-task')?.[1]?.[0]).toMatchObject({ task_id: 55, project_id: 2, node_id: 'second-360' })
    wrapper.unmount()
  })

  it('restores a real 360 project and node when browser history changes the query', async () => {
    routeQuery = reactive({ project_id: '1', node: 'first-360' })
    const projects = [overview.projects[0], { ...overview.projects[0], project_id: 2 }]
    const feedback = { ...overview.categories[1].nodes[0], executor_role_code: 'assessment.reviewer_360' }
    usePerformanceProjectContextStore().setNavigation(navigationOf(1, { review_projects: projects }))
    vi.mocked(performanceReviewApi.overview).mockImplementation(async projectId => ({ ...structuredClone(overview), projects, active_project: projects[(projectId || 1) - 1], categories: [{ key: 'others', label: '给他人的评估', nodes: [{ ...feedback, node_id: projectId === 2 ? 'second-360' : 'first-360' }] }] }))
    vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [], total: 0, node_id: null, allow_voluntary_evaluation: false })
    const wrapper = mountView()
    await flushPromises()
    Object.assign(routeQuery, { project_id: '2', node: 'second-360' })
    await flushPromises()
    expect(usePerformanceProjectContextStore().activeProjectId).toBe(2)
    expect(wrapper.getComponent(PerformanceReviewContent).props('node')).toMatchObject({ node_id: 'second-360' })
    expect(wrapper.findAll('.review-node')).toHaveLength(1)
    expect(wrapper.get('.review-node').classes()).toContain('active')
    wrapper.unmount()
  })

  it('fails closed when one feedback source is forbidden and retries the complete aggregate', async () => {
    const sources = [{ project_id: 1, node_id: 'first', project_name: '甲', node_name: '360' }, { project_id: 2, node_id: 'second', project_name: '乙', node_name: '360' }]
    const list = vi.spyOn(performanceReview360FeedbackApi, 'list').mockImplementation(async projectId => {
      if (Number(projectId) === 2) throw { response: { status: 403 } }
      return { items: [], total: 0, node_id: 'first', allow_voluntary_evaluation: true }
    })
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'first', sources }, global: { plugins: [pinia] } })
    await flushPromises()
    expect(wrapper.text()).toContain('360° 评估列表加载失败')
    expect((wrapper.vm as unknown as { allowVoluntary: boolean }).allowVoluntary).toBe(false)
    list.mockResolvedValue({ items: [], total: 0, node_id: null, allow_voluntary_evaluation: true })
    await wrapper.findAll('button').find(button => button.text() === '重新加载')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('列表加载失败')
    expect((wrapper.vm as unknown as { allowVoluntary: boolean }).allowVoluntary).toBe(true)
    wrapper.unmount()
  })

  it('discards delayed aggregate rows when the source context changes', async () => {
    let finish!: (value: Awaited<ReturnType<typeof performanceReview360FeedbackApi.list>>) => void
    const list = vi.spyOn(performanceReview360FeedbackApi, 'list').mockImplementation(projectId => Number(projectId) === 1 ? new Promise(resolve => { finish = resolve }) : Promise.resolve({ items: [], total: 0, node_id: 'second', allow_voluntary_evaluation: false }))
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'first', sources: [{ project_id: 1, node_id: 'first', project_name: '甲', node_name: '360' }, { project_id: 2, node_id: 'second', project_name: '乙', node_name: '360' }] }, global: { plugins: [pinia] } })
    await flushPromises()
    await wrapper.setProps({ projectId: 2, nodeId: 'second', sources: undefined })
    await flushPromises()
    finish({ items: [], total: 99, node_id: 'first', allow_voluntary_evaluation: true })
    await flushPromises()
    expect(wrapper.getComponent({ name: 'PerformanceManagementTable' }).props('total')).toBe(0)
    expect((wrapper.vm as unknown as { allowVoluntary: boolean }).allowVoluntary).toBe(false)
    expect(list).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('drops late aggregated project menus after switching cycles', async () => {
    const projects = [overview.projects[0], { ...overview.projects[0], project_id: 2, project_name: '旧周期第二项目' }]
    let resolveOld!: (value: Awaited<ReturnType<typeof performanceReviewApi.navigation>>) => void
    vi.mocked(performanceReviewApi.navigation).mockImplementation(cycleId => cycleId === 1
      ? new Promise(done => { resolveOld = done })
      : Promise.resolve({ projects: overview.projects, overviews: [{ ...structuredClone(overview), template_name: '新周期模板' }] }))
    vi.mocked(performanceReviewApi.overview).mockImplementation((_projectId, _taskId, cycleId) => Promise.resolve(cycleId === 1 ? { ...structuredClone(overview), projects } : { ...structuredClone(overview), template_name: '新周期模板' }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('工作总结环节')
    expect(wrapper.text()).not.toContain('正在加载绩效评估')
    wrapper.findComponent({ name: 'PerformanceReviewCategorySidebar' }).vm.$emit('select-filter', 2)
    await flushPromises()
    resolveOld({ projects, overviews: [{ ...structuredClone(overview), projects, active_project: projects[1], categories: [{ key: 'mine', label: '我的绩效', nodes: [{ ...overview.categories[0].nodes[0], node_name: '旧周期敏感节点' }] }] }] })
    await flushPromises()
    expect(wrapper.text()).toContain('新周期模板')
    expect(wrapper.text()).not.toContain('旧周期敏感节点')
    expect(usePerformanceProjectContextStore().reviewOverview(2)).toBeNull()
    wrapper.unmount()
  })

  it('lets completed cards grow with content instead of shrinking inside the scroll viewport', () => {
    expect(reviewContentSource).toContain("'review-body--completed': !resultUnavailable && (node.node_type === 'result_view' || node.status === 'completed'")
    expect(reviewContentSource).toMatch(/\.review-body--completed\s*\{[^}]*flex:\s*1 0 auto/)
    expect(reviewContentSource).toMatch(/\.review-panel\.completed\s*\{[^}]*flex:\s*1 0 auto;[^}]*min-height:\s*0/)
    expect(reviewContentSource).toMatch(/\.completed-content\s*\{[^}]*flex:\s*none/)
    expect(reviewContentSource).toContain('.review-panel > p, .review-state p')
  })

  it('renders reconsideration directly as a members table without manager tabs', async () => {
    const node = { ...overview.categories[3].nodes[0], task_kind: 'result_reconsideration', entry_mode: 'template_task' as const }
    const wrapper = mount(PerformanceReviewContent, {
      props: { node, projectId: 1, loading: false, error: '', templateName: '模板' },
      global: { stubs: { ProjectMemberListPanel: { template: '<div class="recon-member-table" />' } } },
    })
    await flushPromises()
    expect(wrapper.find('.recon-member-table').exists()).toBe(true)
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('矩阵分析')
    expect(wrapper.text()).not.toContain('统计报表')
    wrapper.unmount()
  })

  it('renders reconsideration frozen and updated results through shared dynamic columns', async () => {
    const node = { ...overview.categories[3].nodes[0], task_kind: 'result_reconsideration', entry_mode: 'template_task' as const }
    const row = {
      task_id: 81, employee_no: 'E001', display_name: '复议成员', status: 'pending', due_at: null,
      job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null,
      department: null, employee_type: null, employment_status: null,
      rating_columns: [{ key: 'rating:grade', label: '年度绩效' }, { key: 'rating:value', label: '价值贡献' }],
      ratings: { 'rating:grade': { label: 'B', color: '#d9f5d6' }, 'rating:value': { label: 'A', color: '#e1eaff' } },
    }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue({ items: [row], total: 1, rating_columns: row.rating_columns })
    const wrapper = mount(PerformanceReviewContent, { props: { node, projectId: 1, loading: false, error: '', templateName: '模板' } })
    await flushPromises()
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenCalledWith(1, 'appeal', 'all', undefined, undefined, 1, 50, undefined, undefined)
    expect(wrapper.findAll('th').map(cell => cell.text())).toEqual(expect.arrayContaining(['年度绩效', '价值贡献']))
    expect(wrapper.findAll('.performance-rating-tag').map(tag => tag.text())).toEqual(['B', 'A'])
    expect(wrapper.text()).not.toContain('矩阵分析')
    const panel = wrapper.getComponent(ProjectMemberListPanel)
    expect(panel.findComponent({ name: 'PerformanceExportButton' }).exists()).toBe(false)
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue({ items: [{ ...row, status: 'completed', ratings: { ...row.ratings, 'rating:grade': { label: 'A', color: '#d9f5d6' } } }], total: 1, rating_columns: row.rating_columns })
    await panel.get('input').trigger('keyup.enter')
    await flushPromises()
    expect(wrapper.findAll('.performance-rating-tag').map(tag => tag.text())).toEqual(['A', 'A'])
    panel.findComponent({ name: 'ProjectMemberColumnDrawer' }).vm.$emit('confirm', ['name', 'rating:grade'])
    await flushPromises()
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue({ items: [], total: 0, rating_columns: row.rating_columns })
    await panel.get('input').setValue('no-match')
    await panel.get('input').trigger('keyup.enter')
    await flushPromises()
    const headers = wrapper.findAll('th').map(cell => cell.text())
    expect(headers).toContain('年度绩效')
    expect(headers).not.toContain('价值贡献')
    wrapper.unmount()
  })

  it('opens pending reconsideration through the full shared task workspace', async () => {
    const node = { ...overview.categories[3].nodes[0], task_kind: 'result_reconsideration', entry_mode: 'template_task' as const }
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...structuredClone(overview), categories: [{ key: 'other', label: '其他事项', nodes: [node] }] })
    const wrapper = mountView()
    await flushPromises()
    push.mockClear()
    wrapper.getComponent(PerformanceReviewContent).vm.$emit('open-member', { node, member: { task_id: 81, employee_no: 'E001', display_name: '成员', status: 'pending' } })
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=81&project_id=1&node=appeal&employee_no=E001&cycle_id=1')
    expect(wrapper.findComponent(SelfSummaryTask).exists()).toBe(false)
    expect(wrapper.findComponent(PerformanceDialogShell).exists()).toBe(false)
    expect(wrapper.findComponent(PerformanceReviewEvaluationDrawer).exists()).toBe(false)
    wrapper.unmount()
  })

  it('reopens completed reconsideration through the full workspace with its draft choice', async () => {
    const node = { ...overview.categories[3].nodes[0], task_kind: 'result_reconsideration', entry_mode: 'template_task' as const }
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...structuredClone(overview), categories: [{ key: 'other', label: '其他事项', nodes: [node] }] })
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 81, task_kind: 'result_reconsideration', entry_mode: 'template_task', node_name: node.node_name, person: { employee_no: 'E001', display_name: '成员' }, editable: true, submit_allowed: true, form_schema: [], answers: {} })
    const wrapper = mountView()
    await flushPromises()
    push.mockClear()
    wrapper.getComponent(PerformanceReviewContent).vm.$emit('open-member', { node, member: { task_id: 81, employee_no: 'E001', display_name: '成员', status: 'completed' } })
    await flushPromises()
    const drawer = wrapper.getComponent(PerformanceReviewEvaluationDrawer)
    expect(drawer.props('readonly')).toBe(false)
    expect(wrapper.findComponent(SelfSummaryTask).exists()).toBe(false)
    drawer.vm.$emit('edit', { task_id: 81, employee_no: 'E001', draft_choice: 'use', task_kind: 'result_reconsideration', node_id: 'appeal' })
    await flushPromises()
    expect(wrapper.findComponent(SelfSummaryTask).exists()).toBe(false)
    expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=81&project_id=1&node=appeal&employee_no=E001&draft_choice=use&cycle_id=1')
    wrapper.unmount()
  })

  it('uses the drawer edit payload when the reconsideration tab belongs to a different node', async () => {
    const node = { ...overview.categories[2].nodes[0], node_type: 'calibration', task_kind: 'calibration' }
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 81, task_kind: 'calibration', entry_mode: 'template_task', node_name: node.node_name, person: { employee_no: 'E001', display_name: '成员' }, editable: true, submit_allowed: true, form_schema: [], answers: {} })
    const wrapper = mountView()
    await flushPromises()
    wrapper.getComponent(PerformanceReviewContent).vm.$emit('open-member', { node, member: { task_id: 81, employee_no: 'E001', status: 'completed' } })
    await flushPromises()
    push.mockClear()
    wrapper.getComponent(PerformanceReviewEvaluationDrawer).vm.$emit('edit', { task_id: 91, employee_no: 'E002', task_kind: 'result_reconsideration', node_id: 'appeal' })
    await flushPromises()
    expect(wrapper.findComponent(SelfSummaryTask).exists()).toBe(false)
    expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=91&project_id=1&node=appeal&employee_no=E002&cycle_id=1')
    wrapper.unmount()
  })

  it('uses the identity epoch as the view key without remounting on query navigation', () => {
    expect(performanceLayoutSource).toMatch(/<router-view\b[^>]*:key="employeeSwitchEpoch"/)
    expect(performanceLayoutSource).not.toContain('route.fullPath')
  })

  it('uses the same outer card width and scrollbar behavior for every node state', () => {
    expect(performanceLayoutSource).toMatch(/\.review-main\s*\{[^}]*scrollbar-gutter:\s*auto/s)
    expect(performanceLayoutSource).toContain(':global(html:has(.performance-app)) { scrollbar-gutter: auto; }')
    expect(reviewSource).not.toContain(':global(html:has(.review-page))')
    expect(reviewContentSource).toMatch(/\.review-content\s*\{[^}]*padding:\s*var\(--performance-review-surface-inset\) var\(--performance-review-surface-inset\) 0;[^}]*scrollbar-width:\s*none/s)
    expect(reviewContentSource).toMatch(/\.review-content::-webkit-scrollbar\s*\{[^}]*display:\s*none/s)
    expect(reviewContentSource).not.toMatch(/\.review-content\.is-completed\s*\{/)
  })

  it('shares the tabbed surface outside the legacy padded evaluation panel', () => {
    expect(reviewContentSource).toContain('<PerformanceTabbedSurface v-if="showsTabbedWorkspace"')
    expect(reviewContentSource).not.toContain('<PerformanceLineTabs')
    expect(reviewContentSource).toMatch(/\.review-content--tabbed \.review-body\s*\{[^}]*margin:\s*0/s)
    expect(reviewContentSource).toMatch(/\.review-panel\.completed\s*\{[^}]*padding:\s*var\(--performance-review-surface-inset\)/s)
  })

  it.each(['pending', 'completed'] as const)('uses one shared sticky tabbed surface for a %s manager task', async status => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'manager', node_type: 'evaluation', task_kind: 'evaluation', executor_role_code: 'assessment.line_manager', status }
    const wrapper = mount(PerformanceReviewContent, {
      props: { node, loading: false, error: '', templateName: '', projectId: 1, cycleId: 1 },
      global: { plugins: [pinia], stubs: { ProjectMemberListPanel: true, PerformanceReviewScopeAnalysis: true } },
    })
    expect(wrapper.getComponent(PerformanceTabbedSurface).props('tabs')).toEqual(performanceAnalysisTabs)
    expect(wrapper.getComponent(PerformanceLineTabs).props()).toMatchObject({ sticky: true, flush: false })
    expect(wrapper.findAll('.surface-card')).toHaveLength(1)
    expect(wrapper.find('.review-panel').exists()).toBe(false)
    expect(wrapper.find('.surface-card .line-tabs-holder').exists()).toBe(false)
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.text())).toEqual(['成员列表', '矩阵分析', '统计报表'])
    expect(wrapper.getComponent(ProjectMemberListPanel).props('reviewContext')).toEqual({ nodeId: 'manager', state: 'all', phaseId: undefined })
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(wrapper.getComponent(PerformanceReviewScopeAnalysis).props('tab')).toBe('matrix')
    await wrapper.findAll('[role="tab"]')[2].trigger('click')
    expect(wrapper.getComponent(PerformanceReviewScopeAnalysis).props('tab')).toBe('reports')
    await wrapper.setProps({ node: { ...node, node_id: 'next-manager' } })
    expect(wrapper.getComponent(PerformanceTabbedSurface).props('modelValue')).toBe('members')
    await wrapper.setProps({ node: { ...node, node_type: 'result_reconsideration' } })
    expect(wrapper.findComponent(PerformanceTabbedSurface).exists()).toBe(false)
    expect(wrapper.find('.review-panel').exists()).toBe(true)
    wrapper.unmount()
  })

  it.each(['evaluation', 'calibration', 'result_reconsideration', 'reviewer_360_confirm', 'result_communication', 'reviewer360'])('embeds %s lists without a second white card', async kind => {
    const feedback = ['reviewer_360_confirm', 'result_communication', 'reviewer360'].includes(kind)
    const node = { ...overview.categories[0].nodes[0], node_id: kind, node_type: kind === 'reviewer360' ? 'evaluation' : kind, task_kind: 'evaluation', executor_role_code: kind === 'reviewer360' ? 'assessment.reviewer_360' : 'assessment.line_manager', status: 'pending' as const }
    const wrapper = mount(PerformanceReviewContent, {
      props: { node, loading: false, error: '', templateName: '', projectId: 1 },
      global: { plugins: [pinia], stubs: { ProjectMemberListPanel: true, PerformanceReview360FeedbackPanel: true, PerformanceDistributionTips: true } },
    })
    expect(wrapper.get('.review-body').classes()).toContain('review-body--workspace')
    if (feedback) expect(wrapper.getComponent(PerformanceReview360FeedbackPanel).props('embedded')).toBe(true)
    else expect(wrapper.getComponent(ProjectMemberListPanel).props('variant')).toBe('review')
    wrapper.unmount()
  })

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    routeQuery = {}
    push.mockReset()
    replace.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(performanceNavigationApi, 'get').mockImplementation(async (cycleId) => navigationOf(cycleId || 1))
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigationOf(1))
    vi.spyOn(performanceCalibrationApi, 'tasks').mockResolvedValue({ tasks: [calibrationScope()], pending_member_count: 2 })
    vi.spyOn(performanceCalibrationApi, 'preview').mockResolvedValue({ scope_version: 'scope-1', total_count: 2, completed_count: 0, missing_result_count: 1, can_complete: true, completed: false })
    vi.spyOn(performanceCalibrationApi, 'distribution').mockResolvedValue({ rules: [] } as any)
    vi.spyOn(performanceCalibrationApi, 'members').mockResolvedValue({ items: [], total: 0, rating_columns: [] })
    vi.spyOn(projectManagementApi, 'resultReconsideration').mockRejectedValue(new Error('RECONSIDERATION_NOT_CONFIGURED'))
    vi.spyOn(performanceReviewApi, 'overview').mockResolvedValue(overview)
    vi.spyOn(performanceReviewApi, 'navigation').mockResolvedValue({ projects: structuredClone(overview.projects), overviews: [structuredClone(overview)] })
    vi.spyOn(projectManagementApi, 'calibrationCompletionPreview').mockResolvedValue({ scope_version: 'scope-1', total_count: 2, completed_count: 0, missing_result_count: 1, can_complete: true, completed: false })
    vi.spyOn(projectManagementApi, 'memberReminderTasks').mockResolvedValue({ items: [], total: 0, can_remind: true })
    vi.spyOn(performanceWorkbenchApi, 'taskPeople').mockResolvedValue([])
    vi.spyOn(performanceWorkbenchApi, 'taskDistributionTips').mockResolvedValue({ enabled: false, total_people: 0, rated_people: 0, rules: [], lines: [] })
  })

  it.each(['evaluation', 'calibration', 'result_communication', 'reviewer_360_confirm'])('passes the real %s source and 360 scope to the member dialog', async taskKind => {
    const wrapper = mount(Review, { global: { plugins: [pinia], stubs: { PerformanceReviewCategorySidebar: true, PerformanceReviewContent: true, PerformanceMemberReminderDialog: true } } })
    await flushPromises()
    const node = { ...overview.categories[2].nodes[0], node_type: taskKind, task_kind: taskKind, task_id: 999 }
    wrapper.getComponent(PerformanceReviewContent).vm.$emit('remind-evaluate', { node, member: { employee_no: 'E001', task_id: 42 }, pendingCount: 2 })
    await flushPromises()
    expect(wrapper.getComponent(PerformanceMemberReminderDialog).props()).toMatchObject({ modelValue: true, context: { employeeNo: 'E001', sourceTaskId: 42, targetKind: 'reviewer_360' } })
    expect(wrapper.findComponent({ name: 'PerformanceTaskOverlay' }).exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['evaluation', 'calibration', 'result_communication', 'reviewer_360_confirm'])('restores %s drawer reminders with reference employee and actual loaded source', async taskKind => {
    const loaded = structuredClone(overview)
    const node = { ...loaded.categories[2].nodes[0], node_type: taskKind, task_kind: taskKind, status: 'completed' as const }
    loaded.categories[2].nodes = [node]
    Object.assign(routeQuery, { project_id: '1', node: node.node_id, rootReviewId: '22' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(loaded)
    const wrapper = mount(Review, { global: { plugins: [pinia], stubs: { PerformanceReviewCategorySidebar: true, PerformanceReviewContent: true, PerformanceReviewEvaluationDrawer: { props: ['modelValue', 'taskId', 'detailLoader', 'employeeNo', 'nodeName', 'person', 'activeTab', 'readonly'], template: '<div />' }, PerformanceMemberReminderDialog: true } } })
    await flushPromises()
    wrapper.getComponent(PerformanceReviewEvaluationDrawer).vm.$emit('remind', { employee_no: 'E001', node_id: 'summary', task_id: 77 }, 42)
    await flushPromises()
    expect(wrapper.getComponent(PerformanceMemberReminderDialog).props('context')).toMatchObject({ employeeNo: 'E001', sourceTaskId: 42, nodeId: 'summary', targetTaskId: 77 })
    wrapper.getComponent(PerformanceReviewEvaluationDrawer).vm.$emit('remind', { kind: 'reviewer_360', employee_no: 'E001', node_id: 'feedback', task_id: null }, 42)
    await flushPromises()
    expect(wrapper.getComponent(PerformanceMemberReminderDialog).props('context')).toMatchObject({ employeeNo: 'E001', sourceTaskId: 42, nodeId: 'feedback', targetKind: 'reviewer_360', targetTaskId: undefined })
    wrapper.unmount()
  })

  it('forwards communication completion reminders through the review content', async () => {
    const node = { ...overview.categories[2].nodes[0], node_type: 'result_communication', status: 'pending' as const }
    const wrapper = mount(PerformanceReviewContent, { props: { loading: false, error: '', templateName: '', projectId: 1, node }, global: { stubs: { PerformanceReview360FeedbackPanel: true } } })
    const payload = { member: { task_id: 42, employee_no: 'E001' }, pendingCount: 1 }
    wrapper.getComponent(PerformanceReview360FeedbackPanel).vm.$emit('remind-evaluate', payload)
    expect(wrapper.emitted('remind-evaluate')).toEqual([[{ node, ...payload }]])
    wrapper.unmount()
  })

  it.each([true, false])('uses completion popovers only for communication rows: allowed=%s', async allowed => {
    const member = { task_id: 42, employee_no: 'E001', display_name: '成员', status: 'pending', completion: '0/1', can_remind: allowed, evaluate_ratio: { evaluated: [], pending: [{ name: '评估人' }], dimission_count: 0, invite_stage: 'in_progress' } }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([member] as any)
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' }, global: { plugins: [pinia], stubs: { PerformancePopover: { template: '<div><slot /></div>' } } } })
    await flushPromises()
    const popover = wrapper.getComponent(PerformanceEvaluateRatioPopover)
    expect(popover.props('canRemind')).toBe(allowed)
    if (allowed) {
      await wrapper.get('.performance-remind-button').trigger('click')
      expect(wrapper.emitted('remind-evaluate')).toEqual([[{ member: expect.objectContaining({ task_id: 42, employee_no: 'E001' }), pendingCount: 1 }]])
    } else expect(wrapper.find('.performance-remind-button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('never exposes completion reminder popovers in the reviewer feedback interface', async () => {
    vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [{ task_id: 42, employee_no: 'E001', display_name: '成员', status: 'pending', department: null, job_sequence: null, position_level: null, source_label: '', relationship: '', due_at: null, can_remind: true, evaluate_ratio: { evaluated: [], pending: [{ name: '评估人' }], invite_stage: 'in_progress', dimission_count: 0 } }], total: 1, node_id: 'feedback', allow_voluntary_evaluation: false } as any)
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'feedback' }, global: { plugins: [pinia] } })
    await flushPromises()
    expect(wrapper.findComponent(PerformanceEvaluateRatioPopover).exists()).toBe(false)
    expect(wrapper.emitted('remind-evaluate')).toBeUndefined()
    wrapper.unmount()
  })

  it('renders the server invitation_tip with the shared notice and removes it when the next context has no tip', async () => {
    vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValueOnce({ items: [], total: 0, node_id: 'feedback', allow_voluntary_evaluation: false, invitation_tip: { count: 6, threshold: 5, text: '<b>请合理安排评估时间</b>' } })
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'feedback' }, global: { plugins: [pinia] } })
    await flushPromises()
    expect(wrapper.get('.feedback-invitation-tip.prompt-notice').text()).toBe('<b>请合理安排评估时间</b>')
    expect(wrapper.find('.feedback-invitation-tip b').exists()).toBe(false)
    vi.mocked(performanceReview360FeedbackApi.list).mockResolvedValueOnce({ items: [], total: 0, node_id: 'next', allow_voluntary_evaluation: false, invitation_tip: null })
    await wrapper.setProps({ nodeId: 'next' })
    await flushPromises()
    expect(wrapper.find('.feedback-invitation-tip').exists()).toBe(false)
    wrapper.unmount()
  })

  it('deduplicates invitation_tip text across aggregated feedback sources', async () => {
    vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [], total: 0, node_id: 'feedback', allow_voluntary_evaluation: false, invitation_tip: { count: 6, threshold: 5, text: '收到较多邀请' } })
    const sources = [{ project_id: 1, node_id: 'first', project_name: '甲', node_name: '360' }, { project_id: 2, node_id: 'second', project_name: '乙', node_name: '360' }]
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'first', sources }, global: { plugins: [pinia] } })
    await flushPromises()
    expect(wrapper.findAll('.feedback-invitation-tip').map(item => item.text())).toEqual(['收到较多邀请'])
    wrapper.unmount()
  })

  it('ignores invitation_tip from a stale feedback request', async () => {
    let resolveFirst!: (value: any) => void
    vi.spyOn(performanceReview360FeedbackApi, 'list').mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve }))
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'first' }, global: { plugins: [pinia] } })
    vi.mocked(performanceReview360FeedbackApi.list).mockResolvedValueOnce({ items: [], total: 0, node_id: 'second', allow_voluntary_evaluation: false, invitation_tip: null })
    await wrapper.setProps({ nodeId: 'second' })
    await flushPromises()
    resolveFirst({ items: [], total: 0, allow_voluntary_evaluation: false, invitation_tip: { count: 9, threshold: 5, text: '旧环节提示' } })
    await flushPromises()
    expect(wrapper.find('.feedback-invitation-tip').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not reload a member list when its parent recreates identical context props', async () => {
    const wrapper = mount(ProjectMemberListPanel, { props: { projectId: 29, reviewContext: { nodeId: 'manager', state: 'all' } } })
    await flushPromises()
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ reviewContext: { nodeId: 'manager', state: 'all' } })
    await flushPromises()
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ reviewContext: { nodeId: 'manager', state: 'all', phaseId: 'next' } })
    await flushPromises()
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('does not continue loading overview after leaving while navigation is pending', async () => {
    const store = usePerformanceProjectContextStore()
    store.resetIdentity()
    let resolve!: (value: PerformanceNavigationContext) => void
    vi.mocked(performanceNavigationApi.get).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = mountView()
    wrapper.unmount()
    resolve(navigationOf(1))
    await flushPromises()
    expect(performanceReviewApi.overview).not.toHaveBeenCalled()
    expect(performanceWorkbenchApi.taskPeople).not.toHaveBeenCalled()
  })

  it('maps the legacy results shortcut to the real result submenu and renders its readonly content', async () => {
    Object.assign(routeQuery, { entry: 'results', cycle_id: '1', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [{ task_id: 11, field_id: 'rating', option_id: 'a', label: '优秀' }], contents: [] })
    const wrapper = mountView()
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ query: { cycle_id: '1', project_id: '1', node: 'view-result' } })
    expect(projectManagementApi.myResults).toHaveBeenCalledWith(1)
    expect(wrapper.get('.review-heading h2').text()).toBe('查看绩效结果')
    expect(wrapper.find('.review-panel.completed .review-results').exists()).toBe(true)
    expect(wrapper.get('.review-results').text()).not.toContain('优秀')
    expect(wrapper.get('.review-results').text()).toContain('暂无可查看的绩效结果')
    expect(wrapper.find('.review-sidebar').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders server-ordered result and reference regions in the shared completed white card', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const content = (id: number, text: string) => ({ task_id: id, form_schema: [{ id: String(id), name: text, fields: [{ id: 'text', type: 'rich_text' as const, label: '内容' }] }], answers: { text } })
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({
      project_id: 1, employee_no: 'E001', content_page_name: '配置的结果页名称',
      results: [{ task_id: 11, field_id: 'rating', option_id: 'a', label: '不应额外展示的摘要' }],
      regions: [
        { key: 'reference:summary', kind: 'reference', title: '配置的工作总结标题', contents: [content(12, '参考内容先展示')] },
        { key: 'result', kind: 'result', title: '配置的结果页名称', contents: [content(11, '主结果后展示')] },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.review-heading h2').text()).toBe('配置的结果页名称')
    expect(wrapper.findAll('[data-region-id]').map(region => region.attributes('data-region-id'))).toEqual(['reference:summary', 'result'])
    const whiteCard = wrapper.get('.review-panel.completed')
    expect(whiteCard.find('.completed-content > .review-results').exists()).toBe(true)
    expect(whiteCard.findAll('.completed-content')).toHaveLength(1)
    expect(reviewSource).not.toContain('.result-region h3')
    expect(reviewSource).not.toContain('.result-region p{')
    expect(whiteCard.text()).toContain('参考内容先展示')
    expect(whiteCard.text()).toContain('主结果后展示')
    expect(wrapper.text()).not.toContain('不应额外展示的摘要')
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders real 360 reviewers with shared compact identities and no duplicate region heading', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const contents = [
      { task_id: 41, reviewer: { employee_no: 'R41', display_name: '评估同事甲' }, form_schema: [{ id: 'feedback', name: '反馈根标题', description: '模板反馈说明', fields: [{ id: 'answer', type: 'rich_text' as const, label: '反馈内容' }] }], answers: { answer: '<p>第一位真实反馈</p>' } },
      { task_id: 42, reviewer: { employee_no: 'R42', display_name: '评估同事乙' }, form_schema: [{ id: 'feedback', name: '隐藏根标题', hide_name: true, description: '独立可见描述', fields: [{ id: 'answer', type: 'rich_text' as const, label: '隐藏题名', hide_name: true }] }], answers: { answer: '第二位真实反馈' } },
    ]
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], regions: [
      { key: 'reference:360', kind: 'reference', title: '我的360反馈', reference_kind: 'reviewer_360', contents },
    ] })
    const wrapper = mountView()
    await flushPromises()
    const region = wrapper.get('[data-region-id="reference:360"]')
    expect(region.findAll('h3')).toHaveLength(1)
    expect(region.get('h3').text()).toBe('我的360反馈')
    expect(region.findAllComponents(PerformanceMemberIdentity)).toHaveLength(2)
    for (const identity of region.findAllComponents(PerformanceMemberIdentity)) expect(identity.props('size')).toBe('sm')
    expect(region.findAll('.member-name').map(identity => identity.text())).toEqual(['评估同事甲', '评估同事乙'])
    expect(region.find('.pr360-items').exists()).toBe(false)
    await region.get('.pr360-comment__toggle').trigger('click')
    expect(region.text()).toContain('第一位真实反馈')
    expect(region.text()).not.toContain('第二位真实反馈')
    await region.get('.pr360-toggle').trigger('click')
    expect(region.text()).toContain('第二位真实反馈')
    expect(region.text()).toContain('独立可见描述')
    for (const text of ['隐藏根标题', '隐藏题名', '这里展示用户填写的内容', '所属部门', '提交时间', '员工关系']) expect(region.text()).not.toContain(text)
    expect(region.find('[contenteditable="true"]').exists()).toBe(false)
    expect(region.find('table, select, [role="listbox"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps empty 360 results empty instead of fabricating reviewers or preview answers', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], regions: [
      { key: 'reference:360', kind: 'reference', title: '360反馈', reference_kind: 'reviewer_360', contents: [] },
    ] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-region-id="reference:360"]').exists()).toBe(false)
    expect(wrapper.find('.pr360-block').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('360反馈')
    expect(wrapper.text()).not.toContain('暂无可查看内容')
    wrapper.unmount()
  })

  it('keeps ordinary empty references even with a 360-like title while hiding only typed empty 360 regions', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], regions: [
      { key: 'reference:arbitrary-id', kind: 'reference', title: '反馈模块', reference_kind: 'reviewer_360', contents: [] },
      { key: 'reference:ordinary', kind: 'reference', title: '360°反馈（自愿评估）', reference_kind: 'node', contents: [] },
      { key: 'reference:communication', kind: 'reference', title: '发展建议', reference_kind: 'node', contents: [] },
    ] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('[data-region-id="reference:arbitrary-id"]').exists()).toBe(false)
    for (const key of ['ordinary', 'communication']) {
      expect(wrapper.get(`[data-region-id="reference:${key}"]`).text()).toContain('暂无可查看内容')
    }
    expect(wrapper.get('[data-region-id="reference:ordinary"] h3').text()).toBe('360°反馈（自愿评估）')
    wrapper.unmount()
  })

  it('renders explicitly configured OKR regions through the existing readonly OKR panel', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], regions: [
      { key: 'reference:okr', kind: 'reference', title: '本期目标', reference_kind: 'okr', contents: [], okrs: [{ source: 'feishu', okr_id: 'fixture', period_label: '本期', objectives: [{ id: 'objective', content: '授权本人目标', key_results: [] }] }] },
    ] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.review-panel.completed .okr-card').text()).toContain('授权本人目标')
    expect(wrapper.text()).not.toContain('暂无可查看的绩效结果')
    wrapper.unmount()
  })

  it('honors explicit empty regions over compatibility contents without inventing visible content', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], regions: [], contents: [{ task_id: 11, form_schema: [{ id: 'hidden', name: '不该回退的旧内容', fields: [] }], answers: {} }] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('暂无可查看的绩效结果')
    expect(wrapper.text()).not.toContain('不该回退的旧内容')
    wrapper.unmount()
  })

  it('keeps a deep link on the requested submenu and does not fall back to work summary', async () => {
    Object.assign(routeQuery, { cycle_id: '1', project_id: '1', node: 'manager' })
    const loaded = resultOverview()
    loaded.categories[2].nodes.push({ ...loaded.categories[0].nodes[0], node_id: 'manager', node_name: '上级评估' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(loaded)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.review-heading h2').text()).toBe('上级评估')
    expect(replace).not.toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ node: 'summary' }) }))
    wrapper.unmount()
  })

  it('renders allowed result tags through the shared readonly renderer and honors display flags', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [{ task_id: 11, form_schema: [{ id: 'tags', name: '终评内容', fields: [
      { id: 'tag', type: 'tag_with_followup', label: '', hide_name: true, description: '', hide_description: true, options: [{ id: 'a', label: '协作' }] },
    ] }], answers: { tag: { tags: ['a'], notes: { a: '<p>终评反馈</p>' } } } }] })
    const wrapper = mountView()
    await flushPromises()
    expect(projectManagementApi.myResults).toHaveBeenCalledWith(1)
    expect(wrapper.get('.review-results').text()).toContain('协作')
    expect(wrapper.get('.review-results').text()).toContain('终评反馈')
    expect(wrapper.find('.template-field-label').exists()).toBe(false)
    expect(wrapper.find('.template-field-description').exists()).toBe(false)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('暂无可查看的绩效结果')
    wrapper.unmount()
  })

  it('does not render legacy rating summaries outside template content and keeps denied or empty states', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const api = vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [{ task_id: 11, field_id: 'rating', option_id: 'a', label: '优秀' }] })
    const legacy = mountView()
    await flushPromises()
    expect(legacy.get('.review-results').text()).not.toContain('优秀')
    legacy.unmount()
    api.mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    const empty = mountView()
    await flushPromises()
    expect(empty.text()).toContain('暂无可查看的绩效结果')
    empty.unmount()
    api.mockRejectedValue(new Error('RESULT_NOT_FOUND'))
    const denied = mountView()
    await flushPromises()
    expect(denied.get('[role="alert"]').text()).toContain('绩效结果加载失败，请重试')
    expect(denied.find('.performance-template-renderer').exists()).toBe(false)
    denied.unmount()
  })

  it.each(['pending', 'not_started', 'overdue', 'completed'] as const)('hides only the result-view sidebar status for %s', async status => {
    Object.assign(routeQuery, { project_id: '1', node: 'view-result' })
    const loaded = resultOverview()
    loaded.categories[0].nodes.find(node => node.node_type === 'result_view')!.status = status
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(loaded)
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    const wrapper = mountView()
    await flushPromises()
    const resultNode = wrapper.findAll('.review-node').find(node => node.text().includes('查看绩效结果'))!
    expect(resultNode.find('em').exists()).toBe(false)
    expect(wrapper.findAll('.review-node').find(node => node.text().includes('工作总结环节'))!.find('em').text()).toBe('待完成')
    wrapper.unmount()
  })

  it('uses the shared centered node illustration for unopened results and clears it on reopening', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'view-result' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const api = vi.spyOn(projectManagementApi, 'myResults').mockRejectedValue({ response: { status: 404, data: { detail: 'RESULT_NOT_FOUND' } } })
    const wrapper = mountView()
    await flushPromises()
    const panel = wrapper.get('.review-panel')
    expect(panel.text()).toBe('暂未开通结果')
    expect(panel.classes()).not.toContain('completed')
    expect(wrapper.get('.review-body').classes()).not.toContain('review-body--completed')
    expect(panel.get('.state-illustration img').attributes()).toMatchObject({ src: '/performance-not-started.svg', width: '120', height: '121' })
    expect(wrapper.find('.reconsideration-menu').exists()).toBe(false)
    expect(wrapper.find('.primary-button').exists()).toBe(false)
    api.mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    usePerformanceProjectContextStore().setActiveProjectId(2)
    await flushPromises()
    usePerformanceProjectContextStore().setActiveProjectId(1)
    await flushPromises()
    expect(wrapper.text()).not.toContain('暂未开通结果')
    expect(wrapper.find('.review-panel.completed').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps transport failures distinct from unopened results and supports retry', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'view-result' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const api = vi.spyOn(projectManagementApi, 'myResults').mockRejectedValue({ response: { status: 500 } })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('绩效结果加载失败，请重试')
    expect(wrapper.text()).not.toContain('暂未开通结果')
    api.mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('绩效结果加载失败，请重试')
    expect(wrapper.text()).toContain('暂无可查看的绩效结果')
    wrapper.unmount()
  })

  it('restores the linked project after loading a different cycle navigation', async () => {
    Object.assign(routeQuery, { cycle_id: '2', project_id: '1', node: 'view-result' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    const wrapper = mountView()
    await flushPromises()
    expect(performanceNavigationApi.get).toHaveBeenCalledWith(2)
    expect(performanceReviewApi.overview).toHaveBeenCalledWith(1, undefined, 2)
    expect(projectManagementApi.myResults).toHaveBeenCalledWith(1)
    expect(usePerformanceProjectContextStore().activeProjectId).toBe(1)
    wrapper.unmount()
  })

  it('refuses unavailable result menus instead of selecting a different project or summary', async () => {
    Object.assign(routeQuery, { entry: 'results', project_id: '1' })
    const results = vi.spyOn(projectManagementApi, 'myResults')
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('当前项目没有可查看的绩效结果入口')
    expect(results).not.toHaveBeenCalled()
    expect(wrapper.find('.review-results').exists()).toBe(false)
    wrapper.unmount()

    Object.assign(routeQuery, { project_id: '9' })
    const denied = mountView()
    await flushPromises()
    expect(denied.text()).toContain('当前项目不存在或无权查看')
    expect(results).not.toHaveBeenCalled()
    denied.unmount()
  })

  it('does not silently select summary for an unknown explicit node', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'manager?node=manager' })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('当前评估环节不存在或无权查看')
    expect(wrapper.find('.review-heading').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the completed employee reconsideration notice above the final readonly result without action entries', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'view-result' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [{ task_id: 11, form_schema: [{ id: 'result', name: '绩效结果', fields: [{ id: 'feedback', type: 'rich_text', label: '最终反馈' }] }], answers: { feedback: '<p>复议后的正式结果</p>' } }] })
    vi.mocked(projectManagementApi.resultReconsideration).mockResolvedValue({ id: 1, version: 3, node_id: 'appeal', window_open: true, can_submit: false, can_edit: false, can_withdraw: false, deadline_at: '2099-11-11T10:00:00Z', withdrawn_at: null, prompt: '', instruction: '', handler_label: 'HRBP', reason: '<p>申请理由</p>', submitted_at: '2026-11-15T03:04:00Z', closed_at: '2026-11-16T03:04:00Z' })
    const wrapper = mountView()
    await flushPromises()
    const results = wrapper.get('.review-results')
    expect(results.get('.reconsideration-completion').text()).toContain('你的复议已于 2026-11-16 11:04（GMT+8） 处理完成，最终结果如下')
    expect(results.text()).toContain('复议后的正式结果')
    expect(results.text().indexOf('已完成')).toBeLessThan(results.text().indexOf('复议后的正式结果'))
    expect(wrapper.find('.reconsideration-menu').exists()).toBe(false)
    expect(wrapper.find('.reconsideration-banner__actions').exists()).toBe(false)
    expect(results.find('[contenteditable="true"]').exists()).toBe(false)
    expect(results.text()).not.toMatch(/复议中|将收到待办|请耐心等待结果|申请理由|查看复议|复议详情/)
    wrapper.unmount()
  })

  it('loads results when selecting the submenu and preserves the reconsideration entry', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'summary' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const api = vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    vi.mocked(projectManagementApi.resultReconsideration).mockResolvedValue({ prompt: '结果存在疑问可发起复议', can_submit: true, window_open: true, deadline_at: '2099-11-11T10:00:00Z' } as any)
    const wrapper = mountView()
    await flushPromises()
    expect(api).not.toHaveBeenCalled()
    await wrapper.findAll('.review-node').find(node => node.text().includes('查看绩效结果'))!.trigger('click')
    await flushPromises()
    expect(api).toHaveBeenCalledWith(1)
    await wrapper.get('.reconsideration-more').trigger('mouseenter')
    await wrapper.get('.reconsideration-more').trigger('click')
    expect(wrapper.get('.reconsideration-menu__panel').text()).toContain('发起复议')
    expect(wrapper.find('.review-heading .reconsideration-menu').exists()).toBe(true)
    await wrapper.get('.reconsideration-menu__panel button').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.rich-input')?.getAttribute('data-placeholder')).toBe('请输入复议理由')
    expect(wrapper.find('.review-sidebar').exists()).toBe(true)
    expect(wrapper.find('.review-results input').exists()).toBe(false)
    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignores a late result response after switching to a different project', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'view-result' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    let resolveResult!: (value: any) => void
    vi.spyOn(projectManagementApi, 'myResults').mockReturnValue(new Promise(resolve => { resolveResult = resolve }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('正在加载绩效结果')
    usePerformanceProjectContextStore().setActiveProjectId(2)
    await wrapper.vm.$nextTick()
    resolveResult({ results: [{ task_id: 11, field_id: 'rating', label: '旧项目敏感结果' }], contents: [] })
    await flushPromises()
    expect(wrapper.text()).not.toContain('旧项目敏感结果')
    expect(projectManagementApi.resultReconsideration).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('renders the template name and all four template-driven categories', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('半年度绩效评估模板')
    expect(wrapper.text()).toContain('我的绩效')
    expect(wrapper.text()).toContain('给他人的评估')
    expect(wrapper.text()).toContain('我团队的绩效')
    expect(wrapper.text()).toContain('其他事项')
    expect(wrapper.text()).toContain('工作总结环节')
    expect(wrapper.get('.review-sidebar').attributes('style')).toBeUndefined()
    expect(wrapper.findAll('.category-icon svg')).toHaveLength(4)
    expect(performanceReviewApi.overview).toHaveBeenCalledWith(1, undefined, 1)
    expect(usePerformanceProjectContextStore().activeProjectId).toBe(1)
  })

  it('restores cached overview immediately and refreshes it silently', async () => {
    const context = usePerformanceProjectContextStore()
    context.setActiveProjectId(1)
    context.setReviewOverview(overview)
    vi.mocked(performanceReviewApi.overview).mockReturnValue(new Promise(() => {}))

    const wrapper = mountView()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('半年度绩效评估模板')
    expect(wrapper.text()).not.toContain('正在加载绩效评估')
    expect(performanceReviewApi.overview).toHaveBeenCalledWith(1, undefined, 1)
  })

  it('renders the captured sidebar edge button without clipping it', () => {
    const wrapper = mountView()
    const button = wrapper.get('.sidebar-collapse')
    const icon = button.get('svg')

    expect(button.attributes('aria-label')).toBe('收起侧边栏')
    expect(icon.attributes('data-icon')).toBe('LeftSmallCcmOutlined')
    expect(icon.attributes('width')).toBe('16')
    expect(icon.attributes('height')).toBe('16')
    expect(button.get('path').attributes('d')).toBe('M15.707 4.293a1 1 0 0 1 0 1.414L9.414 12l6.293 6.293a1 1 0 0 1-1.414 1.414l-7-7a1 1 0 0 1 0-1.414l7-7a1 1 0 0 1 1.414 0Z')
    expect(sidebarSource.match(/\.review-sidebar\s*\{([^}]*)\}/)?.[1]).not.toMatch(/overflow/)
    expect(sidebarSource).toMatch(/\.sidebar-scroll\s*\{[^}]*overflow-y:\s*auto/s)
    expect(sidebarSource).toMatch(/\.sidebar-collapse\s*\{[^}]*right:\s*calc\(-1 \* var\(--performance-review-collapse-width\)\);[^}]*width:\s*var\(--performance-review-collapse-width\);[^}]*height:\s*var\(--performance-review-collapse-height\);[^}]*color:\s*var\(--performance-review-collapse-color\);[^}]*box-shadow:\s*none/s)
    expect(sidebarSource).toMatch(/\.sidebar-collapse:hover[^}]*color:\s*var\(--color-primary\);[^}]*box-shadow:\s*var\(--performance-review-collapse-shadow\)/s)
  })

  it('collapses to a 72px category rail and rotates the edge arrow by 180 degrees', async () => {
    const wrapper = mountView()
    await flushPromises()
    const button = wrapper.get('.sidebar-collapse')

    await button.trigger('click')
    expect(wrapper.get('.review-sidebar').classes()).toContain('is-collapsed')
    expect(button.attributes('aria-label')).toBe('展开侧边栏')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.get('svg').classes()).toContain('flipped')
    expect(wrapper.find('.cycle-picker').exists()).toBe(false)
    expect(wrapper.findAll('.category-toggle')).toHaveLength(4)
    expect(wrapper.get('.category-toggle.active .category-label').text()).toBe('我的绩效')
    expect(wrapper.findAll('.review-node-list').every(list => !list.isVisible())).toBe(true)
    expect(sidebarSource).toMatch(/\.review-sidebar\.is-collapsed\s*\{[^}]*width:\s*72px;[^}]*flex-basis:\s*72px/s)
    expect(sidebarSource).toMatch(/\.universe-icon svg\.flipped\s*\{\s*transform:\s*rotate\(180deg\)/s)

    await wrapper.findAll('.category-toggle')[1].trigger('click')
    expect(wrapper.get('.review-sidebar').classes()).toContain('is-collapsed')
    expect(wrapper.get('.sidebar-flyout').attributes('aria-label')).toBe('给他人的评估')
    expect(wrapper.get('.flyout-node').text()).toBe('360°评估')
    expect(sidebarSource).toMatch(/\.sidebar-flyout\s*\{[^}]*left:\s*72px;[^}]*width:\s*188px;[^}]*height:\s*100%/s)

    await button.trigger('click')
    expect(button.attributes('aria-label')).toBe('收起侧边栏')
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)
    expect(button.get('svg').classes()).not.toContain('flipped')
    expect(wrapper.find('.cycle-picker').exists()).toBe(true)
  })

  it('opens the captured submenu on hover or click and selects a node without expanding', async () => {
    const multiNodeOverview = structuredClone(overview)
    multiNodeOverview.categories[0].nodes.push({
      ...multiNodeOverview.categories[0].nodes[0], node_id: 'self', node_name: '自评', task_id: 12,
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(multiNodeOverview)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.sidebar-collapse').trigger('click')

    const categories = wrapper.findAll('.category-toggle')
    await categories[0].trigger('mouseenter')
    expect(categories[0].find('.flyout-notch-inner').exists()).toBe(true)
    expect(sidebarSource).toMatch(/\.flyout-notch\s*\{[^}]*right:\s*-8px;[^}]*z-index:\s*1000;[^}]*border:\s*6px solid transparent;[^}]*border-right-color:\s*rgba\(31, 35, 41, 0\.15\)/s)
    expect(sidebarSource).toMatch(/\.flyout-notch-inner\s*\{[^}]*top:\s*-5px;[^}]*left:\s*-3px;[^}]*border:\s*5px solid transparent;[^}]*border-right-color:\s*#fff/s)
    expect(wrapper.findAll('.flyout-node').map(node => node.text())).toEqual(['工作总结环节', '自评'])
    expect(wrapper.get('.flyout-node.active').text()).toBe('工作总结环节')
    expect(categories[0].attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.review-sidebar').classes()).toContain('has-flyout')
    expect(sidebarSource).toMatch(/\.is-collapsed\.has-flyout \.sidebar-collapse\s*\{[^}]*right:\s*-204px/s)

    await categories[1].trigger('click')
    expect(categories[0].find('.flyout-notch').exists()).toBe(false)
    expect(categories[1].find('.flyout-notch-inner').exists()).toBe(true)
    expect(wrapper.get('.sidebar-flyout').attributes('aria-label')).toBe('给他人的评估')
    expect(wrapper.get('.review-sidebar').classes()).toContain('is-collapsed')
    await categories[0].trigger('click')
    await wrapper.findAll('.flyout-node')[1].trigger('click')
    expect(wrapper.get('.review-heading h2').text()).toBe('自评')
    expect(replace).toHaveBeenCalledWith({ query: { project_id: '1', node: 'self' } })
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)
    expect(wrapper.get('.review-sidebar').classes()).toContain('is-collapsed')
    expect(wrapper.get('.category-toggle.active .category-label').text()).toBe('我的绩效')
    wrapper.unmount()
  })

  it('dismisses the submenu on mouse leave, Escape and outside pointer', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.sidebar-collapse').trigger('click')
    const category = wrapper.get('.category-toggle')
    await category.trigger('mouseenter')
    await wrapper.get('.review-sidebar').trigger('mouseleave')
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)

    await category.trigger('click')
    await wrapper.get('.review-sidebar').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)

    await category.trigger('click')
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)
    wrapper.unmount()
  })

  it('supports collapsing each category block from its title button', async () => {
    const wrapper = mountView()
    await flushPromises()

    const categoryToggle = wrapper.get('.category-toggle')
    expect(categoryToggle.attributes('aria-expanded')).toBe('true')
    await categoryToggle.trigger('click')

    expect(categoryToggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.review-node-list').attributes('style')).toContain('display: none')
  })

  it('uses only registered task kind and entry mode for template task navigation', async () => {
    const { performanceTaskEntryRoute } = await import('@/components/performance/performanceTaskEntry')
    const registered = overview.categories[0].nodes[0]
    expect(performanceTaskEntryRoute(registered, 1)).toBe('/performance/review/self-summary?task_id=11&project_id=1&node=summary')
    expect(performanceTaskEntryRoute({ ...registered, task_id: 299, task_kind: 'evaluation' }, 3)).toBe('/performance/review/template-task?task_id=299&project_id=3&node=summary')
    for (const task_kind of ['reviewer_360_invite', 'reviewer_360_confirm']) expect(performanceTaskEntryRoute({ ...registered, task_kind }, 1)).toBe('/performance/review/template-task?task_id=11&project_id=1&node=summary')
    expect(performanceTaskEntryRoute({ ...registered, entry_mode: 'route' }, 1)).toBeNull()
    expect(performanceTaskEntryRoute({ ...registered, task_kind: 'future_task' }, 1)).toBeNull()
    expect(performanceTaskEntryRoute({ ...registered, task_id: undefined }, 1)).toBeNull()
  })

  it('shows node states and keeps internal task navigation inside the SPA', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('待完成')
    expect(wrapper.text()).toContain('已逾期')
    expect(wrapper.text()).toContain('未开始')
    await wrapper.get('.review-node').trigger('click')
    await wrapper.get('.primary-button').trigger('click')
    expect(push).toHaveBeenCalledWith('/performance/review/self-summary?task_id=11&project_id=1&node=summary')
  })

  it('keeps the time subtitle on unfinished nodes', async () => {
    const scheduled = structuredClone(overview)
    scheduled.categories[0].nodes[0].end_at = '2026-09-24T15:59:00Z'
    scheduled.categories[2].nodes[0].start_at = '2026-09-24T00:00:00Z'
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(scheduled)

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.review-heading .review-deadline').text()).toContain('截止时间：')
    await wrapper.findAll('.review-node')[2].trigger('click')
    expect(wrapper.get('.review-heading .review-deadline').text()).toContain('启动时间：')
    expect(wrapper.findAll('.review-panel')).toHaveLength(1)
  })

  it('renders an unstarted direct-manager evaluation with the shared unstarted state', async () => {
    const scheduled = structuredClone(overview)
    Object.assign(scheduled.categories[2].nodes[0], {
      node_id: 'manager-review',
      node_name: '直接上级评估',
      node_type: 'evaluation',
      task_kind: 'evaluation',
      executor_label: '直接上级',
      status: 'not_started',
      start_at: '2026-09-24T00:00:00Z',
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(scheduled)

    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.review-node')[2].trigger('click')

    expect(wrapper.get('.review-panel').classes()).not.toContain('evaluation')
    expect(wrapper.get('.state-illustration img').attributes('src')).toBe('/performance-not-started.svg')
    expect(wrapper.get('.review-panel').text()).toContain('暂未启动')
    expect(wrapper.find('.evaluation-workspace').exists()).toBe(false)
    expect(wrapper.find('.primary-button').exists()).toBe(false)
  })

  it('keeps the submitted task selected and renders its answers in the review panel', async () => {
    const completed = structuredClone(overview)
    Object.assign(completed.categories[0].nodes[0], {
      status: 'completed',
      submitted_at: '2026-09-17T03:10:10Z',
      end_at: '2026-09-24T15:59:00Z',
      editable: true,
      form_schema: [
        { id: 'work', name: '工作总结', description: '描述', allow_multiple: true, fields: [{ id: 'answer', type: 'rich_text', label: '填写内容' }] },
        { id: 'rating', name: '评分评级', fields: [{ id: 'level', type: 'rating', label: '绩效评级', options: [{ id: 'four', label: '4星', color: '#d9f5d6', description: '超出预期' }] }] },
        { id: 'tag', name: '标签型填写题', fields: [{ id: 'contribution', type: 'tag_with_followup', label: '价值贡献', options: [{ id: 'good', label: '做得好的' }] }] },
      ],
      answers: { answer: ['<ol><li><b>已提交内容</b></li></ol>'], level: 'four', contribution: { tags: ['good'], note: '<p>补充说明</p>' } },
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(completed)

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('.review-sidebar').find('.status-completed').exists()).toBe(false)
    expect(wrapper.text()).toContain('填写内容 1')
    expect(wrapper.text()).toContain('已提交内容')
    expect(wrapper.text()).toContain('你可以在 2026-09-24 23:59（GMT+8） 前继续编辑')
    expect(wrapper.find('.review-heading .review-deadline').exists()).toBe(false)
    expect(wrapper.get('.performance-review-completion-notice__edit').text()).toBe('编辑')
    expect(wrapper.get('.performance-review-completion-notice__edit').attributes('aria-label')).toBe('编辑已提交内容')
    expect(wrapper.get('.performance-review-completion-notice__edit svg').attributes('viewBox')).toBe('0 0 24 24')
    expect(wrapper.get('.performance-review-completion-notice__edit svg').attributes('data-icon')).toBe('EditOutlined')
    expect(wrapper.text()).toContain('4星')
    expect(wrapper.get('.readonly-field-rating').text()).toContain('绩效评级4星超出预期')
    expect(wrapper.text()).toContain('超出预期')
    expect(wrapper.text()).toContain('做得好的')
    expect(wrapper.text()).toContain('补充说明')
    expect(wrapper.get('.rich-answer ol li b').text()).toBe('已提交内容')
    expect(wrapper.text()).not.toContain('暂未填写')
    expect(wrapper.text()).not.toContain('去完成')

    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue({ task_id: 11, has_draft: false, editable: true, submit_allowed: true } as any)
    await wrapper.get('.performance-review-completion-notice__edit').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenLastCalledWith({ query: { project_id: '1', node: 'summary', task_id: '11' } })
    expect(push).toHaveBeenCalledWith('/performance/review/self-summary?task_id=11&project_id=1&node=summary')
  })

  it('shows submitted content without an edit action after the deadline', async () => {
    const completed = structuredClone(overview)
    Object.assign(completed.categories[0].nodes[0], {
      status: 'completed', editable: false, end_at: '2026-07-10T15:59:00Z',
      form_schema: [{ id: 'work', name: '工作总结', fields: [{ id: 'answer', type: 'rich_text', label: '总结' }] }],
      answers: { answer: '<script>alert(1)</script><a href="javascript:alert(1)">恶意链接</a><ul><li>保留列表</li></ul>' },
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(completed)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('保留列表')
    expect(wrapper.find('.rich-answer ul li').exists()).toBe(true)
    expect(wrapper.find('.rich-answer script').exists()).toBe(false)
    expect(wrapper.get('.rich-answer a').attributes('href')).toBeUndefined()
    expect(wrapper.find('.performance-review-completion-notice').exists()).toBe(true)
    expect(wrapper.text()).toContain('该环节已在 2026-07-10 23:59（GMT+8） 截止；如有疑问，请联系你的 HRBP。')
    expect(wrapper.find('.performance-review-completion-notice__edit').exists()).toBe(false)
  })

  it('接入真实上级评估矩阵和报表，仅请求当前任务分析并通过原Review打开成员抽屉', async () => {
    const loaded = structuredClone(overview)
    const node = { ...loaded.categories[0].nodes[0], node_id: 'manager-review', node_name: '上级评估', node_type: 'evaluation', task_kind: 'evaluation', executor_role_code: 'assessment.line_manager', phase_id: 'phase-a', status: 'pending' as const }
    loaded.categories[2].nodes = [node]
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(loaded)
    vi.mocked(performanceReviewApi.navigation).mockResolvedValue({ projects: loaded.projects, overviews: [loaded] })
    Object.assign(routeQuery, { project_id: '1', node: node.node_id })
    const matrix = { source: 'template_final_result', dimension: 'rating', display_modes: ['name', 'count'], total: 0, completed_count: 0, pending_count: 0, ratings: [], pending_rows: [], completed_rows: [] }
    const report = { source: 'api', dimension: 'department', rowLabel: '部门', showSummary: true, totalParticipants: 1, ratings: [{ key: 'A', label: '优秀', color: null }], distribution: { A: 1 }, departments: [], indicatorKey: 'value' }
    const comparison = { source: 'api', total: 1, ratings: report.ratings, xRatings: report.ratings, yRatings: report.ratings, counts: [[1]], heatLevels: [[1]], xKey: 'previous', yKey: 'value', historyCycleId: 8 }
    const member = { id: 91, employee_no: 'E091', display_name: '范围内成员', project_id: 1, root_review_id: 91, can_view_detail: true }
    const get = vi.spyOn(api, 'get').mockImplementation(async url => {
      if (String(url).endsWith('/analysis/matrix')) return { data: matrix }
      if (String(url).endsWith('/analysis/statistics')) return { data: report }
      if (String(url).endsWith('/analysis/comparison')) return { data: comparison }
      if (String(url).endsWith('-members')) return { data: { items: [member], total: 1, page: 1, page_size: 50 } }
      return { data: { column_keys: null } }
    })
    const notes = vi.spyOn(reportNotesApi, 'read')
    const wrapper = mount(Review, { global: { plugins: [pinia], stubs: { PerformanceReviewEvaluationDrawer: true, PerformanceMemberReminderDialog: true } } })
    try {
      await flushPromises()
      const tab = (label: string) => wrapper.findAll('button').find(button => button.text() === label)!
      await tab('矩阵分析').trigger('click'); await flushPromises()
      expect(wrapper.getComponent(ProjectPerformanceMatrix).props()).toMatchObject({ projectId: 1, cycleId: 1, readonly: true })
      expect(get).toHaveBeenCalledWith('/performance/workbench/tasks/manager-review/analysis/matrix', { params: { project_id: 1, phase_id: 'phase-a' } })
      expect(wrapper.findComponent(MatrixPeopleDialog).exists()).toBe(false)
      await tab('统计报表').trigger('click'); await flushPromises()
      const panel = wrapper.getComponent(ProjectStatisticsReportPanel)
      expect(panel.props()).toMatchObject({ allowExamples: false, allowComments: false, cycleId: 1 })
      expect(get).toHaveBeenCalledWith('/performance/workbench/tasks/manager-review/analysis/statistics', { params: { project_id: 1, phase_id: 'phase-a', dimension: 'department' } })
      expect(wrapper.getComponent(ProjectReportDistribution).props('report').ratings[0].color).toBeUndefined()
      wrapper.getComponent(ProjectReportDistribution).vm.$emit('people', { dimension: 'department', rowLabel: '汇总', ratingKey: 'A', count: 1 })
      await flushPromises()
      expect(get).toHaveBeenCalledWith('/performance/workbench/tasks/manager-review/analysis/statistics-members', { params: expect.objectContaining({ project_id: 1, phase_id: 'phase-a', indicator_key: 'value', rating_key: 'A', page: 1, page_size: 50, sort_by: 'name', sort_order: 'asc' }) })
      const dialog = wrapper.getComponent(MatrixPeopleDialog)
      dialog.vm.$emit('select-member', { ...member, can_view_detail: false })
      await flushPromises()
      expect(wrapper.findComponent(PerformanceReviewEvaluationDrawer).exists()).toBe(false)
      vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue({ items: [{ task_id: 707, employee_no: 'E091', display_name: '范围内成员', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null, status: 'completed', due_at: null }], total: 1, rating_columns: [] })
      dialog.vm.$emit('select-member', member)
      await flushPromises()
      expect(performanceWorkbenchApi.taskPeople).toHaveBeenLastCalledWith(1, 'manager-review', 'all', 'E091', 'phase-a', 1, 50)
      expect(wrapper.getComponent(PerformanceReviewEvaluationDrawer).props()).toMatchObject({ modelValue: true, taskId: 707, employeeNo: 'E091' })
      await wrapper.get('[data-key="history"]').trigger('click'); await flushPromises()
      const comparisonView = wrapper.getComponent(ProjectReportComparison)
      expect(comparisonView.props('comparison').xRatings![0].color).toBeUndefined()
      comparisonView.vm.$emit('cell', { rowKey: 'A', columnKey: 'A', count: 1 })
      await flushPromises()
      expect(get).toHaveBeenCalledWith('/performance/workbench/tasks/manager-review/analysis/comparison-members', { params: expect.objectContaining({ project_id: 1, phase_id: 'phase-a', kind: 'history', x_key: 'previous', y_key: 'value', history_cycle_id: 8, x_rating_key: 'A', y_rating_key: 'A' }) })
      comparisonView.vm.$emit('change', { xKey: 'old-value', yKey: 'new-value', historyCycleId: 7 })
      await flushPromises()
      expect(get).toHaveBeenCalledWith('/performance/workbench/tasks/manager-review/analysis/comparison', { params: { project_id: 1, phase_id: 'phase-a', kind: 'history', x_key: 'old-value', y_key: 'new-value', history_cycle_id: 7 } })
      expect(notes).not.toHaveBeenCalled()
      for (const kind of ['self-final', 'dimension']) {
        await wrapper.get(`[data-key="${kind}"]`).trigger('click'); await flushPromises()
        expect(get).toHaveBeenCalledWith('/performance/workbench/tasks/manager-review/analysis/comparison', { params: expect.objectContaining({ project_id: 1, phase_id: 'phase-a', kind }) })
      }
      wrapper.getComponent(ProjectReportDistribution).vm.$emit('indicator-change', 'contribution')
      await flushPromises()
      expect(get).toHaveBeenCalledWith('/performance/workbench/tasks/manager-review/analysis/statistics', { params: { project_id: 1, phase_id: 'phase-a', dimension: 'department', indicator_key: 'contribution' } })
      expect(get.mock.calls.some(([url]) => String(url).includes('/project-management/'))).toBe(false)
      expect(wrapper.text()).not.toContain('查看示例')
    } finally { wrapper.unmount() }
  })

  it.each(['project', 'cycle', 'node', 'phase', 'identity'] as const)('上级评估%s切换销毁旧分析组件并拒绝迟到报表回流', async change => {
    let finish!: (value: any) => void
    const report = { source: 'api', dimension: 'department', rowLabel: '部门', showSummary: true, totalParticipants: 0, ratings: [], distribution: {}, departments: [] }
    const stats = vi.spyOn(performanceWorkbenchApi, 'taskAnalysisStatistics').mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue(report as any)
    const node = { ...overview.categories[0].nodes[0], node_type: 'evaluation', task_kind: 'evaluation', executor_role_code: 'assessment.line_manager', node_id: 'manager-review', phase_id: 'phase-a' }
    const wrapper = mount(PerformanceReviewContent, { props: { loading: false, error: '', templateName: '', projectId: 9, memberPreferenceScope: { cycle_ref: 2, scene: 'evaluation' }, node }, global: { plugins: [pinia], stubs: { ProjectMemberListPanel: true } } })
    try {
      await wrapper.findAll('button').find(button => button.text() === '统计报表')!.trigger('click'); await flushPromises()
      const previous = wrapper.getComponent(PerformanceReviewScopeAnalysis).vm
      expect(wrapper.getComponent(ProjectStatisticsReportPanel).props('cycleId')).toBe(2)
      if (change === 'project') await wrapper.setProps({ projectId: 10 })
      else if (change === 'cycle') await wrapper.setProps({ memberPreferenceScope: { cycle_ref: 3, scene: 'evaluation' } })
      else if (change === 'node') await wrapper.setProps({ node: { ...node, node_id: 'another-node' } })
      else if (change === 'phase') await wrapper.setProps({ node: { ...node, phase_id: 'phase-b' } })
      else { employeeSwitchEpoch.value++; await wrapper.vm.$nextTick() }
      await flushPromises()
      if (change === 'node') {
        expect(wrapper.findComponent(PerformanceReviewScopeAnalysis).exists()).toBe(false)
        await wrapper.findAll('button').find(button => button.text() === '统计报表')!.trigger('click'); await flushPromises()
      }
      expect(wrapper.getComponent(PerformanceReviewScopeAnalysis).vm).not.toBe(previous)
      finish({ ...report, totalParticipants: 999 })
      await flushPromises()
      expect(wrapper.text()).not.toContain('999')
      expect(stats).toHaveBeenLastCalledWith(change === 'project' ? 10 : 9, change === 'node' ? 'another-node' : 'manager-review', 'department', undefined, change === 'phase' ? 'phase-b' : 'phase-a')
    } finally { wrapper.unmount() }
  })

  it('成员解析按工号精准分页，不使用root_review_id且拒绝跨phase迟到回调', async () => {
    const node = { ...overview.categories[0].nodes[0], node_type: 'evaluation', phase_id: 'phase-a' }
    const person = { task_id: 707, employee_no: 'E091', display_name: '范围内成员', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null, status: 'completed', due_at: null }
    const people = vi.mocked(performanceWorkbenchApi.taskPeople)
    people.mockResolvedValueOnce({ items: [{ ...person, employee_no: 'E0910', task_id: 808 }], total: 51, rating_columns: [] })
      .mockResolvedValueOnce({ items: [person], total: 51, rating_columns: [] })
    const opened = vi.fn()
    const wrapper = mount(PerformanceReviewScopeAnalysis, { props: { projectId: 1, cycleId: 2, node, tab: 'matrix', onOpenMember: opened }, global: { stubs: { ProjectPerformanceMatrix: true } } })
    try {
      const select = () => wrapper.getComponent(ProjectPerformanceMatrix).vm.$emit('open-member', { project_id: 1, employee_no: 'E091', root_review_id: 91, can_view_detail: true })
      select(); await flushPromises()
      expect(people).toHaveBeenNthCalledWith(2, 1, node.node_id, 'all', 'E091', 'phase-a', 2, 50)
      expect(wrapper.emitted('open-member')?.[0]?.[0]).toMatchObject({ employee_no: 'E091', task_id: 707, status: 'completed' })
      let finish!: (value: any) => void
      people.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      select(); await flushPromises()
      await wrapper.setProps({ node: { ...node, phase_id: 'phase-b' } })
      finish({ items: [person], total: 1, rating_columns: [] }); await flushPromises()
      expect(wrapper.emitted('open-member')).toHaveLength(1)
      people.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      select(); await flushPromises()
      wrapper.unmount()
      finish({ items: [person], total: 1, rating_columns: [] }); await flushPromises()
      expect(opened).toHaveBeenCalledTimes(1)
    } finally { if (wrapper.exists()) wrapper.unmount() }
  })

  it('周期未就绪时不伪造cycleId、不调用分析接口', async () => {
    const stats = vi.spyOn(performanceWorkbenchApi, 'taskAnalysisStatistics')
    const wrapper = mount(PerformanceReviewContent, { props: { loading: false, error: '', templateName: '', projectId: 9, node: { ...overview.categories[0].nodes[0], node_type: 'evaluation', task_kind: 'evaluation', executor_role_code: 'assessment.line_manager' } }, global: { plugins: [pinia], stubs: { ProjectMemberListPanel: true } } })
    try {
      await wrapper.findAll('button').find(button => button.text() === '统计报表')!.trigger('click')
      expect(wrapper.text()).toContain('当前周期信息尚未就绪')
      expect(stats).not.toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })

  it('keeps the member list when every direct-report evaluation is completed', async () => {
    const completedEvaluation = structuredClone(overview)
    Object.assign(completedEvaluation.categories[2].nodes[0], {
      node_id: 'manager-review',
      node_name: '直接上级评估',
      node_type: 'evaluation',
      task_kind: 'evaluation',
      status: 'completed',
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(completedEvaluation)

    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.review-node')[2].trigger('click')

    expect(wrapper.findComponent(PerformanceTabbedSurface).exists()).toBe(true)
    expect(wrapper.find('.performance-review-completion-notice').exists()).toBe(false)
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenCalledWith(1, 'manager-review', 'all', undefined, undefined, 1, 50, undefined, undefined)
  })

  it('waits for late column preferences before displaying member rows without a disappearing status paragraph', async () => {
    let finishPreference!: (value: unknown) => void
    const request = vi.spyOn(api, 'get').mockImplementation(url => url === '/performance/column-preferences'
      ? new Promise(resolve => { finishPreference = resolve })
      : Promise.reject(new Error('unexpected request')))
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue({ items: [{ task_id: 22, employee_no: 'E002', display_name: '已加载员工', status: 'pending' }], total: 1 } as any)
    const wrapper = mount(ProjectMemberListPanel, {
      props: { projectId: 1, reviewContext: { nodeId: 'manager-review', state: 'all' }, preferenceScope: { cycle_ref: 1, scene: 'evaluation', project_id: 1, node_id: 'manager-review' } },
    })
    try {
      await flushPromises()
      expect(wrapper.find('.member-list-panel > p[role="status"]').exists()).toBe(false)
      expect(wrapper.get('.ui-table__row--loading').text()).toContain('正在加载列设置')
      expect(wrapper.text()).not.toContain('已加载员工')
      finishPreference({ data: { column_keys: null } })
      await flushPromises()
      expect(wrapper.find('.ui-table__row--loading').exists()).toBe(false)
      expect(wrapper.text()).toContain('已加载员工')
    } finally {
      wrapper.unmount()
      request.mockRestore()
    }
  })

  it('renders independent rating columns from task metadata and preserves hidden columns on reload', async () => {
    const row = {
      task_id: 22, employee_no: 'E002', display_name: '已完成员工', status: 'completed', due_at: null,
      job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null,
      department: null, employee_type: null, employment_status: null,
      rating_columns: [{ key: 'rating:grade', label: '年度绩效' }, { key: 'rating:value', label: '价值贡献' }],
      ratings: { 'rating:grade': { label: '3星+', color: '#d9f5d6' }, 'rating:value': { label: 'A', color: '#e1eaff' } },
    }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([row])
    const wrapper = mount(ProjectMemberListPanel, { props: { projectId: 1, reviewContext: { nodeId: 'manager-review', state: 'all' } } })
    await flushPromises()
    expect(wrapper.findAll('th').map(cell => cell.text())).toEqual(expect.arrayContaining(['年度绩效', '价值贡献']))
    expect(wrapper.findAll('.performance-rating-tag').map(tag => tag.text())).toEqual(['3星+', 'A'])
    const exportButton = wrapper.findComponent({ name: 'PerformanceExportButton' })
    const exported = await exportButton.props('loadRows')()
    expect(exported[0]).toEqual(expect.arrayContaining(['年度绩效', '价值贡献']))
    expect(exported[1][exported[0].indexOf('年度绩效')]).toBe('3星+')
    expect(exported[1][exported[0].indexOf('价值贡献')]).toBe('A')
    expect(wrapper.text()).not.toContain('绩效评级')
    const drawer = wrapper.findComponent({ name: 'ProjectMemberColumnDrawer' })
    drawer.vm.$emit('confirm', ['name', 'rating:grade'])
    await flushPromises()
    await wrapper.get('input').setValue('员工')
    await wrapper.get('input').trigger('keyup.enter')
    await flushPromises()
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenLastCalledWith(1, 'manager-review', 'all', '员工', undefined, 1, 50, undefined, undefined)
    expect(wrapper.findAll('.performance-rating-tag').map(tag => tag.text())).toEqual(['3星+'])
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([])
    await wrapper.get('input').trigger('keyup.enter')
    await flushPromises()
    expect(wrapper.findAll('th').map(cell => cell.text())).toContain('年度绩效')
    expect(wrapper.findAll('.performance-rating-tag')).toHaveLength(0)
    wrapper.unmount()
  })

  it('passes the reviewee into the evaluation task route', async () => {
    const evaluation = structuredClone(overview)
    Object.assign(evaluation.categories[2].nodes[0], { node_id: 'manager-review', node_type: 'evaluation', task_kind: 'evaluation', entry_mode: 'template_task', task_id: 22, status: 'pending' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(evaluation)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.review-node')[2].trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', { task_id: 22, employee_no: 'E 002', status: 'pending' })
    await flushPromises()
    expect(push).toHaveBeenLastCalledWith(expect.stringContaining('employee_no=E%20002'))
    wrapper.unmount()
  })

  it('opens a completed evaluation member in the readonly drawer and keeps pending members on task entry', async () => {
    const evaluationOverview = structuredClone(overview)
    Object.assign(evaluationOverview.categories[1].nodes[0], {
      task_id: 22,
      status: 'pending',
      task_kind: 'evaluation',
      entry_mode: 'template_task',
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(evaluationOverview)
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{
      task_id: 22,
      aggregate_task_id: null,
      employee_no: 'E002',
      display_name: '已完成员工',
      job_family: '专业',
      job_category: '产品',
      job_sequence: '专业-产品',
      position_level: 'J3',
      hire_date: '2020-01-01',
      department: '产品中心',
      employee_type: '正式员工',
      employment_status: '在职',
      status: 'completed',
      due_at: '2026-10-03T15:59:00Z',
    }])
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({
      task_id: 22,
      task_kind: 'evaluation',
      entry_mode: 'template_task',
      node_name: '360°评估',
      deadline_at: '2026-10-03T15:59:00Z',
      submitted_at: '2026-09-22T07:29:00Z',
      editable: true,
      submit_allowed: true,
      person: { employee_no: 'E002', display_name: '已完成员工' },
      form_schema: [{ id: 'summary', name: '评估内容', fields: [{ id: 'answer', type: 'rich_text', label: '内容' }] }],
      answers: { answer: '已提交内容' },
    })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.review-node')[1].trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', { id: 22, task_id: 22, employee_no: 'E002', display_name: '已完成员工', status: 'completed' })
    await flushPromises()

    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(22, 'E002', { view: 'drawer', tab: undefined })
    expect(document.body.textContent).toContain('已完成员工')
    expect(document.body.textContent).toContain('已提交内容')
    expect(document.body.querySelector('.performance-review-evaluation-drawer__scroll')).not.toBeNull()
    wrapper.unmount()
  })

  it('restores a shared completed task and copies its reference-tab link', async () => {
    const shared = structuredClone(overview)
    Object.assign(shared.categories[2].nodes[0], { node_id: 'manager-review', node_name: '上级评估', node_type: 'evaluation', task_kind: 'evaluation', status: 'completed' })
    Object.assign(routeQuery, { project_id: '1', node: 'manager-review', rootReviewId: '22', activeTab: 'summary' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(shared)
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 22, task_kind: 'evaluation', entry_mode: 'template_task', node_name: '上级评估', submitted_at: '2026-01-01T00:00:00Z', editable: false, submit_allowed: false, person: { employee_no: 'E002', display_name: '授权员工' }, form_schema: [], answers: {}, reference_tabs: [{ key: 'reference-summary', node_id: 'summary', node_name: '工作总结', employee_no: 'E002', status: 'completed', form_schema: [{ id: 'summary', name: '工作总结', fields: [{ id: 'answer', type: 'rich_text', label: '总结' }] }], answers: { answer: '已授权参考内容' }, can_remind: false }] })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mountView()
    await flushPromises()
    expect(performanceReviewApi.overview).toHaveBeenCalledWith(1, 22, 1)
    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(22, undefined, { view: 'drawer', tab: 'summary' })
    expect(document.body.textContent).toContain('已授权参考内容')
    expect(document.body.querySelector('.performance-drawer__mask')).toBeNull()
    ;(document.body.querySelector('[aria-label="复制链接"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('rootReviewId=22'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('activeTab=reference-summary'))
    ;(document.body.querySelector('.performance-drawer__outside') as HTMLElement).click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(replace).toHaveBeenLastCalledWith({ query: { project_id: '1', node: 'manager-review' } })
    expect(document.body.querySelector('.performance-drawer__panel')).toBeNull()
    wrapper.unmount()
  })

  it('renders self evaluation as a form task instead of the member workspace', async () => {
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce({
      ...overview,
      categories: overview.categories.map(category => category.key === 'mine'
        ? { ...category, nodes: [{ ...category.nodes[0], task_id: 12, node_id: 'self-eval', node_name: '员工自评', node_type: 'evaluation', task_kind: 'evaluation', executor_label: '被评估人', executor_role_code: 'assessment.reviewee', status: 'pending' }] }
        : category),
    })
    Object.assign(routeQuery, { project_id: '1', node: 'self-eval' })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.evaluation-workspace').exists()).toBe(false)
    expect(wrapper.text()).toContain('去完成')
    wrapper.unmount()
  })

  it('keeps the member workspace for manager evaluation nodes', async () => {
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce({
      ...overview,
      categories: overview.categories.map(category => category.key === 'team'
        ? { ...category, nodes: [{ ...category.nodes[0], task_id: 13, node_id: 'manager-eval', node_name: '上级评估', node_type: 'evaluation', task_kind: 'evaluation', executor_label: '实线上级', executor_role_code: 'assessment.line_manager', status: 'pending' }] }
        : category),
    })
    Object.assign(routeQuery, { project_id: '1', node: 'manager-eval' })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.findComponent(PerformanceTabbedSurface).exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides empty evaluation categories while preserving categories with nodes', async () => {
    const withEmptyCategory = structuredClone(overview)
    withEmptyCategory.categories = [
      ...withEmptyCategory.categories.slice(0, 1),
      { key: 'empty', label: '空评估分组', nodes: [] },
      ...withEmptyCategory.categories.slice(1),
    ]
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(withEmptyCategory)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('空评估分组')
    expect(wrapper.findAll('.category-toggle')).toHaveLength(4)
  })

  it('switches the shared cycle from the review selector and loads that cycle overview', async () => {
    const context = usePerformanceProjectContextStore()
    vi.mocked(performanceNavigationApi.get).mockImplementation(async (cycleId) => navigationOf(cycleId || 1))
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(overview)
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'PerformanceReviewCategorySidebar' }).vm.$emit('select-filter', 2)
    await flushPromises()

    expect(context.activeCycleId).toBe(2)
    expect(performanceNavigationApi.get).toHaveBeenCalledWith(2)
    expect(performanceReviewApi.overview).toHaveBeenLastCalledWith(undefined, undefined, 2)
  })

  it('redirects to the workbench when the selected cycle has no review access', async () => {
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigationOf(1, { can_review: false }))
    const wrapper = mountView()
    await flushPromises()

    expect(replace).toHaveBeenCalledWith('/performance/workbench')
    wrapper.unmount()
  })

  it.each(['not_started', 'pending', 'overdue'] as const)('uses the shared invite home state for %s without loading an invite list', async status => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'invite', node_type: 'reviewer_360_invite', task_kind: 'reviewer_360_invite', status }
    const list = vi.spyOn(performanceReview360InviteApi, 'list')
    const wrapper = mount(PerformanceReviewContent, { props: { node, projectId: 1, loading: false, error: '', templateName: '模板' } })
    expect(wrapper.get('.state-illustration img').attributes('src')).toBe(status === 'not_started' ? '/performance-not-started.svg' : '/performance-no-submit.svg')
    expect(wrapper.findComponent(PerformanceReview360InvitePanel).exists()).toBe(false)
    expect(list).not.toHaveBeenCalled()
    if (status === 'not_started') expect(wrapper.find('.primary-button').exists()).toBe(false)
    else {
      await wrapper.get('.primary-button').trigger('click')
      expect(wrapper.emitted('open-node')).toEqual([[node]])
    }
    wrapper.unmount()
  })

  it('passes the submitted invite schema to the shared readonly renderer', () => {
    const formSchema = [{ id: 'invite', name: '已提交邀请名单', fields: [], elements: [{ kind: 'reviewer_360' as const, id: 'reviewer_360', data: { items: [], total: 0, minimum_invited_count: 0, maximum_invited_count: null, maximum_invite_mode: 'SUGGESTED', second_prompt_enabled: false, second_prompt_count: null, second_prompt_mode: 'SUGGESTED', exclude_default_invite_from_limit: false } }] }]
    const node = { ...overview.categories[0].nodes[0], node_id: 'invite', node_type: 'reviewer_360_invite', task_kind: 'reviewer_360_invite', status: 'completed' as const, editable: false, form_schema: formSchema }
    const wrapper = mount(PerformanceReviewContent, { props: { node, projectId: 1, loading: false, error: '', templateName: '' }, global: { stubs: { PerformanceTemplateRenderer: true, PerformanceReviewCompletionNotice: true } } })
    expect(wrapper.getComponent({ name: 'PerformanceTemplateRenderer' }).props()).toMatchObject({ mode: 'readonly', sections: formSchema })
    expect(wrapper.findComponent(PerformanceReview360InvitePanel).exists()).toBe(false)
    expect(wrapper.find('.primary-button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps unstarted confirm on the shared icon without requesting task people or feedback', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'confirm', node_type: 'reviewer_360_confirm', task_kind: 'reviewer_360_confirm', status: 'not_started' as const }
    const feedback = vi.spyOn(performanceReview360FeedbackApi, 'list')
    const wrapper = mount(PerformanceReviewContent, { props: { node, projectId: 1, loading: false, error: '', templateName: '' } })
    await flushPromises()
    expect(wrapper.get('.state-illustration img').attributes('src')).toBe('/performance-not-started.svg')
    expect(wrapper.text()).toContain('暂未启动')
    expect(performanceWorkbenchApi.taskPeople).not.toHaveBeenCalled()
    expect(feedback).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each(['pending', 'completed'] as const)('keeps the exact six-column confirm table when the node is %s', async status => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'confirm', node_type: 'reviewer_360_confirm', task_kind: 'reviewer_360_confirm', status }
    const member = { task_id: 42, employee_no: 'E001', display_name: '确认成员', status, due_at: null, completion: '0/1', visible_profile_fields: ['job_sequence', 'position_level'], job_sequence: '技术', position_level: 'P6', can_remind: true, evaluate_ratio: { evaluated: [], pending: [{ name: '待评人' }], dimission_count: 0, invite_stage: 'in_progress' } }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue({ items: [member], total: 1, rating_columns: [{ key: 'rating:final', label: '不应出现的终评' }] } as any)
    const feedback = vi.spyOn(performanceReview360FeedbackApi, 'list')
    const wrapper = mount(PerformanceReviewContent, { props: { node, projectId: 1, loading: false, error: '', templateName: '' }, global: { plugins: [pinia], stubs: { PerformancePopover: { template: '<div><slot /></div>' } } } })
    await flushPromises()
    const table = wrapper.getComponent({ name: 'PerformanceManagementTable' })
    expect(table.props('columns').map((column: { label: string }) => column.label)).toEqual(['姓名', '360°邀请确认状态', '截止时间', '360°评估率', '序列', '职级'])
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenCalledWith(1, 'confirm', 'all', undefined, undefined, 1, 50, undefined, undefined)
    expect(feedback).not.toHaveBeenCalled()
    expect(wrapper.getComponent(PerformanceEvaluateRatioPopover).props('canRemind')).toBe(true)
    await wrapper.get('.performance-remind-button').trigger('click')
    expect(wrapper.emitted('remind-evaluate')?.[0]?.[0]).toMatchObject({ node, member: { task_id: 42, employee_no: 'E001' }, pendingCount: 1 })
    table.vm.$emit('row-click', member)
    expect(wrapper.emitted('open-member')?.[0]?.[0]).toMatchObject({ node, member: { task_id: 42, employee_no: 'E001', status } })
    table.vm.$emit('page-change', 2)
    await flushPromises()
    expect(table.props('rows')).toHaveLength(1)
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenLastCalledWith(1, 'confirm', 'all', undefined, undefined, 2, 50, undefined, undefined)
    table.vm.$emit('sort-change', { key: 'completion', order: 'desc' })
    await flushPromises()
    await wrapper.get('input').setValue('确认成员')
    await wrapper.get('input').trigger('keyup.enter')
    await flushPromises()
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenLastCalledWith(1, 'confirm', 'all', '确认成员', undefined, 1, 50, 'completion', 'desc')
    expect(wrapper.find('.performance-review-completion-notice').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([[], ['job_sequence'], undefined])('clips confirm profile columns to actual visible fields %j', async fields => {
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue({ items: [{ task_id: 42, employee_no: 'E001', display_name: '成员', status: 'pending', visible_profile_fields: fields, job_sequence: '技术', position_level: '禁止泄漏' }], total: 1, rating_columns: [] } as any)
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'confirm', mode: 'taskPeople' }, global: { plugins: [pinia] } })
    await flushPromises()
    const labels = wrapper.getComponent({ name: 'PerformanceManagementTable' }).props('columns').map((column: { label: string }) => column.label)
    expect(labels).toEqual(['姓名', '360°邀请确认状态', '截止时间', '360°评估率', ...(fields?.includes('job_sequence') ? ['序列'] : [])])
    expect(wrapper.text()).not.toContain('禁止泄漏')
    wrapper.unmount()
  })

  it('routes unfinished confirm rows to the shared template task using the real kind', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'confirm', node_type: 'reviewer_360_confirm', task_kind: 'reviewer_360_confirm' }
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...structuredClone(overview), categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const wrapper = mountView()
    await flushPromises()
    push.mockClear()
    wrapper.getComponent(PerformanceReviewContent).vm.$emit('open-member', { node, member: { task_id: 42, employee_no: 'E001', status: 'pending' } })
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=42&project_id=1&node=confirm&employee_no=E001')
    expect(wrapper.findComponent(PerformanceReviewEvaluationDrawer).exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([true, false])('uses the shared drawer and server editable=%s for completed confirm rows', async editable => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'confirm', node_type: 'reviewer_360_confirm', task_kind: 'reviewer_360_confirm', status: 'completed' as const }
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...structuredClone(overview), categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 42, task_kind: 'reviewer_360_confirm', entry_mode: 'template_task', node_name: '360°确认', person: { employee_no: 'E001', display_name: '成员' }, editable, submit_allowed: editable, form_schema: [], answers: {} })
    const wrapper = mountView()
    await flushPromises()
    push.mockClear()
    wrapper.getComponent(PerformanceReviewContent).vm.$emit('open-member', { node, member: { task_id: 42, employee_no: 'E001', status: 'completed' } })
    await flushPromises()
    const drawer = wrapper.getComponent(PerformanceReviewEvaluationDrawer)
    expect(drawer.props('readonly')).toBe(false)
    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(42, 'E001', { view: 'drawer', tab: undefined })
    expect(Boolean(document.body.querySelector('.performance-drawer .performance-review-completion-notice__edit'))).toBe(editable)
    expect(push).not.toHaveBeenCalled()
    if (editable) {
      drawer.vm.$emit('edit', { task_id: 42, employee_no: 'E001', task_kind: 'reviewer_360_confirm', node_id: 'confirm', draft_choice: 'use' })
      await flushPromises()
      expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=42&project_id=1&node=confirm&employee_no=E001&draft_choice=use')
    }
    wrapper.unmount()
  })

  it('shows communication rows directly and uses a readonly drawer for completed rows', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'communicate', node_name: '绩效结果沟通', node_type: 'result_communication', task_kind: 'result_communication', status: 'pending' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'communicate' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ task_id: 22, employee_no: 'E2', display_name: '沟通员工', status: 'completed', due_at: null, completion: '3/5', previous_position_level: 'P5', job_family: null, job_category: null, job_sequence: null, position_level: 'P6', hire_date: null, department: null, employee_type: null, employment_status: null, rating_columns: [{ key: 'rating:grade', label: '绩效评级' }], ratings: { 'rating:grade': { label: 'A', color: '#d9f5d6' } } }])
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 22, task_kind: 'result_communication', entry_mode: 'template_task', node_name: '绩效结果沟通', editable: true, submit_allowed: true, submitted_at: '2026-10-20T00:00:00Z', person: { employee_no: 'E2', display_name: '沟通员工' }, form_schema: [], answers: {} })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.feedback-panel').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('去完成')
    const table = wrapper.findComponent({ name: 'PerformanceManagementTable' })
    expect(table.props('columns').map((column: { label: string }) => column.label)).toEqual(['姓名', '状态', '截止时间', '绩效评级', '360°评估率', '序列', '职级', '入职日期', '所属部门', '员工类型', '上期职级'])
    expect(wrapper.find('.performance-rating-tag').text()).toBe('A')
    expect(wrapper.text()).toContain('3/5')
    expect(wrapper.text()).toContain('P5')
    table.vm.$emit('row-click', { task_id: 22, employee_no: 'E2', display_name: '沟通员工', status: 'completed' })
    await flushPromises()
    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(22, 'E2', { view: 'drawer', tab: undefined })
    expect(wrapper.findComponent({ name: 'PerformanceReviewEvaluationDrawer' }).props('readonly')).toBe(true)
    expect(document.body.querySelector('.performance-review-completion-notice__edit')).toBeNull()
    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('opens communication summary, self-review and 360 reminders from the real readonly drawer', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'communicate', node_name: '绩效沟通并开通结果', node_type: 'result_communication', task_kind: 'result_communication', status: 'completed' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'communicate' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const reference = (id: string, name: string, taskId: number | null, kind: 'node' | 'reviewer_360' = 'node') => ({ key: `reference-${id}`, node_id: id, node_name: name, task_id: taskId, employee_no: 'E2', kind, status: 'pending' as const, form_schema: [], answers: {}, can_remind: true, reviewers: [], evaluate_ratio: kind === 'reviewer_360' ? { completion: '0/1', evaluated: [], pending: [{ name: '待评估人', dimission: false }], dimission_count: 0, invite_stage: 'in_progress' as const } : undefined })
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 22, project_id: 1, node_id: 'communicate', task_kind: 'result_communication', entry_mode: 'template_task', node_name: node.node_name, editable: false, submit_allowed: false, person: { employee_no: 'E2', display_name: '沟通员工' }, form_schema: [], answers: {}, reference_tabs: [reference('summary', '工作总结', 71), reference('self', '自评', 72), reference('feedback', '360°反馈', null, 'reviewer_360')] })
    const wrapper = mount(Review, { global: { plugins: [pinia], stubs: { PerformanceMemberReminderDialog: true } } })
    try {
      await flushPromises()
      wrapper.getComponent(PerformanceReviewContent).vm.$emit('open-member', { node, member: { task_id: 22, employee_no: 'E2', display_name: '沟通员工', status: 'completed' } })
      await flushPromises()
      for (const [index, nodeId, targetTaskId, targetKind] of [[1, 'summary', 71, undefined], [2, 'self', 72, undefined], [3, 'feedback', undefined, 'reviewer_360']] as const) {
        document.body.querySelectorAll<HTMLButtonElement>('.performance-drawer .line-tab')[index]!.click()
        await flushPromises()
        if (targetKind === 'reviewer_360') {
          document.body.querySelector('.performance-drawer .evaluate-ratio-anchor')!.dispatchEvent(new MouseEvent('mouseenter'))
          await flushPromises()
          document.body.querySelector<HTMLButtonElement>('.evaluate-ratio-popover .performance-remind-button--text')!.click()
        } else {
          document.body.querySelector<HTMLButtonElement>('.performance-drawer .performance-remind-button--outline')!.click()
        }
        await flushPromises()
        expect(wrapper.getComponent(PerformanceMemberReminderDialog).props()).toMatchObject({ modelValue: true, context: { employeeNo: 'E2', sourceTaskId: 22, nodeId, targetTaskId, targetKind } })
        wrapper.getComponent(PerformanceMemberReminderDialog).vm.$emit('update:modelValue', false)
        await flushPromises()
      }
      expect(wrapper.getComponent(PerformanceReviewEvaluationDrawer).props('readonly')).toBe(true)
      expect(push).not.toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })

  it('opens a newly created voluntary 360 task even when the overview node has no existing task metadata', async () => {
    const node = {
      node_id: 'evaluation-1',
      node_name: '360°反馈（自愿评估）',
      node_type: 'evaluation',
      executor_label: '360°评估人',
      executor_role_code: 'assessment.reviewer_360',
      status: 'pending' as const,
      start_at: null,
      end_at: null,
      action_url: '/performance/review?node=evaluation-1',
    }
    Object.assign(routeQuery, { project_id: '1', node: 'evaluation-1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'others', label: '给他人的评估', nodes: [node] }] })
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'PerformanceReview360FeedbackPanel' }).vm.$emit('open-task', {
      task_id: 12975,
      employee_no: '107187',
      display_name: '被评估人',
      status: 'pending',
    })
    await flushPromises()

    expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=12975&project_id=1&node=evaluation-1&employee_no=107187')
    wrapper.unmount()
  })

  it('scopes voluntary candidates and creation to the currently selected 360 node', async () => {
    const list = vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [], total: 0, node_id: 'second-360', allow_voluntary_evaluation: true })
    const candidates = vi.spyOn(performanceReview360FeedbackApi, 'candidates').mockResolvedValue({ items: [{ employee_no: 'E2', display_name: '同事', department: null, job_sequence: null }], total: 1 })
    const start = vi.spyOn(performanceReview360FeedbackApi, 'start').mockResolvedValue({ task_id: 55, target_employee_no: 'E2' })
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'second-360' }, global: { plugins: [pinia] } })
    await flushPromises()
    expect(list).toHaveBeenCalledWith(1, undefined, 'second-360', 1, 50, undefined, undefined)
    ;(wrapper.vm as unknown as { openVoluntaryDialog: () => void }).openVoluntaryDialog()
    await flushPromises()
    expect(candidates).toHaveBeenCalledWith(1, undefined, 'second-360')
    wrapper.findComponent({ name: 'PerformancePersonSelect' }).vm.$emit('update:modelValue', 'E2')
    await flushPromises()
    const confirm = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.trim() === '前往评估')!
    confirm.click()
    await flushPromises()
    expect(start).toHaveBeenCalledWith(1, 'E2', 'second-360')
    expect(wrapper.emitted('open-task')?.[0]?.[0]).toMatchObject({ task_id: 55, employee_no: 'E2' })
    wrapper.unmount()
  })

  it('opens a pending communication task through the shared template route', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'communicate', node_name: '绩效结果沟通', node_type: 'result_communication', task_kind: 'result_communication', status: 'pending' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'communicate' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const wrapper = mountView()
    await flushPromises()
    wrapper.findComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', { task_id: 23, employee_no: 'E3', display_name: '待沟通', status: 'pending' })
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=23&project_id=1&node=communicate&employee_no=E3')
    wrapper.unmount()
  })

  it('keeps a single calibration task in the existing direct member workspace', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'calibration' })
    const node = { ...overview.categories[2].nodes[0], status: 'pending' as const, phase_id: 'phase-2' }
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent(PerformanceCalibrationWorkspace).exists()).toBe(true)
    expect(performanceCalibrationApi.tasks).toHaveBeenCalledWith(1)
    expect(wrapper.findComponent(ProjectMemberListPanel).exists()).toBe(true)
    expect(wrapper.find('.calibration-home').exists()).toBe(false)
    expect(wrapper.findAll('button').some(item => item.text() === '完成校准')).toBe(true)
    wrapper.unmount()
  })

  it('restores a task-specific full screen and forwards the selected scope to preflight', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'calibration', calibration_open: '1', calibration_scope: 'scope-rule-2' })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('button').find(item => item.text() === '完成校准')!.trigger('click')
    await flushPromises()
    expect(performanceCalibrationApi.preview).toHaveBeenCalledWith(expect.objectContaining({ scope_key: 'scope-rule-2', phase_id: 'phase-2' }))
    expect(document.body.textContent).toContain('有1名员工没有绩效结果')
    wrapper.unmount()
  })

  it('renders calibration with the manager list and passes the frozen phase', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'calibration', node_name: '校准', node_type: 'calibration', task_kind: 'calibration', phase_id: 'phase-2', status: 'pending' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'calibration', calibration_open: '1', calibration_scope: 'scope-rule-2' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ProjectMemberListPanel' }).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('去完成')
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenCalledWith(1, 'calibration', 'all', undefined, 'phase-2', 1, 50, undefined, undefined)
    wrapper.unmount()
  })

  it.each(['pending', 'completed', 'overdue'])('opens a %s calibration member in the shared readonly drawer before editing', async status => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'calibration', node_name: '校准', node_type: 'calibration', task_kind: 'calibration', phase_id: 'phase-2', status: 'pending' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'calibration', calibration_open: '1', calibration_scope: 'scope-rule-2' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const detail = vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 81, node_id: 'calibration', task_kind: 'calibration', entry_mode: 'template_task', node_name: '校准', editable: status !== 'overdue', submit_allowed: status !== 'overdue', person: { employee_no: 'E3', display_name: '被校准人' }, form_schema: [], answers: {} })
    const wrapper = mountView()
    await flushPromises()
    wrapper.getComponent(ProjectMemberListPanel).vm.$emit('select-member', { task_id: 81, employee_no: 'E3', display_name: '被校准人', status })
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    expect(detail).toHaveBeenCalledWith(81, 'E3', { view: 'drawer', tab: undefined })
    expect(wrapper.getComponent({ name: 'PerformanceReviewEvaluationDrawer' }).props('readonly')).toBe(false)
    expect(replace).toHaveBeenLastCalledWith({ query: expect.objectContaining({ rootReviewId: '81', node: 'calibration' }) })
    wrapper.getComponent({ name: 'PerformanceReviewEvaluationDrawer' }).vm.$emit('edit', { task_id: 81, employee_no: 'E3' })
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=81&project_id=1&node=calibration&employee_no=E3')
    wrapper.unmount()
  })

  it('keeps the selected calibration member project when opening and editing across projects', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'calibration', calibration_open: '1', calibration_scope: 'scope-rule-2' })
    vi.mocked(performanceCalibrationApi.tasks).mockResolvedValue({ tasks: [calibrationScope({ project_id: 2 })], pending_member_count: 1 })
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 81, task_kind: 'calibration', entry_mode: 'template_task', node_name: '校准', editable: true, submit_allowed: true, person: { employee_no: 'E3', display_name: '跨项目成员' }, form_schema: [], answers: {} })
    const wrapper = mountView()
    await flushPromises()
    wrapper.getComponent(PerformanceCalibrationWorkspace).vm.$emit('open-member', { node: { ...overview.categories[2].nodes[0], project_id: 2, task_kind: 'calibration', entry_mode: 'template_task' }, member: { project_id: 2, task_id: 81, employee_no: 'E3', display_name: '跨项目成员' } })
    await flushPromises()
    expect(wrapper.getComponent(PerformanceReviewEvaluationDrawer).props('projectId')).toBe(2)
    wrapper.getComponent(PerformanceReviewEvaluationDrawer).vm.$emit('edit', { task_id: 81, employee_no: 'E3' })
    await flushPromises()
    expect(push).toHaveBeenLastCalledWith('/performance/review/template-task?task_id=81&project_id=2&node=calibration&employee_no=E3')
    wrapper.unmount()
  })

  it('restores calibration source detail from a shared drawer link without navigating to edit', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'calibration', node_name: '校准', node_type: 'calibration', task_kind: 'calibration', phase_id: 'phase-2', status: 'pending' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'calibration', rootReviewId: '81', activeTab: 'calibration' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const detail = vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 81, task_kind: 'calibration', entry_mode: 'template_task', node_name: '校准', editable: true, submit_allowed: true, person: { employee_no: 'E3', display_name: '被校准人' }, form_schema: [], answers: {} })
    const wrapper = mountView()
    await flushPromises()
    expect(detail).toHaveBeenCalledWith(81, undefined, { view: 'drawer', tab: undefined })
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.getComponent({ name: 'PerformanceReviewEvaluationDrawer' }).props('modelValue')).toBe(true)
    wrapper.unmount()
  })

  it('keeps unopened communication and calibration stages in the not-started state', async () => {
    for (const type of ['calibration', 'result_communication']) {
      const node = { ...overview.categories[0].nodes[0], node_id: type, node_type: type, task_kind: type, status: 'not_started' as const }
      Object.assign(routeQuery, { project_id: '1', node: type })
      vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.text()).toContain('暂未启动')
      expect(wrapper.findComponent({ name: 'PerformanceManagementTable' }).exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('renders an empty state when the current user has no started project', async () => {
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce({
      projects: [], active_project: null, template_name: '', categories: overview.categories.map(category => ({ ...category, nodes: [] })),
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无已启动的绩效评估')
  })
  it.each(['project', 'review'])('preserves supervisor names and displays blue 0/0 in the %s member list', async entry => {
    const row = { id: 1, task_id: 1, employee_no: 'E1', display_name: '员工', direct_supervisor: '当期上级姓名', status: 'pending', due_at: null, avatar_url: null, rating: null, rating_tone: null, completion: null, job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([row])
    vi.spyOn(projectManagementApi, 'members').mockResolvedValue({ items: [row], total: 1, page: 1, page_size: 50 })
    const wrapper = mount(ProjectMemberListPanel, { props: { projectId: 1, ...(entry === 'review' ? { reviewContext: { nodeId: 'manager', state: 'all' as const } } : {}) } })
    await flushPromises()
    expect(wrapper.text()).toContain('当期上级姓名')
    expect(wrapper.get('.completion-text').text()).toBe('0/0')
    await wrapper.setProps({ projectId: 2 })
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ ...row, completion: '2/3' }])
    vi.mocked(projectManagementApi.members).mockResolvedValue({ items: [{ ...row, completion: '2/3' }], total: 1, page: 1, page_size: 50 })
    await wrapper.setProps({ projectId: 3 })
    await flushPromises()
    expect(wrapper.get('.completion-text').text()).toBe('2/3')
    wrapper.unmount()
  })

  it('passes the shared 360 ratio payload through the review member-list field', async () => {
    const evaluateRatio = { completion: '1/2', evaluated: [{ name: '已评人', dimission: false }], pending: [{ name: '待评人', dimission: false }], dimission_count: 0, invite_stage: 'in_progress' as const }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ task_id: 1, employee_no: 'E1', display_name: '员工', status: 'completed', due_at: null, completion: '1/2', evaluate_ratio: evaluateRatio, job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }])
    const wrapper = mount(ProjectMemberListPanel, { props: { projectId: 1, reviewContext: { nodeId: 'manager', state: 'all' } } })
    await flushPromises()
    expect(wrapper.getComponent({ name: 'PerformanceEvaluateRatioPopover' }).props('ratio')).toEqual(evaluateRatio)
    wrapper.unmount()
  })

  it.each(['review', 'communication'])('uses remote paging, sorting and search without slicing the %s page twice', async entry => {
    const row = { task_id: 51, employee_no: 'E51', display_name: '第二页员工', status: 'pending', due_at: null, completion: '0/0', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue({ items: [row], total: 101, rating_columns: [{ key: 'rating:final', label: '终评' }] } as any)
    const wrapper = entry === 'review'
      ? mount(ProjectMemberListPanel, { props: { projectId: 1, reviewContext: { nodeId: 'manager', state: 'all', phaseId: 'phase-2' } } })
      : mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' } })
    await flushPromises()
    const table = wrapper.getComponent({ name: 'PerformanceManagementTable' })
    table.vm.$emit('page-change', 2)
    await flushPromises()
    expect(table.props('rows')).toHaveLength(1)
    expect(table.props('total')).toBe(101)
    expect(table.props('columns').some((column: { key: string }) => column.key === 'rating:final')).toBe(true)
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenLastCalledWith(1, entry === 'review' ? 'manager' : 'communication', 'all', undefined, entry === 'review' ? 'phase-2' : undefined, 2, 50, undefined, undefined)
    table.vm.$emit('sort-change', { key: 'name', order: 'desc' })
    await flushPromises()
    await wrapper.get('input').setValue('第二页')
    await wrapper.get('input').trigger('keyup.enter')
    await flushPromises()
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenLastCalledWith(1, entry === 'review' ? 'manager' : 'communication', 'all', '第二页', entry === 'review' ? 'phase-2' : undefined, 1, 50, 'name', 'desc')
    wrapper.unmount()
  })

  it.each(['review', 'communication'])('ignores an older %s response after switching projects', async entry => {
    let resolveOld!: (value: any) => void
    vi.mocked(performanceWorkbenchApi.taskPeople).mockReturnValueOnce(new Promise(done => { resolveOld = done }))
    const wrapper = entry === 'review'
      ? mount(ProjectMemberListPanel, { props: { projectId: 1, reviewContext: { nodeId: 'manager', state: 'all' } } })
      : mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' } })
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue({ items: [], total: 0, rating_columns: [] } as any)
    await wrapper.setProps({ projectId: 2 })
    await flushPromises()
    resolveOld({ items: [{ task_id: 1, employee_no: 'OLD', display_name: '旧项目员工' }], total: 1 })
    await flushPromises()
    expect(wrapper.text()).not.toContain('旧项目员工')
    expect(wrapper.getComponent({ name: 'PerformanceManagementTable' }).props('total')).toBe(0)
    wrapper.unmount()
  })

  it('displays blue 0/0 instead of a dash in the communication table', async () => {
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ task_id: 1, employee_no: 'E1', display_name: '员工', status: 'pending', due_at: null, completion: null, job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }])
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' } })
    await flushPromises()
    expect(wrapper.get('.feedback-panel__completion').text()).toBe('0/0')
    wrapper.unmount()
  })

  it.each([
    ['pending', '2099-01-01T00:00:00Z', 'pending', '待完成'],
    ['completed', '2020-01-01T00:00:00Z', 'completed', '已完成'],
    ['overdue', null, 'overdue', '已逾期'],
    ['pending', '2020-01-01T00:00:00Z', 'overdue', '已逾期'],
    ['invited', null, 'pending', '待完成'],
    ['not_started', '2020-01-01T00:00:00Z', 'pending', '待完成'],
    ['pending', 'invalid', 'pending', '待完成'],
  ])('uses shared dot status for %s with deadline %s', (status, dueAt, normalized, label) => {
    expect(normalizePerformanceTaskStatus(status, dueAt)).toBe(normalized)
    const wrapper = mount(PerformanceTaskStatus, { props: { status, dueAt } })
    expect(wrapper.text()).toBe(label)
    expect(wrapper.classes()).toContain(`is-${normalized}`)
    expect(wrapper.get('.performance-task-status__dot').attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it.each(['review', 'communication'])('renders all three dot statuses in the %s table', async entry => {
    const rows = ['pending', 'completed', 'overdue'].map((status, index) => ({ task_id: index + 1, employee_no: `E${index}`, display_name: `员工${index}`, status, due_at: null, completion: '0/0', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }))
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue(rows)
    const wrapper = entry === 'review'
      ? mount(ProjectMemberListPanel, { props: { projectId: 1, reviewContext: { nodeId: 'manager', state: 'all' } } })
      : mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' } })
    await flushPromises()
    expect(wrapper.findAll('.performance-task-status').map(status => status.text())).toEqual(['待完成', '已完成', '已逾期'])
    expect(wrapper.findAll('.performance-task-status__dot')).toHaveLength(3)
    wrapper.unmount()
  })

  it('keeps shared status labels limited to the three table labels', () => {
    expect(['pending', 'completed', 'overdue'].map(status => performanceTaskStatusLabel(status as 'pending' | 'completed' | 'overdue'))).toEqual(['待完成', '已完成', '已逾期'])
  })

  it.each([
    { label: 'allowed', fields: ['employee_type'], value: '正式员工', visible: true },
    { label: 'denied', fields: [], value: null, visible: false },
    { label: 'allowed with missing snapshot data', fields: ['employee_type'], value: null, visible: true },
  ])('honors employee type field visibility when $label', async ({ fields, value, visible }) => {
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ task_id: 1, employee_no: 'E1', display_name: '员工', status: 'pending', due_at: null, job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: value, employment_status: null, visible_profile_fields: fields }])
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' } })
    await flushPromises()
    const table = wrapper.findComponent({ name: 'PerformanceManagementTable' })
    const drawer = wrapper.findComponent({ name: 'ProjectMemberColumnDrawer' })
    expect(table.props('columns').some((column: { key: string }) => column.key === 'employee_type')).toBe(visible)
    expect(drawer.props('columns').some((column: { key: string }) => column.key === 'employee_type')).toBe(visible)
    expect(wrapper.findComponent({ name: 'PerformanceTableSummary' }).props('hiddenColumnCount')).toBe(0)
    if (value && visible) expect(wrapper.text()).toContain(value)
    if (visible && !value) expect(wrapper.findAll('tbody td').some(cell => cell.text() === '--')).toBe(true)
    if (!visible) {
      drawer.vm.$emit('confirm', ['name', 'employee_type'])
      await flushPromises()
      expect(table.props('columns').some((column: { key: string }) => column.key === 'employee_type')).toBe(false)
    }
    wrapper.unmount()
  })

  it('refreshes permission-derived columns and does not expose denied values in mixed rows', async () => {
    const person = { task_id: 1, employee_no: 'E1', display_name: '员工', status: 'pending', due_at: null, job_family: null, job_category: null, job_sequence: null, position_level: 'P6', hire_date: null, department: null, employee_type: '正式员工', employment_status: null, visible_profile_fields: ['employee_type'] }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([person])
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' } })
    await flushPromises()
    expect(wrapper.text()).toContain('正式员工')
    expect(wrapper.text()).not.toContain('职级')
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ ...person, employee_type: null, visible_profile_fields: [] }])
    await wrapper.setProps({ projectId: 2 })
    await flushPromises()
    expect(wrapper.text()).not.toContain('员工类型')
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([person, { ...person, task_id: 2, employee_no: 'E2', employee_type: '禁止暴露值', visible_profile_fields: [] }])
    await wrapper.setProps({ projectId: 3 })
    await flushPromises()
    expect(wrapper.text()).toContain('员工类型')
    expect(wrapper.text()).toContain('正式员工')
    expect(wrapper.text()).not.toContain('禁止暴露值')
    wrapper.unmount()
  })

  it('keeps rejected feedback terminal after the deadline and uses the shared red dot', async () => {
    expect(normalizePerformanceTaskStatus('rejected', '2020-01-01T00:00:00Z', true)).toBe('rejected')
    expect(performanceTaskStatusLabel('rejected')).toBe('已拒绝')
    const wrapper = mount(PerformanceTaskStatus, { props: { status: 'rejected', dueAt: '2020-01-01T00:00:00Z', allowRejected: true } })
    expect(wrapper.text()).toBe('已拒绝')
    expect(wrapper.classes()).toContain('is-rejected')
    expect(wrapper.findAll('.performance-task-status__dot')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the four feedback states without changing their underlying row status', async () => {
    vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [
      { task_id: 1, employee_no: 'E1', display_name: '待完成员工', status: 'pending', due_at: '2099-01-01T00:00:00Z', source_label: '邀请评估', relationship: '同事', department: null, job_sequence: null, position_level: null },
      { task_id: 2, employee_no: 'E2', display_name: '已完成员工', status: 'completed', due_at: '2020-01-01T00:00:00Z', source_label: '邀请评估', relationship: '同事', department: null, job_sequence: null, position_level: null },
      { task_id: 3, employee_no: 'E3', display_name: '逾期员工', status: 'pending', due_at: '2020-01-01T00:00:00Z', source_label: '自愿评估', relationship: '同事', department: null, job_sequence: null, position_level: null },
      { task_id: 4, employee_no: 'E4', display_name: '拒绝员工', status: 'rejected', due_at: '2020-01-01T00:00:00Z', source_label: '邀请评估', relationship: '同事', department: null, job_sequence: null, position_level: null },
    ], total: 4, node_id: 'feedback', allow_voluntary_evaluation: false })
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'feedback' } })
    await flushPromises()
    expect(wrapper.findAll('.performance-task-status').map(status => status.text())).toEqual(['待完成', '已完成', '已逾期', '已拒绝'])
    expect(wrapper.findAll('.performance-task-status__dot')).toHaveLength(4)
    expect(wrapper.text()).not.toContain('待评估')
    expect(wrapper.text()).not.toContain('已提交')
    expect(wrapper.get('.is-rejected').get('.performance-task-status__dot').attributes('aria-hidden')).toBe('true')
    wrapper.findComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', { task_id: 4, employee_no: 'E4', display_name: '拒绝员工', status: 'rejected' })
    await flushPromises()
    expect(wrapper.emitted('open-task')?.at(-1)).toEqual([{ task_id: 4, employee_no: 'E4', display_name: '拒绝员工', status: 'rejected' }])
    wrapper.unmount()
  })

  it.each(['成员甲', 'gaby.liu刘琦', '很长的姓名'.repeat(12)])('uses the member list avatar rule without duplicating the accessible name for %s', name => {
    const wrapper = mount(PerformanceMemberIdentity, { props: { displayName: name } })
    expect(wrapper.get('.member-avatar').text()).toBe(name.slice(-1))
    expect(wrapper.get('.member-avatar').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.member-name').text()).toBe(name)
    expect(wrapper.find('img').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['review', 'feedback', 'communication', 'invite'])('reuses member identity in the %s table and preserves row actions', async entry => {
    const person = { task_id: 41, employee_no: 'E41', display_name: '测试员工甲', status: 'pending' as const, due_at: '2099-01-01T00:00:00Z', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([person])
    vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [{ ...person, source_label: '邀请评估', relationship: '同事' }], total: 1, node_id: 'feedback', allow_voluntary_evaluation: false })
    vi.spyOn(performanceReview360InviteApi, 'list').mockResolvedValue({ items: [{ ...person, source_label: '自己邀请', invited_at: null }], total: 1, minimum_invited_count: 0, maximum_invited_count: null, maximum_invite_mode: 'SUGGESTED', second_prompt_enabled: false, second_prompt_count: null, second_prompt_mode: 'SUGGESTED', exclude_default_invite_from_limit: false })
    const wrapper = entry === 'review'
      ? mount(ProjectMemberListPanel, { props: { projectId: 1, reviewContext: { nodeId: 'manager', state: 'all' } } })
      : entry === 'invite'
        ? mount(PerformanceReview360InvitePanel, { props: { projectId: 1, nodeId: 'invite' }, global: { components: { ElTableColumn } } })
        : mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: entry, mode: entry === 'communication' ? 'communication' : 'feedback' } })
    await flushPromises()
    expect(wrapper.findAllComponents(PerformanceMemberIdentity)).toHaveLength(1)
    expect(wrapper.get('.member-avatar').text()).toBe('甲')
    expect(wrapper.get('.member-name').text()).toBe('测试员工甲')
    if (entry === 'invite') {
      expect(wrapper.find('button[aria-label="撤销邀请"]').exists()).toBe(false)
      expect(wrapper.find('.invite-panel__remove').exists()).toBe(false)
    } else {
      wrapper.findComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', person)
      await flushPromises()
      expect(wrapper.emitted(entry === 'review' ? 'select-member' : 'open-task')?.[0]?.[0]).toEqual(expect.objectContaining({ task_id: 41, employee_no: 'E41' }))
    }
    wrapper.unmount()
  })

  it('hides task status badges when a 360 node has no active tasks', async () => {
    const loaded = structuredClone(overview)
    Object.assign(loaded.categories[1].nodes[0], { show_status: false })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(loaded)
    const wrapper = mountView()
    await flushPromises()
    const sidebar = wrapper.get('.review-sidebar')
    expect(sidebar.findAll('.review-node')).toHaveLength(4)
    expect(sidebar.text()).not.toContain('已逾期')
    expect(sidebar.find('.status-overdue').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides completed badges in the sidebar without removing their navigation entries', async () => {
    const loaded = structuredClone(overview)
    Object.assign(loaded.categories[0].nodes[0], { status: 'completed' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(loaded)
    const wrapper = mountView()
    await flushPromises()
    const sidebar = wrapper.get('.review-sidebar')
    expect(sidebar.findAll('.review-node')).toHaveLength(4)
    expect(sidebar.find('.status-completed').exists()).toBe(false)
    expect(sidebar.findAll('.review-node')[0].text()).toBe('工作总结环节')
    expect(sidebar.find('.status-overdue').text()).toBe('已逾期')
    expect(sidebar.find('.status-not_started').exists()).toBe(true)
    await sidebar.findAll('.review-node')[0].trigger('click')
    expect(replace).toHaveBeenLastCalledWith(expect.objectContaining({ query: expect.objectContaining({ node: 'summary' }) }))
    wrapper.unmount()
  })

})
