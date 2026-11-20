import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
enableAutoUnmount(afterEach)
import { defineComponent, reactive } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { performanceApi, performanceNavigationApi, projectManagementApi, type PerformanceNavigationContext, type ProjectManagementOverview } from '@/api/performance'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'

const { routeQuery } = vi.hoisted(() => ({ routeQuery: {} as Record<string, string> }))
const push = vi.fn()
const replace = vi.fn()
const route = reactive({ query: routeQuery })
vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => ({ push, replace }),
}))

vi.mock('@/api/performance', async () => {
  const actual = await vi.importActual<typeof import('@/api/performance')>('@/api/performance')
  return { ...actual, projectManagementApi: { ...actual.projectManagementApi, overview: vi.fn(), timeline: vi.fn(), managementMatrix: vi.fn(), members: vi.fn(), exportMembers: vi.fn(), matrix: vi.fn(), memberDetail: vi.fn(), cycleMembers: vi.fn(), cycleExportMembers: vi.fn() } }
})

import ProjectManagement from './ProjectManagement.vue'
import PerformanceMemberReminderDialog from '@/components/performance/PerformanceMemberReminderDialog.vue'
import ProjectMemberListPanel from '@/components/performance/ProjectMemberListPanel.vue'
import PerformanceReviewEvaluationDrawer from '@/components/performance/PerformanceReviewEvaluationDrawer.vue'
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
    attachTo: document.body,
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

beforeEach(() => {
  route.query = routeQuery
  push.mockReset()
  replace.mockReset()
})

