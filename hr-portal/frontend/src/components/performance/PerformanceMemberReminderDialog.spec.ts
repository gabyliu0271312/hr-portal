import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceMemberReminderDialog from './PerformanceMemberReminderDialog.vue'
import { projectManagementApi } from '@/api/performance'

const context = {
  projectId: 3,
  cycleId: 1,
  nodeId: 'evaluation-1',
  nodeType: 'evaluation',
  reviewType: 'member-remind',
  title: '张三 · 催办',
  sectionTitle: '未完成的任务',
  employeeNo: 'E001',
  reminderTarget: '直属上级',
  sourceTaskId: 11,
  targetTaskId: 71,
}
const preview = {
  title: '绩效任务提醒',
  description: '请尽快前往绩效系统为@张三完成上级评估。',
  stage_label: '上级评估',
  deadline_at: '2026-09-30T00:00:00Z',
  cycle_name: '2026 H2',
  cycle_start_at: '2026-07-01T00:00:00Z',
  cycle_end_at: '2026-12-31T00:00:00Z',
  reminder_name: '当前操作者',
  reminder_target: '直属上级',
  stage_type: '上级评估',
  assessee_name: '张三',
}

function mountDialog() {
  return mount(PerformanceMemberReminderDialog, { attachTo: document.body, props: { modelValue: true, context } })
}

