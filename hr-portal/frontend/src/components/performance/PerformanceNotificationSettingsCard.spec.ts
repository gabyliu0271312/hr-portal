import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceNotificationSettingsCard from './PerformanceNotificationSettingsCard.vue'
import type { PerformanceNotificationSettings } from '@/api/performance'

const defaults: PerformanceNotificationSettings = {
  feishu_push_enabled: true,
  email_enabled: false,
  calibration_delivery_mode: 'realtime',
  result_change_notification_scope: 'final_score_grade',
  todo_task_notification_enabled: true,
  progress_daily_notification_enabled: true,
  stage_start_notification_enabled: true,
}

function mountCard(overrides: Partial<PerformanceNotificationSettings> = {}) {
  return mount(PerformanceNotificationSettingsCard, { props: { settings: { ...defaults, ...overrides } } })
}

describe('PerformanceNotificationSettingsCard', () => {
  it('shows server values and captured content in order', () => {
    const wrapper = mountCard({ calibration_delivery_mode: 'after_calibration', progress_daily_notification_enabled: false })
    const text = wrapper.text()
    const expected = [
      '绩效校准期间发送结果变更通知', '实时发送', '校准结束后合并发送',
      '绩效结果变更通知', '仅在终评绩效结果（评分评级）发生变更时通知',
      '任意内容发生变更时通知', '其他通知设置', '待办任务通知',
      '绩效进度日报通知', '环节启动通知',
    ]
    let last = -1
    for (const label of expected) {
      const next = text.indexOf(label, last + 1)
      expect(next, label).toBeGreaterThan(last)
      last = next
    }
    const radios = wrapper.findAll('input[type="radio"]')
    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(radios).toHaveLength(4)
    expect(checkboxes).toHaveLength(3)
    expect((radios[1].element as HTMLInputElement).checked).toBe(true)
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.findAll('.notification-rule-summary')[1].find('.notification-rule-summary__details').exists()).toBe(false)
    expect(wrapper.findAll('.notification-rule-summary')[1].find('button').exists()).toBe(false)
    expect(wrapper.findAll('button:disabled')).toHaveLength(2)
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('saves radio changes and requests confirmation before disabling checkboxes', async () => {
    const wrapper = mountCard()
    await wrapper.findAll('input[type="radio"]')[1].setValue(true)
    await wrapper.findAll('input[type="radio"]')[3].setValue(true)
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(false)
    await wrapper.findAll('input[type="checkbox"]')[1].setValue(false)
    await wrapper.findAll('.notification-rule-summary__name .performance-checkbox__label')[2].trigger('click')

    expect(wrapper.emitted('request-save')).toEqual([
      [{ calibration_delivery_mode: 'after_calibration' }],
      [{ result_change_notification_scope: 'any_content' }],
    ])
    expect(wrapper.emitted('request-disable')).toEqual([
      ['todo_task_notification_enabled'],
      ['progress_daily_notification_enabled'],
      ['stage_start_notification_enabled'],
    ])
    expect(wrapper.findAll('input[type="checkbox"]:checked')).toHaveLength(3)
  })

  it('enables an unchecked notification without asking for confirmation', async () => {
    const wrapper = mountCard({ todo_task_notification_enabled: false })
    expect(wrapper.findAll('.notification-rule-summary')[0].find('.notification-rule-summary__details').exists()).toBe(false)
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)
    expect(wrapper.emitted('request-save')).toEqual([[{ todo_task_notification_enabled: true }]])
    await wrapper.setProps({ settings: defaults })
    expect(wrapper.findAll('.notification-rule-summary')[0].find('.notification-rule-summary__details').exists()).toBe(true)
    expect(wrapper.emitted('request-disable')).toBeUndefined()
  })

  it('keeps the selected radio mounted and focused during saving', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const wrapper = mount(PerformanceNotificationSettingsCard, { attachTo: host, props: { settings: defaults } })
    try {
      const radio = wrapper.findAll('input[type="radio"]')[0].element as HTMLInputElement
      radio.focus()
      expect(document.activeElement).toBe(radio)
      await wrapper.setProps({ settings: { ...defaults, calibration_delivery_mode: 'after_calibration' }, saving: true })
      expect(wrapper.findAll('input[type="radio"]')[0].element).toBe(radio)
      expect(document.activeElement).toBe(radio)
      expect(radio.disabled).toBe(false)
    } finally {
      wrapper.unmount()
      host.remove()
    }
  })

  it('keeps both sibling notification choices unchanged during either save direction', async () => {
    for (const initiallyChecked of [true, false]) {
      const initial = { ...defaults, todo_task_notification_enabled: initiallyChecked }
      const wrapper = mountCard(initial)
      const siblings = wrapper.findAll('.notification-rule-summary').slice(1)
      const nodes = siblings.map((row) => row.element)
      const markup = siblings.map((row) => row.element.outerHTML)
      const notice = wrapper.get('.notification-settings-card__notice').text()
      const next = { ...initial, todo_task_notification_enabled: !initiallyChecked }
      await wrapper.setProps({ settings: next, saving: true })
      expect(wrapper.findAll('.notification-rule-summary').slice(1).map((row) => row.element)).toEqual(nodes)
      expect(wrapper.findAll('.notification-rule-summary').slice(1).map((row) => row.element.outerHTML)).toEqual(markup)
      expect(wrapper.get('.notification-settings-card__notice').text()).toBe(notice)
      await wrapper.findAll('.notification-rule-summary__name .performance-checkbox__label')[1].trigger('click')
      expect(wrapper.emitted('request-save')).toBeUndefined()
      expect(wrapper.emitted('request-disable')).toBeUndefined()
      await wrapper.setProps({ saving: false })
      expect(wrapper.findAll('.notification-rule-summary').slice(1).map((row) => row.element.outerHTML)).toEqual(markup)
      wrapper.unmount()
    }
  })

  it('locks input while saving without disabled visual changes', async () => {
    const wrapper = mountCard()
    await wrapper.setProps({ saving: true })
    expect(wrapper.findAll('input:disabled')).toHaveLength(0)
    expect(wrapper.findAll('input[type="radio"]:disabled')).toHaveLength(0)
    expect(wrapper.findAll('[role="radiogroup"][aria-disabled="true"]')).toHaveLength(2)
    expect(wrapper.findAll('button:disabled')).toHaveLength(3)
    expect(wrapper.get('[role="status"]').text()).toContain('保存中')
    await wrapper.findAll('.notification-rule-summary__name .performance-checkbox__label')[0].trigger('click')
    expect(wrapper.emitted('request-save')).toBeUndefined()
    expect(wrapper.emitted('request-disable')).toBeUndefined()
  })
})
