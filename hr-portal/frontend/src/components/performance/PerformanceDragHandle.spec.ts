import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceDragHandle from './PerformanceDragHandle.vue'

describe('PerformanceDragHandle', () => {
  it('renders the compact source handle contract', () => {
    const wrapper = mount(PerformanceDragHandle, { props: { label: '拖拽第1个等级' } })
    expect(wrapper.get('[data-drag-handle]').attributes('role')).toBe('button')
    expect(wrapper.get('[data-drag-handle]').attributes('tabindex')).toBe('0')
    expect(wrapper.get('[data-drag-handle]').attributes('data-drag-state')).toBe('grab')
    expect(wrapper.get('.universe-icon').classes()).toEqual(expect.arrayContaining(['align-top', 'text-16', 'text-N-600']))
    expect(wrapper.get('.universe-icon').attributes('style')).toBeUndefined()
    expect(wrapper.get('svg').attributes('data-icon')).toBe('DragOutlined')
    expect(wrapper.get('svg').attributes('width')).toBe('1em')
    expect(wrapper.get('svg').attributes('height')).toBe('1em')
  })

  it('keeps the strip variant layout-independent', () => {
    const wrapper = mount(PerformanceDragHandle, { props: { label: 'Drag content', variant: 'strip' } })
    expect(wrapper.classes()).toContain('is-strip')
    expect(wrapper.get('[data-drag-handle]').attributes('data-drag-state')).toBe('grab')
    expect(wrapper.get('svg').attributes('data-icon')).toBe('DragOutlined')
    expect(wrapper.get('svg').attributes('style')).toBeUndefined()
  })
})
