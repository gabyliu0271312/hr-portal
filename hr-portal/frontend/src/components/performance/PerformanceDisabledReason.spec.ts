import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'

const TooltipStub = {
  props: ['content'],
  template: '<div class="tooltip-stub" :data-content="content"><slot /></div>',
}

describe('PerformanceDisabledReason', () => {
  it('provides a not-allowed hit area and reason for disabled actions', () => {
    const wrapper = mount(PerformanceDisabledReason, {
      props: { disabled: true, reason: '此评估规则已被使用，不允许删除' },
      slots: { default: '<button disabled>删除</button>' },
      global: { stubs: { 'el-tooltip': TooltipStub } },
    })

    expect(wrapper.find('[data-disabled-reason]').exists()).toBe(true)
    expect(wrapper.get('.tooltip-stub').attributes('data-content')).toBe('此评估规则已被使用，不允许删除')
  })

  it('does not render a tooltip for enabled actions', () => {
    const wrapper = mount(PerformanceDisabledReason, {
      slots: { default: '<button>删除</button>' },
      global: { stubs: { 'el-tooltip': TooltipStub } },
    })
    expect(wrapper.find('.tooltip-stub').exists()).toBe(false)
    expect(wrapper.get('.performance-disabled-reason').classes()).toContain('is-enabled')
  })
})
