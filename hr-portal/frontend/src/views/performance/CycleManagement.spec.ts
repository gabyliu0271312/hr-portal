import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/stores/user'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ElTableColumn } from 'element-plus'
import CycleManagement from './CycleManagement.vue'
import PerformancePeopleListPanel from '@/components/performance/PerformancePeopleListPanel.vue'
import PerformanceSelectShell from '@/components/performance/PerformanceSelectShell.vue'
import PerformanceDateTimeField from '@/components/performance/PerformanceDateTimeField.vue'
import PerformanceDepartmentListPanel from '@/components/performance/PerformanceDepartmentListPanel.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformanceSearchInput from '@/components/performance/PerformanceSearchInput.vue'
import managementTableSource from '@/components/performance/PerformanceManagementTable.vue?raw'
import peopleDepartmentTabsSource from '@/components/performance/PerformancePeopleDepartmentTabs.vue?raw'

const mocks = vi.hoisted(() => ({
  getAccessContext: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  listPeople: vi.fn(),
  listPeoplePage: vi.fn(),
  listDepartmentsPage: vi.fn(),
  refreshPeople: vi.fn(),
  updatePerson: vi.fn(),
  remove: vi.fn(),
  projectRemove: vi.fn(),
  projectGet: vi.fn(),
  projectCopy: vi.fn(),
  listEvaluatorOptions: vi.fn(),
  templateList: vi.fn(),
  otherSettingsGet: vi.fn(),
}))

vi.mock('@/api/performance', () => ({
  performanceApi: { getAccessContext: mocks.getAccessContext },
  performanceOtherSettingsApi: { get: mocks.otherSettingsGet },
  performanceCycleApi: {
    list: mocks.list,
    get: mocks.get,
    create: mocks.create,
    update: mocks.update,
    listPeople: mocks.listPeople,
    listPeoplePage: mocks.listPeoplePage,
    listDepartmentsPage: mocks.listDepartmentsPage,
    refreshPeople: mocks.refreshPeople,
    updatePerson: mocks.updatePerson,
    remove: mocks.remove,
  },
  performanceProjectApi: {
    get: mocks.projectGet,
    copy: mocks.projectCopy,
    remove: mocks.projectRemove,
    listEvaluatorOptions: mocks.listEvaluatorOptions,
  },
  performanceTemplateApi: {
    list: mocks.templateList,
  },
}))

const cycle = {
  id: 1,
  cycle_ref: 'cycle:1',
  name: '2026 年度考核',
  language: 'zh-CN',
  period_year: 2026,
  period_type: 'YEAR',
  start_at: '2026-01-01T01:00:00.000Z',
  end_at: '2026-12-31T15:59:00.000Z',
  lock_rule: 'IMMEDIATE',
  lock_at: null,
  pre_lock_sync_mode: 'MANUAL',
  leaver_enabled: false,
  leaver_start_date: null,
  leaver_end_date: null,
  leaver_participation_mode: 'CREATE_TASK',
  overdue_submission_enabled: true,
  overdue_submission_scope: 'EVALUATION',
  status: 'LOCKED',
  people_count: 2,
  department_count: 1,
  project_count: 0,
  projects: [],
}

const project = {
  id: 11,
  project_ref: 'project:11',
  name: 'dee',
  description: '111',
  administrators: [] as string[],
  status: 'DRAFT',
  evaluated_count: 3,
}

async function mountView(path = '/performance/settings/cycles') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/performance/settings/cycles', name: 'PerformanceCycles', component: CycleManagement },
      { path: '/performance/settings/cycles/new', name: 'PerformanceCycleCreate', component: CycleManagement },
      { path: '/performance/settings/cycles/:id/edit', name: 'PerformanceCycleEdit', component: CycleManagement },
      { path: '/performance/settings/cycles/:cycleId/projects/:id/edit', name: 'PerformanceProjectEdit', component: { template: '<div>项目配置</div>' } },
    ],
  })
  await router.push(path)
  await router.isReady()
  const pinia = createPinia()
  setActivePinia(pinia)
  useUserStore().menus = [{ code: 'performance.admin', can_create: true, can_update: true, can_delete: true } as any]
  const wrapper = mount({ template: '<router-view />' }, {
    global: {
      plugins: [router, pinia],
      stubs: {
        PermissionButton: { template: '<button><slot /></button>' },
      },
    },
  })
  await flushPromises()
  const view = wrapper.getComponent(CycleManagement)
  view.unmount = () => wrapper.unmount()
  return view
}

async function selectEnabledTemplate(wrapper: ReturnType<typeof mountView> extends Promise<infer T> ? T : never) {
  await wrapper.get('.evaluation-template-field .performance-select-shell__selector').trigger('click')
  await flushPromises()
  ;(document.body.querySelector('.evaluation-template-option') as HTMLButtonElement).click()
  await flushPromises()
}

