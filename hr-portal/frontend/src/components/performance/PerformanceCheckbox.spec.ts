import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceCheckbox from './PerformanceCheckbox.vue'

describe('PerformanceCheckbox', () => {
  it('emits the checked value and renders the shared checked state', async () => {
    const wrapper = mount(PerformanceCheckbox, { props: { modelValue: false, label: '必填' } })
    await wrapper.get('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
    await wrapper.setProps({ modelValue: true })
    expect(wrapper.get('.ud__checkbox__wallpaper').classes()).toContain('ud__checkbox__wallpaper--checked')
    expect(wrapper.text()).toBe('必填')
    const children = wrapper.get('.performance-checkbox').element.children
    expect(children[0].classList.contains('performance-checkbox__control')).toBe(true)
    expect(children[1].classList.contains('performance-checkbox__label')).toBe(true)
  })

  it('supports the shared disabled state', () => {
    const wrapper = mount(PerformanceCheckbox, { props: { modelValue: false, label: '必填', disabled: true } })
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.performance-checkbox').classes()).toContain('performance-checkbox--disabled')
  })
})
