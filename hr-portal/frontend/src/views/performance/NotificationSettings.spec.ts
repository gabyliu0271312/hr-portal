import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useUserStore } from '@/stores/user'
import { defaultProgressDailyNotificationRule, defaultTodoNotificationRule } from '@/components/performance/performanceTodoNotificationRule'
import NotificationSettings from './NotificationSettings.vue'
import type { PerformanceNotificationSettings } from '@/api/performance'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/api/performance', () => ({ performanceNotificationSettingsApi: api }))

const stubs = {
  Teleport: true,
  PerformanceNotificationMethodsCard: {
    props: ['emailEnabled', 'loading'],
    emits: ['update:emailEnabled'],
    template: '<section class="methods-card"><span class="email-state">{{ emailEnabled }}</span><button :disabled="loading" @click="$emit(\'update:emailEnabled\', !emailEnabled)">email</button></section>',
  },
}

function response(overrides: Partial<PerformanceNotificationSettings> = {}): PerformanceNotificationSettings {
  return {
    feishu_push_enabled: true,
    email_enabled: false,
    calibration_delivery_mode: 'realtime',
    result_change_notification_scope: 'final_score_grade',
    todo_task_notification_enabled: true,
    progress_daily_notification_enabled: true,
    stage_start_notification_enabled: true,
    ...overrides,
  }
}

