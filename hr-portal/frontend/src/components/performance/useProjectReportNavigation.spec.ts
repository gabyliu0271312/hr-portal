import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useProjectReportNavigation } from './useProjectReportNavigation'

const box = (top: number, height = 100) => ({ top, y: top, bottom: top + height, left: 0, right: 700, x: 0, width: 700, height, toJSON() {} })

describe('useProjectReportNavigation', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = '' })

  it('tracks external scrolling, recomputes section geometry and cleans up observers', async () => {
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', vi.fn(cb => { frame = cb; return 1 }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const disconnect = vi.fn()
    const observe = vi.fn()
    let resize: (() => void) | undefined
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { resize = cb } observe = observe; disconnect = disconnect })
    const scroller = document.createElement('div')
    scroller.style.overflowY = 'auto'
    scroller.style.paddingTop = '20px'
    document.body.appendChild(scroller)
    Object.defineProperty(scroller, 'clientHeight', { value: 400 })
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000 })
    scroller.getBoundingClientRect = () => box(56, 400)
    scroller.scrollTo = vi.fn()
    const remove = vi.spyOn(scroller, 'removeEventListener')
    let navigation!: ReturnType<typeof useProjectReportNavigation>
    const wrapper = mount(defineComponent({
      setup() { const root = ref<HTMLElement | null>(null); navigation = useProjectReportNavigation(root); return { root } },
      template: '<div ref="root"><section data-report-section="overview"/><section data-report-section="department"/><aside class="report-navigation"/></div>',
    }), { attachTo: scroller })
    await flushPromises()
    const sections = wrapper.findAll('section')
    sections[0].element.getBoundingClientRect = () => box(180 - scroller.scrollTop)
    let departmentTop = 894
    sections[1].element.getBoundingClientRect = () => box(departmentTop - scroller.scrollTop)
    frame?.(0)
    expect(navigation.activeKey.value).toBe('overview')
    expect((wrapper.element as HTMLElement).style.getPropertyValue('--report-scroll-padding')).toBe('20px')
    navigation.select('department')
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 730, behavior: 'auto' })
    scroller.scrollTop = 900
    scroller.dispatchEvent(new Event('scroll'))
    frame?.(0)
    expect(navigation.activeKey.value).toBe('department')
    departmentTop = 1200
    resize?.()
    frame?.(0)
    expect(navigation.activeKey.value).toBe('overview')
    expect((wrapper.element as HTMLElement).style.getPropertyValue('--report-scroll-padding')).toBe('20px')
    navigation.select('department')
    expect(scroller.scrollTo).toHaveBeenLastCalledWith({ top: 1036, behavior: 'auto' })
    expect(observe).toHaveBeenCalledWith(sections[1].element)
    wrapper.unmount()
    expect(disconnect).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function))
    expect(cancelAnimationFrame).toHaveBeenCalled()
  })
})
