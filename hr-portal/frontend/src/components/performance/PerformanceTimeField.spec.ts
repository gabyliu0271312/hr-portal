import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { ElTimePicker } from 'element-plus'
import PerformanceTimeField from './PerformanceTimeField.vue'

describe('PerformanceTimeField', () => {
  it('uses a pure minute-precision string and forwards disabled state', async () => {
    const wrapper = mount(PerformanceTimeField, { props: { modelValue: '10:00' } })
    const picker = wrapper.getComponent(ElTimePicker)
    expect(picker.props('format')).toBe('HH:mm')
    expect(picker.props('valueFormat')).toBe('HH:mm')
    expect(picker.props('popperStyle')).toEqual({ zIndex: 'var(--performance-popover-z-index)' })
    picker.vm.$emit('update:modelValue', '09:30')
    expect(wrapper.emitted('update:modelValue')).toEqual([['09:30']])
    await wrapper.setProps({ disabled: true })
    expect(picker.props('disabled')).toBe(true)
    wrapper.unmount()
  })
})
