import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'

enableAutoUnmount(afterEach)
afterEach(() => vi.useRealTimers())

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

  it('reuses the shared white popover around a disabled button without enabling it', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PerformanceDisabledReason, {
      attachTo: document.body,
      props: { disabled: true, reason: '系统预置字段，不允许编辑', variant: 'popover' },
      slots: { default: '<button disabled>编辑</button>' },
    })
    const popover = wrapper.getComponent(PerformanceInfoPopover)
    expect(popover.props('width')).toBe('auto')
    expect(popover.props('variant')).toBe('disabled-action')
    expect(wrapper.find('[data-disabled-reason]').exists()).toBe(true)
    await wrapper.get('.performance-info-popover__anchor').trigger('mouseenter')
    vi.advanceTimersByTime(124)
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain('系统预置字段，不允许编辑')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ disabled: false })
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
    expect(wrapper.findComponent(PerformanceInfoPopover).exists()).toBe(false)
  })

  it('does not show a system reason for an action outside the disabled-reason scope', () => {
    const wrapper = mount(PerformanceDisabledReason, {
      props: { disabled: false, reason: '系统预置字段，不允许编辑', variant: 'popover' },
      slots: { default: '<button disabled>编辑</button>' },
    })
    expect(wrapper.findComponent(PerformanceInfoPopover).exists()).toBe(false)
    expect(wrapper.find('[data-disabled-reason]').exists()).toBe(false)
    expect(wrapper.find('[tabindex]').exists()).toBe(false)
  })
})
