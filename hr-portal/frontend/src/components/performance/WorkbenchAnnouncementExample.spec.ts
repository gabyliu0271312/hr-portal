import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorkbenchAnnouncementExample from './WorkbenchAnnouncementExample.vue'
import PerformancePopover from './PerformancePopover.vue'

describe('WorkbenchAnnouncementExample', () => {
  afterEach(() => vi.useRealTimers())
  it('shows a 500px shared popover containing a 468×286 local illustration on hover and focus', async () => {
    const wrapper = mount(WorkbenchAnnouncementExample, { global: { stubs: { PerformancePopover: { props: ['visible', 'width', 'anchor'], template: '<aside v-if="visible"><slot /></aside>' } } } })
    await wrapper.get('button').trigger('focus')
    expect(wrapper.getComponent(PerformancePopover).props()).toMatchObject({ visible: true, width: 'var(--performance-announcement-example-width)' })
    expect(wrapper.get('img').attributes()).toMatchObject({ width: '468', height: '286', alt: '公告弹窗布局示例，含查看详情和我已知悉按钮' })
    await wrapper.get('button').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('aside').exists()).toBe(false)
    await wrapper.get('.announcement-example-trigger').trigger('mouseenter')
    expect(wrapper.find('aside').exists()).toBe(true)
    wrapper.unmount()
  })
  it('keeps hover visible when moving into the popover and closes on blur', async () => {
    vi.useFakeTimers()
    const wrapper = mount(WorkbenchAnnouncementExample, { global: { stubs: { PerformancePopover: { props: ['visible'], template: '<aside v-if="visible"><slot /></aside>' } } } })
    await wrapper.get('button').trigger('focus')
    await wrapper.get('button').trigger('blur')
    wrapper.getComponent(PerformancePopover).vm.$emit('mouseenter')
    await vi.advanceTimersByTimeAsync(150)
    expect(wrapper.find('aside').exists()).toBe(true)
    wrapper.getComponent(PerformancePopover).vm.$emit('mouseleave')
    await vi.advanceTimersByTimeAsync(150)
    expect(wrapper.find('aside').exists()).toBe(false)
    wrapper.unmount()
  })
})
