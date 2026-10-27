import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceHorizontalDragHandle from './PerformanceHorizontalDragHandle.vue'

describe('PerformanceHorizontalDragHandle', () => {
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
