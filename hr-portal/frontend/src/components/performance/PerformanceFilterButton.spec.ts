import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceFilterButton from './PerformanceFilterButton.vue'

describe('PerformanceFilterButton', () => {
  it('shows the active count and primary outline state', async () => {
    const wrapper = mount(PerformanceFilterButton, { props: { active: true, count: 2 } })
    expect(wrapper.text()).toContain('筛选 (2)')
    expect(wrapper.attributes('aria-pressed')).toBe('true')
    expect(wrapper.classes()).toContain('performance-button--outline-primary')
    expect(wrapper.attributes('style')).toContain('--performance-filter-active-background')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('uses the neutral secondary state without filters', () => {
    const wrapper = mount(PerformanceFilterButton)
    expect(wrapper.text()).toContain('筛选')
    expect(wrapper.text()).not.toContain('(')
    expect(wrapper.attributes('aria-pressed')).toBe('false')
    expect(wrapper.classes()).toContain('performance-button--secondary')
  })
})
