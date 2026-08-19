import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceSwitchSettingRow from './PerformanceSwitchSettingRow.vue'

describe('PerformanceSwitchSettingRow', () => {
  it('composes the shared switch and optional information popover', async () => {
    const wrapper = mount(PerformanceSwitchSettingRow, {
      props: { modelValue: false, label: '设置执行人需完成上一环节任务', info: '说明' },
    })

    expect(wrapper.get('.performance-switch-setting-row__label').text()).toBe('设置执行人需完成上一环节任务')
    expect(wrapper.find('.performance-info-popover__anchor').exists()).toBe(true)
    expect(wrapper.get('.performance-switch').attributes('aria-checked')).toBe('false')
    await wrapper.get('.performance-switch').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[true]])
  })

  it('passes the locked state to the shared switch', () => {
    const wrapper = mount(PerformanceSwitchSettingRow, {
      props: { modelValue: false, label: '设置项', disabled: true },
    })

    expect(wrapper.get('.performance-switch').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.performance-info-popover__anchor').exists()).toBe(false)
  })
})
