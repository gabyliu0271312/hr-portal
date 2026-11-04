import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PerformanceResultReviewer360Block from './PerformanceResultReviewer360Block.vue'

describe('PerformanceResultReviewer360Block', () => {
  it('renders collapsed state: title + toggle + comment time, no items', () => {
    const wrapper = mount(PerformanceResultReviewer360Block, { props: { title: '360°反馈（自愿评估）', submittedAt: '2026-11-04 22:59（GMT+8）' } })
    expect(wrapper.find('.pr360-title').text()).toBe('360°反馈（自愿评估）')
    expect(wrapper.find('.pr360-toggle').text()).toBe('展开详情')
    expect(wrapper.find('.pr360-comment__time').text()).toBe('2026-11-04 22:59（GMT+8）')
    expect(wrapper.findAll('.pr360-item')).toHaveLength(0)
  })

  it('expands to show items with field names and placeholder values', async () => {
    const wrapper = mount(PerformanceResultReviewer360Block)
    expect(wrapper.findAll('.pr360-item')).toHaveLength(0)
    await wrapper.find('.pr360-toggle').trigger('click')
    const items = wrapper.findAll('.pr360-item')
    expect(items).toHaveLength(2)
    expect(items[0].find('.pr360-item__title').text()).toBe('360°反馈')
    expect(items[0].find('.pr360-field__name').text()).toBe('360°反馈内容')
    expect(items[0].text()).toContain('这里展示用户填写的内容')
    expect(items[1].find('.pr360-item__title').text()).toBe('留言')
    expect(items[1].find('.pr360-field__name').text()).toBe('留言内容')
  })

  it('toggles via comment row click too', async () => {
    const wrapper = mount(PerformanceResultReviewer360Block)
    await wrapper.find('.pr360-comment').trigger('click')
    expect(wrapper.findAll('.pr360-item')).toHaveLength(2)
    expect(wrapper.find('.pr360-toggle').text()).toBe('收起详情')
  })
})
