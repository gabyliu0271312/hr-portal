import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceMetricFieldIcon from './PerformanceMetricFieldIcon.vue'

describe('PerformanceMetricFieldIcon', () => {
  it.each([
    ['text', 'StyleOutlined'],
    ['number', 'NumberOutlined'],
    ['percentage', 'SheetPercentOutlined'],
    ['person', 'PersonAdmitOutlined'],
  ] as const)('maps %s fields to %s', (fieldType, icon) => {
    const wrapper = mount(PerformanceMetricFieldIcon, { props: { fieldType } })
    expect(wrapper.find(`[data-icon="${icon}"]`).exists()).toBe(true)
  })
})
