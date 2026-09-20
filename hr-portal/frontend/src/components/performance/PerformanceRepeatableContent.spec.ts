import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceRepeatableContent from './PerformanceRepeatableContent.vue'

const section = { id: 'summary', name: '工作总结', description: '描述', allow_multiple: true, fields: [] }

describe('PerformanceRepeatableContent', () => {
  it('uses shared delete buttons for every instance when more than one exists', async () => {
    const wrapper = mount(PerformanceRepeatableContent, {
      props: { section, instanceKeys: ['first', 'second'], editable: true },
      slots: { default: '<div class="instance-body">内容</div>' },
    })

    expect(wrapper.findAll('.repeatable-content-instance')).toHaveLength(2)
    expect(wrapper.get('.performance-add-another-button').text()).toBe('添加')
    expect(wrapper.text()).not.toContain('第 2 条')
    expect(wrapper.find('.repeatable-instance-toolbar').exists()).toBe(false)
    expect(wrapper.findAll('.repeatable-instance-remove')).toHaveLength(2)
    expect(wrapper.find('.repeatable-instance-divider').exists()).toBe(false)
    await wrapper.get('.performance-add-another-button').trigger('click')
    await wrapper.findAll('.repeatable-instance-remove')[0].trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
    expect(wrapper.emitted('remove')?.[0]).toEqual([0])
  })

  it('hides delete when only one instance remains and hides all controls when not repeatable', async () => {
    const wrapper = mount(PerformanceRepeatableContent, {
      props: { section, instanceKeys: ['first'], editable: true },
    })
    expect(wrapper.find('.performance-add-another-button').exists()).toBe(true)
    expect(wrapper.find('.repeatable-instance-remove').exists()).toBe(false)

    await wrapper.setProps({ section: { ...section, allow_multiple: false } })
    expect(wrapper.find('.performance-add-another-button').exists()).toBe(false)
    expect(wrapper.find('.repeatable-instance-remove').exists()).toBe(false)
  })
})
