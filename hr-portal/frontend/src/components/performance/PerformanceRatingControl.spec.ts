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
    wrapper.getComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', 's')
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['s'])
  })

  it.each(['标签样式', '下拉样式'] as const)('derives unknown from the shared configuration in %s without mutating options', async displayMode => {
    const source = [...options, { id: '__unknown__', label: '旧值' }]
    const wrapper = mount(PerformanceRatingControl, { props: { options: source, displayMode, interactive: true, allowUnknown: true }, global: { stubs: { Teleport: true } } })
    if (displayMode === '下拉样式') await wrapper.get('.performance-select-shell__selector').trigger('click')
    const selector = displayMode === '标签样式' ? '.rating-option' : '[role="option"]'
    expect(wrapper.findAll(selector).map(option => option.text())).toEqual(['卓越', '符合预期', '不了解'])
    if (displayMode === '标签样式') await wrapper.findAll(selector)[2].trigger('click')
    else await wrapper.findAll(selector)[2].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['__unknown__'])
    expect(source[2].label).toBe('旧值')
    await wrapper.setProps({ allowUnknown: false, options })
    if (displayMode === '下拉样式') await wrapper.get('.performance-select-shell__selector').trigger('click')
    expect(wrapper.findAll(selector).map(option => option.text())).toEqual(['卓越', '符合预期'])
    wrapper.unmount()
  })

  it('renders a readonly dropdown preview', () => {
    const wrapper = mount(PerformanceRatingControl, { props: { options, displayMode: '下拉样式', modelValue: 'a' } })
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.get('.rating-select-preview').text()).toContain('符合预期')
  })
})
