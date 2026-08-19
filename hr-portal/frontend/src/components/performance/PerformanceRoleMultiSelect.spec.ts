import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceRoleMultiSelect from './PerformanceRoleMultiSelect.vue'

describe('PerformanceRoleMultiSelect', () => {
  it('opens on click and toggles node-role values', async () => {
    const wrapper = mount(PerformanceRoleMultiSelect, {
      attachTo: document.body,
      props: { modelValue: [], options: ['实线上级', '虚线上级'] },
    })

    await wrapper.get('.role-select-trigger').trigger('click')
    const option = document.body.querySelectorAll<HTMLButtonElement>('.role-select-option')[1]
    option.click()

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['虚线上级']])
    wrapper.unmount()
  })

  it('renders selected values as removable tags', async () => {
    const wrapper = mount(PerformanceRoleMultiSelect, {
      props: { modelValue: ['实线上级'], options: ['实线上级'] },
    })

    expect(wrapper.get('.role-select-tag').text()).toContain('实线上级')
    await wrapper.get('.role-select-tag-close').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[]])
  })

  it('keeps the trigger interactive without rendering an empty popup when no roles are available', async () => {
    const wrapper = mount(PerformanceRoleMultiSelect, {
      attachTo: document.body,
      props: { modelValue: [], options: [] },
    })

    await wrapper.get('.role-select-trigger').trigger('click')

    expect(wrapper.classes()).toContain('open')
    expect(wrapper.classes()).not.toContain('has-options')
    expect(wrapper.get('.role-select-trigger').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.role-select-trigger').attributes('aria-expanded')).toBeUndefined()
    expect(document.body.querySelector('.role-select-dropdown')).toBeNull()
    expect(document.body.querySelectorAll('.role-select-option')).toHaveLength(0)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
