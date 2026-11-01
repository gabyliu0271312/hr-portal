import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import PerformanceSplitWorkspace from './PerformanceSplitWorkspace.vue'

enableAutoUnmount(afterEach)
let notifyResize: ResizeObserverCallback
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { notifyResize = callback }
    observe = vi.fn()
    disconnect = vi.fn()
  })
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function resize(el: Element, width: number) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ width, height: 700, left: 0, right: width, top: 0, bottom: 700, x: 0, y: 0, toJSON: () => ({}) })
  notifyResize([], {} as ResizeObserver)
}
function leftWidth(wrapper: ReturnType<typeof mount>) { return Number(wrapper.get('.split-separator').attributes('aria-valuenow')) }
describe('PerformanceSplitWorkspace', () => {
  it('uses 60% minus 3px on sufficiently wide containers and clamps stale offsets', async () => {
    const wrapper = mount(PerformanceSplitWorkspace, { props: { enabled: true } })
    resize(wrapper.element, 1920); await wrapper.vm.$nextTick()
    expect(leftWidth(wrapper)).toBe(1149)
    expect(wrapper.attributes('style')).toContain('--split-left-width: 1149px')
    resize(wrapper.element, 1280); await wrapper.vm.$nextTick()
    expect(leftWidth(wrapper)).toBe(743)
  })
  it('supports keyboard boundaries and restores the saved pixel offset', async () => {
    localStorage.setItem('draggableContainerOffset', '-153')
    const wrapper = mount(PerformanceSplitWorkspace, { props: { enabled: true } })
    resize(wrapper.element, 1280); await wrapper.vm.$nextTick()
    expect(leftWidth(wrapper)).toBe(615)
    const separator = wrapper.get('.split-separator')
    await separator.trigger('keydown', { key: 'Home' })
    expect(leftWidth(wrapper)).toBe(524)
    await separator.trigger('keydown', { key: 'End' })
    expect(leftWidth(wrapper)).toBe(743)
    await separator.trigger('keydown', { key: 'ArrowLeft' })
    expect(leftWidth(wrapper)).toBe(727)
    expect(Number(localStorage.getItem('draggableContainerOffset'))).toBe(727 - 768)
  })
  it('falls back below minimum and keeps the same current-content DOM while restoring split', async () => {
    const wrapper = mount(PerformanceSplitWorkspace, { props: { enabled: true }, slots: { default: '<input value="保留输入" />' } })
    const input = wrapper.get('input').element
    resize(wrapper.element, 1050); await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('is-split')
    expect(wrapper.get('.split-separator').isVisible()).toBe(false)
    resize(wrapper.element, 1280); await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('is-split')
    await wrapper.setProps({ enabled: false })
    expect(wrapper.classes()).not.toContain('is-split')
    expect(wrapper.get('input').element).toBe(input)
  })
  it('flushes the trailing drag position and cleans listeners on release, blur and unmount', async () => {
    vi.useFakeTimers()
    localStorage.setItem('draggableContainerOffset', '-153')
    document.body.style.userSelect = 'text'
    const add = vi.spyOn(document.body, 'addEventListener'), remove = vi.spyOn(document.body, 'removeEventListener')
    const wrapper = mount(PerformanceSplitWorkspace, { props: { enabled: true } })
    resize(wrapper.element, 1280); await wrapper.vm.$nextTick()
    await wrapper.get('.split-separator').trigger('mousedown', { button: 0, clientX: 615 })
    expect(add).toHaveBeenCalledWith('mousemove', expect.any(Function))
    document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 640 }))
    document.body.dispatchEvent(new MouseEvent('mousemove', { clientX: 670 }))
    document.body.dispatchEvent(new MouseEvent('mouseup'))
    await wrapper.vm.$nextTick()
    expect(leftWidth(wrapper)).toBe(670)
    expect(remove).toHaveBeenCalledWith('mousemove', expect.any(Function))
    expect(document.body.style.userSelect).toBe('text')
    await wrapper.get('.split-separator').trigger('mousedown', { button: 0, clientX: 670 })
    window.dispatchEvent(new Event('blur'))
    expect(document.body.style.userSelect).toBe('text')
    await wrapper.get('.split-separator').trigger('mousedown', { button: 0, clientX: 670 })
    wrapper.unmount()
    await vi.runAllTimersAsync()
    expect(document.body.style.userSelect).toBe('text')
    document.body.style.userSelect = ''
  })
  it('finishes an active drag when mode or container width changes', async () => {
    const wrapper = mount(PerformanceSplitWorkspace, { props: { enabled: true } })
    resize(wrapper.element, 1280); await wrapper.vm.$nextTick()
    await wrapper.get('.split-separator').trigger('mousedown', { button: 0, clientX: 700 })
    await wrapper.setProps({ enabled: false })
    expect(wrapper.classes()).not.toContain('is-dragging')
    expect(document.body.style.userSelect).toBe('')
  })
})
