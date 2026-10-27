import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceRoleMultiSelect from './PerformanceRoleMultiSelect.vue'

describe('PerformanceRoleMultiSelect', () => {
  it('opens on click and toggles node-role values', async () => {
    const wrapper = mount(PerformanceRoleMultiSelect, {
      attachTo: document.body,
      props: { modelValue: [], options: ['实线上级', '虚线上级'] },
    })

    await wrapper.get('.performance-select-shell__selector').trigger('click')
    const option = document.body.querySelectorAll<HTMLButtonElement>('.performance-flat-option-list__option')[1]
    option.click()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['虚线上级']])
    wrapper.unmount()
  })

  it('renders selected values as removable tags', async () => {
    const wrapper = mount(PerformanceRoleMultiSelect, {
      props: { modelValue: ['实线上级'], options: ['实线上级'] },
    })

    expect(wrapper.get('.performance-select-shell__content .performance-select-shell__tag').text()).toContain('实线上级')
    await wrapper.get('.performance-select-shell__content .performance-select-shell__tag-close').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[]])
  })

  it('uses the shared empty state without fabricating candidate roles', async () => {
    const wrapper = mount(PerformanceRoleMultiSelect, { props: { modelValue: [], options: [] }, global: { stubs: { Teleport: true } } })
    await wrapper.get('.performance-select-shell__selector').trigger('click')
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('true')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(0)
    expect(wrapper.get('.performance-flat-option-list__empty').text()).toBe('暂无可选项')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
