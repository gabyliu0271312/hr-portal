import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ScheduleSelector from './ScheduleSelector.vue'

const stubs = {
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { props: ['label'], template: '<span>{{ label }}</span>' },
  'el-date-picker': true,
  'el-input': true,
}

describe('ScheduleSelector', () => {
  it('keeps manual execution out of scheduled-trigger choices', () => {
    const wrapper = mount(ScheduleSelector, {
      props: { schedule: '', showStartTime: false, allowAdvanced: false, allowManual: false },
      global: { stubs },
    })

    expect(wrapper.text()).toContain('每 6 小时')
    expect(wrapper.text()).not.toContain('手动触发')
  })
})
