import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceButton from './PerformanceButton.vue'

describe('PerformanceButton', () => {
  it('maps variants to shared state classes and disables loading actions', () => {
    const wrapper = mount(PerformanceButton, {
      props: { variant: 'primary', loading: true },
      slots: { default: '保存' },
    })

    expect(wrapper.get('button').classes()).toContain('performance-button--primary')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('保存')
  })

  it('emits the native click event for enabled actions', async () => {
    const wrapper = mount(PerformanceButton, { slots: { default: '取消' } })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
