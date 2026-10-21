import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import PerformanceConfiguredContentBlock from './PerformanceConfiguredContentBlock.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'

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

  it('starts work-summary item settings with fill settings and preserves the root flow', async () => {
    const wrapper = mount(PerformanceConfiguredContentBlock, {
      props: {
        content: { ...content, type: 'work_summary' },
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
    expect(wrapper.emitted('activate')).toHaveLength(1)
    expect(wrapper.get('[data-content-item-id="item-1"] .performance-assessment-rich-text-field__label i').text()).toBe('*')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('在此环节填写')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('必填项设置')
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['填写设置', '必填项设置'])

    const radios = wrapper.findAll('.content-settings-detail--item input[type="radio"]')
    await radios[1].setValue()
    expect(wrapper.emitted('update:item-settings')?.at(-1)).toEqual([{ 'item-1': { mode: 'hidden', required: true } }])
    await wrapper.setProps({ itemSettings: { 'item-1': { mode: 'hidden', required: true } } })
    expect(wrapper.find('[data-icon="VisibleLockOutlined"]').exists()).toBe(true)
    expect(wrapper.find('.work-summary-required-setting').exists()).toBe(false)
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['填写设置'])

    await wrapper.get('.configured-content-card__row').trigger('click')
    await wrapper.setProps({ rootSettings: { hideDescription: false, allowMultiple: true } })
    expect(wrapper.get('.configured-content-card__add-item').text()).toBe('添加')
    await wrapper.get('.configured-content-card__add-item').trigger('click')
    expect(wrapper.emitted('update:content')).toBeUndefined()
    expect(wrapper.findAll('[data-content-item-id]')).toHaveLength(1)
  })

  it.each([undefined, 'text'] as const)('shows custom text display settings for question type %s and keeps item state independent', async (questionType) => {
    const wrapper = mount(PerformanceConfiguredContentBlock, {
      props: {
        content: { ...content, items: [
          { ...content.items[0], questionType },
          { id: 'item-2', label: '第二题', hint: '', questionType: 'text' },
          { id: 'tag-item', label: '标签题', hint: '', questionType: 'tag' },
        ] },
        active: true,
        expanded: true,
        dragging: false,
        index: 0,
        count: 1,
        toolbarVisible: false,
        rootSettings: { hideDescription: false, allowMultiple: false },
        itemSettings: {
          'item-1': { mode: 'fill', required: true, hideName: false },
          'item-2': { mode: 'fill', required: true, hideName: false },
          'tag-item': { mode: 'fill', required: true, hideName: false },
        },
        rootSettingsVariant: 'work-summary-root',
        itemSettingsVariant: 'work-summary-item',
      },
    })

    await wrapper.get('[data-content-item-id="item-1"]').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '填写设置', '必填项设置'])
    const hideName = wrapper.findAllComponents(PerformanceCheckbox).find(checkbox => checkbox.props('label') === '隐藏名称')!
    expect(hideName.exists()).toBe(true)
    await hideName.get('input').setValue(true)
    const settings = (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0]
    expect(settings['item-1']).toEqual({ mode: 'fill', required: true, hideName: true })
    expect(settings['item-2'].hideName).toBe(false)
    await wrapper.setProps({ itemSettings: settings })
    expect(wrapper.get('[data-content-item-id="item-1"]').classes()).toContain('content-renderer-item--name-hidden')
    expect(wrapper.find('[data-content-item-id="item-1"] .performance-rich-text-box').exists()).toBe(true)
    expect(wrapper.get('.configured-content-card__header').text()).toContain('复用区块')
    expect(wrapper.get('[data-content-item-id="item-2"]').classes()).not.toContain('content-renderer-item--name-hidden')

    await wrapper.get('[data-content-item-id="item-2"]').trigger('click')
    expect((wrapper.get('.content-settings-detail--item input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
    await wrapper.get('[data-content-item-id="item-1"]').trigger('click')
    await wrapper.get('.content-settings-detail--item input[type="checkbox"]').setValue(false)
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof settings])[0] })
    expect(wrapper.get('[data-content-item-id="item-1"]').classes()).not.toContain('content-renderer-item--name-hidden')
    expect(wrapper.get('[data-content-item-id="item-1"] .performance-assessment-rich-text-field__label').text()).toBe('填写题名称*')

    await wrapper.get('.content-settings-detail--item input[type="radio"][value="hidden"]').setValue()
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof settings])[0] })
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '填写设置'])
    await wrapper.get('[data-content-item-id="tag-item"]').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['填写设置', '必填项设置'])
  })

  it('shows rating visibility settings for a rating item and reuses the shared checkbox', async () => {
    const wrapper = mount(PerformanceConfiguredContentBlock, {
      props: {
        content: { ...content, type: 'rating', name: '评分评级', items: [{ id: 'rating-item', label: '季度评级', hint: '' }] },
        active: true,
        expanded: true,
        dragging: false,
        index: 0,
        count: 1,
        toolbarVisible: false,
        rootSettings: { hideDescription: false, allowMultiple: false },
        itemSettings: { 'rating-item': { mode: 'fill', required: true, hideName: false } },
        rootSettingsVariant: 'work-summary-root',
        itemSettingsVariant: 'work-summary-item',
      },
    })

    await wrapper.get('[data-content-item-id="rating-item"]').trigger('click')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('隐藏名称')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('必填项设置')
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '必填项设置'])
    expect(wrapper.findAll('.content-settings-detail--item input[type="checkbox"]')).toHaveLength(2)
    await wrapper.get('.content-settings-detail--item input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('update:item-settings')?.at(-1)).toEqual([{ 'rating-item': { mode: 'fill', required: true, hideName: true } }])
    await wrapper.setProps({ itemSettings: { 'rating-item': { mode: 'fill', required: true, hideName: true } } })
    expect(wrapper.find('[data-content-item-id="rating-item"] strong').exists()).toBe(false)
    expect(wrapper.find('[data-content-item-id="rating-item"] > i').exists()).toBe(false)
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
