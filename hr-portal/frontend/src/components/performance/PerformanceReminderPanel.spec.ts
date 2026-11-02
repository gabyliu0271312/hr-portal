import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PerformanceReminderPanel from './PerformanceReminderPanel.vue'
import PerformanceTaskOverlay from './PerformanceTaskOverlay.vue'
import PerformanceExportButton from './PerformanceExportButton.vue'
import PerformanceColumnVisibilityDrawer from './PerformanceColumnVisibilityDrawer.vue'
import type { ReminderListResult } from './performanceReminder'
import type { ProjectManagementReminderPerson } from '@/api/performance'

const result = (): ReminderListResult => ({
  items: [{ task_id: 11, aggregate_task_id: 11, project_id: 3, employee_no: 'E001', display_name: '张三', job_family: '产品', job_category: '策划', job_sequence: '产品-策划', position_level: 'P6', hire_date: '2020-01-01', department: '产品中心', employee_type: '正式员工', employment_status: '在职', status: 'pending', due_at: '2026-09-30T00:00:00Z' }],
  total: 1,
  columns: [
    { key: 'display_name', label: '被评估人', locked: true, visibleByDefault: true },
    { key: 'status', label: '状态', visibleByDefault: true },
  ],
  capabilities: { canRemind: true, canAuthorize: false, canTransfer: false, canExport: false },
})

const context = { projectId: 3, cycleId: 1, nodeId: 'evaluation-1', nodeType: 'evaluation', reviewType: 'leader_review', title: '上级评估', sectionTitle: '未完成的被评估人' }

