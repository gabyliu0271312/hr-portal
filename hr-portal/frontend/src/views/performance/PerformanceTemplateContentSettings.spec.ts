import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceTemplateContentSettings from './PerformanceTemplateContentSettings.vue'

describe('PerformanceTemplateContentSettings', () => {
  it('renders the three-column content-settings architecture and SnapSpec empty state', () => {
    const wrapper = mount(PerformanceTemplateContentSettings)
    expect(wrapper.find('.stage-panel').exists()).toBe(true)
    expect(wrapper.find('.content-canvas').exists()).toBe(true)
    expect(wrapper.find('.content-tabs__divider').exists()).toBe(true)
    expect(wrapper.find('.content-tab--active').text()).toBe('配置填写内容')
    expect(wrapper.get('.text-normal__title').text()).toBe('内容设置')
    expect(wrapper.get('.text-normal__body').text()).toBe('暂未选择内容')
    expect(wrapper.findAll('.stage-card')).toHaveLength(7)
  })

  it('updates the selected stage without changing the empty right-panel contract', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings)
    await wrapper.findAll('.stage-card')[0].trigger('click')
    expect(wrapper.findAll('.stage-card')[0].classes()).toContain('selected')
    expect(wrapper.get('.text-normal__body').text()).toBe('暂未选择内容')
    expect(wrapper.get('.template-section__title').text()).toBe('工作总结环节')
    expect(wrapper.findAll('.template-operate__button').map((button) => button.text())).toEqual(['添加内容', '添加提示'])
    expect(wrapper.find('.template-operate__item + .template-operate__item').exists()).toBe(true)
    await wrapper.findAll('.template-operate__button')[1].trigger('click')
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.body.querySelector('.prompt-modal__title')?.textContent).toBe('添加提示')
    expect(document.body.querySelector('.prompt-textarea')?.getAttribute('maxlength')).toBe('2000')
  })

  it('derives the middle tabs from the selected workflow node and moves the active ink', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings)
    expect(wrapper.findAll('.content-tab').map((tab) => tab.text())).toEqual(['配置填写内容', '配置参考内容'])
    await wrapper.findAll('.content-tab')[1].trigger('click')
    expect(wrapper.findAll('.content-tab')[1].classes()).toContain('content-tab--active')
    await wrapper.findAll('.stage-card')[0].trigger('click')
    expect(wrapper.findAll('.content-tab').map((tab) => tab.text())).toEqual(['配置填写内容'])
    expect(wrapper.get('.content-tab').classes()).toContain('content-tab--active')
  })
})
