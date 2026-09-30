import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'

enableAutoUnmount(afterEach)
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

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

  it('reuses the captured arrow and a custom disabled trigger with natural content width', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PerformanceInfoPopover, {
      attachTo: document.body,
      props: { content: '系统预置字段，不允许编辑', variant: 'disabled-action', width: 'auto' },
      slots: { default: '<button disabled>编辑</button>' },
    })
    expect(wrapper.find('[data-icon="InfoOutlined"]').exists()).toBe(false)
    const anchor = wrapper.get('.performance-info-popover__anchor')
    await anchor.trigger('mouseenter')
    vi.advanceTimersByTime(124)
    await wrapper.vm.$nextTick()
    const popover = document.body.querySelector<HTMLElement>('.performance-info-popover--action')!
    expect(popover.textContent).toContain('系统预置字段，不允许编辑')
    expect(popover.style.width).toBe('max-content')
    expect(anchor.attributes('aria-describedby')).toBe(popover.id)
    expect(popover.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 16 8')
    expect(popover.querySelector('path')?.getAttribute('d')).toBe('M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 002.242 0l2.814-3.166A5.438 5.438 0 0116 .5v-1H8z')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.performance-info-popover--action')).toBeNull()
    expect(anchor.attributes('aria-describedby')).toBeUndefined()
  })

  it('cancels a brief hover and stays readable when moving from the trigger to the popover', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PerformanceInfoPopover, {
      attachTo: document.body,
      props: { content: '系统预置字段，不允许删除', variant: 'disabled-action', width: 'auto' },
      slots: { default: '<button disabled>删除</button>' },
    })
    const anchor = wrapper.get('.performance-info-popover__anchor')
    await anchor.trigger('mouseenter')
    vi.advanceTimersByTime(50)
    await anchor.trigger('mouseleave')
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.performance-info-popover')).toBeNull()
    await anchor.trigger('mouseenter')
    vi.advanceTimersByTime(124)
    await wrapper.vm.$nextTick()
    const popover = document.body.querySelector<HTMLElement>('.performance-info-popover')!
    await anchor.trigger('mouseleave')
    vi.advanceTimersByTime(60)
    popover.dispatchEvent(new MouseEvent('mouseenter'))
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()
    expect(document.body.contains(popover)).toBe(true)
    popover.dispatchEvent(new MouseEvent('mouseleave'))
    vi.advanceTimersByTime(124)
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.performance-info-popover')).toBeNull()
  })

  it('uses unique descriptions, supports focus, and removes portalled content on unmount', async () => {
    vi.useFakeTimers()
    const options = { attachTo: document.body, props: { content: '系统预置字段，不允许编辑', variant: 'disabled-action' as const, width: 'auto' as const }, slots: { default: '<button disabled>编辑</button>' } }
    const first = mount(PerformanceInfoPopover, options)
    const second = mount(PerformanceInfoPopover, options)
    await first.get('.performance-info-popover__anchor').trigger('focusin')
    await second.get('.performance-info-popover__anchor').trigger('focusin')
    vi.advanceTimersByTime(124)
    await first.vm.$nextTick()
    const ids = Array.from(document.body.querySelectorAll('.performance-info-popover')).map(node => node.id)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
    await first.get('.performance-info-popover__anchor').trigger('focusout')
    expect(document.body.querySelectorAll('.performance-info-popover')).toHaveLength(1)
    second.unmount()
    vi.runAllTimers()
    expect(document.body.querySelector('.performance-info-popover')).toBeNull()
  })

  it('reuses viewport clamping and flips below an anchor near the top edge', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('innerWidth', 894)
    const wrapper = mount(PerformanceInfoPopover, {
      attachTo: document.body,
      props: { content: '系统预置字段，不允许编辑', variant: 'disabled-action', width: 'auto' },
      slots: { default: '<button disabled>编辑</button>' },
    })
    vi.spyOn(wrapper.get('.performance-info-popover__anchor').element, 'getBoundingClientRect').mockReturnValue({ top: 4, bottom: 26, left: 850, right: 878, width: 28, height: 22 } as DOMRect)
    await wrapper.get('.performance-info-popover__anchor').trigger('mouseenter')
    vi.advanceTimersByTime(124)
    await wrapper.vm.$nextTick()
    const popover = document.body.querySelector<HTMLElement>('.performance-info-popover')!
    vi.spyOn(popover, 'getBoundingClientRect').mockReturnValue({ width: 202, height: 48 } as DOMRect)
    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
    expect(popover.style.left).toBe('676px')
    expect(popover.style.top).toBe('36px')
    expect(popover.classList).toContain('performance-info-popover--bottom')
  })
})