describe('PerformanceReminderPanel', () => {
  it('uses the shared toolbar, renders configured columns, and selects task rows', async () => {
    const provider = vi.fn().mockResolvedValue(result())
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider } })
    await flushPromises()

    expect(wrapper.find('.performance-task-header').exists()).toBe(false)
    expect(wrapper.find('.card-sticky-mask').exists()).toBe(true)
    expect(wrapper.find('.performance-reminder-card__toolbar').exists()).toBe(true)
    expect(wrapper.find('.performance-reminder-card').attributes('style') || '').not.toContain('--performance-table-container-padding')
    const overlaySource = (await import('./PerformanceTaskOverlay.vue?raw')).default
    const reminderPageSource = (await import('../../views/performance/ProjectManagementReminder.vue?raw')).default
    expect(overlaySource).toMatch(/\.performance-task-overlay__body\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*0;/)
    expect(reminderPageSource).toMatch(/\.project-reminder-page__body\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*0;/)
    expect(wrapper.find('.performance-search-input input').attributes('placeholder')).toBe('搜索成员')
    expect(wrapper.findAll('.feishu-table__header th').map(cell => cell.text())).toEqual(['', '被评估人', '状态'])

    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    expect(wrapper.find('.selection-bar').text()).toContain('已选择 1 条')
    expect(wrapper.find('.selection-bar .performance-button--primary').attributes('disabled')).toBeUndefined()
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ context, page: 1, pageSize: 50 }))
  })

  it('blocks ineligible rows and confirms only eligible members before batch opening', async () => {
    const api = await import('@/api/performance')
    const people = vi.spyOn(api.projectManagementApi, 'openingPeople').mockResolvedValue({
      items: [
        { employee_no: 'E001', display_name: '张三', project_id: 3, project_name: '项目甲', can_open: true, unavailable_reason: null },
        { employee_no: 'E002', display_name: '李四', project_id: 3, project_name: '项目甲', can_open: false, unavailable_reason: 'MANUAL_OPENING_DISABLED' },
      ], total: 2, page: 1, page_size: 50,
    })
    const opening = vi.spyOn(api.projectManagementApi, 'openResults').mockResolvedValue({ accepted_employee_nos: ['E001'], skipped_employee_nos: [], skipped_reasons: {}, notification_status: 'pending_integration' })
    const wrapper = mount(PerformanceReminderPanel, { attachTo: document.body, props: { context, mode: 'open-result' } })
    await flushPromises()
    const boxes = wrapper.findAll('tbody input[type="checkbox"]')
    expect(boxes[1].attributes('disabled')).toBeDefined()
    await wrapper.find('thead input[type="checkbox"]').setValue(true)
    expect(wrapper.text()).toContain('已选择 1 条')
    await wrapper.get('.selection-bar .performance-button--primary').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.performance-confirm-dialog__title-content')?.textContent).toBe('确定开通所选成员的绩效结果嘛？')
    expect(document.body.querySelector('.performance-confirm-dialog__body')?.textContent).toContain('有1名被评估人会立即收到结果开通的通知')
    ;(document.body.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(opening).toHaveBeenCalledWith(1, ['E001'])
    expect(wrapper.text()).toContain('实际开通 1 人，跳过 0 人')
    expect(people).toHaveBeenCalledTimes(2)
    wrapper.unmount()
    people.mockRestore()
    opening.mockRestore()
  })

  it('renders preview providers without selection or action controls', async () => {
    const provider = vi.fn().mockResolvedValue({
      ...result(),
      columns: [
        { key: 'display_name', label: '姓名', locked: true, visibleByDefault: true },
        { key: 'standard_position', label: '标准职位', visibleByDefault: true },
      ],
      items: [{ ...result().items[0], standard_position: '软件工程师', selectable: false }],
      capabilities: { canRemind: false, canAuthorize: false, canTransfer: false, canExport: false },
    })
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider, mode: 'preview' } })
    await flushPromises()
    expect(wrapper.find('.selection-cell').exists()).toBe(false)
    expect(wrapper.getComponent({ name: 'PerformanceManagementTable' }).props('selectedKeys')).toEqual([])
    expect(wrapper.find('.performance-export-button').exists()).toBe(true)
    expect(wrapper.get('.performance-export-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.performance-reminder-panel__heading').exists()).toBe(false)
    expect(wrapper.get('.performance-search-input').attributes('style')).toContain('224px')
    expect(wrapper.findAll('thead th').map(cell => cell.text())).toEqual(['姓名', '标准职位'])
  })

  it('exports all matching pages with the applied search and visible columns', async () => {
    const provider = vi.fn().mockImplementation(async query => {
      const all = Array.from({ length: 101 }, (_, index) => ({ ...result().items[0], task_id: index + 1, display_name: `员工${index + 1}` }))
      return { ...result(), items: all.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: all.length, capabilities: { ...result().capabilities, canExport: true } }
    })
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider, mode: 'preview' } })
    await flushPromises()
    await wrapper.get('input[aria-label="搜索成员"]').setValue('员工')
    await wrapper.get('input[aria-label="搜索成员"]').trigger('keyup.enter')
    await flushPromises()
    const drawer = wrapper.getComponent(PerformanceColumnVisibilityDrawer)
    drawer.vm.$emit('confirm', ['display_name'])
    await flushPromises()
    const loadRows = wrapper.getComponent(PerformanceExportButton).props('loadRows')
    const exported = await loadRows()
    expect(exported).toHaveLength(102)
    expect(exported[0]).toEqual(['被评估人'])
    expect(exported.at(-1)).toEqual(['员工101'])
    expect(provider).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '员工', page: 2, pageSize: 100 }))
    provider.mockResolvedValueOnce({ ...result(), items: Array.from({ length: 100 }, (_, index) => ({ ...result().items[0], task_id: index + 1 })), total: 101 }).mockRejectedValueOnce(new Error('failed page'))
    await expect(loadRows()).rejects.toThrow('failed page')
    wrapper.unmount()
  })

  it('keeps selection and reports failed reminder requests', async () => {
    const provider = vi.fn().mockResolvedValue(result())
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider } })
    await flushPromises()
    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    const api = await import('@/api/performance')
    vi.spyOn(api.projectManagementApi, 'remindTasks').mockRejectedValueOnce(new Error('failed'))

    await wrapper.find('.selection-bar .performance-button--primary').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.performance-confirm-dialog--submit .performance-confirm-dialog__title-content')?.textContent).toBe('确定催办吗？')
    ;(document.body.querySelector('.performance-confirm-dialog--submit .performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()

    expect(wrapper.text()).toContain('催办请求提交失败')
    expect(wrapper.text()).toContain('已选择 1 条')
    wrapper.unmount()
    vi.restoreAllMocks()
  })
})

describe('PerformanceTaskOverlay', () => {
  it('renders a full-screen task shell and closes from the header back action', async () => {
    const wrapper = mount(PerformanceTaskOverlay, { props: { modelValue: true, title: '上级评估', description: '生成评估任务并纳入报表统计，共计 415 人' }, slots: { default: '<p>content</p>' } })
    expect(document.querySelector('.performance-task-header-description')?.textContent).toBe('生成评估任务并纳入报表统计，共计 415 人')
    expect(document.body.textContent).toContain('上级评估')
    expect(document.body.textContent).toContain('content')
    const backButton = document.querySelector('.full-screen-modal-header-back')
    expect(backButton).not.toBeNull()
    backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })
})