beforeEach(() => {
  vi.spyOn(projectManagementApi, 'memberReminderPreview').mockResolvedValue(preview)
  vi.spyOn(projectManagementApi, 'memberRemind').mockResolvedValue({ accepted_task_ids: [71], skipped_task_ids: [], failed_task_ids: [], delivery_status: 'success' })
})
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('PerformanceMemberReminderDialog', () => {
  it('cancels without preview or POST and restores the body lock', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    expect(document.body.style.overflow).toBe('hidden')
    document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--cancel')!.click()
    await wrapper.setProps({ modelValue: false })
    await flushPromises()
    expect(projectManagementApi.memberReminderPreview).not.toHaveBeenCalled()
    expect(projectManagementApi.memberRemind).not.toHaveBeenCalled()
    expect(document.body.style.overflow).toBe('')
    wrapper.unmount()
  })

  it('loads preview on hover with the single target and never posts', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const trigger = document.querySelector<HTMLElement>('.performance-member-reminder-dialog__preview-trigger')!
    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await flushPromises()
    expect(projectManagementApi.memberReminderPreview).toHaveBeenCalledWith(3, 'E001', { node_id: 'evaluation-1', task_id: 71, source_task_id: 11 })
    expect(document.body.querySelector('.reminder-preview-card')).not.toBeNull()
    expect(projectManagementApi.memberRemind).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('uses the preview recipient rather than the sender name when no explicit recipient exists', async () => {
    const wrapper = mount(PerformanceMemberReminderDialog, { attachTo: document.body, props: { modelValue: true, context: { ...context, reminderTarget: undefined } } })
    const trigger = document.querySelector<HTMLElement>('.performance-member-reminder-dialog__preview-trigger')!
    trigger.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelector('.performance-confirm-dialog__body')?.textContent).toContain('直属上级')
    wrapper.unmount()
  })

  it('confirms one task with source and six-hour options', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const checkbox = document.querySelector<HTMLInputElement>('.performance-confirm-dialog .ud__checkbox__input')!
    checkbox.click()
    document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
    await flushPromises()
    expect(projectManagementApi.memberRemind).toHaveBeenCalledWith(3, 'E001', { node_id: 'evaluation-1', task_id: 71, source_task_id: 11, skip_recently_reminded: true })
    expect(document.body.textContent).toContain('催办成功')
    expect(document.body.textContent).not.toContain('催办未发送')
    wrapper.unmount()
  })

  it('does not present preview_only as success and keeps the result dialog', async () => {
    vi.mocked(projectManagementApi.memberRemind).mockResolvedValue({ accepted_task_ids: [], skipped_task_ids: [], failed_task_ids: [], preview_task_ids: [71], delivery_status: 'preview_only', errors: [{ task_id: 71, error: 'NOTIFICATION_PREVIEW_ONLY' }] })
    const wrapper = mountDialog()
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
    await flushPromises()
    const result = document.querySelector('[role="alertdialog"]')!
    expect(result.querySelector('.performance-confirm-dialog__title-content')?.textContent).toBe('催办未发送')
    expect(result.textContent).not.toContain('催办成功')
    wrapper.unmount()
  })

  it('reports failed delivery without claiming success', async () => {
    vi.mocked(projectManagementApi.memberRemind).mockResolvedValue({ accepted_task_ids: [], skipped_task_ids: [], failed_task_ids: [71], delivery_status: 'failed', errors: [{ task_id: 71, error: 'NOTIFICATION_FAILED' }] })
    const wrapper = mountDialog()
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
    await flushPromises()
    expect(document.body.querySelector('[role="alertdialog"]')?.textContent).toContain('催办发送失败')
    expect(document.body.querySelector('[role="alertdialog"]')?.textContent).not.toContain('催办成功')
    wrapper.unmount()
  })

  it('closes a failed preview without sending', async () => {
    vi.mocked(projectManagementApi.memberReminderPreview).mockRejectedValue(new Error('preview failed'))
    const wrapper = mountDialog()
    await flushPromises()
    document.querySelector<HTMLElement>('.performance-member-reminder-dialog__preview-trigger')!.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelector('.performance-popover')).toBeNull()
    expect(projectManagementApi.memberRemind).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('resolves only the employee 360 scope and confirms its exact task set without a table', async () => {
    const task = (id: number, selectable = true) => ({ task_id: id, project_id: 3, employee_no: 'E001', display_name: '张三', node_id: 'feedback', node_name: '360°反馈', task_kind: 'evaluation', status: 'pending', due_at: null, selectable, can_authorize: false as const, reminder_target: '360°评估人' })
    vi.spyOn(projectManagementApi, 'memberReminderTasks').mockResolvedValue({ items: [task(71), task(72), task(73, false)], total: 3, can_remind: true })
    const send = vi.spyOn(projectManagementApi, 'memberRemindBatch').mockResolvedValue({ accepted_task_ids: [71, 72], skipped_task_ids: [], delivery_status: 'success' })
    const wrapper = mount(PerformanceMemberReminderDialog, { attachTo: document.body, props: { modelValue: true, context: { ...context, nodeId: '', targetTaskId: undefined, targetKind: 'reviewer_360' } } })
    await flushPromises()
    expect(projectManagementApi.memberReminderTasks).toHaveBeenCalledWith(3, 'E001', expect.objectContaining({ source_task_id: 11, target_kind: 'reviewer_360' }))
    expect(document.querySelector('table')).toBeNull()
    document.querySelector<HTMLElement>('.performance-member-reminder-dialog__preview-trigger')!.dispatchEvent(new MouseEvent('mouseenter'))
    await flushPromises()
    expect(projectManagementApi.memberReminderPreview).toHaveBeenCalledWith(3, 'E001', { node_id: 'feedback', task_id: 71, source_task_id: 11 })
    document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
    await flushPromises()
    expect(send).toHaveBeenCalledWith(3, 'E001', { source_task_id: 11, node_id: undefined, target_kind: 'reviewer_360', task_ids: [71, 72], skip_recently_reminded: false })
    expect(projectManagementApi.memberRemind).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('催办成功')
    wrapper.unmount()
  })

  it('blocks an empty or denied 360 scope without any POST', async () => {
    vi.spyOn(projectManagementApi, 'memberReminderTasks').mockResolvedValue({ items: [], total: 0, can_remind: false })
    const send = vi.spyOn(projectManagementApi, 'memberRemindBatch')
    const wrapper = mount(PerformanceMemberReminderDialog, { attachTo: document.body, props: { modelValue: true, context: { ...context, nodeId: '', targetTaskId: undefined, targetKind: 'reviewer_360' } } })
    await flushPromises()
    expect(document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.disabled).toBe(true)
    expect(send).not.toHaveBeenCalled()
    expect(projectManagementApi.memberRemind).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('discards a closed preview and an old send after switching to another employee', async () => {
    let finishPreview!: (value: typeof preview) => void
    vi.mocked(projectManagementApi.memberReminderPreview).mockReturnValue(new Promise(resolve => { finishPreview = resolve }))
    const wrapper = mountDialog()
    await flushPromises()
    document.querySelector<HTMLElement>('.performance-member-reminder-dialog__preview-trigger')!.dispatchEvent(new MouseEvent('mouseenter'))
    await flushPromises()
    await wrapper.setProps({ context: { ...context, employeeNo: 'E002', targetTaskId: 72 } })
    finishPreview(preview)
    await flushPromises()
    expect(document.querySelector('.reminder-preview-card')).toBeNull()
    let finishSend!: (value: any) => void
    vi.mocked(projectManagementApi.memberRemind).mockReturnValue(new Promise(resolve => { finishSend = resolve }))
    document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
    await flushPromises()
    await wrapper.setProps({ context: { ...context, employeeNo: 'E003', targetTaskId: 73 } })
    finishSend({ accepted_task_ids: [72], skipped_task_ids: [], delivery_status: 'success' })
    await flushPromises()
    expect(document.body.textContent).not.toContain('催办成功')
    expect(document.body.textContent).toContain('确定催办吗？')
    wrapper.unmount()
  })

  it('reports six-hour skips without claiming delivery or suggesting immediate retry', async () => {
    vi.mocked(projectManagementApi.memberRemind).mockResolvedValue({ accepted_task_ids: [], skipped_task_ids: [71], delivery_status: 'failed' })
    const wrapper = mountDialog()
    await flushPromises()
    document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
    await flushPromises()
    expect(document.body.textContent).toContain('本次催办已跳过')
    expect(document.body.textContent).not.toContain('催办成功')
    expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1)
    document.querySelector<HTMLButtonElement>('.performance-confirm-dialog__button--danger')!.click()
    await flushPromises()
    expect(document.body.style.overflow).toBe('')
    wrapper.unmount()
  })

  it('restores body overflow after unmount while the dialog is open', async () => {
    document.body.style.overflow = 'auto'
    const wrapper = mountDialog()
    await flushPromises()
    expect(document.body.style.overflow).toBe('hidden')
    wrapper.unmount()
    expect(document.body.style.overflow).toBe('auto')
  })
})
