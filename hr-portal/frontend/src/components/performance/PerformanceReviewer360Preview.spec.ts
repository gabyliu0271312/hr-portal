import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PerformanceReviewer360Preview from '@/components/performance/PerformanceReviewer360Preview.vue'

describe('PerformanceReviewer360Preview', () => {
  it('renders 360 evaluation detail', () => {
    const wrapper = mount(PerformanceReviewer360Preview)
    expect(wrapper.text()).toContain('已评估')
    expect(wrapper.text()).toContain('评估维度')
    expect(wrapper.findAll('.r360-form__item')).toHaveLength(2)
  })
})