describe('cycle reminder selection', () => {
  it('selects all eligible rows across pages without a 500-row truncation', async () => {
    const all = Array.from({ length: 601 }, (_, index) => ({ ...result().items[0], task_id: index + 1, selectable: index !== 0 }))
    const provider = vi.fn().mockImplementation(async query => ({ ...result(), items: all.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: all.length }))
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider, mode: 'cycle-remind', selectAllAvailable: true } })
    await flushPromises()
    expect(wrapper.text()).toContain('已选择 600 条')
    expect(wrapper.find('tbody input[type="checkbox"]').attributes('disabled')).toBeDefined()
    await wrapper.get('.selection-bar__clear').trigger('click')
    await flushPromises()
    expect(wrapper.getComponent({ name: 'PerformanceManagementTable' }).props('selectedKeys')).toEqual([])
    wrapper.unmount()
  })

  it('defaults cycle-remind mode to all eligible selections without an explicit prop', async () => {
    const all = Array.from({ length: 151 }, (_, index) => ({ ...result().items[0], task_id: index + 1, selectable: index !== 0 }))
    const provider = vi.fn().mockImplementation(async query => ({ ...result(), items: all.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: all.length }))
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider, mode: 'cycle-remind' } })
    await flushPromises()
    expect(wrapper.text()).toContain('已选择 150 条')
    expect(wrapper.get('.selection-bar .performance-button--primary').text()).toBe('催办')
    await wrapper.get('.selection-bar__clear').trigger('click')
    await flushPromises()
    expect(wrapper.getComponent({ name: 'PerformanceManagementTable' }).props('selectedKeys')).toEqual([])
    await wrapper.findAll('tbody input[type="checkbox"]')[1].setValue(true)
    expect(wrapper.get('.selection-bar').text()).toContain('已选择 1 条')
    expect(wrapper.get('.selection-bar .performance-button--primary').text()).toBe('催办')
    const table = wrapper.getComponent({ name: 'PerformanceManagementTable' })
    table.vm.$emit('page-change', 2)
    await flushPromises()
    expect(table.props('selectedKeys')).toEqual(['2'])
    expect(wrapper.get('.selection-bar').text()).toContain('已选择 1 条')
    wrapper.unmount()
  })

  it('hides delegation buttons for self-review, 360 and calibration reminder nodes even when the provider allows them', async () => {
    const api = await import('@/api/performance')
    const people = vi.spyOn(api.projectManagementApi, 'reminderPeople').mockResolvedValue({ items: [result().items[0] as ProjectManagementReminderPerson], total: 1, page: 1, page_size: 50 })
    const wrapper = mount(PerformanceReminderPanel, {
      props: { context: { ...context, nodeId: 'review-360', nodeType: 'evaluation', reviewType: '360_review', title: '360°反馈', sectionTitle: '未完成的被评估人' }, mode: 'cycle-remind', selectAllAvailable: true },
    })
    await flushPromises()
    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    expect(wrapper.find('.selection-bar .performance-button--primary').text()).toBe('催办')
    expect(wrapper.findAll('.selection-bar button').filter(button => /授权他人处理|转交他人处理/.test(button.text()))).toHaveLength(0)
    wrapper.unmount(); people.mockRestore()
  })

  it('keeps delegation buttons for manager review and communicate reminder nodes', async () => {
    const api = await import('@/api/performance')
    const people = vi.spyOn(api.projectManagementApi, 'reminderPeople').mockResolvedValue({ items: [{ ...result().items[0], can_authorize: true } as ProjectManagementReminderPerson], total: 1, page: 1, page_size: 50 })
    const wrapper = mount(PerformanceReminderPanel, {
      props: { context: { ...context, nodeId: 'manager-review', nodeType: 'evaluation', reviewType: 'leader_review', title: '上级评估', sectionTitle: '未完成的被评估人' }, mode: 'cycle-remind', selectAllAvailable: true },
    })
    await flushPromises()
    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    expect(wrapper.get('.selection-bar').text()).toContain('授权他人处理')
    expect(wrapper.get('.selection-bar').text()).toContain('转交他人处理')
    wrapper.unmount(); people.mockRestore()
  })

  it('reports preview-only reminders as recorded without claiming delivery', async () => {
    const api = await import('@/api/performance')
    const sending = vi.spyOn(api.projectManagementApi, 'remindCycleTasks').mockResolvedValue({ accepted_task_ids: [], skipped_task_ids: [], preview_task_ids: [11], failed_task_ids: [], delivery_status: 'preview_only', errors: [{ error: 'NOTIFICATION_PREVIEW_ONLY' }] })
    const provider = vi.fn().mockResolvedValue(result())
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider, mode: 'cycle-remind', selectAllAvailable: true } })
    await flushPromises()
    await wrapper.get('.selection-bar .performance-button--primary').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('.performance-confirm-dialog--submit .performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(wrapper.text()).toContain('测试模式：已记录 1 条，未发送飞书通知')
    expect(wrapper.text()).not.toContain('催办已发送')
    expect(wrapper.getComponent({ name: 'PerformanceManagementTable' }).props('selectedKeys')).toEqual([])
    wrapper.unmount(); sending.mockRestore()
  })

  it('retains only failed task selection and displays partial delivery results', async () => {
    const api = await import('@/api/performance')
    const sending = vi.spyOn(api.projectManagementApi, 'remindCycleTasks').mockResolvedValue({ accepted_task_ids: [11], skipped_task_ids: [], failed_task_ids: [12], delivery_status: 'partial_success' })
    const provider = vi.fn().mockResolvedValue({ ...result(), items: [result().items[0], { ...result().items[0], task_id: 12 }], total: 2 })
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider, mode: 'cycle-remind', selectAllAvailable: true } })
    await flushPromises()
    await wrapper.get('.selection-bar .performance-button--primary').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('.performance-confirm-dialog--submit .performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(sending).toHaveBeenCalledWith(1, 'evaluation-1', [11, 12], undefined, false)
    expect(wrapper.text()).toContain('催办部分发送成功')
    expect(wrapper.text()).toContain('已选择 1 条')
    wrapper.unmount()
    sending.mockRestore()
  })

  it('renders the submit confirm dialog with an InfoFilled icon and passes the skip-recently-reminded checkbox to the API', async () => {
    const api = await import('@/api/performance')
    const sending = vi.spyOn(api.projectManagementApi, 'remindCycleTasks').mockResolvedValue({ accepted_task_ids: [11], skipped_task_ids: [], failed_task_ids: [], delivery_status: 'success' })
    const provider = vi.fn().mockResolvedValue(result())
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider, mode: 'cycle-remind', selectAllAvailable: true } })
    await flushPromises()
    await wrapper.get('.selection-bar .performance-button--primary').trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('.performance-confirm-dialog--submit') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.querySelector('[data-icon="InfoFilled"]')).not.toBeNull()
    expect(dialog.textContent).toContain('确定催办吗？')
    expect(dialog.textContent).toContain('催办后，系统将向催办对象发送飞书通知。')
    expect(dialog.textContent).toContain('6 小时内已被催办过该环节的人员不再发送通知')
    const checkbox = dialog.querySelector('.ud__checkbox__input') as HTMLInputElement
    expect(checkbox).not.toBeNull()
    checkbox.click()
    await flushPromises()
    ;(dialog.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(sending).toHaveBeenCalledWith(1, 'evaluation-1', [11], undefined, true)
    wrapper.unmount(); sending.mockRestore()
  })
})


