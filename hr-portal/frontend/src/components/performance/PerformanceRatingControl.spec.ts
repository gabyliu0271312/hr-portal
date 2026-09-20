import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceRatingControl from './PerformanceRatingControl.vue'

const options = [{ id: 's', label: '卓越', color: '#3370ff' }, { id: 'a', label: '符合预期', color: '#34c724' }]

describe('PerformanceRatingControl', () => {
  it('renders and updates label-style ratings', async () => {
    const wrapper = mount(PerformanceRatingControl, { props: { options, displayMode: '标签样式', interactive: true } })
    expect(wrapper.findAll('.performance-rating-control__option').map(item => item.text())).toEqual(['卓越', '符合预期'])
    expect(wrapper.findAll('.performance-rating-control__connector')).toHaveLength(1)
    await wrapper.findAll('.performance-rating-control__option')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['a'])
  })

  it('renders and updates dropdown-style ratings', async () => {
    const wrapper = mount(PerformanceRatingControl, { props: { options, displayMode: '下拉样式', interactive: true } })
    expect(wrapper.find('.performance-rating-control__labels').exists()).toBe(false)
    await wrapper.get('select').setValue('s')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['s'])
  })

  it('renders a readonly dropdown preview', () => {
    const wrapper = mount(PerformanceRatingControl, { props: { options, displayMode: '下拉样式', modelValue: 'a' } })
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.get('.rating-select-preview').text()).toContain('符合预期')
  })
})
