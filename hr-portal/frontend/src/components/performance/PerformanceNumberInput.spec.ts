import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceNumberInput from './PerformanceNumberInput.vue'

describe('PerformanceNumberInput', () => {
  it('supports a unit suffix without changing default controls', async () => {
    const wrapper = mount(PerformanceNumberInput, { props: { suffix: '天', showControls: false, modelValue: '1' } })
    expect(wrapper.get('.number-input-suffix').text()).toBe('天')
    expect(wrapper.find('.number-stepper').exists()).toBe(false)
    await wrapper.setProps({ showControls: true })
    expect(wrapper.findAll('.number-stepper button')).toHaveLength(2)
  })
  it('supports a captured addon without changing default suffix styling or model behavior', async () => {
    const wrapper = mount(PerformanceNumberInput, { props: { suffix: '档', suffixVariant: 'addon', width: '100%', modelValue: '2', ariaLabel: '差异阈值', min: 1, step: 1 } })
    expect(wrapper.classes()).toContain('has-addon')
    expect(wrapper.attributes('style')).toContain('--number-input-width: 100%')
    expect(wrapper.get('.number-input-suffix').text()).toBe('档')
    await wrapper.get('[aria-label="差异阈值增加"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['3'])
    await wrapper.setProps({ suffixVariant: 'inline' })
    expect(wrapper.classes()).not.toContain('has-addon')
  })
  it('uses the measured interval outer frame and nested handle dimensions', () => {
    const wrapper = mount(PerformanceNumberInput, { props: { size: 'interval', disabled: true } })
    const root = wrapper.get('.performance-number-input')
    expect(root.attributes('style')).toContain('--number-input-width: 98px')
    expect(root.attributes('style')).toContain('--number-input-control-height: 31px')
    expect(root.get('input').attributes('readonly')).toBeUndefined()
    expect(root.get('.number-stepper').attributes('style')).toBeUndefined()
  })
})
