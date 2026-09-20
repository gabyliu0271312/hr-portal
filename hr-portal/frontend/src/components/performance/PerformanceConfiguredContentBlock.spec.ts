import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PerformanceConfiguredContentBlock from './PerformanceConfiguredContentBlock.vue'

const content = {
  id: 'content-1',
  type: 'custom' as const,
  name: '复用区块',
  description: '描述',
  items: [{ id: 'item-1', label: '填写题名称', hint: '' }],
}

describe('PerformanceConfiguredContentBlock', () => {
  beforeEach(() => {
    const host = document.createElement('div')
    host.id = 'configured-content-settings-host'
    document.body.appendChild(host)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('owns the complete root and item rule flow independently of content type', async () => {
    const wrapper = mount(PerformanceConfiguredContentBlock, {
      props: {
        content,
        active: true,
        expanded: true,
        dragging: false,
        index: 0,
        count: 1,
        toolbarVisible: false,
        rootSettings: { hideDescription: false, allowMultiple: false },
        itemSettings: { 'item-1': { mode: 'fill', required: true } },
        rootSettingsVariant: 'work-summary-root',
        itemSettingsVariant: 'work-summary-item',
      },
    })

    expect(wrapper.get('.content-settings-detail--root').text()).toContain('隐藏描述')
    expect(wrapper.get('.content-settings-detail--root').text()).toContain('允许添加多个')
    const rootCheckboxes = wrapper.findAll('.content-settings-detail--root input[type="checkbox"]')
    await rootCheckboxes[0].setValue(true)
    expect(wrapper.emitted('update:root-settings')?.at(-1)).toEqual([{ hideDescription: true, allowMultiple: false }])

    await wrapper.get('[data-content-item-id="item-1"]').trigger('click')
    expect(wrapper.get('[data-content-item-id="item-1"] .performance-assessment-rich-text-field__label i').text()).toBe('*')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('在此环节填写')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('必填项设置')

    const radios = wrapper.findAll('.content-settings-detail--item input[type="radio"]')
    await radios[1].setValue()
    expect(wrapper.emitted('update:item-settings')?.at(-1)).toEqual([{ 'item-1': { mode: 'hidden', required: true } }])
    await wrapper.setProps({ itemSettings: { 'item-1': { mode: 'hidden', required: true } } })
    expect(wrapper.find('[data-icon="VisibleLockOutlined"]').exists()).toBe(true)
    expect(wrapper.find('.work-summary-required-setting').exists()).toBe(false)

    await wrapper.get('.configured-content-card__row').trigger('click')
    await wrapper.setProps({ rootSettings: { hideDescription: false, allowMultiple: true } })
    expect(wrapper.get('.configured-content-card__add-item').text()).toBe('添加')
    await wrapper.get('.configured-content-card__add-item').trigger('click')
    expect(wrapper.emitted('update:content')).toBeUndefined()
    expect(wrapper.findAll('[data-content-item-id]')).toHaveLength(1)
  })

  it('does not mount the rule panel when the stage variants do not opt in', () => {
    mount(PerformanceConfiguredContentBlock, {
      props: {
        content,
        active: true,
        expanded: true,
        dragging: false,
        index: 0,
        count: 1,
        toolbarVisible: false,
        rootSettings: { hideDescription: false, allowMultiple: false },
        itemSettings: { 'item-1': { mode: 'fill', required: true } },
        rootSettingsVariant: 'generic-root',
        itemSettingsVariant: 'generic-item',
      },
    })
    expect(document.querySelector('.content-settings-detail')).toBeNull()
  })
})