describe('shared task delegation dialog', () => {
  it('loads candidates and persists authorization to the selected task', async () => {
    const { default: Dialog } = await import('./PerformanceTaskDelegationDialog.vue')
    const { default: Select } = await import('./PerformanceSearchSelect.vue')
    const api = await import('@/api/performance')
    const candidates = vi.spyOn(api.projectManagementApi, 'delegationCandidates').mockResolvedValue([{ employee_no: 'R1', display_name: '接收人一' }])
    const authorizing = vi.spyOn(api.projectManagementApi, 'authorizeTask').mockResolvedValue({ id: 1, task_id: 11, status: 'ACTIVE' })
    const wrapper = mount(Dialog, { props: { modelValue: false, action: 'AUTHORIZE', tasks: [{ task_id: 11, project_id: 3 }] }, global: { stubs: { teleport: true } } })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(candidates).toHaveBeenCalledWith(3, 11)
    wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R1')
    await wrapper.get('textarea').setValue('临时授权')
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(authorizing).toHaveBeenCalledWith(3, 11, 'AUTHORIZE', 'R1', '临时授权')
    expect(wrapper.emitted('completed')).toEqual([[1, '']])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount(); candidates.mockRestore(); authorizing.mockRestore()
  })

  it('blocks resubmission after a partially completed transfer batch', async () => {
    const { default: Dialog } = await import('./PerformanceTaskDelegationDialog.vue')
    const { default: Select } = await import('./PerformanceSearchSelect.vue')
    const api = await import('@/api/performance')
    const candidates = vi.spyOn(api.projectManagementApi, 'delegationCandidates').mockResolvedValue([{ employee_no: 'R1', display_name: '接收人一' }])
    const authorizing = vi.spyOn(api.projectManagementApi, 'authorizeTask').mockResolvedValueOnce({ id: 1, task_id: 11, status: 'ACTIVE' }).mockRejectedValueOnce(new Error('unconfirmed'))
    const wrapper = mount(Dialog, { props: { modelValue: false, action: 'TRANSFER', tasks: [{ task_id: 11, project_id: 3 }, { task_id: 12, project_id: 3 }] }, global: { stubs: { teleport: true } } })
    await wrapper.setProps({ modelValue: true }); await flushPromises()
    wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R1')
    await wrapper.get('textarea').setValue('任务转交')
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('已处理 1 项')
    expect(wrapper.get('.performance-dialog__footer .performance-button--primary').attributes('disabled')).toBeDefined()
    expect(authorizing).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('completed')).toEqual([[1, '']])
    wrapper.unmount(); candidates.mockRestore(); authorizing.mockRestore()
  })
})
