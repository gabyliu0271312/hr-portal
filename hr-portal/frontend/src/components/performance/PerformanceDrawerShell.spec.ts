import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import source from './PerformanceDrawerShell.vue?raw'

const props = { modelValue: true, width: '720px', initialWidth: 1000, resizable: true, minWidth: 720, mask: false, cacheKey: 'perf-drawer' }
const namespace = 'RESIZABLE-DRAWER-LOCKR-NS'
const panel = () => document.body.querySelector('.performance-drawer__panel') as HTMLElement
const separator = () => document.body.querySelector('[role="separator"]') as HTMLElement
const stored = () => JSON.parse(localStorage.getItem(namespace) || '{}').data
function mouse(type: string, clientX: number, button = 0) { return new MouseEvent(type, { clientX, button, bubbles: true, cancelable: true }) }

beforeEach(() => {
  vi.restoreAllMocks()
  vi.useFakeTimers()
  localStorage.clear()
  vi.stubGlobal('innerWidth', 1280)
  vi.spyOn(document.body, 'offsetWidth', 'get').mockImplementation(() => window.innerWidth)
})
afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals() })

describe('PerformanceDrawerShell', () => {
  it('keeps the default modal while an evaluation drawer uses initialWidth and no mask', () => {
    const modal = mount(PerformanceDrawerShell, { props: { modelValue: true } })
    expect(document.body.querySelector('.performance-drawer__mask')).not.toBeNull()
    expect(panel().getAttribute('aria-modal')).toBe('true')
    modal.unmount()
    const drawer = mount(PerformanceDrawerShell, { props })
    expect(document.body.querySelector('.performance-drawer__mask')).toBeNull()
    expect(panel().getAttribute('aria-modal')).toBe('false')
    expect(panel().style.width).toBe('1000px')
    expect(separator().getAttribute('aria-valuemin')).toBe('720')
    expect(separator().querySelectorAll('circle')).toHaveLength(3)
    expect(source).toContain('inset:0 -20px')
    expect(stored()['resizable-drawer-perf-drawer']).toEqual({ 'zh-CN': 1000, 'en-US': 1000 })
    drawer.unmount()
  })

  it('clamps keyboard resizing and persists the language-specific width across mounts', async () => {
    const wrapper = mount(PerformanceDrawerShell, { props })
    separator().dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
    await nextTick()
    expect(panel().style.width).toBe('720px')
    separator().dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await nextTick()
    expect(panel().style.width).toBe('1132px')
    expect(stored()['resizable-drawer-perf-drawer']).toEqual({ 'zh-CN': 1132, 'en-US': 1000 })
    wrapper.unmount()
    const reopened = mount(PerformanceDrawerShell, { props })
    expect(panel().style.width).toBe('1132px')
    reopened.unmount()
    const english = mount(PerformanceDrawerShell, { props: { ...props, lang: 'en-US' } })
    expect(panel().style.width).toBe('1000px')
    english.unmount()
  })

  it('uses document mouse events and body coordinates with 50ms leading/trailing updates', async () => {
    const wrapper = mount(PerformanceDrawerShell, { props })
    separator().dispatchEvent(mouse('mousedown', 295))
    expect(document.body.style.userSelect).toBe('none')
    document.dispatchEvent(mouse('mousemove', 300))
    await nextTick()
    expect(panel().style.width).toBe('980px')
    document.dispatchEvent(mouse('mousemove', 400))
    await nextTick()
    expect(panel().style.width).toBe('980px')
    await vi.advanceTimersByTimeAsync(49)
    expect(panel().style.width).toBe('980px')
    await vi.advanceTimersByTimeAsync(1)
    expect(panel().style.width).toBe('880px')
    document.dispatchEvent(mouse('mousemove', 500))
    document.dispatchEvent(mouse('mouseup', 500))
    await nextTick()
    expect(panel().style.width).toBe('780px')
    expect(document.body.style.userSelect).toBe('')
    expect(separator().classList.contains('is-resizing')).toBe(false)
    document.dispatchEvent(mouse('mousemove', 100))
    await vi.advanceTimersByTimeAsync(100)
    expect(panel().style.width).toBe('780px')
    expect(stored()['resizable-drawer-perf-drawer']['zh-CN']).toBe(780)
    wrapper.unmount()
  })

  it('debounces viewport changes for 300ms and constrains shrinking without enlarging again', async () => {
    const wrapper = mount(PerformanceDrawerShell, { props })
    vi.stubGlobal('innerWidth', 390)
    window.dispatchEvent(new Event('resize'))
    await vi.advanceTimersByTimeAsync(299)
    expect(panel().style.width).toBe('1000px')
    await vi.advanceTimersByTimeAsync(1)
    expect(panel().style.width).toBe('390px')
    vi.stubGlobal('innerWidth', 1920)
    window.dispatchEvent(new Event('resize'))
    await vi.advanceTimersByTimeAsync(300)
    expect(panel().style.width).toBe('720px')
    wrapper.unmount()
  })

  it('keeps other drawers and the other language intact in the Lockr namespace', async () => {
    localStorage.setItem(namespace, JSON.stringify({ data: { other: { value: 1 }, 'resizable-drawer-perf-drawer': { 'zh-CN': 900, 'en-US': 850 } } }))
    const wrapper = mount(PerformanceDrawerShell, { props: { ...props, lang: 'en-US' } })
    expect(panel().style.width).toBe('850px')
    separator().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await nextTick()
    expect(stored()).toEqual({ other: { value: 1 }, 'resizable-drawer-perf-drawer': { 'zh-CN': 900, 'en-US': 866 } })
    wrapper.unmount()
  })

  it('renders when storage is blocked and honors keyboard=false for ESC', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    const wrapper = mount(PerformanceDrawerShell, { props: { ...props, keyboard: false } })
    expect(panel().style.width).toBe('1000px')
    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toBeUndefined()
    await wrapper.setProps({ keyboard: true })
    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('cleans pending drag and resize timers on blur, close and unmount', async () => {
    const wrapper = mount(PerformanceDrawerShell, { props })
    separator().dispatchEvent(mouse('mousedown', 280))
    document.dispatchEvent(mouse('mousemove', 300))
    document.dispatchEvent(mouse('mousemove', 350))
    window.dispatchEvent(new Event('blur'))
    await nextTick()
    expect(panel().style.width).toBe('930px')
    separator().dispatchEvent(mouse('mousedown', 350))
    await wrapper.setProps({ modelValue: false })
    expect(document.body.style.userSelect).toBe('')
    window.dispatchEvent(new Event('resize'))
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(500)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('uses the captured evaluation close size without changing configuration drawers', () => {
    const evaluation = mount(PerformanceDrawerShell, { props: { modelValue: true, variant: 'evaluation' } })
    expect(document.body.querySelector('.performance-drawer__close svg')?.getAttribute('width')).toBe('16')
    expect(source).toContain('.performance-drawer__panel--evaluation .performance-drawer__close{width:24px;height:24px;flex:0 0 24px;margin:0;padding:4px}')
    expect(source).toContain('min-height:69.5px;flex:0 0 auto;align-items:flex-start')
    evaluation.unmount()
    const captured = mount(PerformanceDrawerShell, { props: { modelValue: true, variant: 'captured' } })
    expect(document.body.querySelector('.performance-drawer__close svg')?.getAttribute('width')).toBe('20')
    captured.unmount()
  })

})
