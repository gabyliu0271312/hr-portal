import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceSortHeader from './PerformanceSortHeader.vue'

describe('PerformanceSortHeader', () => {
  it('renders captured triangles and exposes the current sort state without owning sorting', async () => {
    const wrapper = mount(PerformanceSortHeader, { props: { label: '总人数', order: 'descending' } })
    expect(wrapper.attributes('aria-label')).toContain('降序')
    expect(wrapper.findAll('svg').map(icon => icon.attributes('data-icon'))).toEqual(['ExpandUpFilled', 'ExpandDownFilled'])
    expect(wrapper.get('[data-icon="ExpandDownFilled"]').classes()).toContain('active')
    expect(wrapper.get('[data-icon="ExpandUpFilled"]').classes()).not.toContain('active')
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
    expect(wrapper.emitted('update:order')).toBeUndefined()
    await wrapper.setProps({ order: 'ascending' })
    expect(wrapper.get('[data-icon="ExpandUpFilled"]').classes()).toContain('active')
    await wrapper.setProps({ order: null })
    expect(wrapper.findAll('svg.active')).toHaveLength(0)
    expect(wrapper.attributes('aria-label')).toContain('未排序')
    wrapper.unmount()
  })

  it('accepts a rating tag in the label slot', () => {
    const wrapper = mount(PerformanceSortHeader, { props: { label: '优秀' }, slots: { default: '<span class="custom-label">优秀</span>' } })
    expect(wrapper.get('.custom-label').text()).toBe('优秀')
    expect(wrapper.attributes('type')).toBe('button')
    wrapper.unmount()
  })
})
