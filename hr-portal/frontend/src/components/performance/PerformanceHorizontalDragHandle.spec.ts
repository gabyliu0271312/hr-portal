import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceHorizontalDragHandle from './PerformanceHorizontalDragHandle.vue'
import PerformanceRepeatableFillItemList from './PerformanceRepeatableFillItemList.vue'

describe('PerformanceHorizontalDragHandle', () => {
  it('only changes template drawer handles and restores concealment when leaving their root', async () => {
    const wrapper = mount(PerformanceRepeatableFillItemList, { props: { items: [
      { id: 'one', label: '一', hint: '' }, { id: 'two', label: '二', hint: '' },
    ] } })
    expect(wrapper.findAll('.performance-drag-handle')).toHaveLength(2)
    expect(wrapper.find('.performance-horizontal-drag-handle').exists()).toBe(false)
    await wrapper.setProps({ horizontalHandle: true })
    expect(wrapper.find('.performance-drag-handle').exists()).toBe(false)
    const first = wrapper.findAll('.saved-item')[0]
    expect(first.get('.performance-horizontal-drag-handle').classes()).toContain('is-concealed')
    await first.trigger('mouseenter')
    expect(first.get('.performance-horizontal-drag-handle').classes()).not.toContain('is-concealed')
    await first.trigger('mouseleave')
    expect(first.get('.performance-horizontal-drag-handle').classes()).toContain('is-concealed')
    wrapper.unmount()
  })

  it('conceals inactive handles without removing keyboard access and keeps a dragging handle visible', async () => {
    const wrapper = mount(PerformanceHorizontalDragHandle, { props: { label: '拖拽', visible: false } })
    expect(wrapper.get('[data-drag-handle]').classes()).toContain('is-concealed')
    expect(wrapper.get('[data-drag-handle]').attributes('tabindex')).toBe('0')
    await wrapper.setProps({ dragging: true })
    expect(wrapper.get('[data-drag-handle]').classes()).not.toContain('is-concealed')
  })

  it('renders an independent horizontal six-dot handle', () => {
    const wrapper = mount(PerformanceHorizontalDragHandle, { props: { label: '拖拽内容区域' } })
    expect(wrapper.get('[data-drag-handle]').classes()).toContain('performance-horizontal-drag-handle')
    expect(wrapper.get('svg').attributes('data-icon')).toBe('DragOutlined')
    expect(wrapper.findAll('circle')).toHaveLength(6)
    expect(wrapper.get('[data-drag-handle]').attributes('tabindex')).toBe('0')
  })

  it('keeps disabled state and emits pointerdown without changing the legacy handle', async () => {
    const wrapper = mount(PerformanceHorizontalDragHandle, { props: { label: '拖拽内容区域', disabled: true } })
    expect(wrapper.get('[data-drag-handle]').attributes('aria-disabled')).toBe('true')
    expect(wrapper.get('[data-drag-handle]').attributes('tabindex')).toBe('-1')
    await wrapper.get('[data-drag-handle]').trigger('pointerdown')
    expect(wrapper.emitted('pointerdown')).toHaveLength(1)
  })
})
