import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceTodoNotificationDialog from './PerformanceTodoNotificationDialog.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import { defaultTodoNotificationRule } from './performanceTodoNotificationRule'

const stubs = {
  Teleport: true,
  PerformanceTimeField: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<input aria-label="通知时刻" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
}
function create() {
  return mount(PerformanceTodoNotificationDialog, { props: { modelValue: true, rule: defaultTodoNotificationRule() }, global: { stubs } })
}

describe('PerformanceTodoNotificationDialog', () => {
  it('opens with saved values, uses shared controls and cancels without saving', async () => {
    const wrapper = create()
    expect(wrapper.get('[role="dialog"]').attributes('style')).toContain('--performance-notification-dialog-width')
    expect(wrapper.findAll('[role="radiogroup"]')).toHaveLength(2)
    expect(wrapper.getComponent(PerformanceNumberInput).props('suffix')).toBe('天')
    await wrapper.get('input[aria-label="通知时刻"]').setValue('09:30')
    await wrapper.findAll('.todo-notification-actions button')[0].trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('switches all three schedules and retains per-frequency draft values', async () => {
    const wrapper = create()
    await wrapper.getComponent(PerformanceNumberInput).vm.$emit('update:modelValue', '3')
    await wrapper.get('input[value="weekly"]').setValue(true)
    expect(wrapper.getComponent(PerformanceNumberInput).props('suffix')).toBe('周')
    await wrapper.getComponent(PerformanceNumberInput).vm.$emit('update:modelValue', '2')
    const weekday = wrapper.findAllComponents(PerformanceSearchSelect).find(select => select.props('ariaLabel') === '通知星期')!
    weekday.vm.$emit('update:modelValue', ['5', '1'])
    await wrapper.get('input[value="specified"]').setValue(true)
    expect(wrapper.findComponent(PerformanceNumberInput).exists()).toBe(false)
    expect(wrapper.findAllComponents(PerformanceSearchSelect).map(select => select.props('ariaLabel'))).toContain('通知日期单位')
    await wrapper.get('input[value="daily"]').setValue(true)
    expect(wrapper.getComponent(PerformanceNumberInput).props('modelValue')).toBe('3')
    await wrapper.get('input[value="weekly"]').setValue(true)
    expect(wrapper.getComponent(PerformanceNumberInput).props('modelValue')).toBe('2')
    await wrapper.findAll('.todo-notification-actions button')[1].trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([{ ...defaultTodoNotificationRule(), frequency: 'weekly', interval: 2, weekdays: [1, 5] }])
    wrapper.unmount()
  })

  it('validates only active schedule fields and submits normalized specified days', async () => {
    const wrapper = create()
    await wrapper.get('input[value="specified"]').setValue(true)
    await wrapper.findAll('.todo-notification-actions button')[1].trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('至少选择一个通知日期')
    const days = wrapper.findAllComponents(PerformanceSearchSelect).find(select => select.props('ariaLabel') === '截止前通知日期')!
    days.vm.$emit('update:modelValue', ['7', '0', '7'])
    await wrapper.findAll('.todo-notification-actions button')[1].trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([{ ...defaultTodoNotificationRule(), frequency: 'specified', days_before: [0, 7] }])
    wrapper.unmount()
  })

  it('rejects invalid intervals, empty weekdays and malformed time', async () => {
    const wrapper = create()
    await wrapper.getComponent(PerformanceNumberInput).vm.$emit('update:modelValue', '1.5')
    await wrapper.findAll('.todo-notification-actions button')[1].trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('整数间隔')
    await wrapper.get('input[value="weekly"]').setValue(true)
    await wrapper.findAll('.todo-notification-actions button')[1].trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('至少选择一个星期')
    await wrapper.get('input[value="daily"]').setValue(true)
    await wrapper.getComponent(PerformanceNumberInput).vm.$emit('update:modelValue', '1')
    await wrapper.get('input[aria-label="通知时刻"]').setValue('25:00')
    await wrapper.findAll('.todo-notification-actions button')[1].trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('有效的通知时刻')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not mutate saved arrays and resets cancelled drafts when reopened', async () => {
    const original = { ...defaultTodoNotificationRule(), frequency: 'specified' as const, days_before: [2] }
    const wrapper = mount(PerformanceTodoNotificationDialog, { props: { modelValue: true, rule: original }, global: { stubs } })
    const days = wrapper.findAllComponents(PerformanceSearchSelect)[0]
    days.vm.$emit('update:modelValue', ['7'])
    await wrapper.get('input[aria-label="通知时刻"]').setValue('08:30')
    expect(original.days_before).toEqual([2])
    expect(original.time).toBe('10:00')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    expect(wrapper.get('input[aria-label="通知时刻"]').element).toHaveProperty('value', '10:00')
    expect(wrapper.findAllComponents(PerformanceSearchSelect)[0].props('modelValue')).toEqual(['2'])
    wrapper.unmount()
  })

  it('locks confirmation and closing while saving, keeping server errors visible', async () => {
    const wrapper = create()
    await wrapper.setProps({ saving: true, saveError: '保存失败，请重试' })
    await wrapper.findAll('.todo-notification-actions button')[1].trigger('click')
    await wrapper.get('.performance-dialog__close').trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('保存失败')
    wrapper.unmount()
  })
})