describe('周期人员和部门快照表格', () => {
  it('将浏览器求解列宽传给EP，包含操作列，缩放和空态不重启EP的fit分配', async () => {
    const callbacks = new Map<Element, ResizeObserverCallback>()
    const Observer = globalThis.ResizeObserver
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(element: Element) { callbacks.set(element, this.callback) }
      unobserve() {}
      disconnect() {}
    })
    const wrapper = mount(PerformanceManagementTable, {
      props: { rows: [], loading: true, loadingText: '加载中', emptyText: '暂无', tableAriaLabel: '表格', paginationAriaLabel: '分页', browserColumnMinWidths: [280, 280, 160, 280] },
      slots: { default: '<template #default="{ columnWidths }"><el-table-column v-for="(width, index) in columnWidths" :key="index" :width="width" :fixed="index === 3 ? \'right\' : false" /></template>' },
      global: { components: { ElTableColumn } },
    })
    try {
      await flushPromises()
      const table = wrapper.getComponent({ name: 'ElTable' })
      expect(table.props('fit')).toBe(false)
      expect(wrapper.findAllComponents({ name: 'ElTableColumn' }).map(column => column.props('width'))).toEqual([280, 280, 160, 280])
      let measured = [504, 504, 288, 504]
      wrapper.findAll('.column-width-probe td').forEach((cell, index) => {
        vi.spyOn(cell.element, 'getBoundingClientRect').mockImplementation(() => ({ width: measured[index] } as DOMRect))
      })
      const resize = async () => {
        callbacks.get(wrapper.element)!([], {} as ResizeObserver)
        await flushPromises()
      }
      await resize()
      expect(wrapper.findAllComponents({ name: 'ElTableColumn' }).map(column => column.props('width'))).toEqual(measured)
      await wrapper.setProps({ loading: false, rows: [{ name: '部门' }] })
      expect(wrapper.findAllComponents({ name: 'ElTableColumn' }).map(column => column.props('width'))).toEqual(measured)
      measured = [280, 280, 160, 280]
      await resize()
      expect(wrapper.findAllComponents({ name: 'ElTableColumn' }).map(column => column.props('width'))).toEqual(measured)
      measured = [504.4, 504.4, 287.8, 503.4]
      await resize()
      expect(wrapper.findAllComponents({ name: 'ElTableColumn' }).map(column => column.props('width'))).toEqual([504, 505, 288, 503])
      await wrapper.setProps({ browserColumnMinWidths: undefined })
      expect(table.props('fit')).toBe(true)
      expect(wrapper.find('.column-width-probe').exists()).toBe(false)
    } finally {
      wrapper.unmount()
      vi.stubGlobal('ResizeObserver', Observer)
    }
  })

  it('仅溢出文本悬停300ms后展示共享提示，允许移入浮层并在滚动、换数据及卸载时清理', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PerformanceManagementTable, {
      attachTo: document.body,
      props: { rows: [{ name: '完整的长部门名称' }], loading: false, loadingText: '加载中', emptyText: '暂无', tableAriaLabel: '表格', paginationAriaLabel: '分页', viewportSurface: true },
      slots: { default: '<el-table-column prop="name" label="名称" /><el-table-column label="操作" width="280" fixed="right">操作</el-table-column>' },
      global: { components: { ElTableColumn } },
    })
    try {
      await flushPromises()
      const cell = wrapper.get('tbody td:not(.el-table-fixed-column--right)')
      const content = cell.get('.cell').element
      let width = 100
      Object.defineProperties(content, {
        clientWidth: { get: () => 100 }, scrollWidth: { get: () => width },
        clientHeight: { get: () => 22 }, scrollHeight: { get: () => 22 },
      })
      await cell.trigger('mouseover')
      await vi.advanceTimersByTimeAsync(300)
      expect(document.querySelector('.performance-cell-tooltip')).toBeNull()
      width = 200
      await cell.trigger('mouseover')
      await vi.advanceTimersByTimeAsync(299)
      expect(document.querySelector('.performance-cell-tooltip')).toBeNull()
      await vi.advanceTimersByTimeAsync(1)
      expect(document.querySelector('.performance-cell-tooltip')?.textContent).toContain('完整的长部门名称')
      await cell.trigger('mouseout')
      document.querySelector('.performance-cell-tooltip')!.dispatchEvent(new MouseEvent('mouseenter'))
      await vi.advanceTimersByTimeAsync(100)
      expect(document.querySelector('.performance-cell-tooltip')).not.toBeNull()
      document.querySelector('.performance-cell-tooltip')!.dispatchEvent(new MouseEvent('mouseleave'))
      await vi.advanceTimersByTimeAsync(100)
      expect(document.querySelector('.performance-cell-tooltip')).toBeNull()
      await cell.trigger('mouseover')
      await cell.trigger('mouseout')
      await vi.advanceTimersByTimeAsync(300)
      expect(document.querySelector('.performance-cell-tooltip')).toBeNull()
      await cell.trigger('mouseover')
      window.dispatchEvent(new Event('scroll'))
      await vi.advanceTimersByTimeAsync(300)
      expect(document.querySelector('.performance-cell-tooltip')).toBeNull()
      await cell.trigger('mouseover')
      await vi.advanceTimersByTimeAsync(300)
      await wrapper.setProps({ rows: [{ name: '替换数据' }] })
      expect(document.querySelector('.performance-cell-tooltip')).toBeNull()
      await wrapper.get('tbody td').trigger('mouseover')
    } finally {
      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(500)
      expect(document.querySelector('.performance-cell-tooltip')).toBeNull()
      vi.useRealTimers()
    }
  })

  it('按父容器剩余空间调整表格上限，窗口变化后重新计算且不影响默认分支', async () => {
    const callbacks = new Map<Element, ResizeObserverCallback>()
    const Observer = globalThis.ResizeObserver
    vi.stubGlobal('ResizeObserver', class {
      constructor(private callback: ResizeObserverCallback) {}
      observe(element: Element) { callbacks.set(element, this.callback) }
      unobserve() {}
      disconnect() {}
    })
    const wrapper = mount(PerformanceManagementTable, {
      props: { rows: [], loading: false, loadingText: '加载中', emptyText: '暂无人员', tableAriaLabel: '表格', paginationAriaLabel: '分页', viewportSurface: true },
      slots: { toolbar: '<div>搜索</div>', default: '<el-table-column label="姓名" />' },
      global: { components: { ElTableColumn } },
    })
    try {
      const root = wrapper.element as HTMLElement
      const parent = document.createElement('div')
      parent.append(root)
      let height = 400
      Object.defineProperty(parent, 'clientHeight', { get: () => height })
      Object.defineProperty(wrapper.get('.table-toolbar').element, 'offsetHeight', { value: 32 })
      Object.defineProperty(wrapper.get('.table-pagination').element, 'offsetHeight', { value: 28 })
      await flushPromises()
      const resize = async () => {
        callbacks.get(root)!([], {} as ResizeObserver)
        await flushPromises()
      }
      await resize()
      const table = wrapper.getComponent({ name: 'ElTable' })
      expect(table.props('maxHeight')).toBe(340)
      height = 240
      await resize()
      expect(table.props('maxHeight')).toBe(180)
      height = 1000
      await resize()
      expect(table.props('maxHeight')).toBe(600)
      await wrapper.setProps({ viewportFill: true })
      expect(wrapper.classes()).toContain('table-surface-fill')
      height = 240
      await resize()
      expect(table.props('maxHeight')).toBe(600)
      await wrapper.setProps({ viewportFill: false })
      expect(wrapper.classes()).not.toContain('table-surface-fill')
      expect(table.props('maxHeight')).toBe(180)
      await wrapper.setProps({ viewportSurface: false })
      expect(wrapper.classes()).not.toContain('table-surface')
      expect(table.props('maxHeight')).toBe(600)
    } finally {
      wrapper.unmount()
      vi.stubGlobal('ResizeObserver', Observer)
    }
  })

  it('统一白卡留白、分页固定底距并仅开放内部横向滚动条', () => {
    expect(managementTableSource).toMatch(/\.table-surface\s*\{[^}]*padding: var\(--performance-table-viewport-padding\)[^}]*overflow: hidden/s)
    expect(managementTableSource).toMatch(/\.table-surface \.table-pagination\s*\{[^}]*flex-shrink: 0[^}]*margin: var\(--performance-table-pagination-gap\) 0 0/s)
    expect(managementTableSource).toContain('.table-surface :deep(.el-scrollbar__bar.is-vertical) { display: none; }')
    expect(managementTableSource).toContain('.table-surface :deep(.el-scrollbar__bar.is-horizontal) { height: var(--performance-table-scrollbar-size); }')
    expect(managementTableSource).toContain('.table-surface .table-scroll { min-width: 0; min-height: 0; overflow: hidden; }')
    expect(managementTableSource).toContain('overflow: hidden !important;')
    expect(managementTableSource).toContain('text-overflow: ellipsis !important;')
    expect(managementTableSource).toContain('scrollbar-width: none; overscroll-behavior: contain;')
    expect(peopleDepartmentTabsSource).toContain('sticky flush fill')
    expect(peopleDepartmentTabsSource).toContain('padding: var(--performance-table-page-top-gap) var(--performance-table-page-inset) var(--performance-table-page-bottom-gap)')
  })

  it('白卡填满剩余高度，分页保留自然位置且小屏仅纵向滚动白卡', () => {
    expect(managementTableSource).toMatch(/\.table-surface-fill\s*\{[^}]*flex: 1 1 0[^}]*overflow-x: hidden[^}]*overflow-y: auto/s)
    expect(managementTableSource).toContain('.table-surface-fill .table-scroll { flex: 0 0 auto; }')
    expect(managementTableSource).toContain('.table-surface-fill .table-pagination {')
    expect(managementTableSource).toContain('margin: var(--performance-table-fill-pagination-gap) 0;')
    expect(peopleDepartmentTabsSource).toContain('--performance-table-tabs-gap: 0px;')
  })

  it.each([
    { component: PerformancePeopleListPanel, api: mocks.listPeoplePage, row: { employee_no: 'E001', display_name: '快照人员', organization_ref: '集团/研发/平台组' }, text: '快照人员', columns: 12 },
    { component: PerformanceDepartmentListPanel, api: mocks.listDepartmentsPage, row: { department_name: '平台组', parent_department: '研发', people_count: 1 }, text: '平台组', columns: 4 },
  ])('使用真实表格展示 $text，并固定右侧操作列', async ({ component, api, row, text, columns }) => {
    api.mockReset().mockResolvedValue({ items: [row], total: 21 })
    const wrapper = mount(component as typeof PerformancePeopleListPanel, { props: { cycleId: 1 } })
    await flushPromises()

    const table = wrapper.findComponent({ name: 'ElTable' })
    const uiTable = wrapper.findComponent({ name: 'UiTable' })
    const renderedTable = table.exists() ? table : uiTable
    expect(renderedTable.exists()).toBe(true)
    if (table.exists()) {
      expect(table.props('maxHeight')).toBe(600)
      expect(table.props('data')).toEqual([row])
      expect(table.attributes('style')).toContain('width: 100%')
      expect(table.props('scrollbarTabindex')).toBe(0)
      expect(table.props('fit')).toBe(false)
    } else {
      expect(uiTable.props('rows')).toEqual([row])
      expect(uiTable.props('columns')).toEqual(expect.arrayContaining([expect.objectContaining({ label: '操作', fixed: 'right', width: 280 })]))
    }
    expect(wrapper.find('.feishu-table').exists()).toBe(false)
    expect(wrapper.find('.table-surface, .department-surface').exists()).toBe(true)
    expect(wrapper.text()).toContain(text)
    if ('employee_no' in row) expect(wrapper.text()).toContain('平台组')
    const tableColumns = wrapper.findAllComponents({ name: 'ElTableColumn' })
    if (table.exists()) {
      expect(tableColumns).toHaveLength(columns)
      expect(tableColumns.at(-1)?.props()).toMatchObject({ label: '操作', fixed: 'right', width: 280, minWidth: '280' })
    } else {
      expect(wrapper.text()).toContain('操作')
    }

    if (table.exists()) wrapper.getComponent(PerformanceManagementTable).vm.$emit('page-change', 2)
    else await wrapper.get('[aria-label="周期部门分页"] [aria-label="下一页"]').trigger('click')
    await flushPromises()
    expect(api).toHaveBeenLastCalledWith(1, { keyword: undefined, offset: 10, limit: 10 })
    wrapper.getComponent(PerformanceSearchInput).vm.$emit('update:modelValue', text)
    wrapper.getComponent(PerformanceSearchInput).vm.$emit('search')
    await flushPromises()
    expect(api).toHaveBeenLastCalledWith(1, { keyword: text, offset: 0, limit: 10 })
    wrapper.unmount()
  })
})