describe('ProjectManagement', () => {
  beforeEach(() => {
    Object.keys(routeQuery).forEach(key => delete routeQuery[key])
    route.query = routeQuery
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigationOf(1))
    vi.spyOn(performanceApi, 'getAccessContext').mockResolvedValue({ subject_type: 'PORTAL_USER', subject_id: 1, display_name: '测试用户', account_type: null, portal_entry_permissions: ['performance.app'], permission_codes: [] })
    vi.spyOn(performanceNavigationApi, 'get').mockImplementation(async cycleId => navigationOf(cycleId || 1))
    vi.mocked(mockedApi.overview).mockReset()
    vi.mocked(mockedApi.timeline).mockReset().mockResolvedValue([])
    vi.mocked(mockedApi.managementMatrix).mockReset().mockResolvedValue({ source: 'template_final_result', dimension: 'rating', display_modes: ['name', 'count'], total: 0, completed_count: 0, pending_count: 0, ratings: [], completed_rows: [], pending_rows: [] })
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
    replace.mockImplementation(async target => {
      if (typeof target !== 'object' || !target.query) return
      route.query = reactive(Object.fromEntries(Object.entries(target.query).filter(([, value]) => value != null)) as Record<string, string>)
    })
  })

  it('keeps member 360 reminders separate from the result-opening overlay and scopes detail reminders', async () => {
    Object.assign(routeQuery, { rootReviewId: '5', member_project_id: '3', employee_no: 'E001' })
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mount(ProjectManagement, { global: { plugins: [pinia], stubs: { PerformanceReviewCategorySidebar: true, PerformanceReviewEvaluationDrawer: { props: ['modelValue', 'taskId', 'detailLoader', 'employeeNo', 'nodeName', 'person', 'activeTab', 'readonly', 'member', 'projectId'], template: '<div />' }, ProjectMemberListPanel: true, PerformanceMemberReminderDialog: true, CompletionRatePanel: true } } })
    await flushPromises()
    wrapper.getComponent(ProjectMemberListPanel).vm.$emit('remind-evaluate', { member: { project_id: 3, employee_no: 'E001' }, pendingCount: 1 })
    await flushPromises()
    const dialog = wrapper.getComponent(PerformanceMemberReminderDialog)
    expect(dialog.props()).toMatchObject({ modelValue: true, context: { projectId: 3, employeeNo: 'E001', targetKind: 'reviewer_360' } })
    expect(wrapper.getComponent({ name: 'PerformanceTaskOverlay' }).props('modelValue')).toBe(false)
    wrapper.getComponent(PerformanceReviewEvaluationDrawer).vm.$emit('remind', { node_id: 'summary', task_id: 77, employee_no: 'E001' })
    await flushPromises()
    expect(dialog.props('context')).toMatchObject({ nodeId: 'summary', targetTaskId: 77, targetKind: undefined })
    wrapper.getComponent(PerformanceReviewEvaluationDrawer).vm.$emit('remind', { kind: 'reviewer_360', node_id: 'feedback', task_id: null, employee_no: 'E001' })
    await flushPromises()
    expect(dialog.props('context')).toMatchObject({ nodeId: 'feedback', targetTaskId: undefined, targetKind: 'reviewer_360' })
    wrapper.unmount()
  })

  it.each([false, true])('keeps member selection delegation buttons visible with capability=%s', async allowed => {
    const { default: MemberList } = await import('@/components/performance/ProjectMemberListPanel.vue')
    vi.mocked(mockedApi.members).mockResolvedValue({ items: [{ id: 1, root_review_id: 1, project_id: 3, employee_no: 'E1', display_name: '被评估人', avatar_url: null, rating: null, rating_tone: null, completion: '0/0', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null, can_authorize: allowed, task_id: 11, task_map: [{ task_id: 11, stage_key: 'manager', stage_label: '上级评估', role_key: 'DIRECT_SUPERVISOR', role_label: '直属上级', handler_ref: 'M1', can_authorize: allowed }] }], total: 1, page: 1, page_size: 50 })
    const wrapper = mount(MemberList, { props: { projectId: 3 } })
    await flushPromises()
    await wrapper.get('tbody input[type="checkbox"]').setValue(true)
    const authorize = wrapper.get('[aria-label="授权他人处理"]')
    const transfer = wrapper.get('[aria-label="转交他人处理"]')
    expect((authorize.element as HTMLButtonElement).disabled).toBe(!allowed)
    expect((transfer.element as HTMLButtonElement).disabled).toBe(!allowed)
    await authorize.trigger('click'); await transfer.trigger('click')
    expect(Boolean(wrapper.emitted('authorize-selected'))).toBe(allowed)
    expect(Boolean(wrapper.emitted('transfer-selected'))).toBe(allowed)
    wrapper.unmount()
  })

  it.each([false, true])('restores the real readonly member drawer with server actions=%s', async allowed => {
    Object.assign(routeQuery, { rootReviewId: '5', member_project_id: '3', employee_no: 'E001' })
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    vi.mocked(mockedApi.memberDetail).mockResolvedValue({ task_id: null, task_kind: 'evaluation', entry_mode: 'template_task', node_name: '评估', person: { employee_no: 'E001', display_name: '成员' }, editable: false, submit_allowed: false, form_schema: [], answers: {}, member_actions: { can_remove: allowed, task_map: [] } } as any)
    const remove = vi.spyOn(projectManagementApi, 'removeMember').mockResolvedValue({ code: 0, data: {}, msg: 'ok' })
    const wrapper = mount(ProjectManagement, { global: { plugins: [pinia], stubs: { PerformanceReviewCategorySidebar: true, ProjectMemberListPanel: true, CompletionRatePanel: true } } })
    try {
      await flushPromises()
      expect(wrapper.getComponent(PerformanceReviewEvaluationDrawer).props('readonly')).toBe(true)
      expect(Boolean(document.body.querySelector('[aria-label="更多成员操作"]'))).toBe(allowed)
      expect(mockedApi.memberDetail).toHaveBeenCalledWith(3, 'E001', 5, '')
      if (allowed) {
        ;(document.body.querySelector('[aria-label="更多成员操作"]') as HTMLButtonElement).click()
        await flushPromises()
        const deletion = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent === '删除')!
        deletion.click()
        await flushPromises()
        const confirm = [...document.body.querySelectorAll<HTMLButtonElement>('.performance-confirm-dialog__footer button')].find(button => button.textContent?.trim() === '删除')!
        expect(confirm).toBeTruthy()
        confirm.click()
        await flushPromises()
        expect(remove).toHaveBeenCalledWith(3, 'E001', 5)
      } else expect(remove).not.toHaveBeenCalled()
    } finally { wrapper.unmount(); remove.mockRestore() }
  })

  it('reloads member permissions after closing and restoring the same detail link', async () => {
    Object.assign(routeQuery, { rootReviewId: '5', member_project_id: '3', employee_no: 'E001' })
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const detail = { task_id: null, task_kind: 'evaluation', entry_mode: 'template_task', node_name: '评估', person: { employee_no: 'E001', display_name: '成员' }, editable: false, submit_allowed: false, form_schema: [], answers: {}, member_actions: { can_remove: true, task_map: [] } }
    vi.mocked(mockedApi.memberDetail).mockResolvedValue(detail as any)
    const wrapper = mount(ProjectManagement, { global: { plugins: [pinia], stubs: { PerformanceReviewCategorySidebar: true, ProjectMemberListPanel: true, CompletionRatePanel: true } } })
    try {
      await flushPromises()
      const link = { ...route.query }
      expect(document.body.querySelector('[aria-label="更多成员操作"]')).not.toBeNull()
      wrapper.getComponent(PerformanceReviewEvaluationDrawer).vm.$emit('close')
      await flushPromises()
      vi.mocked(mockedApi.memberDetail).mockResolvedValue({ ...detail, member_actions: { can_remove: false, task_map: [] } } as any)
      route.query = reactive(link)
      await flushPromises()
      expect(mockedApi.memberDetail).toHaveBeenCalledTimes(2)
      expect(document.body.querySelector('[aria-label="更多成员操作"]')).toBeNull()
    } finally { wrapper.unmount() }
  })

  it('keeps selected member payloads across server pages and clears them for another cycle', async () => {
    const { default: MemberList } = await import('@/components/performance/ProjectMemberListPanel.vue')
    const member = (id: number) => ({ id, root_review_id: id, project_id: 3, employee_no: `E${id}`, display_name: `员工${id}`, can_authorize: true, task_id: id, avatar_url: null, rating: null, rating_tone: null, completion: '0/0', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null })
    vi.mocked(mockedApi.cycleMembers).mockImplementation(async (_cycle, _keyword, page = 1) => ({ items: [member(page)], total: 101, page, page_size: 50 }))
    const wrapper = mount(MemberList, { props: { projectId: 3, cycleId: 1 } })
    await flushPromises()
    const table = wrapper.getComponent({ name: 'PerformanceManagementTable' })
    table.vm.$emit('update:selectedKeys', ['1'])
    await flushPromises()
    table.vm.$emit('page-change', 2)
    await flushPromises()
    table.vm.$emit('update:selectedKeys', ['1', '2'])
    await flushPromises()
    await wrapper.get('[aria-label="授权他人处理"]').trigger('click')
    expect(wrapper.emitted('authorize-selected')?.[0]?.[0]).toEqual([member(1), member(2)])
    await wrapper.setProps({ cycleId: 2 })
    await flushPromises()
    expect(table.props('selectedKeys')).toEqual([])
    wrapper.unmount()
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

  it('normalizes the default role before rendering shared content and exposes unique dual-role nodes', async () => {
    const loaded = overviewOf({ active_role: 'hrbp', categories: [
      { key: 'hrbp', label: 'HRBP', projects: overviewOf().projects },
      { key: 'project_admin', label: '项目管理员', projects: overviewOf().projects },
    ] })
    vi.mocked(mockedApi.overview).mockResolvedValue(loaded)
    const wrapper = mountView()
    await flushPromises()
    expect(route.query.management_role).toBe('hrbp')
    const sidebar = wrapper.getComponent({ name: 'PerformanceReviewCategorySidebar' })
    const categories = sidebar.props('categories')
    expect(categories.map((category: any) => category.key)).toEqual(['hrbp', 'project_admin'])
    const ids = categories.flatMap((category: any) => category.nodes.map((node: any) => node.node_id))
    expect(new Set(ids).size).toBe(6)
    expect(wrapper.findComponent({ name: 'PerformanceManagementMemberScope' }).exists()).toBe(true)
    const count = vi.mocked(mockedApi.overview).mock.calls.length
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()
    expect(route.query.tab).toBe('members')
    expect(mockedApi.overview).toHaveBeenCalledTimes(count)
    const panel = wrapper.getComponent(ProjectMemberListPanel)
    expect(panel.props()).toMatchObject({ cycleId: 1, projectId: 0 })
    const scope = wrapper.getComponent({ name: 'PerformanceManagementMemberScope' })
    const memberCalls = vi.mocked(mockedApi.cycleMembers).mock.calls.length
    await scope.get('button').trigger('click')
    await flushPromises()
    const current = document.body.querySelector<HTMLInputElement>('input[aria-label="当前我负责的人员"]')!
    current.checked = true; current.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(scope.text()).toContain('成员范围：全部')
    await wrapper.findAll('.line-tab')[0].trigger('click')
    await flushPromises()
    expect(scope.text()).toContain('成员范围：全部')
    expect(mockedApi.cycleMembers).toHaveBeenCalledTimes(memberCalls)
    expect(mockedApi.overview).toHaveBeenCalledTimes(count)
  })

  it('shares project tabs, uses project members and real timeline, and preserves role on action navigation', async () => {
    Object.assign(routeQuery, { cycle_id: '1', management_role: 'hrbp', project_id: '4', tab: 'members' })
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({ active_role: 'hrbp', categories: [{ key: 'hrbp', label: 'HRBP', projects: overviewOf().projects }] }))
    vi.mocked(mockedApi.timeline).mockResolvedValue([{ node_id: 'appeal', node_name: '结果复议处理', node_type: 'result_reconsideration', node_order: 8, start_at: '2026-08-01T01:00:00Z', end_at: '2026-08-31T15:59:00Z', status: 'in_progress' }])
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.getComponent(ProjectMemberListPanel).props()).toMatchObject({ projectId: 4, cycleId: undefined })
    expect(mockedApi.members).toHaveBeenCalled()
    expect(mockedApi.cycleMembers).not.toHaveBeenCalled()
    expect(mockedApi.overview).toHaveBeenCalledWith(1, { management_role: 'hrbp', project_id: 4 })
    await wrapper.findAll('.line-tab')[0].trigger('click')
    await flushPromises()
    expect(mockedApi.timeline).toHaveBeenCalledWith(1, 4, 'hrbp')
    expect(wrapper.getComponent({ name: 'PerformanceWorkbenchTimeline' }).props('nodes')[0]).toMatchObject({ node_name: '结果复议处理', current: true })
    wrapper.getComponent({ name: 'AuthorizationManagementPanel' }).vm.$emit('view', { key: 'evaluation-transfer' })
    await flushPromises()
    expect(push).toHaveBeenCalledWith({ name: 'PerformanceAuthorizationRecords', query: { cycle_id: '1', management_role: 'hrbp', project_id: '4' } })
    await wrapper.findAll('.line-tab')[2].trigger('click')
    await flushPromises()
    expect(mockedApi.managementMatrix).toHaveBeenCalledWith(1, { management_role: 'hrbp', project_id: 4 })
    expect(mockedApi.matrix).not.toHaveBeenCalled()
  })

  it('reloads on role navigation, clears details and prevents the old scope from restoring content', async () => {
    Object.assign(routeQuery, { cycle_id: '1', management_role: 'hrbp' })
    const categories = [{ key: 'hrbp' as const, label: 'HRBP', projects: overviewOf().projects }, { key: 'project_admin' as const, label: '项目管理员', projects: overviewOf().projects }]
    let resolveOld!: (value: ProjectManagementOverview) => void
    vi.mocked(mockedApi.overview).mockResolvedValueOnce(overviewOf({ active_role: 'hrbp', categories }))
      .mockImplementationOnce(() => new Promise(done => { resolveOld = done }))
      .mockResolvedValueOnce(overviewOf({ active_role: 'project_admin', categories, completion_nodes: [] }))
    const wrapper = mountView()
    await flushPromises()
    const sidebar = wrapper.getComponent({ name: 'PerformanceReviewCategorySidebar' })
    const nodes = sidebar.props('categories')
    sidebar.vm.$emit('select-node', nodes[0].nodes[1])
    await flushPromises()
    expect(wrapper.text()).toContain('正在加载项目管理')
    sidebar.vm.$emit('select-node', nodes[1].nodes[0])
    await flushPromises()
    expect(route.query.management_role).toBe('project_admin')
    expect(wrapper.findComponent({ name: 'PerformanceManagementMemberScope' }).exists()).toBe(false)
    resolveOld(overviewOf({ active_role: 'hrbp', categories, projects: [{ project_id: 3, project_name: '旧范围不得回填', project_ref: 'p:3', status: 'STARTED' }] }))
    await flushPromises()
    expect(wrapper.text()).not.toContain('旧范围不得回填')
    expect(wrapper.get('.page-title-text').text()).toBe('周期概览')
  })

  it('renders the admin category with cycle overview first and involved projects', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()

    expect(mockedApi.overview).toHaveBeenCalledWith(1, {})
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

    expect(mockedApi.overview).toHaveBeenLastCalledWith(2, { management_role: 'project_admin' })
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
    expect(mockedApi.overview).toHaveBeenLastCalledWith(2, { management_role: 'project_admin' })
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
    const table = wrapper.findComponent({ name: 'UiTable' })
    expect(table.props('stickyHeaderTop')).toBe('var(--performance-table-sticky-top, 0px)')
    expect(wrapper.find('.ui-table__header').exists()).toBe(true)
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

  it.each([
    { deadline: '2099-08-20T15:59:00Z', expected: '2099-08-20 23:59（GMT+8）' },
    { deadline: '2000-08-20T15:59:00Z', expected: '2000-08-20 23:59（GMT+8）（已截止）' },
  ])('uses opened results as the reconsideration denominator and switches deadline $deadline', async ({ deadline, expected }) => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({ completion_nodes: [
      { key: 'view-result', title: '查看绩效结果', status: 'active', completed_count: 3, total_count: 5, completion_rate: 60, reconsidered_count: 1, can_open_result: false, openable_count: 2, deadline_at: null, reconsideration_deadline_at: deadline },
      { key: 'result-reconsideration', title: '结果复议处理', status: 'active', completed_count: 0, total_count: 1, completion_rate: 0, can_remind: true, deadline_at: '2099-08-28T15:59:00Z' },
    ] }))
    const wrapper = mountView()
    await flushPromises()
    const cards = wrapper.findAll('.completion-node-card')
    const ordinaryCard = cards[1].text()
    expect(cards[0].find('.card-progress').text()).toBe('60.00%')
    expect(cards[0].text()).toContain('完成情况：3/5')
    expect(cards[0].text()).toContain('截止时间：--')
    expect(cards[0].find('.node-action').exists()).toBe(false)
    expect(cards[1].text()).toContain('截止时间：2099-08-28 23:59（GMT+8）')
    await cards[0].findAll('.segment')[1].trigger('click')
    expect(cards[0].find('.card-progress').text()).toBe('33.33%')
    expect(cards[0].text()).toContain('完成情况：1/3')
    expect(cards[0].text()).toContain(`截止时间：${expected}`)
    expect(cards[1].text()).toBe(ordinaryCard)
    await cards[0].findAll('.segment')[0].trigger('click')
    expect(cards[0].find('.card-progress').text()).toBe('60.00%')
    expect(cards[0].text()).toContain('完成情况：3/5')
    expect(cards[0].text()).toContain('截止时间：--')
    expect(cards[1].text()).toBe(ordinaryCard)
    await cards[1].get('.node-action').trigger('click')
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ name: 'PerformanceProjectReminder', query: expect.objectContaining({ node_key: 'result-reconsideration' }) }))
    wrapper.unmount()
  })

  it.each([
    { completed: 0, total: 0 },
    { completed: 0, total: 5 },
    { completed: 3, total: 5 },
  ])('defaults missing reconsideration count and deadline with opened=$completed, total=$total', async ({ completed, total }) => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({ completion_nodes: [
      { key: 'view-result', title: '查看绩效结果', status: 'active', completed_count: completed, total_count: total, completion_rate: total ? completed / total * 100 : 0, deadline_at: null },
    ] }))
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.completion-node-card .segment')[1].trigger('click')
    expect(wrapper.get('.completion-node-card .card-progress').text()).toBe('0.00%')
    expect(wrapper.get('.completion-node-card').text()).toContain(`完成情况：0/${completed}`)
    expect(wrapper.get('.completion-node-card').text()).toContain('截止时间：--')
    expect(wrapper.find('.completion-node-card .node-action').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([
    { can_open_result: false, openable_count: 2, visible: false },
    { can_open_result: true, openable_count: 0, visible: false },
    { can_open_result: true, openable_count: 2, visible: true },
  ])('passes backend opening eligibility to result actions: $can_open_result/$openable_count', async ({ visible, ...capability }) => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({ completion_nodes: [
      { key: 'view-result', title: '查看绩效结果', status: 'active', completed_count: 0, total_count: 2, completion_rate: 0, deadline_at: null, ...capability },
    ] }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.completion-node-card .node-action').exists()).toBe(visible)
    wrapper.unmount()
  })

  it('keeps the opening list mounted after confirmation without refreshing the overview', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({ completion_nodes: [
      { key: 'view-result', title: '查看绩效结果', status: 'active', completed_count: 0, total_count: 1, completion_rate: 0, deadline_at: null, can_open_result: true, openable_count: 1 },
    ] }))
    const people = vi.spyOn(projectManagementApi, 'openingPeople').mockResolvedValue({ items: [
      { employee_no: 'E001', display_name: '开通成员', project_id: 3, project_name: '项目', can_open: true, unavailable_reason: null },
    ], total: 1, page: 1, page_size: 50 })
    const opening = vi.spyOn(projectManagementApi, 'openResults').mockResolvedValue({ accepted_employee_nos: ['E001'], skipped_employee_nos: [], skipped_reasons: {}, notification_status: 'pending_integration' })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.completion-node-card .node-action').trigger('click')
    await flushPromises()
    const panel = wrapper.getComponent({ name: 'PerformanceReminderPanel' })
    expect(panel.props('mode')).toBe('open-result')
    expect(panel.props('context')).toMatchObject({ cycleId: 1, projectId: 0 })
    const loads = people.mock.calls.length
    await panel.get('.selection-bar .performance-button--primary').trigger('click')
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
    await flushPromises()
    expect(opening).toHaveBeenCalledWith(1, ['E001'])
    expect(wrapper.getComponent({ name: 'PerformanceTaskOverlay' }).props('modelValue')).toBe(true)
    expect(panel.text()).toContain('开通成员')
    expect(panel.find('.selection-bar').exists()).toBe(false)
    expect(people).toHaveBeenCalledTimes(loads)
    expect(mockedApi.overview).toHaveBeenCalledTimes(1)
    wrapper.unmount()
    people.mockRestore()
    opening.mockRestore()
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

  it('opens reconsideration edits in the full task workspace with management return context', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    vi.mocked(mockedApi.members).mockResolvedValue({ items: [], total: 0 } as any)
    const wrapper = mount(ProjectManagement, { global: { plugins: [pinia], stubs: {
      PerformanceReviewCategorySidebar: true, ProjectMemberListPanel: true, CompletionRatePanel: true,
      PerformanceReviewEvaluationDrawer: { name: 'PerformanceReviewEvaluationDrawer', props: ['modelValue', 'detailLoader'], template: '<div />' },
      SelfSummaryTask: { name: 'SelfSummaryTask', props: { embedded: Boolean, taskKind: String, taskId: [String, Number], employeeNo: String, projectId: Number, cycleId: Number, draftChoice: String }, template: '<div class="embedded-reconsideration" />' },
    } } })
    await flushPromises()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()
    wrapper.getComponent({ name: 'ProjectMemberListPanel' }).vm.$emit('select-member', { project_id: 3, employee_no: 'E1', root_review_id: 10, display_name: '员工', can_view_detail: true })
    await flushPromises()
    const drawer = wrapper.getComponent({ name: 'PerformanceReviewEvaluationDrawer' })
    drawer.vm.$emit('edit', { task_id: 901, employee_no: 'E1', node_id: 'appeal', node_name: '自定义申诉处理', task_kind: 'result_reconsideration', draft_choice: 'use' })
    await flushPromises()
    expect(wrapper.findComponent({ name: 'SelfSummaryTask' }).exists()).toBe(false)
    expect(push).toHaveBeenCalledWith({ path: '/performance/review/template-task', query: {
      task_id: '901', project_id: '3', node: 'appeal', employee_no: 'E1', draft_choice: 'use',
      return_entry: 'management', return_root_review_id: '10', cycle_id: '1', management_role: 'project_admin',
    } })
    expect(drawer.props('modelValue')).toBe(false)
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
    expect(mockedApi.memberDetail).toHaveBeenCalledWith(3, 'E1', 71, '')
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
    expect(replace).toHaveBeenLastCalledWith({ query: { cycle_id: '1', management_role: 'project_admin', tab: 'members' } })
    wrapper.unmount()
    route.query = reactive(routeQuery)
    const reopened = mountView()
    await flushPromises()
    expect(mockedApi.memberDetail).toHaveBeenLastCalledWith(3, 'E1', 71, 'management-final')
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
    expect(mockedApi.memberDetail).toHaveBeenCalledWith(3, 'E1', 71, '')
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
    expect(mockedApi.memberDetail).toHaveBeenCalledWith(3, 'E1', 71, '')
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

  it('opens the statistics report with the current cycle and the statistics API', async () => {
    const statistics = vi.spyOn(projectManagementApi, 'levelStatistics').mockResolvedValue({ source: 'api', dimension: 'department', rowLabel: '部门', showSummary: true, totalParticipants: 0, ratings: [], distribution: {}, departments: [] })
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[3].trigger('click')
    await flushPromises()
    const report = wrapper.findComponent({ name: 'ProjectStatisticsReportPanel' })
    expect(report.props('cycleId')).toBe(1)
    expect(report.props('cycleName')).toBe('2026上半年')
    expect(wrapper.text()).not.toContain('模拟数据')
    expect(wrapper.findAll('[data-report-section]')).toHaveLength(9)
    expect(statistics).toHaveBeenCalledWith(1, 'department', { management_role: 'project_admin' }, undefined)
    expect(mockedApi.members).not.toHaveBeenCalled()
    expect(mockedApi.overview).toHaveBeenCalledTimes(1)
    await wrapper.findAll('.line-tab')[2].trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ProjectPerformanceMatrix' }).exists()).toBe(true)
    expect(mockedApi.managementMatrix).toHaveBeenCalledWith(1, { management_role: 'project_admin' })
    expect(wrapper.text()).toContain('待完成评估')
    wrapper.unmount()
    statistics.mockRestore()
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
    expect(wrapper.text()).not.toContain('后续迭代中开发')
    expect(mockedApi.overview).toHaveBeenLastCalledWith(1, { management_role: 'project_admin', project_id: 3 })
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
  expect(push).toHaveBeenCalledWith({ name: 'PerformanceAuthorizationRecords', query: { cycle_id: '1', management_role: 'project_admin' } })
  await buttons[1].trigger('click')
  await flushPromises()
  expect(push).toHaveBeenCalledWith({ name: 'PerformanceCalibrationAuthorization', query: { cycle_id: '1', management_role: 'project_admin' } })
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
    expect(push).toHaveBeenCalledWith({ name: 'PerformanceAuthorizationRecords', query: { cycle_id: '1', management_role: 'project_admin', highlight_id: '21', highlight_tab: 'authorization' } })
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


it('keeps calibration rows readable while both unauthorized operations stay disabled', async () => {
  const { default: Calibration } = await import('./ProjectCalibrationAuthorization.vue')
  const { default: Dialog } = await import('@/components/performance/PerformanceTaskDelegationDialog.vue')
  pinia = createPinia(); setActivePinia(pinia)
  usePerformanceProjectContextStore().setNavigation(navigationOf(1))
  routeQuery.cycle_id = '1'
  const loaded = vi.spyOn(projectManagementApi, 'calibrationAuthorization').mockResolvedValue({ cycle_id: 1, cycle_name: '2026上半年', items: [{ id: 'cal:1', project_id: 3, task_ids: [11], authorizations: [{ id: 21, task_id: 11, recipient: '接收人' }], calibrator: '校准人', status: '待校准', scope: '全部下级', authorized_count: 1, unauthorized_count: 0, allow_authorize: true, can_authorize: false, can_revoke: false, distribution_rule: null, authorized_by: '原授权人', authorized_at: null }] })
  const candidates = vi.spyOn(projectManagementApi, 'delegationCandidatesBatch').mockResolvedValue([])
  const revoking = vi.spyOn(projectManagementApi, 'revokeTaskAuthorization').mockResolvedValue(undefined)
  const wrapper = mount(Calibration, { global: { plugins: [pinia] } })
  await flushPromises()
  expect(loaded).toHaveBeenCalledWith(1)
  expect(wrapper.text()).toContain('校准人')
  const table = wrapper.getComponent({ name: 'PerformanceManagementTable' })
  expect(table.get('thead th:first-child').classes()).toContain('is-fixed-left')
  expect(table.get('tbody td:first-child').classes()).toContain('is-fixed-left')
  expect(table.get('thead th:last-child').classes()).toContain('is-fixed-right')
  expect(table.get('tbody td:last-child').classes()).toContain('is-fixed-right')
  expect(table.get('thead th:last-child').attributes('style')).toContain('right: 0px')
  expect(table.get('tbody td:last-child').attributes('style')).toContain('right: 0px')
  const actions = wrapper.findAll('.actions button')
  expect(actions.map(action => action.text())).toEqual(['协助授权', '撤销授权'])
  expect(actions.every(action => (action.element as HTMLButtonElement).disabled)).toBe(true)
  for (const action of actions) await action.trigger('click')
  expect(wrapper.getComponent(Dialog).props('modelValue')).toBe(false)
  expect(candidates).not.toHaveBeenCalled()
  expect(revoking).not.toHaveBeenCalled()
  wrapper.unmount(); loaded.mockRestore(); candidates.mockRestore(); revoking.mockRestore(); delete routeQuery.cycle_id
})

it('opens shared calibration people lists and renders source rules with disabled reasons', async () => {
  const { default: Calibration } = await import('./ProjectCalibrationAuthorization.vue')
  const { default: People } = await import('@/components/performance/focus-group/FocusGroupPeopleDialog.vue')
  pinia = createPinia(); setActivePinia(pinia)
  usePerformanceProjectContextStore().setNavigation(navigationOf(1))
  routeQuery.cycle_id = '1'
  const item = { id: 'cal:1', project_id: 3, source: 'BACKEND' as const, task_ids: [11, 12], task_people: [{ task_id: 11, employee_no: 'E1', display_name: '员工甲', department: '研发' }, { task_id: 12, employee_no: 'E2', display_name: '员工乙', department: '产品' }], unauthorized_task_ids: [12], authorizations: [], calibrator: '校准人', status: '待校准', scope: '全部下级', authorized_count: 2, unauthorized_count: 1, allow_authorize: false, can_authorize: false, can_revoke: false, distribution_rule: '后台配置规则', distribution_info: { force_distribution_enabled: true, mode: 'UNIFIED', rules: [], lines: [], groups: [{ title: '强制分布', lines: ['绩效评级：优秀 的人员 ≤ 25%'] }] }, authorized_by: '授权人甲', authorized_at: '2026-11-19T09:18:00Z' }
  const loaded = vi.spyOn(projectManagementApi, 'calibrationAuthorization').mockResolvedValue({ cycle_id: 1, cycle_name: '测试周期', items: [item] })
  const wrapper = mount(Calibration, { attachTo: document.body, global: { plugins: [pinia] } })
  await flushPromises()
  expect(wrapper.text()).toContain('分布规则')
  expect(wrapper.text()).toContain('发起授权时间')
  expect(wrapper.findAll('.count-link').map(button => button.text())).toEqual(['2', '1'])
  await wrapper.findAll('.count-link')[0].trigger('click')
  expect(wrapper.getComponent(People).props('title')).toBe('可校准人员')
  expect(wrapper.getComponent(People).props('rows').map((person: { employee_no: string }) => person.employee_no)).toEqual(['E1', 'E2'])
  expect((wrapper.getComponent(People).props('columns') || []).map((column: { label: string }) => column.label)).toEqual(['被评估人', '一级部门', '末级部门', '直属上级', '序列'])
  wrapper.getComponent(People).vm.$emit('update:modelValue', false)
  const reasons = wrapper.findAllComponents({ name: 'PerformanceInfoPopover' }).map(component => component.props('content'))
  expect(reasons).toContain('此任务不允许授权他人校准')
  expect(reasons).toContain('请联系管理员在「项目设置」中移除此用户的校准权限')
  await wrapper.findAll('.count-link')[1].trigger('click')
  expect(wrapper.getComponent(People).props('title')).toBe('未授权人员')
  expect(wrapper.getComponent(People).props('rows').map((person: { employee_no: string }) => person.employee_no)).toEqual(['E2'])
  wrapper.getComponent(People).vm.$emit('update:modelValue', false)
  expect(wrapper.findAll('.actions button').every(button => (button.element as HTMLButtonElement).disabled)).toBe(true)
  loaded.mockResolvedValue({ cycle_id: 1, cycle_name: '测试周期', items: [{ ...item, unauthorized_count: 0, unauthorized_task_ids: [], distribution_info: { ...item.distribution_info, force_distribution_enabled: false } }] })
  await wrapper.getComponent({ name: 'PerformanceListToolbar' }).vm.$emit('search'); await flushPromises()
  expect(wrapper.text()).not.toContain('分布规则')
  expect(wrapper.findAll('.count-link')[1].text()).toBe('0')
  await wrapper.findAll('.count-link')[1].trigger('click')
  expect(wrapper.getComponent(People).props('title')).toBe('未授权人员')
  expect(wrapper.getComponent(People).props('rows')).toEqual([])
  wrapper.unmount(); loaded.mockRestore(); delete routeQuery.cycle_id
})

it('keeps the same calibrator separate by source rule and delegates only the clicked row', async () => {
  const { default: Calibration } = await import('./ProjectCalibrationAuthorization.vue')
  const { default: Dialog } = await import('@/components/performance/PerformanceTaskDelegationDialog.vue')
  const { default: People } = await import('@/components/performance/focus-group/FocusGroupPeopleDialog.vue')
  pinia = createPinia(); setActivePinia(pinia)
  usePerformanceProjectContextStore().setNavigation(navigationOf(1))
  routeQuery.cycle_id = '1'
  const base = { project_id: 3, source: 'BACKEND' as const, authorizations: [], calibrator: '同一校准人', status: '待校准', unauthorized_count: 1, allow_authorize: true, can_authorize: true, can_revoke: false, distribution_rule: null, authorized_by: null, authorized_at: null }
  const loaded = vi.spyOn(projectManagementApi, 'calibrationAuthorization').mockResolvedValue({ cycle_id: 1, cycle_name: '周期', items: [
    { ...base, id: 'rule-a', source_rule_id: 'a', task_ids: [11, 12], task_people: [{ task_id: 11, employee_no: 'E1', display_name: '员工甲' }, { task_id: 12, employee_no: 'E2', display_name: '员工乙' }], scope: '项目全员', authorized_count: 2 },
    { ...base, id: 'rule-b', source_rule_id: 'b', task_ids: [11], task_people: [{ task_id: 11, employee_no: 'E1', display_name: '员工甲' }], scope: '直属下级', authorized_count: 1 },
  ] })
  const candidates = vi.spyOn(projectManagementApi, 'delegationCandidates').mockResolvedValue([])
  const wrapper = mount(Calibration, { attachTo: document.body, global: { plugins: [pinia] } })
  await flushPromises()
  expect(wrapper.findAll('.actions')).toHaveLength(2)
  await wrapper.findAll('.count-link')[2].trigger('click')
  expect(wrapper.getComponent(People).props('rows')).toEqual([{ task_id: 11, employee_no: 'E1', display_name: '员工甲' }])
  wrapper.getComponent(People).vm.$emit('update:modelValue', false)
  await wrapper.findAll('.actions')[1].findAll('button')[0].trigger('click'); await flushPromises()
  expect(wrapper.getComponent(Dialog).props('tasks')).toEqual([{ project_id: 3, task_id: 11, employee_no: 'E1', display_name: '员工甲', source_rule_id: 'b' }])
  wrapper.unmount(); loaded.mockRestore(); candidates.mockRestore(); delete routeQuery.cycle_id
})

it('excludes the calibration recipient and preserves parent authorization when submitting all people', async () => {
  const { default: Dialog } = await import('@/components/performance/PerformanceTaskDelegationDialog.vue')
  const { default: Select } = await import('@/components/performance/PerformanceSearchSelect.vue')
  const candidates = vi.spyOn(projectManagementApi, 'delegationCandidatesBatch').mockResolvedValue([11, 12, 13].map(task_id => ({ project_id: 3, task_id, candidates: [{ employee_no: 'R', display_name: '接收人' }] })))
  const submit = vi.spyOn(projectManagementApi, 'authorizeTask').mockResolvedValue({ task_id: 11, id: 50, notification_status: 'preview_only' })
  const wrapper = mount(Dialog, { attachTo: document.body, props: { modelValue: true, action: 'AUTHORIZE', calibration: true, hasDistributionRules: false, tasks: [{ task_id: 11, project_id: 3, employee_no: 'E1', source_rule_id: 'a', source_authorization_id: 21 }, { task_id: 12, project_id: 3, employee_no: 'E2', source_rule_id: 'a', source_authorization_id: 22 }, { task_id: 13, project_id: 3, employee_no: 'R', source_authorization_id: 23 }] } })
  await flushPromises()
  wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R')
  await wrapper.vm.$nextTick()
  const all = document.querySelector<HTMLInputElement>('input[name="authorization-scope"][value="ALL"]')!
  all.click(); await wrapper.vm.$nextTick()
  expect(document.querySelector('.scope-count')?.textContent).toContain('总人数：2 人')
  expect(document.body.textContent).not.toContain('强制 / 建议分布规则')
  ;([...document.querySelectorAll<HTMLButtonElement>('.delegation-dialog button')].find(button => button.textContent?.trim() === '确定')!).click()
  await flushPromises()
  expect(submit).toHaveBeenCalledTimes(2)
  expect(submit).toHaveBeenCalledWith(3, 11, 'AUTHORIZE', 'R', '', expect.objectContaining({ source_rule_id: 'a', source_authorization_id: 21, scope_mode: 'ALL', allow_reauthorize: false }))
  expect(submit).toHaveBeenCalledWith(3, 12, 'AUTHORIZE', 'R', '', expect.objectContaining({ source_authorization_id: 22 }))
  expect(wrapper.emitted('completed')?.[0][0]).toBe(2)
  wrapper.unmount(); candidates.mockRestore(); submit.mockRestore()
})

it.each([false, true, null, undefined])('renders real authorization subtrees and revokes only the selected branch with notify=%s', async notifyOriginal => {
  const { default: Calibration } = await import('./ProjectCalibrationAuthorization.vue')
  pinia = createPinia(); setActivePinia(pinia)
  usePerformanceProjectContextStore().setNavigation(navigationOf(1))
  routeQuery.cycle_id = '1'
  const base = { project_id: 3, task_ids: [11], calibrator: '同名校准人', status: '已校准', scope: '任务内全部人员', authorized_count: 1, unauthorized_count: 0, allow_authorize: false, can_authorize: false, can_revoke: true, distribution_rule: null, authorized_by: '管理者', authorized_at: null }
  const loaded = vi.spyOn(projectManagementApi, 'calibrationAuthorization').mockResolvedValue({ cycle_id: 1, cycle_name: '测试周期', items: [
    { ...base, id: 'child', parent_id: 'root-a', source: 'DELEGATION', notify_original: notifyOriginal, authorizations: [{ id: 21, task_id: 11, recipient: 'R1' }] },
    { ...base, id: 'root-b', source: 'BACKEND', authorizations: [] },
    { ...base, id: 'grandchild', parent_id: 'child', source: 'DELEGATION', authorizations: [{ id: 22, task_id: 11, recipient: 'R2' }] },
    { ...base, id: 'root-a', source: 'BACKEND', authorizations: [] },
  ] })
  const revoking = vi.spyOn(projectManagementApi, 'revokeTaskAuthorization').mockResolvedValue(undefined)
  const wrapper = mount(Calibration, { attachTo: document.body, global: { plugins: [pinia] } })
  await flushPromises()
  expect(wrapper.find('.info-banner .prompt-notice__icon svg').exists()).toBe(true)
  const persons = () => wrapper.findAll('.authorization-person')
  expect(persons().map(person => person.attributes('style'))).toEqual([0, 0, 1, 2].map(depth => `padding-left: calc(${depth} * var(--performance-authorization-tree-indent));`))
  await wrapper.findAll('.authorization-expand')[1].trigger('click')
  expect(persons()).toHaveLength(3)
  await wrapper.findAll('.authorization-expand')[1].trigger('click')
  expect(persons()).toHaveLength(4)
  await wrapper.findAll('.actions')[2].findAll('button')[1].trigger('click')
  expect(document.querySelector('.performance-confirm-dialog__title')?.textContent).toContain('确定撤销授权吗?')
  expect(document.querySelectorAll('.performance-confirm-dialog__details li')).toHaveLength(typeof notifyOriginal === 'boolean' ? 2 : 1)
  expect(document.querySelector('.performance-confirm-dialog__details')?.textContent).toContain('子任务将会回收')
  if (notifyOriginal === true) expect(document.querySelector('.performance-confirm-dialog__details')?.textContent).toContain('由于授权时选择了通知原校准人，故本次撤销也会通知原校准人。')
  else if (notifyOriginal === false) expect(document.querySelector('.performance-confirm-dialog__details')?.textContent).toContain('本次撤销也不会通知原校准人')
  else expect(document.querySelector('.performance-confirm-dialog__details')?.textContent).not.toContain('通知原校准人')
  document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
  await flushPromises()
  expect(revoking).toHaveBeenCalledTimes(1)
  expect(revoking).toHaveBeenCalledWith(3, 11, 21)
  wrapper.unmount(); loaded.mockRestore(); revoking.mockRestore(); delete routeQuery.cycle_id
})

it('nests department and people pickers beneath their scope options using the shared shell', async () => {
  const { default: Dialog } = await import('@/components/performance/PerformanceTaskDelegationDialog.vue')
  const { default: Select } = await import('@/components/performance/PerformanceSearchSelect.vue')
  const candidates = vi.spyOn(projectManagementApi, 'delegationCandidatesBatch').mockResolvedValue([11, 12].map(task_id => ({ project_id: 3, task_id, candidates: [{ employee_no: 'R', display_name: '接收人' }] })))
  const wrapper = mount(Dialog, { attachTo: document.body, props: { modelValue: true, action: 'AUTHORIZE', calibration: true, readOnly: true, tasks: [{ task_id: 11, project_id: 3, employee_no: 'E1', department_path: '研发/产品' }, { task_id: 12, project_id: 3, employee_no: 'E2', department_path: '研发/工程' }] } })
  await flushPromises()
  wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R')
  await flushPromises()
  expect(document.querySelector('.scope-count')?.parentElement?.className).toBe('performance-form-item__label')
  expect(document.querySelectorAll('.stage-notice')).toHaveLength(1)
  document.querySelector<HTMLInputElement>('input[value="DEPARTMENT"]')!.click()
  await flushPromises()
  expect(document.querySelector('.scope-picker')?.parentElement?.parentElement?.textContent).toContain('指定部门')
  document.querySelector<HTMLInputElement>('[aria-label="指定部门"]')!.click()
  await flushPromises()
  expect(document.querySelector('.organization-tree__description')?.textContent).toBe('筛选所选部门及其下级部门内的员工')
  expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(1)
  document.querySelector<HTMLButtonElement>('[aria-label="展开研发"]')!.click()
  await flushPromises()
  expect(document.querySelectorAll('[role="treeitem"]')).toHaveLength(3)
  document.querySelector<HTMLInputElement>('.organization-tree__scroll input[type="checkbox"]')!.click()
  await flushPromises()
  expect(document.querySelector('.scope-count')?.textContent).toContain('总人数：2 人')
  document.querySelector<HTMLInputElement>('input[value="PEOPLE"]')!.click()
  await flushPromises()
  expect(document.querySelector('.scope-picker .performance-select-shell')).not.toBeNull()
  expect(document.querySelector('.scope-picker')?.parentElement?.parentElement?.textContent).toContain('指定人员')
  wrapper.unmount(); candidates.mockRestore()
})

it('opens the shared delegation dialog from calibration authorization with real task references', async () => {
  const { default: Calibration } = await import('./ProjectCalibrationAuthorization.vue')
  const { default: Dialog } = await import('@/components/performance/PerformanceTaskDelegationDialog.vue')
  pinia = createPinia(); setActivePinia(pinia)
  usePerformanceProjectContextStore().setNavigation(navigationOf(1))
  routeQuery.cycle_id = '1'
  const loaded = vi.spyOn(projectManagementApi, 'calibrationAuthorization').mockResolvedValue({ cycle_id: 1, cycle_name: '2026上半年', items: [{ id: 'cal:1', project_id: 3, task_ids: [11, 12], authorizations: [], calibrator: '校准人', status: '待校准', scope: '全部下级', authorized_count: 2, unauthorized_count: 2, allow_authorize: true, can_authorize: true, can_revoke: false, distribution_rule: null, authorized_by: null, authorized_at: null }] })
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
  expect(document.querySelector<HTMLInputElement>('input[name="authorization-distribution"][value="NONE"]')?.disabled).toBe(false)
  wrapper.getComponent(Dialog).vm.$emit('completed', 2, 'preview_only')
  await flushPromises()
  expect(wrapper.text()).toContain('已授权 2 个任务')
  expect(wrapper.text()).not.toContain('测试模式')
  wrapper.unmount(); loaded.mockRestore(); candidates.mockRestore(); delete routeQuery.cycle_id
})
