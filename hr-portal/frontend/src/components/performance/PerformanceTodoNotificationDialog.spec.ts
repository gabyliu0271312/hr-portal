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

  it('reuses the complete editor with a configurable daily progress title', async () => {
    const wrapper = create()
    expect(wrapper.get('#todo-notification-title').text()).toBe('编辑待办任务通知')
    await wrapper.setProps({ title: '编辑绩效进度日报通知' })
    expect(wrapper.get('#todo-notification-title').text()).toBe('编辑绩效进度日报通知')
    expect(wrapper.findAll('input[name="todo-notification-frequency"]')).toHaveLength(3)
    expect(wrapper.findAll('[role="radiogroup"]')).toHaveLength(2)
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
    expect(wrapper.emitted('confirm')?.[0]).toEqual([{ ...defaultTodoNotificationRule(), frequency: 'weekly', interval: 2, weekdays: [5, 1] }])
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

  it('offers days 1–100 and opts days, day kind and weekdays into checkmarks', async () => {
    const wrapper = create()
    await wrapper.get('input[value="specified"]').setValue(true)
    const days = wrapper.findAllComponents(PerformanceSearchSelect)[0]
    expect(days.props('options')).toEqual(Array.from({ length: 100 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) })))
    expect(days.props('optionStyle')).toBe('checkmark')
    const unit = wrapper.findAllComponents(PerformanceSearchSelect)[1]
    expect(unit.props('optionStyle')).toBe('checkmark')
    expect(unit.props('multiple')).toBe(false)
    expect(unit.props('options')).toEqual([{ value: 'calendar_day', label: '自然日' }, { value: 'working_day', label: '工作日' }])
    expect(wrapper.findAllComponents(PerformanceSearchSelect)[2].props('optionStyle')).toBe('checkmark')
    await wrapper.get('input[value="weekly"]').setValue(true)
    expect(wrapper.findAllComponents(PerformanceSearchSelect).find(select => select.props('ariaLabel') === '通知星期')!.props('optionStyle')).toBe('checkmark')
    wrapper.unmount()
  })

  it('keeps legacy days outside the new range readable and submittable', async () => {
    const rule = { ...defaultTodoNotificationRule(), frequency: 'specified' as const, days_before: [0, 150, 365] }
    const wrapper = mount(PerformanceTodoNotificationDialog, { props: { modelValue: true, rule }, global: { stubs } })
    const days = wrapper.findAllComponents(PerformanceSearchSelect)[0]
    expect(days.props('options')).toHaveLength(103)
    expect(days.props('options')).toContainEqual({ value: '0', label: '截止当天' })
    expect(days.props('options')).toContainEqual({ value: '365', label: '365' })
    await wrapper.findAll('.todo-notification-actions button')[1].trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([rule])
    expect(rule.days_before).toEqual([0, 150, 365])
    wrapper.unmount()
  })

  it('selects, deselects, removes tags and retains selection when the day popup reopens', async () => {
    const days = mount(PerformanceSearchSelect, { props: { modelValue: [], multiple: true, optionStyle: 'checkmark', ariaLabel: '截止前通知日期', options: Array.from({ length: 100 }, (_, index) => ({ value: String(index + 1), label: String(index + 1) })), 'onUpdate:modelValue': value => { void days.setProps({ modelValue: value }) } }, global: { stubs: { Teleport: true } } })
    await days.get('.performance-select-shell__selector').trigger('click')
    expect(days.findAll('[role="option"]')).toHaveLength(100)
    expect(days.find('.performance-flat-option-list--checkmark').exists()).toBe(true)
    expect(days.find('.performance-flat-option-list__checkbox').exists()).toBe(false)
    await days.findAll('[role="option"]')[0].trigger('click')
    await days.findAll('[role="option"]')[1].trigger('click')
    await days.findAll('[role="option"]')[99].trigger('click')
    expect(days.props('modelValue')).toEqual(['1', '2', '100'])
    expect(days.findAll('.performance-flat-option-list__checkmark')).toHaveLength(3)
    expect(days.findAll('.performance-select-shell__content .performance-select-shell__tag-content').map(tag => tag.text())).toEqual(['1', '2', '100'])
    expect(days.get('[role="combobox"]').attributes('aria-expanded')).toBe('true')
    await days.findAll('[role="option"]')[1].trigger('click')
    expect(days.props('modelValue')).toEqual(['1', '100'])
    await days.get('.performance-select-shell__content button[aria-label="移除100"]').trigger('click')
    expect(days.props('modelValue')).toEqual(['1'])
    expect(days.findAll('[role="option"]')[99].attributes('aria-selected')).toBe('false')
    await days.get('[role="combobox"]').trigger('keydown', { key: 'Escape' })
    expect(days.find('[role="option"]').exists()).toBe(false)
    await days.get('.performance-select-shell__selector').trigger('click')
    expect(days.findAll('[role="option"]')[0].attributes('aria-selected')).toBe('true')
    await days.get('button[aria-label="截止前通知日期清空已选"]').trigger('click')
    expect(days.props('modelValue')).toEqual([])
    expect(days.find('.performance-flat-option-list__checkmark').exists()).toBe(false)
    days.unmount()
  })

  it('uses default right checkmarks, disabled option, search and single-select behavior', async () => {
    const wrapper = mount(PerformanceSearchSelect, { props: { modelValue: [], multiple: true, options: [{ value: '1', label: '1' }, { value: '2', label: '2', disabled: true }] }, global: { stubs: { Teleport: true } } })
    await wrapper.get('.performance-select-shell__selector').trigger('click')
    expect(wrapper.findAll('.performance-flat-option-list__checkbox')).toHaveLength(0)
    expect(wrapper.find('.performance-flat-option-list--checkmark').exists()).toBe(true)
    expect(wrapper.findAll('[role="option"]')[1].attributes('disabled')).toBeDefined()
    await wrapper.findAll('[role="option"]')[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['1']])
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('true')
    await wrapper.get('[role="combobox"]').setValue('2')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1)
    expect(wrapper.get('[role="option"]').text()).toBe('2')
    await wrapper.setProps({ modelValue: null, multiple: false, selectionStyle: 'plain' })
    await wrapper.get('[role="combobox"]').setValue('')
    await wrapper.findAll('[role="option"]')[0].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[1]).toEqual(['1'])
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('uses a single right checkmark for day kind and replaces the selected scalar', async () => {
    const unit = mount(PerformanceSearchSelect, { props: { modelValue: 'calendar_day', selectionStyle: 'plain', optionStyle: 'checkmark', options: [{ value: 'calendar_day', label: '自然日' }, { value: 'working_day', label: '工作日' }], 'onUpdate:modelValue': value => { void unit.setProps({ modelValue: value }) } }, global: { stubs: { Teleport: true } } })
    await unit.get('.performance-select-shell__selector').trigger('click')
    expect(unit.findAll('[role="option"]')).toHaveLength(2)
    expect(unit.findAll('.performance-flat-option-list__checkmark')).toHaveLength(1)
    expect(unit.find('.performance-flat-option-list__checkbox').exists()).toBe(false)
    expect(unit.get('[role="combobox"]').attributes('readonly')).toBeDefined()
    await unit.findAll('[role="option"]')[1].trigger('click')
    expect(unit.props('modelValue')).toBe('working_day')
    expect(unit.get('[role="combobox"]').attributes('aria-expanded')).toBe('false')
    expect(unit.get('.performance-select-shell__content .performance-select-shell__tag-content').text()).toBe('工作日')
    expect(unit.find('.performance-select-shell__tag-close').exists()).toBe(false)
    await unit.get('.performance-select-shell__selector').trigger('click')
    expect(unit.findAll('.performance-flat-option-list__checkmark')).toHaveLength(1)
    expect(unit.findAll('[role="option"]')[0].attributes('aria-selected')).toBe('false')
    expect(unit.findAll('[role="option"]')[1].attributes('aria-selected')).toBe('true')
    await unit.findAll('[role="option"]')[0].trigger('click')
    expect(unit.props('modelValue')).toBe('calendar_day')
    unit.unmount()
  })

  it('submits the saved workday scalar, resets cancelled drafts and disables the unit while saving', async () => {
    const rule = { ...defaultTodoNotificationRule(), frequency: 'specified' as const, days_before: [3], day_kind: 'working_day' as const }
    const wrapper = mount(PerformanceTodoNotificationDialog, { props: { modelValue: true, rule }, global: { stubs } })
    const unit = wrapper.findAllComponents(PerformanceSearchSelect)[1]
    expect(unit.props('modelValue')).toBe('working_day')
    unit.vm.$emit('update:modelValue', 'calendar_day')
    await wrapper.findAll('.todo-notification-actions button')[0].trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(rule.day_kind).toBe('working_day')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    expect(wrapper.findAllComponents(PerformanceSearchSelect)[1].props('modelValue')).toBe('working_day')
    await wrapper.findAll('.todo-notification-actions button')[1].trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([rule])
    await wrapper.setProps({ saving: true })
    expect(wrapper.findAllComponents(PerformanceSearchSelect)[1].props('disabled')).toBe(true)
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
