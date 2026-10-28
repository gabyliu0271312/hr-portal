import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PerformanceReminderPanel from './PerformanceReminderPanel.vue'
import PerformanceTaskOverlay from './PerformanceTaskOverlay.vue'
import PerformanceExportButton from './PerformanceExportButton.vue'
import PerformanceColumnVisibilityDrawer from './PerformanceColumnVisibilityDrawer.vue'
import type { ReminderListResult } from './performanceReminder'

const result = (): ReminderListResult => ({
  items: [{ task_id: 11, aggregate_task_id: 11, employee_no: 'E001', display_name: '张三', job_family: '产品', job_category: '策划', job_sequence: '产品-策划', position_level: 'P6', hire_date: '2020-01-01', department: '产品中心', employee_type: '正式员工', employment_status: '在职', status: 'pending', due_at: '2026-09-30T00:00:00Z' }],
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
    expect(wrapper.find('.performance-search-input input').attributes('placeholder')).toBe('搜索成员')
    expect(wrapper.findAll('.performance-task-table thead th').map(cell => cell.text())).toEqual(['全选被评估人', '被评估人', '状态'])

    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    expect(wrapper.find('.performance-selection-action-bar').text()).toContain('已选择 1 条')
    expect(wrapper.find('.performance-selection-action-bar .performance-button--primary').attributes('disabled')).toBeUndefined()
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
    await wrapper.get('.performance-selection-action-bar .performance-button--primary').trigger('click')
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
    expect(wrapper.find('.performance-selection-action-bar').exists()).toBe(false)
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

    await wrapper.find('.performance-selection-action-bar .performance-button--primary').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('催办请求提交失败')
    expect(wrapper.text()).toContain('已选择 1 条')
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
