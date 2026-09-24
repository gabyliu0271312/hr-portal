import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PerformanceReminderPanel from './PerformanceReminderPanel.vue'
import PerformanceTaskOverlay from './PerformanceTaskOverlay.vue'
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
    expect(wrapper.find('.performance-selection-action-bar button.primary').attributes('disabled')).toBeUndefined()
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ context, page: 1, pageSize: 50 }))
  })

  it('keeps selection and reports failed reminder requests', async () => {
    const provider = vi.fn().mockResolvedValue(result())
    const wrapper = mount(PerformanceReminderPanel, { props: { context, provider } })
    await flushPromises()
    await wrapper.find('tbody input[type="checkbox"]').setValue(true)
    const api = await import('@/api/performance')
    vi.spyOn(api.projectManagementApi, 'remindTasks').mockRejectedValueOnce(new Error('failed'))

    await wrapper.find('.performance-selection-action-bar button.primary').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('催办请求提交失败')
    expect(wrapper.text()).toContain('已选择 1 条')
    vi.restoreAllMocks()
  })
})

describe('PerformanceTaskOverlay', () => {
  it('renders a full-screen task shell and closes from the header back action', async () => {
    const wrapper = mount(PerformanceTaskOverlay, { props: { modelValue: true, title: '上级评估' }, slots: { default: '<p>content</p>' } })
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