describe('NotificationSettings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useUserStore().menus = [{ id: 1, parent_id: null, code: 'performance.admin', label: '绩效后台', scope_dimension: '', icon: null, order: 1, can_create: true, can_update: true, can_delete: false, can_export: false }]
    vi.clearAllMocks()
    api.get.mockResolvedValue(response())
    api.update.mockResolvedValue(response({ email_enabled: true }))
  })

  it('loads the notification methods card with the persisted email state', async () => {
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()

    expect(wrapper.text()).toContain('通知设置')
    expect(wrapper.find('.methods-card').exists()).toBe(true)
    expect(wrapper.find('.email-state').text()).toBe('false')
  })

  it('persists email changes immediately', async () => {
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await wrapper.get('.methods-card button').trigger('click')
    await flushPromises()

    expect(api.update).toHaveBeenCalledWith({ email_enabled: true })
    expect(wrapper.find('.email-state').text()).toBe('true')
  })

  it('rolls back email state after a failed update', async () => {
    api.update.mockRejectedValueOnce(new Error('failed'))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await wrapper.get('.methods-card button').trigger('click')
    await flushPromises()

    expect(wrapper.find('.email-state').text()).toBe('false')
  })

  it('shows a reload action when loading fails', async () => {
    api.get.mockRejectedValueOnce(new Error('failed'))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('通知设置加载失败')
    expect(wrapper.find('button').text()).toBe('重新加载')
  })

  it('loads persisted policy and PATCHes a single changed field', async () => {
    api.get.mockResolvedValueOnce(response({ result_change_notification_scope: 'any_content', todo_task_notification_enabled: false }))
    api.update.mockResolvedValueOnce(response({ result_change_notification_scope: 'any_content', todo_task_notification_enabled: true }))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    expect(wrapper.find('.notification-settings-card').exists()).toBe(false)
    await flushPromises()

    const preview = wrapper.get('.notification-settings-card')
    expect((preview.findAll('input[type="radio"]')[3].element as HTMLInputElement).checked).toBe(true)
    expect(preview.findAll('.notification-rule-summary')[0].find('.notification-rule-summary__details').exists()).toBe(false)
    await preview.findAll('input[type="checkbox"]')[0].setValue(true)
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith({ todo_task_notification_enabled: true })
    expect((preview.findAll('input[type="checkbox"]')[0].element as HTMLInputElement).checked).toBe(true)
    expect(preview.findAll('.notification-rule-summary')[0].find('.notification-rule-summary__details').exists()).toBe(true)
    expect(preview.get('.notification-settings-card__notice').text()).toContain('自动保存')
  })

  it('restores a hidden summary if re-enabling fails', async () => {
    api.get.mockResolvedValueOnce(response({ todo_task_notification_enabled: false }))
    api.update.mockRejectedValueOnce(new Error('failed'))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    expect(wrapper.findAll('.notification-rule-summary')[0].find('.notification-rule-summary__details').exists()).toBe(false)
    await wrapper.findAll('.notification-settings-card input[type="checkbox"]')[0].setValue(true)
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith({ todo_task_notification_enabled: true })
    expect(wrapper.findAll('.notification-rule-summary')[0].find('.notification-rule-summary__details').exists()).toBe(false)
    expect((wrapper.findAll('.notification-settings-card input[type="checkbox"]')[0].element as HTMLInputElement).checked).toBe(false)
  })

  it('restores saved policy after reopening the page', async () => {
    let persisted = response()
    api.get.mockImplementation(async () => persisted)
    api.update.mockImplementation(async (payload: Partial<PerformanceNotificationSettings>) => {
      persisted = { ...persisted, ...payload }
      return persisted
    })
    const first = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await first.findAll('.notification-settings-card input[type="radio"]')[1].setValue(true)
    await flushPromises()
    await first.findAll('.notification-settings-card input[type="checkbox"]')[2].setValue(false)
    expect(api.update).toHaveBeenCalledTimes(1)
    await first.get('.notification-confirm__confirm').trigger('click')
    await flushPromises()
    first.unmount()

    const reopened = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    expect((reopened.findAll('.notification-settings-card input[type="radio"]')[1].element as HTMLInputElement).checked).toBe(true)
    expect((reopened.findAll('.notification-settings-card input[type="checkbox"]')[2].element as HTMLInputElement).checked).toBe(false)
    expect(reopened.findAll('.notification-rule-summary')[2].find('.notification-rule-summary__details').exists()).toBe(false)
  })

  it('keeps the notification checked without PATCH when 保留 is clicked', async () => {
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    const input = wrapper.findAll('.notification-settings-card input[type="checkbox"]')[0]
    await input.setValue(false)
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('确定取消勾选吗')
    expect((input.element as HTMLInputElement).checked).toBe(true)
    expect(api.update).not.toHaveBeenCalled()

    await wrapper.get('.notification-confirm__keep').trigger('click')
    expect(wrapper.findAll('.notification-rule-summary')[0].find('.notification-rule-summary__details').exists()).toBe(true)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect((input.element as HTMLInputElement).checked).toBe(true)
    expect(api.update).not.toHaveBeenCalled()
  })

  it('saves false only after 确定 and closes on success', async () => {
    api.update.mockResolvedValueOnce(response({ progress_daily_notification_enabled: false }))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await wrapper.findAll('.notification-settings-card input[type="checkbox"]')[1].setValue(false)
    expect(api.update).not.toHaveBeenCalled()
    await wrapper.get('.notification-confirm__confirm').trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith({ progress_daily_notification_enabled: false })
    expect(wrapper.findAll('.notification-rule-summary')[1].find('.notification-rule-summary__details').exists()).toBe(false)
    expect(wrapper.findAll('.notification-rule-summary')[1].find('button').exists()).toBe(false)
    expect(wrapper.findAll('.notification-rule-summary__details')).toHaveLength(2)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect((wrapper.findAll('.notification-settings-card input[type="checkbox"]')[1].element as HTMLInputElement).checked).toBe(false)
  })

  it('hides only the saved-off rule summary for each notification', async () => {
    const keys = [
      'todo_task_notification_enabled',
      'progress_daily_notification_enabled',
      'stage_start_notification_enabled',
    ] as const
    for (const [index, key] of keys.entries()) {
      const updated = response()
      updated[key] = false
      api.update.mockResolvedValueOnce(updated)
      const wrapper = mount(NotificationSettings, { global: { stubs } })
      await flushPromises()
      const rows = wrapper.findAll('.notification-rule-summary')
      const siblings = rows.filter((_, position) => position !== index)
      const before = siblings.map((row) => row.element.outerHTML)
      await rows[index].find('input[type="checkbox"]').setValue(false)
      expect(rows[index].find('.notification-rule-summary__details').exists()).toBe(true)
      await wrapper.get('.notification-confirm__confirm').trigger('click')
      await flushPromises()
      expect(api.update).toHaveBeenCalledWith({ [key]: false })
      expect(rows[index].find('.notification-rule-summary__details').exists()).toBe(false)
      expect(rows[index].find('button').exists()).toBe(false)
      expect(siblings.map((row) => row.element.outerHTML)).toEqual(before)
      wrapper.unmount()
      api.update.mockClear()
    }
  })

  it('keeps the dialog open after a failed save and allows retry', async () => {
    api.update.mockRejectedValueOnce(new Error('failed'))
    api.update.mockResolvedValueOnce(response({ todo_task_notification_enabled: false }))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await wrapper.findAll('.notification-settings-card input[type="checkbox"]')[0].setValue(false)
    await wrapper.get('.notification-confirm__confirm').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    expect(wrapper.findAll('.notification-rule-summary')[0].find('.notification-rule-summary__details').exists()).toBe(true)
    expect((wrapper.findAll('.notification-settings-card input[type="checkbox"]')[0].element as HTMLInputElement).checked).toBe(true)
    await wrapper.get('.notification-confirm__confirm').trigger('click')
    await flushPromises()
    expect(api.update).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
  })

  it('blocks duplicate confirmation while a disable PATCH is pending', async () => {
    let finish!: (value: PerformanceNotificationSettings) => void
    api.update.mockImplementationOnce(() => new Promise<PerformanceNotificationSettings>((resolve) => { finish = resolve }))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await wrapper.findAll('.notification-settings-card input[type="checkbox"]')[0].setValue(false)
    await wrapper.get('.notification-confirm__confirm').trigger('click')
    expect(wrapper.findAll('.notification-rule-summary')[0].find('.notification-rule-summary__details').exists()).toBe(true)
    expect((wrapper.findAll('.notification-settings-card input[type="checkbox"]')[0].element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.findAll('[role="alertdialog"] button:disabled')).toHaveLength(2)
    await wrapper.get('.notification-confirm__confirm').trigger('click')
    expect(api.update).toHaveBeenCalledTimes(1)
    finish(response({ todo_task_notification_enabled: false }))
    await flushPromises()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.findAll('.notification-rule-summary')[0].find('.notification-rule-summary__details').exists()).toBe(false)
  })

  it('rolls back a failed strategy update', async () => {
    api.update.mockRejectedValueOnce(new Error('save failed'))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await wrapper.findAll('.notification-settings-card input[type="radio"]')[1].setValue(true)
    await flushPromises()

    expect(api.update).toHaveBeenCalledWith({ calibration_delivery_mode: 'after_calibration' })
    expect((wrapper.findAll('.notification-settings-card input[type="radio"]')[0].element as HTMLInputElement).checked).toBe(true)
  })

  it('prevents overlapping policy saves while a PATCH is pending', async () => {
    let finish!: (value: PerformanceNotificationSettings) => void
    api.update.mockImplementationOnce(() => new Promise<PerformanceNotificationSettings>((resolve) => { finish = resolve }))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await wrapper.findAll('.notification-settings-card input[type="radio"]')[1].setValue(true)

    expect(wrapper.findAll('.notification-settings-card input:disabled')).toHaveLength(0)
    expect(wrapper.findAll('.notification-settings-card input[type="radio"]:disabled')).toHaveLength(0)
    await wrapper.findAll('.notification-rule-summary__name .performance-checkbox__label')[0].trigger('click')
    expect(api.update).toHaveBeenCalledTimes(1)
    finish(response({ calibration_delivery_mode: 'after_calibration' }))
    await flushPromises()
    expect(wrapper.findAll('.notification-settings-card input:disabled')).toHaveLength(0)
  })

  it('saves an edited rule only on confirmation and restores it after reopening', async () => {
    let persisted = response({ todo_task_rule: defaultTodoNotificationRule() })
    api.get.mockImplementation(async () => persisted)
    api.update.mockImplementation(async (payload: Partial<PerformanceNotificationSettings>) => {
      persisted = { ...persisted, ...payload }
      return persisted
    })
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await wrapper.get('button[aria-label="编辑待办任务通知"]').trigger('click')
    expect(api.update).not.toHaveBeenCalled()
    const dialog = wrapper.getComponent({ name: 'PerformanceTodoNotificationDialog' })
    const rule = { ...defaultTodoNotificationRule(), frequency: 'weekly' as const, interval: 2, weekdays: [1, 5], time: '09:30' }
    dialog.vm.$emit('confirm', rule)
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith({ todo_task_rule: rule })
    expect(wrapper.find('[aria-labelledby="todo-notification-title"]').exists()).toBe(false)
    expect(wrapper.findAll('.notification-rule-summary')[0].text()).toContain('星期一、星期五')
    wrapper.unmount()
    const reopened = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await reopened.get('button[aria-label="编辑待办任务通知"]').trigger('click')
    expect(reopened.getComponent({ name: 'PerformanceTodoNotificationDialog' }).props('rule')).toEqual(rule)
    reopened.unmount()
  })

  it('saves and reloads the workday rule and summary without optimistic updates', async () => {
    let persisted = response({ todo_task_rule: defaultTodoNotificationRule() })
    api.get.mockImplementation(async () => persisted)
    api.update.mockImplementation(async (payload: Partial<PerformanceNotificationSettings>) => {
      persisted = { ...persisted, ...payload }
      return persisted
    })
    const rule = { ...defaultTodoNotificationRule(), frequency: 'specified' as const, days_before: [3, 100], day_kind: 'working_day' as const }
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await wrapper.get('button[aria-label="编辑待办任务通知"]').trigger('click')
    wrapper.getComponent({ name: 'PerformanceTodoNotificationDialog' }).vm.$emit('confirm', rule)
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith({ todo_task_rule: rule })
    expect(wrapper.findAll('.notification-rule-summary')[0].text()).toContain('第 3 个工作日、第 100 个工作日')
    wrapper.unmount()
    const reopened = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await reopened.get('button[aria-label="编辑待办任务通知"]').trigger('click')
    expect(reopened.getComponent({ name: 'PerformanceTodoNotificationDialog' }).props('rule')).toEqual(rule)
    reopened.unmount()
  })

  it('keeps the rule editor and its draft on failure, without changing the summary', async () => {
    api.get.mockResolvedValue(response({ todo_task_rule: defaultTodoNotificationRule() }))
    api.update.mockRejectedValueOnce(new Error('failed'))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    const before = wrapper.findAll('.notification-rule-summary')[0].text()
    await wrapper.get('button[aria-label="编辑待办任务通知"]').trigger('click')
    const dialog = wrapper.getComponent({ name: 'PerformanceTodoNotificationDialog' })
    await dialog.get('input[value="specified"]').setValue(true)
    const days = dialog.findAllComponents({ name: 'PerformanceSearchSelect' })[0]
    days.vm.$emit('update:modelValue', ['3'])
    dialog.findAllComponents({ name: 'PerformanceSearchSelect' })[1].vm.$emit('update:modelValue', 'working_day')
    await dialog.findAll('.todo-notification-actions button')[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('[aria-labelledby="todo-notification-title"]').exists()).toBe(true)
    expect(wrapper.get('.todo-notification-error').text()).toContain('保存失败')
    expect(dialog.findAllComponents({ name: 'PerformanceSearchSelect' })[1].props('modelValue')).toBe('working_day')
    expect(wrapper.findAll('.notification-rule-summary')[0].text()).toBe(before)
    wrapper.unmount()
  })

  it('edits progress separately, cancels without writing and reloads its saved rule', async () => {
    let persisted = response({ todo_task_rule: defaultTodoNotificationRule(), progress_daily_rule: defaultProgressDailyNotificationRule() })
    api.get.mockImplementation(async () => persisted)
    api.update.mockImplementation(async (payload: Partial<PerformanceNotificationSettings>) => {
      persisted = { ...persisted, ...payload }
      return persisted
    })
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await wrapper.get('button[aria-label="编辑绩效进度日报通知"]').trigger('click')
    const dialog = wrapper.getComponent({ name: 'PerformanceTodoNotificationDialog' })
    expect(dialog.props('title')).toBe('编辑绩效进度日报通知')
    expect(dialog.props('rule')?.time).toBe('18:00')
    await dialog.get('input[value="weekly"]').setValue(true)
    dialog.findAllComponents({ name: 'PerformanceSearchSelect' })[0].vm.$emit('update:modelValue', ['1', '5'])
    await dialog.findAll('.todo-notification-actions button')[0].trigger('click')
    expect(api.update).not.toHaveBeenCalled()
    await wrapper.get('button[aria-label="编辑绩效进度日报通知"]').trigger('click')
    expect(dialog.get('input[value="daily"]').element).toHaveProperty('checked', true)
    const rule = { ...defaultProgressDailyNotificationRule(), frequency: 'weekly' as const, weekdays: [1, 5], time: '09:30' }
    dialog.vm.$emit('confirm', rule)
    await flushPromises()
    expect(api.update).toHaveBeenCalledWith({ progress_daily_rule: rule })
    expect(persisted.todo_task_rule).toEqual(defaultTodoNotificationRule())
    expect(wrapper.findAll('.notification-rule-summary')[1].text()).toContain('星期一、星期五')
    await wrapper.get('button[aria-label="编辑待办任务通知"]').trigger('click')
    expect(dialog.props('title')).toBe('编辑待办任务通知')
    expect(dialog.props('rule')).toEqual(defaultTodoNotificationRule())
    wrapper.unmount()
    const reopened = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    await reopened.get('button[aria-label="编辑绩效进度日报通知"]').trigger('click')
    expect(reopened.getComponent({ name: 'PerformanceTodoNotificationDialog' }).props('rule')).toEqual(rule)
    reopened.unmount()
  })

  it('keeps progress drafts on failure, locks pending saves and updates only after retry', async () => {
    const initial = response({ todo_task_rule: defaultTodoNotificationRule(), progress_daily_rule: defaultProgressDailyNotificationRule() })
    api.get.mockResolvedValue(initial)
    api.update.mockRejectedValueOnce(new Error('failed'))
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    const before = wrapper.findAll('.notification-rule-summary').map(row => row.text())
    await wrapper.get('button[aria-label="编辑绩效进度日报通知"]').trigger('click')
    const dialog = wrapper.getComponent({ name: 'PerformanceTodoNotificationDialog' })
    await dialog.get('input[value="specified"]').setValue(true)
    dialog.findAllComponents({ name: 'PerformanceSearchSelect' })[0].vm.$emit('update:modelValue', ['3'])
    await dialog.findAll('.todo-notification-actions button')[1].trigger('click')
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.get('.todo-notification-error').text()).toContain('保存失败')
    expect(dialog.findAllComponents({ name: 'PerformanceSearchSelect' })[0].props('modelValue')).toEqual(['3'])
    expect(wrapper.findAll('.notification-rule-summary').map(row => row.text())).toEqual(before)
    let finish!: (value: PerformanceNotificationSettings) => void
    api.update.mockImplementationOnce(() => new Promise<PerformanceNotificationSettings>(resolve => { finish = resolve }))
    await dialog.findAll('.todo-notification-actions button')[1].trigger('click')
    await dialog.findAll('.todo-notification-actions button')[1].trigger('click')
    await dialog.get('.performance-dialog__close').trigger('click')
    expect(api.update).toHaveBeenCalledTimes(2)
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('saving')).toBe(true)
    expect(wrapper.findAll('.notification-rule-summary')[1].text()).toBe(before[1])
    const rule = api.update.mock.calls[1][0].progress_daily_rule
    finish({ ...initial, progress_daily_rule: rule })
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(false)
    expect(wrapper.findAll('.notification-rule-summary')[1].text()).toContain('第 3 个自然日')
    expect(wrapper.findAll('.notification-rule-summary')[0].text()).toBe(before[0])
    wrapper.unmount()
  })

  it('hides the edit action without Portal update permission', async () => {
    useUserStore().menus[0].can_update = false
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()
    expect(wrapper.find('button[aria-label="编辑待办任务通知"]').exists()).toBe(false)
    expect(wrapper.find('button[aria-label="编辑绩效进度日报通知"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not reveal the preview when loading is forbidden', async () => {
    api.get.mockRejectedValueOnce({ response: { status: 403, data: { detail: '无权限' } } })
    const wrapper = mount(NotificationSettings, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('.notification-settings-card').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('无权限')
  })
})