describe('CycleManagement', () => {
  beforeEach(() => {
    Object.values(mocks).forEach(mock => mock.mockReset())
    mocks.getAccessContext.mockResolvedValue({ permission_codes: ['performance.cycles.manage'] })
    mocks.list.mockResolvedValue({ items: [cycle], total: 1, page: 1, page_size: 20 })
    mocks.get.mockResolvedValue(cycle)
    mocks.listPeople.mockResolvedValue([])
    mocks.templateList.mockResolvedValue([{ template_id: 101, name: '已启用模板', description: '模板说明', status: 'active' }])
    mocks.otherSettingsGet.mockResolvedValue({ overdue_single_submission_enabled: true, cycle_overdue_submission_override_enabled: true })
    mocks.listEvaluatorOptions.mockResolvedValue({ organization_tree: [{ value: '集团/研发', label: '研发', level: 2, children: [] }], people: [{ value: 'E001', label: '员工（E001）' }], employee_types: [] })
  })

  it('reopens multiple cycle templates and saves the complete selection', async () => {
    const second = { template_id: 102, name: '第二模板', description: '第二描述', status: 'active' }
    mocks.templateList.mockResolvedValue([{ template_id: 101, name: '已启用模板', description: '模板说明', status: 'active' }, second])
    mocks.get.mockResolvedValue({ ...cycle, template_ids: [101, 102] })
    mocks.update.mockResolvedValue({ ...cycle, template_ids: [101, 102] })
    const wrapper = await mountView('/performance/settings/cycles/1/edit')
    expect(wrapper.findAll('.evaluation-template-field .performance-select-shell__tag-content').map(item => item.text())).toEqual(['已启用模板', '第二模板'])
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(1, expect.objectContaining({ template_ids: [101, 102] }))
  })

  it('keeps used templates disabled through deselect, tags, clear and setter while permitting additions', async () => {
    mocks.templateList.mockResolvedValue([101, 102, 103].map(template_id => ({ template_id, name: `模板${template_id}`, status: 'active' })))
    mocks.get.mockResolvedValue({ ...cycle, template_ids: [101, 102], used_template_ids: [101] })
    const wrapper = await mountView('/performance/settings/cycles/1/edit')
    const shell = wrapper.getComponent(PerformanceSelectShell)
    expect(shell.props('lockedValues')).toEqual(['101'])
    expect(wrapper.get('[aria-label="移除模板101"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[aria-label="清空绩效模板"]').attributes('disabled')).toBeDefined()
    shell.vm.$emit('update:modelValue', [])
    await flushPromises()
    expect(shell.props('modelValue')).toEqual(['101', '102'])
    await wrapper.get('.evaluation-template-field .performance-select-shell__selector').trigger('click')
    const options = [...document.body.querySelectorAll<HTMLButtonElement>('.evaluation-template-option')]
    expect(options[0]!.disabled).toBe(true)
    options[2]!.click()
    await flushPromises()
    expect(shell.props('modelValue')).toEqual(['101', '102', '103'])
    await wrapper.get('[aria-label="移除模板102"]').trigger('click')
    expect(shell.props('modelValue')).toEqual(['101', '103'])
  })

  it('locks leaver range from original GET even when start time is delayed in the draft', async () => {
    mocks.get.mockResolvedValue({ ...cycle, template_ids: [101], leaver_enabled: true, leaver_start_date: '2026-01-01', leaver_end_date: '2026-12-31', leaver_range_editable: false })
    const wrapper = await mountView('/performance/settings/cycles/1/edit')
    for (const selector of ['#leaver-enabled', '#leaver-start', '#leaver-end']) expect(wrapper.get(selector).attributes('disabled')).toBeDefined()
    const start = wrapper.findAllComponents(PerformanceDateTimeField).find(field => field.props('inputId') === 'cycle-start')!
    start.vm.$emit('update:modelValue', '2090-01-01T00:00')
    await flushPromises()
    expect(wrapper.get('#leaver-enabled').attributes('disabled')).toBeDefined()
    const state = (wrapper.vm as any).$?.setupState
    state.form.leaver_start_date = '2026-02-01'
    state.form.end_at = '2091-01-01T00:00'
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('不能修改离职人员参评范围')
  })

  it('allows overdue settings after a project has started and submits only the policy fields', async () => {
    const startedCycle = { ...cycle, status: 'LOCKED', projects: [{ ...project, status: 'STARTED' }] }
    mocks.list.mockResolvedValue({ items: [startedCycle], total: 1, page: 1, page_size: 20 })
    mocks.update.mockResolvedValue({ ...startedCycle, overdue_submission_enabled: false, overdue_submission_scope: 'ALL' })
    const wrapper = await mountView()
    await wrapper.get('[aria-label="设置周期"]').trigger('click')
    const item = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(button => button.textContent?.includes('逾期任务提交机会设置'))
    expect(item).toBeDefined()
    item!.click()
    await flushPromises()
    expect(document.body.querySelector('.cycle-overdue-submission-dialog')).not.toBeNull()
    const checkbox = document.body.querySelector<HTMLInputElement>('.cycle-overdue-submission-dialog input[type="checkbox"]')!
    checkbox.click()
    await flushPromises()
    const all = document.body.querySelector<HTMLInputElement>('.cycle-overdue-submission-dialog input[type="radio"][value="ALL"]')!
    all.click()
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.cycle-overdue-submission-actions button.performance-button--primary')!.click()
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(1, { overdue_submission_enabled: false, overdue_submission_scope: 'ALL' })
  })

  it('selects the source cycle, stages a copy and writes only the edited final form to the target cycle', async () => {
    const target = { ...cycle, id: 2, cycle_ref: 'cycle:2', name: '目标周期' }
    mocks.list.mockResolvedValue({ items: [{ ...cycle, projects: [project] }, target], total: 2, page: 1, page_size: 100 })
    mocks.projectGet.mockResolvedValue({ ...project, data_managers: ['HRBP'], scope_limited: false })
    mocks.projectCopy.mockRejectedValueOnce({ response: { data: { detail: '目标周期不允许此模板' } } }).mockResolvedValueOnce({ ...project, id: 22 })
    const wrapper = await mountView()
    wrapper.getComponent({ name: 'PerformanceProjectSettings' }).vm.$emit('copy', project)
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledWith('', 1, 100)
    expect(document.body.querySelector('.project-copy-dialog')?.textContent).toContain(cycle.name)
    expect(mocks.projectCopy).not.toHaveBeenCalled()
    ;(document.body.querySelector('.project-copy-dialog .performance-select-shell__selector') as HTMLElement).click()
    await flushPromises()
    const option = [...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(node => node.textContent?.includes('目标周期'))!
    option.click()
    await flushPromises()
    ;(document.body.querySelector('.project-copy-dialog .performance-button--primary') as HTMLButtonElement).click()
    await flushPromises()
    expect(mocks.projectGet).toHaveBeenCalledWith(project.id)
    expect(mocks.projectCopy).not.toHaveBeenCalled()
    const name = document.body.querySelector<HTMLInputElement>('#project-name')!
    expect(name.value).toBe('dee 副本')
    name.value = '修改后的副本'
    name.dispatchEvent(new Event('input', { bubbles: true }))
    ;(document.body.querySelector('input[aria-label="项目管理员"]') as HTMLElement).click()
    await flushPromises()
    expect(mocks.listEvaluatorOptions).toHaveBeenCalledWith(2)
    const submit = document.body.querySelector<HTMLButtonElement>('.project-dialog-footer .performance-button--primary')!
    submit.click()
    await flushPromises()
    expect(mocks.projectCopy).toHaveBeenCalledWith(11, expect.objectContaining({ target_cycle_id: 2, name: '修改后的副本', description: '111' }))
    expect(document.body.querySelector('.project-dialog-error')?.textContent).toContain('目标周期不允许此模板')
    expect(name.value).toBe('修改后的副本')
    submit.click()
    await flushPromises()
    expect(mocks.projectCopy).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('cancels either copy step without creating a project', async () => {
    mocks.projectGet.mockResolvedValue(project)
    const wrapper = await mountView()
    const open = async () => {
      wrapper.getComponent({ name: 'PerformanceProjectSettings' }).vm.$emit('copy', project)
      await flushPromises()
    }
    await open()
    ;(document.body.querySelector('.project-copy-dialog .performance-button--secondary') as HTMLButtonElement).click()
    await flushPromises()
    expect(mocks.projectGet).not.toHaveBeenCalled()
    await open()
    ;(document.body.querySelector('.project-copy-dialog .performance-button--primary') as HTMLButtonElement).click()
    await flushPromises()
    ;(document.body.querySelector('.project-dialog-footer .performance-button--secondary') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.querySelector('#project-name')).toBeNull()
    expect(mocks.projectCopy).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('loads project department choices only when the value selector opens', async () => {
    const wrapper = await mountView()
    await wrapper.get('.project-create').trigger('click')
    await flushPromises()
    expect(mocks.listEvaluatorOptions).not.toHaveBeenCalled()
    const scope = document.body.querySelector('[aria-label="限定考核范围"]') as HTMLButtonElement
    scope.click()
    await flushPromises()
    expect(mocks.listEvaluatorOptions).not.toHaveBeenCalled()
    const field = document.body.querySelector('input[aria-label="范围字段"]') as HTMLInputElement
    expect(field.readOnly).toBe(true)
    ;(field.closest('.performance-select-shell__selector') as HTMLElement).click()
    await flushPromises()
    const department = [...document.body.querySelectorAll<HTMLButtonElement>('.performance-flat-option-list__option')].find(option => option.textContent === '部门')
    expect(department).toBeDefined()
    department!.click()
    await flushPromises()
    expect(mocks.listEvaluatorOptions).not.toHaveBeenCalled()
    expect(document.body.querySelector('.performance-audience-rule-editor__condition .performance-select-shell__tag')?.textContent).toBe('部门')
    ;(document.body.querySelector('.performance-organization-tree-select__trigger') as HTMLElement).click()
    await flushPromises()
    expect(mocks.listEvaluatorOptions).toHaveBeenCalledTimes(1)
    expect(mocks.listEvaluatorOptions).toHaveBeenCalledWith(1)
  })

  it('confirms project deletion through the shared dialog and refreshes the cycle', async () => {
    const cycleWithProjects = { ...cycle, projects: [project] }
    mocks.list.mockResolvedValue({ items: [cycleWithProjects], total: 1, page: 1, page_size: 20 })
    mocks.get.mockResolvedValue(cycleWithProjects)
    mocks.projectRemove.mockResolvedValue(undefined)
    const wrapper = await mountView()

    const moreButton = wrapper.findAll('button').find(button => button.attributes('aria-label') === '更多操作')
    await moreButton!.trigger('click')
    await document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    const removeItems = [...document.body.querySelectorAll('.el-dropdown-menu__item')].filter(item => item.textContent === '删除')
    expect(removeItems.length).toBeGreaterThanOrEqual(1)
    removeItems[removeItems.length - 1].dispatchEvent(new Event('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    await flushPromises()

    const dialog = document.body.querySelector('.performance-confirm-dialog')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('确定要删除“dee”吗？')
    expect(dialog!.textContent).toContain('删除后将无法恢复')
    const danger = [...dialog!.querySelectorAll('button')].find(button => button.textContent === '删除')!
    expect(danger).toBeDefined()
    danger.click()
    await flushPromises()

    expect(mocks.projectRemove).toHaveBeenCalledWith(11)
    expect(mocks.get).toHaveBeenCalled()
  })

  it('keeps project remove behind the confirm dialog until confirmed', async () => {
    const cycleWithProjects = { ...cycle, projects: [project] }
    mocks.list.mockResolvedValue({ items: [cycleWithProjects], total: 1, page: 1, page_size: 20 })
    mocks.get.mockResolvedValue(cycleWithProjects)
    const wrapper = await mountView()

    const moreButton = wrapper.findAll('button').find(button => button.attributes('aria-label') === '更多操作')
    await moreButton!.trigger('click')
    const removeItems = [...document.body.querySelectorAll('.el-dropdown-menu__item')].filter(item => item.textContent === '删除')
    removeItems[0].dispatchEvent(new Event('click', { bubbles: true }))
    await flushPromises()

    const dialog = document.body.querySelector('.performance-confirm-dialog')
    expect(dialog).not.toBeNull()
    const keep = [...dialog!.querySelectorAll('button')].find(button => button.textContent === '保留')!
    keep.click()
    await flushPromises()
    expect(mocks.projectRemove).not.toHaveBeenCalled()
    expect(document.body.querySelector('.performance-confirm-dialog')).toBeNull()
  })

  it('requires typing 确认删除 before removing a started project', async () => {
    const started = { ...project, status: 'STARTED' as const }
    mocks.list.mockResolvedValue({ items: [{ ...cycle, projects: [started] }], total: 1, page: 1, page_size: 20 })
    mocks.get.mockResolvedValue({ ...cycle, projects: [started] })
    mocks.projectRemove.mockResolvedValue(undefined)
    const wrapper = await mountView()

    const moreButton = wrapper.findAll('button').find(button => button.attributes('aria-label') === '更多操作')
    await moreButton!.trigger('click')
    const removeItems = [...document.body.querySelectorAll('.el-dropdown-menu__item')].filter(item => item.textContent === '删除')
    expect(removeItems.length).toBeGreaterThanOrEqual(1)
    removeItems[removeItems.length - 1].dispatchEvent(new Event('click', { bubbles: true }))
    await flushPromises()

    const dialogs = [...document.body.querySelectorAll('.performance-confirm-dialog')]
    const dialog = dialogs[dialogs.length - 1]!
    expect(dialog.textContent).toContain('项目已启动，删除后，项目中的评估数据将全部被删除且不可恢复')
    const danger = [...dialog.querySelectorAll('button')].find(button => button.textContent === '删除')! as HTMLButtonElement
    expect(danger.disabled).toBe(true)

    const input = dialog.querySelector('.performance-confirm-dialog__confirm-input') as HTMLInputElement
    input.value = '确认删'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(danger.disabled).toBe(true)

    input.value = '确认删除'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(danger.disabled).toBe(false)
    danger.click()
    await flushPromises()
    expect(mocks.projectRemove).toHaveBeenCalledWith(11)
  })

  it('keeps the desktop cycle workspace proportions and renders the detail structure', async () => {
    const wrapper = await mountView()

    expect(wrapper.find('.cycle-workspace').exists()).toBe(true)
    expect(wrapper.find('.cycle-list-panel').exists()).toBe(true)
    expect(wrapper.find('.cycle-detail-panel').exists()).toBe(true)
    expect(wrapper.find('.detail-content').exists()).toBe(true)
    expect(wrapper.find('.project-heading').text()).toContain('项目设置')
    expect(wrapper.find('.project-tools .primary-button').text()).toContain('新建')
    expect(wrapper.findAll('.project-table-wrap')).toHaveLength(1)
    expect(wrapper.find('.project-settings .project-table-wrap').exists()).toBe(true)
    expect(wrapper.find('.project-settings .fixed-operation').exists()).toBe(true)
    expect(wrapper.find('.list-page-title').text()).toBe('周期与项目')
  })

  it('hides cycle management actions without cycle permission', async () => {
    mocks.getAccessContext.mockResolvedValueOnce({ permission_codes: ['performance.projects.manage'] })
    const wrapper = await mountView()
    expect(wrapper.findAll('[aria-label="新建周期"]')).toHaveLength(0)
    expect(wrapper.findAll('.people-card')).toHaveLength(0)
  })

  it('shows the unsaved leave dialog when returning from a changed cycle form', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')
    await wrapper.get('#cycle-name').setValue('未保存周期')
    await wrapper.get('.full-screen-modal-header-back').trigger('click')
    await flushPromises()

    const dialog = document.body.querySelector('.performance-confirm-dialog')
    expect(dialog?.textContent).toContain('离开后，已填写的信息将会丢失。确定离开此页面吗？')
    expect(Array.from(dialog?.querySelectorAll('button') || []).map(button => button.textContent)).toEqual(['取消', '确定'])

    ;[...dialog!.querySelectorAll('button')].find(button => button.textContent === '取消')!.click()
    await flushPromises()
    expect(wrapper.find('.cycle-modal').exists()).toBe(true)

    ;[...dialog!.querySelectorAll('button')].find(button => button.textContent === '确定')!.click()
    await flushPromises()
    expect(wrapper.find('.cycle-modal').exists()).toBe(false)
  })
  it('renders the language options vertically with Chinese selected by default', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')

    const options = wrapper.findAll('.language-options label')
    expect(options.map(option => option.text())).toEqual(['中文', '英文'])
    expect((wrapper.get('#cycle-language-zh').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('#cycle-language-en').element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.get('.language-options').classes()).toContain('language-options')
  })

  it('only shows scheduled lock details inside the gray settings area', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')

    expect(wrapper.find('.lock-rule-options').findAll('label').map(option => option.text())).toEqual([
      '新建周期时，立即锁定',
      '新建周期并到达指定时间后，再锁定',
    ])
    expect(wrapper.find('.lock-settings-card').exists()).toBe(false)
    expect(wrapper.find('.sync-card').exists()).toBe(false)

    await wrapper.find('input[type="radio"][value="SCHEDULED"]').setValue(true)

    expect(wrapper.find('.lock-settings-card').exists()).toBe(true)
    expect(wrapper.find('.lock-settings-card').text()).toContain('锁定时间')
    expect(wrapper.find('.lock-settings-card').text()).toContain('锁定前名单同步')
    expect(wrapper.find('.lock-settings-card .sync-field').exists()).toBe(true)
  })

  it('does not show the six-hour rule when reopening a historical scheduled cycle', async () => {
    const scheduled = { ...cycle, lock_rule: 'SCHEDULED', lock_at: '2026-11-03T10:00:00.000Z', template_ids: [101], status: 'DRAFT' }
    mocks.get.mockResolvedValue(scheduled)
    mocks.update.mockResolvedValue(scheduled)
    const now = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-04T07:44:00.000Z').getTime())
    try {
      const wrapper = await mountView('/performance/settings/cycles/1/edit')
      expect(wrapper.find('#lock-at-rule-error').exists()).toBe(false)
      expect((wrapper.get('#lock-at').element as HTMLInputElement).disabled).toBe(true)
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(mocks.update).toHaveBeenCalledWith(1, expect.objectContaining({ name: cycle.name }))
    } finally {
      now.mockRestore()
    }
  })

  it('still shows the six-hour rule for a new scheduled cycle', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-11-03T03:00:00.000Z').getTime())
    try {
      const wrapper = await mountView('/performance/settings/cycles/new')
      await wrapper.find('input[type="radio"][value="SCHEDULED"]').setValue(true)
      await wrapper.get('#lock-at').setValue('2026-11-03T16:59')
      expect(wrapper.get('#lock-at-rule-error').text()).toContain('至少 6 小时')
      await wrapper.get('#lock-at').setValue('2026-11-03T17:00')
      expect(wrapper.find('#lock-at-rule-error').exists()).toBe(false)
    } finally {
      now.mockRestore()
    }
  })

  it('opens the comparison rule drawer from the evaluation result validation rule card', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')

    expect(wrapper.get('.evaluation-result-rules__title').text()).toBe('评估结果校验提示规则')
    expect(wrapper.get('.evaluation-result-rule-card__title').text()).toBe('不同评估环节的评估结果差异提示')
    const addButton = wrapper.get('.evaluation-result-rule-add')
    expect(addButton.text()).toBe('添加需对比的环节')
    expect(addButton.attributes('aria-label')).toBe('添加需对比的环节')
    expect((addButton.element as HTMLButtonElement).disabled).toBe(false)

    await addButton.trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.performance-drawer__panel')?.textContent).toContain('添加需对比的环节')
  })

  it('shows field-level required errors and blocks an empty save', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')

    await wrapper.get('form').trigger('submit')

    expect(mocks.create).not.toHaveBeenCalled()
    expect(wrapper.get('#cycle-name').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#cycle-name-error').text()).toBe('周期名称为必填')
    expect(wrapper.get('#cycle-year-error').text()).toBe('年份为必填')
    expect(wrapper.get('#cycle-type-error').text()).toBe('周期类型为必填')
    expect(wrapper.get('#cycle-start-error').text()).toBe('开始时间为必填')
    expect(wrapper.get('#cycle-end-error').text()).toBe('截止时间为必填')
  })
  it('removes the duplicate empty-state create button', async () => {
    const wrapper = await mountView()

    expect(wrapper.findAll('[aria-label="新建周期"]')).toHaveLength(1)
    expect(wrapper.findAll('button').filter(button => button.text() === '新建周期')).toHaveLength(0)
  })

  it('renders the form validation relationships and the paged year panel', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')
    expect(wrapper.get('#cycle-year').text()).toContain('请选择年份')
    expect(wrapper.get('#cycle-year').text()).not.toContain('2026')
    await wrapper.get('#cycle-year').trigger('click')
    expect(wrapper.get('[aria-label="年份选择器"]').findAll('.year-options button')).toHaveLength(20)
    await wrapper.get('#cycle-start').setValue('2026-01-01T10:00')
    await wrapper.get('#cycle-end').setValue('2026-01-01T09:00')
    expect(wrapper.get('#cycle-start').attributes('aria-describedby')).toBe('cycle-date-error')
    expect(wrapper.get('#cycle-end').attributes('aria-invalid')).toBe('true')
  })


  it('closes year and period pickers when clicking outside', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')

    await wrapper.get('#cycle-year').trigger('click')
    expect(wrapper.find('[aria-label="年份选择器"]').exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[aria-label="年份选择器"]').exists()).toBe(false)

    await wrapper.get('#cycle-type').trigger('click')
    expect(wrapper.find('[aria-label="周期类型选择器"]').exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[aria-label="周期类型选择器"]').exists()).toBe(false)
  })

  it('keeps picker open when clicking inside it', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')

    await wrapper.get('#cycle-type').trigger('click')
    await wrapper.get('[aria-label="周期类型选择器"] .period-group-label').trigger('pointerdown')
    expect(wrapper.find('[aria-label="周期类型选择器"]').exists()).toBe(true)
  })

  it('keeps the cycle name and period controls aligned to the SnapSpec geometry', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')

    expect(wrapper.get('.cycle-info-period-row').classes()).toContain('cycle-info-period-row')
    expect(wrapper.get('#cycle-name').classes()).toContain('wide-input')
    expect(wrapper.get('#cycle-year').classes()).toContain('selector-control')
    expect(wrapper.get('#cycle-type').classes()).toContain('selector-control')
  })

  it('renders grouped period options and derives subtype dates', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')
    await wrapper.get('#cycle-year').trigger('click')
    await wrapper.get('[aria-label="年份选择器"]').findAll('.year-options button').find(item => item.text() === '2026')!.trigger('click')
    await wrapper.get('#cycle-type').trigger('click')
    expect(wrapper.findAll('.period-group-label').map(item => item.text())).toEqual(['年/半年度', '季度', '双月', '月度', '非标准周期'])
    expect(wrapper.get('[aria-label="周期类型选择器"]').findAll('[role="option"]')).toHaveLength(26)

    const quarterTwo = wrapper.get('[aria-label="周期类型选择器"]').findAll('[role="option"]').find(item => item.text() === '第 2 季度')
    await quarterTwo!.trigger('click')
    expect((wrapper.get('#cycle-type').element as HTMLButtonElement).textContent).toContain('第 2 季度')
    expect((wrapper.get('#cycle-start').element as HTMLInputElement).value).toBe('2026-04-01 00:00')
    expect((wrapper.get('#cycle-end').element as HTMLInputElement).value).toBe('2026-06-30 23:59')
  })

  it('keeps the delete dialog keyboard-trapped and restores focus on close', async () => {
    const wrapper = await mountView()
    const deleteButton = wrapper.findAll('button').find(button => button.text() === '删除')
    await deleteButton!.trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('.performance-confirm-dialog')!
    expect(dialog.getAttribute('role')).toBe('alertdialog')
    expect(dialog.querySelector('.performance-confirm-dialog__title-content')?.textContent).toBe('确定要删除周期吗？')
    expect(dialog.querySelector('.performance-confirm-dialog__body')?.textContent).toBe('删除后，周期内的所有项目将同步删除，请谨慎操作。')
    expect(dialog.querySelector('[data-icon="WarningFilled"]')).not.toBeNull()
    expect([...dialog.querySelectorAll('button')].map(button => button.textContent)).toEqual(['保留', '删除'])
    expect(mocks.remove).not.toHaveBeenCalled()
    ;(dialog.querySelector('.performance-confirm-dialog__button--cancel') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.querySelector('.performance-confirm-dialog')).toBeNull()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('only removes the selected cycle after confirmation', async () => {
    mocks.remove.mockResolvedValue(undefined)
    const wrapper = await mountView()
    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    expect(mocks.remove).not.toHaveBeenCalled()
    ;(document.body.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(mocks.remove).toHaveBeenCalledOnce()
    expect(mocks.remove).toHaveBeenCalledWith(cycle.id)
    expect(document.body.querySelector('.performance-confirm-dialog')).toBeNull()
  })

  it('keeps the dialog open and reports a failed deletion', async () => {
    mocks.remove.mockRejectedValue({ response: { data: { detail: '删除失败' } } })
    const wrapper = await mountView()
    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    ;(document.body.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.querySelector('.performance-confirm-dialog')).not.toBeNull()
    expect(wrapper.find('[role="alert"]').text()).toContain('删除失败')
  })
  it('keeps the desktop cycle workspace proportions and full detail surface', async () => {
    const wrapper = await mountView()
    wrapper.get('.cycle-list-panel')
    wrapper.get('.cycle-detail-panel')
    expect(wrapper.get('.detail-content').text()).toContain('基本信息')
    expect(wrapper.get('.project-tools .primary-button').text()).toContain('新建')
    wrapper.get('.project-table-wrap')
    wrapper.get('.project-table-wrap table')
    wrapper.get('.project-table-wrap .fixed-operation')
  })

  it('shows a save success status after creating a cycle', async () => {
    mocks.create.mockResolvedValueOnce(cycle)
    const wrapper = await mountView('/performance/settings/cycles/new')
    await wrapper.get('#cycle-year').trigger('click')
    await wrapper.get('[aria-label="年份选择器"]').findAll('.year-options button').find(item => item.text() === '2026')!.trigger('click')
    await wrapper.get('#cycle-type').trigger('click')
    await wrapper.get('[aria-label="周期类型选择器"]').findAll('[role="option"]').find(item => item.text() === '自定义')!.trigger('click')
    await wrapper.get('#cycle-name').setValue('新周期')
    await wrapper.get('#cycle-start').setValue('2026-01-01T09:00')
    await wrapper.get('#cycle-end').setValue('2026-12-31T18:00')
    await selectEnabledTemplate(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(wrapper.findAll('[role="status"]').some(item => item.text().includes('周期已保存'))).toBe(true)
  })
  it('prevents submission when the leaver date range is invalid', async () => {
    const wrapper = await mountView('/performance/settings/cycles/new')
    await wrapper.get('#cycle-type').trigger('click')
    await wrapper.get('[aria-label="周期类型选择器"]').findAll('[role="option"]').find(item => item.text() === '自定义')!.trigger('click')
    await wrapper.get('#cycle-name').setValue('新周期')
    await wrapper.get('#cycle-start').setValue('2026-01-01T09:00')
    await wrapper.get('#cycle-end').setValue('2026-12-31T18:00')
    await wrapper.get('#leaver-enabled').setValue(true)
    await wrapper.get('#leaver-start').setValue('2026-02-01')
    await wrapper.get('#leaver-end').setValue('2026-01-01')
    await wrapper.get('form').trigger('submit')

    expect(mocks.create).not.toHaveBeenCalled()
    expect(wrapper.get('#leaver-date-error').text()).toContain('日期范围不合法')
    expect((wrapper.get('#leaver-start').element as HTMLInputElement).value).toBe('2026-02-01')
  })

  it('converts Beijing local times before creating a cycle', async () => {
    mocks.create.mockResolvedValueOnce(cycle)
    const wrapper = await mountView('/performance/settings/cycles/new')
    await wrapper.get('#cycle-year').trigger('click')
    await wrapper.get('[aria-label="年份选择器"]').findAll('.year-options button').find(item => item.text() === '2026')!.trigger('click')
    await wrapper.get('#cycle-type').trigger('click')
    await wrapper.get('[aria-label="周期类型选择器"]').findAll('[role="option"]').find(item => item.text() === '自定义')!.trigger('click')
    await wrapper.get('#cycle-name').setValue('新周期')
    await wrapper.get('#cycle-start').setValue('2026-01-01T09:00')
    await wrapper.get('#cycle-end').setValue('2026-12-31T18:00')
    await selectEnabledTemplate(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      start_at: '2026-01-01T01:00:00.000Z',
      end_at: '2026-12-31T10:00:00.000Z',
    }))
  })

  it('keeps form input after a save failure', async () => {
    mocks.create.mockRejectedValueOnce({ response: { data: { detail: '保存失败' } } })
    const wrapper = await mountView('/performance/settings/cycles/new')
    await wrapper.get('#cycle-year').trigger('click')
    await wrapper.get('[aria-label="年份选择器"]').findAll('.year-options button').find(item => item.text() === '2026')!.trigger('click')
    await wrapper.get('#cycle-type').trigger('click')
    await wrapper.get('[aria-label="周期类型选择器"]').findAll('[role="option"]').find(item => item.text() === '自定义')!.trigger('click')
    await wrapper.get('#cycle-name').setValue('保留的周期')
    await wrapper.get('#cycle-start').setValue('2026-01-01T09:00')
    await wrapper.get('#cycle-end').setValue('2026-12-31T18:00')
    await selectEnabledTemplate(wrapper)
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect((wrapper.get('#cycle-name').element as HTMLInputElement).value).toBe('保留的周期')
    expect(wrapper.get('[role="alert"]').text()).toContain('保存失败')
    expect(wrapper.get('button.primary-button').text()).toBe('保存')
  })
  it('shows a retryable error when loading fails', async () => {
    mocks.list.mockRejectedValue({ response: { data: { detail: '加载失败' } } })
    const wrapper = await mountView()
    expect(wrapper.get('[role="alert"]').text()).toContain('加载失败')
    expect(wrapper.get('[role="alert"] button').text()).toBe('重试')
  })
})

