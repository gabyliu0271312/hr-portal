import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import PerformanceFilterPopover from './PerformanceFilterPopover.vue'

describe('PerformanceFilterPopover', () => {
  let anchor: HTMLButtonElement | null = null
  afterEach(() => { anchor?.remove(); anchor = null })

  function build() {
    anchor = document.createElement('button')
    document.body.appendChild(anchor)
    return mount(PerformanceFilterPopover, {
      props: { visible: true, anchor },
      slots: { default: '<div class="filter-body">内容</div>', footer: '<div class="filter-footer">页脚</div>' },
      attachTo: document.body,
    })
  }

  it('closes when pointerdown happens outside the popover and anchor', async () => {
    const wrapper = build()
    await nextTick()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('keeps open when pointerdown happens inside the popover', async () => {
    const wrapper = build()
    await nextTick()
    const body = document.querySelector('.filter-body')
    expect(body).not.toBeNull()
    body!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('close')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps open when pointerdown happens inside a teleported select popup', async () => {
    const wrapper = build()
    await nextTick()
    const popup = document.createElement('div')
    popup.className = 'performance-select-shell__popup'
    document.body.appendChild(popup)
    popup.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await nextTick()
    expect(wrapper.emitted('close')).toBeUndefined()
    popup.remove()
    wrapper.unmount()
  })

  it('applies width and compact body-padding overrides', async () => {
    anchor = document.createElement('button')
    document.body.appendChild(anchor)
    const wrapper = mount(PerformanceFilterPopover, {
      props: { visible: true, anchor, width: 'var(--performance-filter-popover-max-width)', bodyPadding: 'var(--performance-filter-body-padding-compact)' },
      slots: { default: '<div class="filter-body">内容</div>' },
      attachTo: document.body,
    })
    await nextTick()
    const panel = document.querySelector('.performance-popover') as HTMLElement
    expect(panel.style.width).toBe('var(--performance-filter-popover-max-width)')
    const body = document.querySelector('.filter-body') as HTMLElement
    expect(body.parentElement!.style.padding).toBe('var(--performance-filter-body-padding-compact)')
    wrapper.unmount()
  })
})
