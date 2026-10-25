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

  it('supports a captured checked-color variant without changing the default', () => {
    const wrapper = mount(PerformanceCheckbox, { props: { modelValue: true, label: '必填', checkedColor: '#336df4' } })
    expect(wrapper.get('.performance-checkbox').attributes('style')).toContain('--performance-checkbox-checked-color: #336df4')
  })

  it('keeps normal checkbox visuals in readonly mode without allowing changes', async () => {
    const wrapper = mount(PerformanceCheckbox, { props: { modelValue: true, label: '预览标签', readonly: true } })
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.classes()).toContain('performance-checkbox--readonly')
    expect(wrapper.classes()).not.toContain('performance-checkbox--disabled')
    expect(wrapper.find('.ud__checkbox__wallpaper--checked').exists()).toBe(true)
    await wrapper.get('input').trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.setProps({ disabled: true })
    expect(wrapper.classes()).toContain('performance-checkbox--disabled')
    expect(wrapper.classes()).not.toContain('performance-checkbox--readonly')
    await wrapper.get('input').trigger('change')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('supports the shared disabled state', () => {
    const wrapper = mount(PerformanceCheckbox, { props: { modelValue: false, label: '必填', disabled: true } })
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.performance-checkbox').classes()).toContain('performance-checkbox--disabled')
  })
})
