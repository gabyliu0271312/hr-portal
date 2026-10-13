import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceNumberInput from './PerformanceNumberInput.vue'

describe('PerformanceNumberInput', () => {
  it('uses the measured interval outer frame and nested handle dimensions', () => {
    const wrapper = mount(PerformanceNumberInput, { props: { size: 'interval', disabled: true } })
    const root = wrapper.get('.performance-number-input')
    expect(root.attributes('style')).toContain('--number-input-width: 98px')
    expect(root.attributes('style')).toContain('--number-input-control-height: 31px')
    expect(root.get('input').attributes('readonly')).toBeUndefined()
    expect(root.get('.number-stepper').attributes('style')).toBeUndefined()
  })
})
