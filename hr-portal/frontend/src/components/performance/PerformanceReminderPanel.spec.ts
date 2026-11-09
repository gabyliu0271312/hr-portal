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
    expect(wrapper.findAll('.ui-table thead th').map(cell => cell.text().trim())).toEqual(['', '被评估人', '状态'])

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

  it('reuses the member-list delegation dialog with its complete task contract', async () => {
    const api = await import('@/api/performance')
    const taskMap = [
      { task_id: 11, stage_key: 'manager-review', stage_label: '上级评估', role_key: 'DIRECT_SUPERVISOR', role_label: '直属上级', handler_ref: 'M1', can_authorize: true },
      { task_id: 12, stage_key: 'communicate', stage_label: '绩效沟通并开通结果', role_key: 'DIRECT_SUPERVISOR', role_label: '直属上级', handler_ref: 'M1', can_authorize: true },
    ]
    const people = vi.spyOn(api.projectManagementApi, 'reminderPeople').mockResolvedValue({ items: [
      { ...result().items[0], can_authorize: true, task_map: taskMap } as ProjectManagementReminderPerson,
      { ...result().items[0], task_id: 12, can_authorize: true, task_map: taskMap } as ProjectManagementReminderPerson,
    ], total: 2, page: 1, page_size: 50 })
    const wrapper = mount(PerformanceReminderPanel, {
      props: { context: { ...context, nodeId: 'manager-review', nodeType: 'evaluation', reviewType: 'leader_review', title: '上级评估', sectionTitle: '未完成的被评估人' }, mode: 'cycle-remind', selectAllAvailable: true },
      global: {
        stubs: {
          PerformanceTaskDelegationDialog: {
            name: 'PerformanceTaskDelegationDialog',
            props: ['modelValue', 'action', 'tasks'],
            template: '<div class="delegation-dialog-stub" />',
          },
        },
      },
    })
    await flushPromises()
    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    expect(wrapper.get('.selection-bar').text()).toContain('授权他人处理')
    expect(wrapper.get('.selection-bar').text()).toContain('转交他人处理')
    await wrapper.findAll('.selection-bar button').find(button => button.text() === '授权他人处理')!.trigger('click')
    await flushPromises()
    const dialog = wrapper.getComponent({ name: 'PerformanceTaskDelegationDialog' })
    expect(dialog.props('action')).toBe('AUTHORIZE')
    expect(dialog.props('tasks')).toEqual([{
      task_id: 11,
      project_id: 3,
      employee_no: 'E001',
      display_name: '张三',
      can_authorize: true,
      task_map: taskMap,
    }])
    wrapper.unmount(); people.mockRestore()
  })

  it('never shows test-mode hints and treats legacy preview responses as failures', async () => {
    const api = await import('@/api/performance')
    const sending = vi.spyOn(api.projectManagementApi, 'remindCycleTasks').mockResolvedValue({ accepted_task_ids: [], skipped_task_ids: [], preview_task_ids: [11], failed_task_ids: [], delivery_status: 'preview_only', errors: [{ error: 'NOTIFICATION_PREVIEW_ONLY' }] })
    const provider = vi.fn().mockResolvedValue(result())
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider, mode: 'cycle-remind', selectAllAvailable: true } })
    await flushPromises()
    await wrapper.get('.selection-bar .performance-button--primary').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('.performance-confirm-dialog--submit .performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(wrapper.text()).not.toContain('测试模式')
    expect(wrapper.text()).not.toContain('未发送飞书通知')
    expect(wrapper.text()).toContain('催办发送失败')
    expect(wrapper.getComponent({ name: 'PerformanceManagementTable' }).props('selectedKeys')).toEqual([])
    wrapper.unmount(); sending.mockRestore()
  })

  it('reports a real-style success delivery as sent', async () => {
    const api = await import('@/api/performance')
    const sending = vi.spyOn(api.projectManagementApi, 'remindCycleTasks').mockResolvedValue({ accepted_task_ids: [11], skipped_task_ids: [], failed_task_ids: [], delivery_status: 'success' })
    const provider = vi.fn().mockResolvedValue(result())
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider, mode: 'cycle-remind', selectAllAvailable: true } })
    await flushPromises()
    await wrapper.get('.selection-bar .performance-button--primary').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('.performance-confirm-dialog--submit .performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(wrapper.text()).toContain('催办已发送：1 条，跳过 0 条')
    expect(wrapper.text()).not.toContain('测试模式')
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
    await flushPromises()
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(authorizing).not.toHaveBeenCalled()
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('确定授权吗?')
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click')
    await flushPromises()
    expect(authorizing).toHaveBeenCalledWith(3, 11, 'AUTHORIZE', 'R1', '', expect.objectContaining({ notify_original: true, idempotency_key: expect.any(String) }))
    expect(wrapper.emitted('completed')).toEqual([[1, '', 1, 0]])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount(); candidates.mockRestore(); authorizing.mockRestore()
  })

  it('blocks resubmission after a partially completed transfer batch', async () => {
    const { default: Dialog } = await import('./PerformanceTaskDelegationDialog.vue')
    const { default: Select } = await import('./PerformanceSearchSelect.vue')
    const api = await import('@/api/performance')
    const candidates = vi.spyOn(api.projectManagementApi, 'delegationCandidatesBatch').mockResolvedValue([
      { project_id: 3, task_id: 11, candidates: [{ employee_no: 'R1', display_name: '接收人一' }] },
      { project_id: 3, task_id: 12, candidates: [{ employee_no: 'R1', display_name: '接收人一' }] },
    ])
    const authorizing = vi.spyOn(api.projectManagementApi, 'authorizeTask').mockResolvedValueOnce({ id: 1, task_id: 11, status: 'ACTIVE' }).mockRejectedValueOnce(new Error('unconfirmed'))
    const wrapper = mount(Dialog, { props: { modelValue: false, action: 'TRANSFER', tasks: [{ task_id: 11, project_id: 3 }, { task_id: 12, project_id: 3 }] }, global: { stubs: { teleport: true } } })
    await wrapper.setProps({ modelValue: true }); await flushPromises()
    wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R1')
    await flushPromises()
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click'); await flushPromises()
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('已处理 1 项')
    expect(wrapper.get('.performance-dialog__footer .performance-button--primary').attributes('disabled')).toBeDefined()
    expect(authorizing).toHaveBeenCalledTimes(2)
    expect(wrapper.emitted('completed')).toBeUndefined()
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    await wrapper.setProps({ tasks: [{ task_id: 11, project_id: 3 }, { task_id: 12, project_id: 3 }] }); await flushPromises()
    expect(wrapper.text()).toContain('已处理 1 项')
    expect(wrapper.get('.performance-dialog__footer .performance-button--primary').attributes('disabled')).toBeDefined()
    expect(authorizing).toHaveBeenCalledTimes(2)
    wrapper.unmount(); candidates.mockRestore(); authorizing.mockRestore()
  })

  it('groups stages across people, preserves project task identities and skips forbidden tasks', async () => {
    const { default: Dialog } = await import('./PerformanceTaskDelegationDialog.vue')
    const { default: Select } = await import('./PerformanceSearchSelect.vue')
    const { default: Checkbox } = await import('./PerformanceCheckbox.vue')
    const { projectManagementApi } = await import('@/api/performance')
    const candidates = vi.spyOn(projectManagementApi, 'delegationCandidates').mockResolvedValue([{ employee_no: 'R1', display_name: '接收人' }])
    const authorizing = vi.spyOn(projectManagementApi, 'authorizeTask').mockResolvedValue({ id: 1, task_id: 11, status: 'ACTIVE' })
    const option = (task_id: number, stage_id = 'node-a', can_authorize = true) => ({ task_id, stage_id, stage_key: 'manager-review', stage_label: '上级评估', role_key: 'DIRECT_SUPERVISOR', role_label: '直属上级', handler_ref: 'M1', can_authorize })
    const wrapper = mount(Dialog, { props: { modelValue: true, action: 'AUTHORIZE', tasks: [
      { task_id: 0, project_id: 3, employee_no: 'E1', display_name: '成员一', task_map: [option(11), option(12, 'node-b')] },
      { task_id: 0, project_id: 4, employee_no: 'E2', display_name: '成员二', task_map: [option(11), option(13, 'node-a', false)] },
    ] }, global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(wrapper.findAll('.reviewee-tags .member-identity')).toHaveLength(2)
    expect(wrapper.findAll('.delegation-stages__roles button').map(button => button.text())).toEqual(['直属上级'])
    expect(wrapper.findAllComponents(Checkbox)).toHaveLength(2)
    wrapper.findAllComponents(Checkbox)[0].vm.$emit('update:modelValue', true)
    await flushPromises()
    wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R1'); await flushPromises()
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click'); await flushPromises()
    expect(authorizing).not.toHaveBeenCalled()
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click'); await flushPromises()
    expect(authorizing.mock.calls.map(call => call.slice(0, 2))).toEqual([[3, 11], [4, 11]])
    wrapper.unmount(); candidates.mockRestore(); authorizing.mockRestore()
  })

  it('clears stage selection on role changes and does not write when confirmation is cancelled', async () => {
    const { default: Dialog } = await import('./PerformanceTaskDelegationDialog.vue')
    const { default: Select } = await import('./PerformanceSearchSelect.vue')
    const { default: Checkbox } = await import('./PerformanceCheckbox.vue')
    const { default: Switch } = await import('../ui/UiSwitch.vue')
    const { projectManagementApi } = await import('@/api/performance')
    const candidates = vi.spyOn(projectManagementApi, 'delegationCandidates').mockResolvedValue([{ employee_no: 'R1', display_name: '接收人' }])
    const authorizing = vi.spyOn(projectManagementApi, 'authorizeTask').mockResolvedValue({ id: 1, task_id: 11, status: 'ACTIVE' })
    const wrapper = mount(Dialog, { props: { modelValue: true, action: 'TRANSFER', tasks: [{ task_id: 11, project_id: 3, task_map: [
      { task_id: 11, stage_id: 'node-a', stage_key: 'manager-review', stage_label: '上级评估', role_key: 'DIRECT_SUPERVISOR', role_label: '直属上级', handler_ref: 'M1', can_authorize: true },
      { task_id: 12, stage_id: 'node-b', stage_key: 'result-reconsideration', stage_label: '结果复议处理', role_key: 'HRBP', role_label: 'HRBP', handler_ref: 'H1', can_authorize: true },
    ] }] }, global: { stubs: { teleport: true } } })
    await flushPromises()
    wrapper.getComponent(Checkbox).vm.$emit('update:modelValue', true); await flushPromises()
    await wrapper.findAll('.delegation-stages__roles button')[1].trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('HRBP执行的任务')
    expect(wrapper.getComponent(Checkbox).props('modelValue')).toBe(false)
    await wrapper.findAll('.delegation-stages__roles button')[0].trigger('click'); await flushPromises()
    expect(wrapper.getComponent(Checkbox).props('modelValue')).toBe(false)
    wrapper.getComponent(Checkbox).vm.$emit('update:modelValue', true); await flushPromises()
    wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R1')
    wrapper.getComponent(Switch).vm.$emit('update:modelValue', false); await flushPromises()
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click'); await flushPromises()
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('确定转交吗?')
    await wrapper.get('.performance-confirm-dialog__button--cancel').trigger('click'); await flushPromises()
    expect(authorizing).not.toHaveBeenCalled()
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click'); await flushPromises()
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click'); await flushPromises()
    expect(authorizing).toHaveBeenCalledWith(3, 11, 'TRANSFER', 'R1', '', expect.objectContaining({ notify_original: false, idempotency_key: expect.any(String) }))
    wrapper.unmount(); candidates.mockRestore(); authorizing.mockRestore()
  })

  it('defaults to the first actionable dynamic role and submits only a selected original handler', async () => {
    const { default: Dialog } = await import('./PerformanceTaskDelegationDialog.vue')
    const { default: Select } = await import('./PerformanceSearchSelect.vue')
    const { default: Checkbox } = await import('./PerformanceCheckbox.vue')
    const { projectManagementApi } = await import('@/api/performance')
    const person = { employee_no: 'R1', display_name: '接收人' }
    const candidates = vi.spyOn(projectManagementApi, 'delegationCandidates').mockResolvedValue([person])
    const batch = vi.spyOn(projectManagementApi, 'delegationCandidatesBatch').mockResolvedValue([11, 12].map(task_id => ({ project_id: 3, task_id, candidates: [person] })))
    const authorizing = vi.spyOn(projectManagementApi, 'authorizeTask').mockResolvedValue({ id: 1, task_id: 12, status: 'ACTIVE' })
    const task = (task_id: number, role_key = 'CUSTOM', can_authorize = true) => ({ task_id, stage_id: 'n1', stage_key: 'manager-review', stage_label: '上级评估', role_key, role_label: role_key === 'CUSTOM' ? '自定义角色' : '不可操作角色', handler_ref: `M${task_id}`, handler_name: `原执行人${task_id}`, can_authorize })
    const wrapper = mount(Dialog, { props: { modelValue: true, action: 'AUTHORIZE', tasks: [{ task_id: 0, project_id: 3, employee_no: 'E1', task_map: [task(10, 'BLOCKED', false), task(11), task(12)] }] }, global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(wrapper.findAll('.delegation-stages__roles button').map(button => button.text())).toEqual(['不可操作角色', '自定义角色'])
    expect(wrapper.get('.delegation-stages__roles button[aria-pressed="true"]').text()).toBe('自定义角色')
    wrapper.getComponent(Checkbox).vm.$emit('update:modelValue', true); await flushPromises()
    expect(wrapper.text()).toContain('至少一人')
    expect(wrapper.text()).toContain('原执行人12')
    wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R1'); await flushPromises()
    expect(wrapper.get('.performance-dialog__footer .performance-button--primary').attributes('disabled')).toBeDefined()
    wrapper.findAllComponents(Checkbox)[2].vm.$emit('update:modelValue', true); await flushPromises()
    wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R1'); await flushPromises()
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click'); await flushPromises()
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click'); await flushPromises()
    expect(authorizing.mock.calls.map(call => call.slice(0, 2))).toEqual([[3, 12]])
    wrapper.unmount(); candidates.mockRestore(); batch.mockRestore(); authorizing.mockRestore()
  })

  it('retains every overlapping role for the same task while deduplicating actual submissions', async () => {
    const { default: Dialog } = await import('./PerformanceTaskDelegationDialog.vue')
    const { default: Select } = await import('./PerformanceSearchSelect.vue')
    const { default: Checkbox } = await import('./PerformanceCheckbox.vue')
    const { projectManagementApi } = await import('@/api/performance')
    const candidates = vi.spyOn(projectManagementApi, 'delegationCandidates').mockResolvedValue([{ employee_no: 'R1', display_name: '接收人' }])
    const authorizing = vi.spyOn(projectManagementApi, 'authorizeTask').mockResolvedValue({ id: 1, task_id: 11, status: 'ACTIVE' })
    const taskMap = ['DIRECT_SUPERVISOR', 'HRBP', 'SPECIFIED_PERSON'].map(role_key => ({ task_id: 11, stage_key: 'evaluation', stage_label: '上级评估', role_key, role_label: role_key, handler_ref: 'BOTH', can_authorize: true }))
    const target = { task_id: 11, project_id: 3, employee_no: 'E1', task_map: taskMap }
    const wrapper = mount(Dialog, { props: { modelValue: true, action: 'AUTHORIZE', tasks: [target, { ...target }] }, global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(wrapper.findAll('.delegation-stages__roles button').map(button => button.text())).toEqual(['DIRECT_SUPERVISOR', 'HRBP', 'SPECIFIED_PERSON'])
    for (let index = 0; index < 3; index++) {
      await wrapper.findAll('.delegation-stages__roles button')[index].trigger('click'); await flushPromises()
      expect(wrapper.get('.delegation-stages__roles button[aria-pressed="true"]').text()).toBe(taskMap[index].role_key)
      expect(wrapper.findAllComponents(Checkbox)).toHaveLength(1)
      expect(wrapper.getComponent(Checkbox).props('modelValue')).toBe(false)
      wrapper.getComponent(Checkbox).vm.$emit('update:modelValue', true); await flushPromises()
    }
    wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R1'); await flushPromises()
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click'); await flushPromises()
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click'); await flushPromises()
    expect(authorizing).toHaveBeenCalledTimes(1)
    expect(authorizing.mock.calls[0].slice(0, 2)).toEqual([3, 11])
    wrapper.unmount(); candidates.mockRestore(); authorizing.mockRestore()
  })

  it.each([false, true])('requires a no-origin decision and submits authorize=%s without filtering negative appeal task IDs', async authorize => {
    const { default: Dialog } = await import('./PerformanceTaskDelegationDialog.vue')
    const { default: Select } = await import('./PerformanceSearchSelect.vue')
    const { default: Checkbox } = await import('./PerformanceCheckbox.vue')
    const { projectManagementApi } = await import('@/api/performance')
    const candidates = vi.spyOn(projectManagementApi, 'delegationCandidates').mockResolvedValue([{ employee_no: 'R1', display_name: '接收人' }])
    const taskId = authorize ? -11 : 11
    const authorizing = vi.spyOn(projectManagementApi, 'authorizeTask').mockResolvedValue(authorize ? { id: 1, task_id: taskId, status: 'ACTIVE' } : { task_id: taskId, skipped: true })
    const tasks = [{ task_id: 0, project_id: 3, employee_no: 'E1', display_name: '张三', task_map: [{ task_id: taskId, stage_key: 'evaluation', stage_label: '上级评估', role_key: 'CUSTOM', role_label: '项目角色', handler_ref: '', can_authorize: true }] }]
    const wrapper = mount(Dialog, { props: { modelValue: true, action: 'AUTHORIZE', tasks }, global: { stubs: { teleport: true } } })
    await flushPromises()
    wrapper.getComponent(Checkbox).vm.$emit('update:modelValue', true); await flushPromises()
    wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R1'); await flushPromises()
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click'); await flushPromises()
    const confirmation = wrapper.get('[role="alertdialog"]')
    for (const text of ['1 名被评估人', '张三', '上级评估', '项目角色', '接收人']) expect(confirmation.text()).toContain(text)
    expect(confirmation.get('.performance-confirm-dialog__button--danger').attributes('disabled')).toBeDefined()
    const choice = authorize ? 'AUTHORIZE' : 'SKIP'
    await confirmation.get(`input[value="${choice}"]`).setValue(true); await flushPromises()
    expect(wrapper.getComponent({ name: 'PerformanceDelegationNoOriginChoice' }).props('modelValue')).toBe(choice)
    expect(wrapper.get('.performance-confirm-dialog__button--danger').attributes('disabled')).toBeUndefined()
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click'); await flushPromises()
    expect(authorizing).toHaveBeenCalledWith(3, taskId, 'AUTHORIZE', 'R1', '', expect.objectContaining({ no_origin_reviewer_authorize: authorize }))
    expect(wrapper.emitted('completed')?.[0]).toEqual([authorize ? 1 : 0, '', authorize ? 1 : undefined, authorize ? 0 : 1])
    expect(wrapper.text()).toContain(`跳过 ${authorize ? 0 : 1} 项`)
    await wrapper.setProps({ action: 'TRANSFER' }); await flushPromises()
    expect(wrapper.getComponent(Checkbox).props('disabled')).toBe(true)
    expect(wrapper.get('.performance-dialog__footer .performance-button--primary').attributes('disabled')).toBeDefined()
    wrapper.unmount(); candidates.mockRestore(); authorizing.mockRestore()
  })

  it('retains the unknown request body and key through close, reopen and changed task props without resending successes', async () => {
    const { default: Dialog } = await import('./PerformanceTaskDelegationDialog.vue')
    const { default: Select } = await import('./PerformanceSearchSelect.vue')
    const { projectManagementApi } = await import('@/api/performance')
    const person = { employee_no: 'R1', display_name: '接收人' }
    const candidates = vi.spyOn(projectManagementApi, 'delegationCandidatesBatch').mockResolvedValue([11, 12].map(task_id => ({ project_id: 3, task_id, candidates: [person] })))
    const authorizing = vi.spyOn(projectManagementApi, 'authorizeTask').mockResolvedValueOnce({ id: 1, task_id: 11, status: 'ACTIVE' }).mockRejectedValueOnce(new Error('unknown')).mockResolvedValueOnce({ id: 2, task_id: 12, status: 'ACTIVE' })
    const wrapper = mount(Dialog, { props: { modelValue: true, action: 'TRANSFER', tasks: [{ task_id: 11, project_id: 3, employee_no: 'E1', display_name: '原被评估人' }, { task_id: 12, project_id: 3, employee_no: 'E1', display_name: '原被评估人' }] }, global: { stubs: { teleport: true } } })
    await flushPromises()
    wrapper.getComponent(Select).vm.$emit('update:modelValue', 'R1'); await flushPromises()
    await wrapper.get('.performance-dialog__footer .performance-button--primary').trigger('click'); await flushPromises()
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click'); await flushPromises()
    const unknownCall = authorizing.mock.calls[1]
    await wrapper.setProps({ modelValue: false }); await flushPromises()
    await wrapper.setProps({ tasks: [{ task_id: 12, project_id: 3, employee_no: 'E2', display_name: '新对象' }], modelValue: true }); await flushPromises()
    expect(authorizing).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.retry-details').text()).toContain('转交')
    expect(wrapper.get('.retry-details').text()).toContain('原被评估人')
    expect(wrapper.get('.retry-details').text()).toContain('接收人（R1）')
    expect(wrapper.get('.retry-details').text()).toContain('3:12')
    expect(wrapper.get('.retry-details').text()).not.toContain('新对象')
    expect(wrapper.get('.performance-dialog__footer .performance-button--primary').attributes('disabled')).toBeDefined()
    await wrapper.findAll('button').find(button => button.text() === '重试未确认项')!.trigger('click'); await flushPromises()
    expect(authorizing).toHaveBeenCalledTimes(3)
    expect(authorizing.mock.calls[2]).toEqual(unknownCall)
    expect(authorizing.mock.calls.filter(call => call[1] === 11)).toHaveLength(1)
    expect(wrapper.emitted('completed')?.[0][0]).toBe(2)
    wrapper.unmount(); candidates.mockRestore(); authorizing.mockRestore()
  })

  it('uses a new key when the recipient or options change while preserving the original unknown retry', async () => {
    const { useTaskDelegationRequests } = await import('./useTaskDelegationRequests')
    const { projectManagementApi } = await import('@/api/performance')
    const authorizing = vi.spyOn(projectManagementApi, 'authorizeTask').mockRejectedValue(new Error('unknown'))
    const requests = useTaskDelegationRequests(vi.fn(), vi.fn())
    const request = { project_id: 3, task_id: 11, action: 'AUTHORIZE' as const, recipient: 'R1', options: { notify_original: true } }
    await requests.submit([request])
    const original = authorizing.mock.calls[0]
    await requests.submit([{ ...request, recipient: 'R2' }])
    await requests.submit([{ ...request, options: { notify_original: false } }])
    expect(new Set(authorizing.mock.calls.map(call => call[5]?.idempotency_key)).size).toBe(3)
    await requests.submit([request])
    expect(authorizing.mock.calls[3]).toEqual(original)
    authorizing.mockRestore()
  })

  it('does not fall back to a whole task when the supplied task map is empty', async () => {
    const { default: Dialog } = await import('./PerformanceTaskDelegationDialog.vue')
    const { projectManagementApi } = await import('@/api/performance')
    const candidates = vi.spyOn(projectManagementApi, 'delegationCandidates')
    const wrapper = mount(Dialog, { props: { modelValue: true, action: 'AUTHORIZE', tasks: [{ task_id: 11, project_id: 3, task_map: [] }] }, global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(candidates).not.toHaveBeenCalled()
    expect(wrapper.get('.performance-dialog__footer .performance-button--primary').attributes('disabled')).toBeDefined()
    wrapper.unmount(); candidates.mockRestore()
  })
})
