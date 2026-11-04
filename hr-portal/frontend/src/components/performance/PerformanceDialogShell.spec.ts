import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceDialogShell from './PerformanceDialogShell.vue'

function mountShell(props: Record<string, unknown> = {}) {
  return mount(PerformanceDialogShell, {
    props: { modelValue: true, title: '标题', teleport: false, ...props },
    slots: { default: '<p class="body-content">内容</p>' },
  })
}

describe('PerformanceDialogShell', () => {
  it('renders a sized dialog with overlay padding by default', () => {
    const wrapper = mountShell({ width: '720px' })
    expect(wrapper.find('.performance-dialog-overlay').classes()).not.toContain('performance-dialog-overlay--fullscreen')
    expect(wrapper.find('.performance-dialog').classes()).not.toContain('performance-dialog--fullscreen')
    expect((wrapper.find('.performance-dialog').element as HTMLElement).style.width).toBe('720px')
  })

  it('applies the fullscreen variant classes and viewport width', () => {
    // 全屏页（如模板预览）依赖这些类把整页高度钉死：内容区 flex:1 且自身不滚动，
    // 否则内部三栏会随内容变高，分割线长度在切换环节 / 页签时漂移。
    const wrapper = mountShell({ fullscreen: true, width: '600px' })
    expect(wrapper.find('.performance-dialog-overlay').classes()).toContain('performance-dialog-overlay--fullscreen')
    expect(wrapper.find('.performance-dialog').classes()).toContain('performance-dialog--fullscreen')
    expect((wrapper.find('.performance-dialog').element as HTMLElement).style.width).toBe('100vw')
    expect(wrapper.find('.performance-dialog__body').exists()).toBe(true)
  })

  it('keeps overlay and dialog classes passed by the caller', () => {
    const wrapper = mountShell({ fullscreen: true, overlayClass: 'x-overlay', dialogClass: 'x-dialog' })
    expect(wrapper.find('.performance-dialog-overlay').classes()).toEqual(expect.arrayContaining(['x-overlay', 'performance-dialog-overlay--fullscreen']))
    expect(wrapper.find('.performance-dialog').classes()).toEqual(expect.arrayContaining(['x-dialog', 'performance-dialog--fullscreen']))
  })
})
