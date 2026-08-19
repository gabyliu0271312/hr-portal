import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'

describe('PerformanceInfoPopover', () => {
  it('opens after the configured delay and positions a text tooltip above its anchor', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PerformanceInfoPopover, {
      attachTo: document.body,
      props: { content: '提示内容' },
      global: { stubs: { Teleport: false } },
    })
    vi.spyOn(wrapper.get('.performance-info-popover__anchor').element, 'getBoundingClientRect').mockReturnValue({
      top: 200, right: 516, bottom: 216, left: 500, width: 16, height: 16, x: 500, y: 200, toJSON: () => ({}),
    } as DOMRect)

    await wrapper.get('.performance-info-popover__anchor').trigger('mouseenter')
    vi.advanceTimersByTime(123)
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.performance-info-popover')).toBeNull()
    vi.advanceTimersByTime(1)
    await wrapper.vm.$nextTick()

    const popover = document.body.querySelector<HTMLElement>('.performance-info-popover')
    expect(popover?.textContent).toContain('提示内容')
    expect(popover?.classList).toContain('performance-info-popover--top')
    expect(popover?.style.width).toBe('420px')
    expect(popover?.querySelector('svg')?.getAttribute('width')).toBe('16')
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('renders list content through the same shared popover', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PerformanceInfoPopover, {
      props: { content: ['第一项', '第二项'] },
      attachTo: document.body,
      global: { stubs: { Teleport: false } },
    })
    await wrapper.get('.performance-info-popover__anchor').trigger('focusin')
    vi.advanceTimersByTime(124)
    await wrapper.vm.$nextTick()

    expect(document.body.querySelectorAll('.performance-info-popover__line')).toHaveLength(2)
    expect(document.body.querySelectorAll('.performance-info-popover__dot')).toHaveLength(2)
    wrapper.unmount()
    vi.useRealTimers()
  })
})
