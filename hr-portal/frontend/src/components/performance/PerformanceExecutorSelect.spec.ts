import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceExecutorSelect from './PerformanceExecutorSelect.vue'
import executorSelectSource from './PerformanceExecutorSelect.vue?raw'
import { PERFORMANCE_EXECUTOR_OPTIONS } from './performanceExecutorOptions'

const options = PERFORMANCE_EXECUTOR_OPTIONS.filter((option) =>
  ['SUBJECT', 'REAL_LINE_MANAGER', 'VIRTUAL_LINE_MANAGER'].includes(option.type),
)

describe('PerformanceExecutorSelect', () => {
  it('matches the target selector structure and dimensions contract', () => {
    const wrapper = mount(PerformanceExecutorSelect, { props: { modelValue: '实线上级', options } })
    expect(wrapper.get('.ud__select__selector').attributes('role')).toBe('combobox')
    expect(wrapper.find('.ud__select__selector__content').exists()).toBe(true)
    expect(wrapper.get('.ud__select__selector__selectItem').text()).toBe('实线上级')
    expect(wrapper.get('.ud__select__selector__search__input').attributes('type')).toBe('search')
    expect(wrapper.get('.ud__select__selector__arrow svg').attributes('width')).toBe('1em')
    expect(wrapper.get('.ud__select__selector__arrow path').attributes('d')).toContain('m3.414 7.086')
  })

  it('opens, filters, selects, and closes the custom option list', async () => {
    const wrapper = mount(PerformanceExecutorSelect, { props: { modelValue: '实线上级', options } })
    await wrapper.get('.ud__select__selector').trigger('click')
    expect(wrapper.findAll('.executor-option')).toHaveLength(3)
    await wrapper.get('.ud__select__selector__search__input').setValue('虚线')
    expect(wrapper.findAll('.executor-option')).toHaveLength(1)
    await wrapper.get('.executor-option').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['虚线上级']])
    expect(wrapper.find('.executor-options').exists()).toBe(false)
  })

  it('lets the option list height follow its rendered options and caps long lists', () => {
    expect(executorSelectSource).toContain('height:auto;max-height:165.333px;overflow:auto;padding:2px 0')
    expect(executorSelectSource).not.toContain('height:165.333px;max-height:165.333px')
  })

  it('opens on pointer entry, shows the selected row until another option is hovered, and places the list below', async () => {
    const wrapper = mount(PerformanceExecutorSelect, { props: { modelValue: '实线上级', options } })
    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    expect(wrapper.find('.executor-options').exists()).toBe(true)
    const selected = wrapper.get('.executor-option[aria-selected="true"]')
    expect(selected.classes()).not.toContain('is-hovered')
    expect(selected.classes()).toContain('is-selected-visible')
    await wrapper.findAll('.executor-option')[2].trigger('mouseenter')
    expect(wrapper.findAll('.executor-option')[2].classes()).toContain('is-hovered')
    expect(selected.classes()).not.toContain('is-hovered')
    expect(selected.classes()).not.toContain('is-selected-visible')
    expect(wrapper.get('.executor-options').classes()).toContain('has-hovered')
    await wrapper.get('.executor-options').trigger('mouseleave')
    expect(selected.classes()).not.toContain('is-hovered')
    expect(selected.classes()).toContain('is-selected-visible')
    expect(wrapper.get('.executor-options').classes()).not.toContain('has-hovered')
    expect(wrapper.get('.ud__select__selector').attributes('class')).toContain('ud__select__selector')
  })
})
