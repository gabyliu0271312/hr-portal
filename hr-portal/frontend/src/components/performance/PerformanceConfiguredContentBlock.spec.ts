import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElMessage } from 'element-plus'
import PerformanceRatingControl from './PerformanceRatingControl.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceRatingLevelRuleSettings from './PerformanceRatingLevelRuleSettings.vue'
import ratingRuleSource from './PerformanceRatingLevelRuleSettings.vue?raw'
import PerformanceConfiguredContentBlock from './PerformanceConfiguredContentBlock.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import { getEvaluationExecutorKind, getItemSettingsVariant, getRootSettingsCapabilities, getStageContentRule, itemSettingsCapabilities, supportsEvaluationItemSettings, supportsEvaluationView } from './performanceContentSettingsRules'

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

  it('keeps prompts expanded and edits nested view settings with the shared controls', async () => {
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content: { ...content, type: 'prompt', name: '提示块', prompt: { title: '操作提示', content: '请先确认范围', color: '#3370ff', scope: 'all' }, items: [] } as any,
      active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: false, allowMultiple: false }, itemSettings: {}, rootSettingsEnabled: true, itemSettingsEnabled: true,
      rootSettingsVariant: 'work-summary-root', itemSettingsVariant: 'work-summary-item',
    } })
    expect(wrapper.find('.performance-prompt-display__title').text()).toBe('操作提示')
    expect(wrapper.find('.performance-prompt-display__content').text()).toBe('请先确认范围')
    expect(wrapper.find('.performance-expand-button').exists()).toBe(false)
    await wrapper.setProps({ expanded: false })
    expect(wrapper.get('.performance-prompt-display__content').text()).toBe('请先确认范围')
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.get('.content-settings-detail--prompt').text()).toBe('允许查看仅在填写时显示')
    const toggles = wrapper.findAll('.content-settings-detail--prompt input')
    expect((toggles[0].element as HTMLInputElement).checked).toBe(true)
    await toggles[1].setValue(true)
    let updated = (wrapper.emitted('update:content')!.at(-1) as [typeof wrapper.vm.$props.content])[0]
    expect(updated.prompt).toMatchObject({ allowView: true, onlyWhenFilling: true })
    await wrapper.setProps({ content: updated })
    await toggles[0].setValue(false)
    updated = (wrapper.emitted('update:content')!.at(-1) as [typeof updated])[0]
    await wrapper.setProps({ content: updated })
    expect(wrapper.find('.work-summary-view-options').exists()).toBe(false)
    expect(wrapper.get('.performance-prompt-display').classes()).toContain('is-unavailable')
    expect(wrapper.find('.performance-prompt-display > button [data-icon="VisibleLockOutlined"]').exists()).toBe(true)
    await wrapper.get('.content-settings-detail--prompt input').setValue(true)
    await wrapper.setProps({ content: (wrapper.emitted('update:content')!.at(-1) as [typeof updated])[0] })
    expect((wrapper.findAll('.content-settings-detail--prompt input')[1].element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('.performance-prompt-display__hidden-icon').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['work-summary-item', 'evaluation-item', 'result-view-item', 'generic-item'])('edits embedded prompt settings independently in %s', async itemSettingsVariant => {
    const inline = { title: '内部提示', content: '内部说明', color: '#10B981', scope: 'all' as const }
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content: { ...content, items: [...content.items, { id: 'prompt', kind: 'prompt', label: '', hint: '', prompt: inline }] },
      active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: false, allowMultiple: false }, itemSettings: {},
      rootSettingsEnabled: false, itemSettingsEnabled: false, rootSettingsVariant: 'generic-root', itemSettingsVariant,
    } })
    await wrapper.get('[data-content-item-id="prompt"]').trigger('click')
    expect(wrapper.get('.content-settings-detail--prompt .work-summary-view-options').text()).toBe('仅在填写时显示')
    await wrapper.findAll('.content-settings-detail--prompt input')[1].setValue(true)
    const updated = (wrapper.emitted('update:content')!.at(-1) as [typeof wrapper.vm.$props.content])[0]
    expect(updated.items[0]).toEqual(content.items[0])
    expect(updated.items[1].prompt).toMatchObject({ ...inline, onlyWhenFilling: true })
    expect(inline).not.toHaveProperty('onlyWhenFilling')
    await wrapper.setProps({ active: false })
    expect(wrapper.find('.content-settings-detail').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps rating fill items on custom settings while legacy rating items use rating settings', () => {
    expect(getItemSettingsVariant({ type: 'rating' }, { kind: 'fill', questionType: 'tag' })).toBe('custom-tag')
    expect(getItemSettingsVariant({ type: 'rating' }, { kind: 'fill', questionType: 'text' })).toBe('custom-text')
    expect(getItemSettingsVariant({ type: 'rating' }, { kind: 'rating' })).toBe('rating')
    expect(getItemSettingsVariant({ type: 'prompt' }, undefined)).toBe('prompt')
    expect(getRootSettingsCapabilities({ type: 'prompt', items: [] })).toEqual({ allowMultiple: false, allowUnknown: false })
    expect(getRootSettingsCapabilities({ type: 'rating', items: [] }, 'evaluation-360-root')).toEqual({ allowMultiple: false, allowUnknown: true })
    expect(getRootSettingsCapabilities({ type: 'rating', items: [] }, 'evaluation-direct-root')).toEqual({ allowMultiple: false, allowUnknown: false })
    expect(supportsEvaluationView({ type: 'custom', questionType: 'text' })).toBe(true)
    expect(supportsEvaluationItemSettings({ type: 'rating' }, { kind: 'rating' })).toBe(true)
    expect(supportsEvaluationView({ type: 'prompt' }, { kind: 'prompt' })).toBe(false)
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
        rootSettingsEnabled: true,
        itemSettingsEnabled: true,
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
    expect(wrapper.findComponent(PerformanceRatingLevelRuleSettings).exists()).toBe(false)
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
        rootSettingsEnabled: true,
        itemSettingsEnabled: true,
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
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '填写设置', '必填项设置'])
    expect(wrapper.findAll('.content-settings-detail--item input[type="checkbox"]')).toHaveLength(3)
    expect(wrapper.findComponent(PerformanceRatingLevelRuleSettings).exists()).toBe(false)
  })

  it.each([
    { type: 'custom' as const, questionType: undefined, items: [{ id: 'item-1', label: '文本题', hint: '' }], fillSettings: false },
    { type: 'custom' as const, questionType: 'tag' as const, items: [{ id: 'item-1', label: '文本题', hint: '', questionType: 'text' as const }], fillSettings: false },
    { type: 'custom' as const, questionType: 'text' as const, items: [{ id: 'item-1', label: '标签题', hint: '', questionType: 'tag' as const }], fillSettings: false },
    { type: 'custom' as const, questionType: undefined, items: [{ id: 'item-1', label: '文本题', hint: '', questionType: 'text' as const }, { id: 'tag', label: '标签题', hint: '', questionType: 'tag' as const }], fillSettings: false },
    { type: 'rating' as const, questionType: undefined, items: content.items, fillSettings: false },
  ])('controls root fill settings independently for $type / $questionType / $fillSettings', async ({ type, questionType, items, fillSettings }) => {
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content: { ...content, type, questionType, items }, active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: false, allowMultiple: true }, itemSettings: {},
      rootSettingsEnabled: true, itemSettingsEnabled: true, rootSettingsVariant: 'work-summary-root', itemSettingsVariant: 'work-summary-item',
    } })
    const groups = type === 'rating' ? ['显示设置', '评估设置'] : fillSettings ? ['显示设置', '填写设置'] : ['显示设置']
    expect(wrapper.findAll('.content-settings-detail--root legend').map(group => group.text())).toEqual(groups)
    expect(wrapper.get('.content-settings-detail--root').text().includes('允许添加多个')).toBe(fillSettings)
    await wrapper.get('.content-settings-detail--root input[type="checkbox"]').setValue(true)
    expect(wrapper.emitted('update:root-settings')?.at(-1)).toEqual([{ hideDescription: true, allowMultiple: true }])
    await wrapper.get('[data-content-item-id="item-1"]').trigger('click')
    if (type === 'custom') expect(wrapper.get('.content-settings-detail--item').text()).toContain('在此环节填写')
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--root legend').map(group => group.text())).toEqual(groups)
    wrapper.unmount()
  })

  it('keeps tag name and description independent from root and other items', async () => {
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content: { ...content, questionType: 'text', items: [
        { id: 'tag', label: '标签题', hint: '题目描述', questionType: 'tag', options: [{ id: 'a', label: '选项A' }] },
        { id: 'text', label: '文本题', hint: '文本提示', questionType: 'text' },
      ] }, active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: false, allowMultiple: false }, itemSettings: { tag: { mode: 'fill', required: true }, text: { mode: 'fill', required: true } },
      rootSettingsEnabled: true, itemSettingsEnabled: true, rootSettingsVariant: 'work-summary-root', itemSettingsVariant: 'work-summary-item',
    } })
    expect(wrapper.findAll('.content-settings-detail--root legend').map(group => group.text())).toEqual(['显示设置'])
    await wrapper.get('[data-content-item-id="tag"]').trigger('click')
    const display = wrapper.get('.content-settings-detail--item fieldset')
    expect(display.text()).toContain('显示设置')
    const displayCheckboxes = display.findAllComponents(PerformanceCheckbox)
    expect(displayCheckboxes).toHaveLength(2)
    expect(displayCheckboxes[0].props('label')).toBe('隐藏名称')
    expect(displayCheckboxes[1].props('label')).toBe('隐藏描述')
    await display.findAll('input')[0].setValue(true)
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0] })
    expect(wrapper.find('[data-content-item-id="tag"] .template-field-label').exists()).toBe(false)
    expect(wrapper.get('[data-content-item-id="tag"] .template-field-description').text()).toBe('题目描述')
    await display.findAll('input')[1].setValue(true)
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0] })
    expect(wrapper.find('[data-content-item-id="tag"] .template-field-description').exists()).toBe(false)
    expect(wrapper.get('.configured-content-card__description').text()).toBe('描述')
    expect(wrapper.get('[data-content-item-id="tag"] .tag-options').text()).toBe('选项A')
    expect(wrapper.get('[data-content-item-id="text"] .content-renderer-editor__body').text()).toBe('文本提示')
    await display.findAll('input')[0].setValue(false)
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0] })
    expect(wrapper.get('[data-content-item-id="tag"] .template-field-label').text()).toBe('标签题*')
    expect(wrapper.find('[data-content-item-id="tag"] .template-field-description').exists()).toBe(false)
    await wrapper.get('.content-settings-detail--item input[value="hidden"]').setValue()
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0] })
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '填写设置'])
    await wrapper.get('.content-settings-detail--item input[value="fill"]').setValue()
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0] })
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '填写设置', '必填项设置'])
    await wrapper.findAll('.content-settings-detail--item input[type="checkbox"]')[2].setValue(false)
    expect((wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0].tag).toMatchObject({ mode: 'fill', required: false, hideName: false, hideDescription: true })
    wrapper.unmount()
  })

  it.each(['标签样式', '下拉样式'] as const)('configures unknown rating on the root without mutating levels in %s mode', async ratingDisplayMode => {
    const levels = [{ id: 'a', label: '符合预期' }]
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content: { ...content, type: 'rating', ratingDisplayMode, options: levels }, active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: false, allowMultiple: false }, itemSettings: {},
      rootSettingsEnabled: true, itemSettingsEnabled: true, rootSettingsVariant: 'work-summary-root', itemSettingsVariant: 'work-summary-item',
    } })
    expect(wrapper.findAll('.content-settings-detail--root legend').map(group => group.text())).toEqual(['显示设置', '评估设置'])
    expect(wrapper.get('.rating-unknown-description').text()).toBe('开启后，若评估人选择「不了解」，则会跳过该评估内容中的所有问题。')
    const checkbox = wrapper.findAll('.content-settings-detail--root input')[1]
    expect((checkbox.element as HTMLInputElement).checked).toBe(false)
    await checkbox.setValue(true)
    const settings = (wrapper.emitted('update:root-settings')!.at(-1) as [typeof wrapper.vm.$props.rootSettings])[0]
    expect(settings).toEqual({ hideDescription: false, allowMultiple: false, allowUnknown: true })
    await wrapper.setProps({ rootSettings: settings })
    expect(wrapper.get('.content-renderer-rating__levels').attributes('aria-label')).toBe('评级选项')
    const rating = wrapper.getComponent(PerformanceRatingControl)
    expect(rating.props('allowUnknown')).toBe(true)
    expect(rating.props('options')).toEqual(levels)
    if (ratingDisplayMode === '标签样式') expect(rating.findAll('.rating-option').map(option => option.text())).toEqual(['符合预期', '不了解'])
    expect(levels).toEqual([{ id: 'a', label: '符合预期' }])
    await checkbox.setValue(false)
    await wrapper.setProps({ rootSettings: (wrapper.emitted('update:root-settings')!.at(-1) as [typeof settings])[0] })
    expect(rating.props('options')).toEqual(levels)
    wrapper.unmount()
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
        rootSettingsEnabled: true,
        itemSettingsEnabled: true,
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
    const toggle = wrapper.getComponent(PerformanceSwitch)
    expect(toggle.props('modelValue')).toBe(false)
    expect(wrapper.find('.rating-level-rule-settings__details').exists()).toBe(false)
    await toggle.trigger('click')
    expect(wrapper.emitted('update:item-settings')?.at(-1)).toEqual([{ 'rating-item': { mode: 'fill', required: true, hideName: true, levelRulesEnabled: true } }])
    await wrapper.setProps({ itemSettings: { 'rating-item': { mode: 'fill', required: true, hideName: true, levelRulesEnabled: true } } })
    expect(wrapper.get('.rating-level-rule-settings__details p').text()).toBe('当满足条件时，当前评估题仅可选如下规则配置的可选项，当不满足所有规则时，当前评估题可选任意选项。')
    expect(wrapper.getComponent(PerformanceButton).text()).toBe('添加规则')
    expect(wrapper.get('[data-icon="GanttsetOutlined"]').findAll('path')).toHaveLength(2)
    expect(ratingRuleSource).toContain('var(--performance-settings-help-line-height)')
    expect(ratingRuleSource).toContain('var(--color-line-control)')
    const info = vi.spyOn(ElMessage, 'info').mockImplementation(() => ({ close: () => {} }))
    await wrapper.getComponent(PerformanceButton).trigger('click')
    expect(info).toHaveBeenCalledWith('添加规则弹窗暂未开放')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    info.mockRestore()
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.findComponent(PerformanceRatingLevelRuleSettings).exists()).toBe(false)
    await wrapper.get('[data-content-item-id="rating-item"]').trigger('click')
    expect(wrapper.getComponent(PerformanceSwitch).props('modelValue')).toBe(true)
    await wrapper.getComponent(PerformanceSwitch).trigger('click')
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0] })
    expect(wrapper.find('.rating-level-rule-settings__details').exists()).toBe(false)
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '必填项设置'])
    wrapper.unmount()
  })
  it('shows evaluation rating item settings without view-mode controls', async () => {
    const wrapper = mount(PerformanceConfiguredContentBlock, {
      props: {
        content: { ...content, type: 'rating', name: '评分评级', items: [{ id: 'rating-item', label: '季度评级', hint: '' }] },
        active: true,
        expanded: true,
        dragging: false,
        index: 0,
        count: 1,
        toolbarVisible: false,
        rootSettings: { hideDescription: false, allowMultiple: false, allowUnknown: true },
        itemSettings: { 'rating-item': { mode: 'fill', required: true, hideName: false } },
        rootSettingsEnabled: true,
        itemSettingsEnabled: true,
        rootSettingsVariant: 'evaluation-360-root',
        itemSettingsVariant: 'evaluation-item',
      },
    })

    await wrapper.get('[data-content-item-id="rating-item"]').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '必填项设置'])
    expect(wrapper.findAll('.content-settings-detail--item input[type="radio"]')).toHaveLength(0)
    expect(wrapper.findComponent(PerformanceRatingLevelRuleSettings).exists()).toBe(true)
    wrapper.unmount()
  })

  it('exposes only confirmed stage and item capabilities with item-first legacy fallbacks', () => {
    expect(getStageContentRule('work_summary')).toMatchObject({ rootSettingsEnabled: true, itemSettingsEnabled: true, visibleSlots: ['fill'] })
    expect(getStageContentRule('evaluation')).toMatchObject({ rootSettingsEnabled: false, itemSettingsEnabled: true })
    expect(getStageContentRule('evaluation', 'reviewer_360')).toMatchObject({ rootSettingsEnabled: true, rootSettingsVariant: 'evaluation-360-root', itemSettingsEnabled: true })
    expect(getStageContentRule('evaluation', 'direct_manager')).toMatchObject({ rootSettingsEnabled: true, rootSettingsVariant: 'evaluation-direct-root', itemSettingsEnabled: true })
    expect(getEvaluationExecutorKind('360°评估人')).toBe('reviewer_360')
    expect(getEvaluationExecutorKind('直属上级')).toBe('direct_manager')
    expect(getEvaluationExecutorKind('', ['DIRECT_MANAGER'])).toBe('direct_manager')
    expect(getStageContentRule('result_view')).toMatchObject({ rootSettingsEnabled: true, rootSettingsVariant: 'result-view-root', itemSettingsEnabled: true })
    expect(getStageContentRule('result_communication')).toMatchObject({ rootSettingsEnabled: true, rootSettingsVariant: 'result-communication-root', itemSettingsEnabled: true, itemSettingsVariant: 'result-communication-item' })
    for (const stage of ['reviewer_360_invite', 'reviewer_360_confirm', 'calibration', 'result_reconsideration', 'unknown', undefined]) {
      expect(getStageContentRule(stage)).toMatchObject({ rootSettingsEnabled: false, itemSettingsEnabled: false, allowedContentTypes: ['work_summary', 'rating', 'custom'] })
    }
    expect(itemSettingsCapabilities).toMatchObject({
      'work-summary': { hideName: false, mode: true, required: true },
      'custom-text': { hideName: true, mode: true, required: true },
      'custom-tag': { hideName: true, hideDescription: true, mode: true, required: true },
      rating: { hideName: true, mode: false, required: true, levelRules: true },
      'evaluation-work-summary': { hideName: false, mode: true, required: true, viewResults: true },
      'evaluation-custom-text': { hideName: true, mode: true, required: true, viewResults: true },
      'evaluation-custom-tag': { hideName: true, hideDescription: true, mode: true, required: true, viewResults: true },
      'evaluation-rating': { hideName: true, mode: false, required: true, levelRules: true },
      'result-communication-work-summary': { hideName: false, mode: true, required: true, viewResults: true },
      'result-communication-custom-text': { hideName: true, mode: true, required: true, viewResults: true },
      'result-communication-custom-tag': { hideName: true, hideDescription: true, mode: true, required: true, viewResults: true },
      'result-communication-rating': { hideName: true, mode: false, required: true, levelRules: true },
    })
    expect(getItemSettingsVariant({ type: 'custom', questionType: 'tag' }, { questionType: 'text' })).toBe('custom-text')
    expect(getItemSettingsVariant({ type: 'custom', questionType: 'text' }, { questionType: 'tag' })).toBe('custom-tag')
    expect(getItemSettingsVariant({ type: 'custom', questionType: 'tag' })).toBe('custom-tag')
    expect(getItemSettingsVariant({ type: 'custom' })).toBe('custom-text')
  })

  it('reuses result tag visibility settings and keeps hidden items selectable for restoring access', async () => {
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content: { ...content, items: [
        { id: 'tag', label: '标签题名称', hint: '标签题描述', questionType: 'tag', options: [{ id: 'a', label: '协作' }] },
        { id: 'text', label: '文本题', hint: '', questionType: 'text' },
      ] }, active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: false, allowMultiple: false }, itemSettings: { tag: { mode: 'fill', required: true }, text: { mode: 'fill', required: false } },
      rootSettingsEnabled: false, itemSettingsEnabled: true, rootSettingsVariant: 'generic-root', itemSettingsVariant: 'result-view-item',
    } })
    await wrapper.get('[data-content-item-id="tag"]').trigger('click')
    expect(wrapper.find('[data-content-item-id="tag"] .readonly-tag-panel').exists()).toBe(true)
    expect(wrapper.find('[data-content-item-id="tag"] .tag-options').exists()).toBe(false)
    expect(wrapper.find('[data-content-item-id="tag"] .tag-rich-text-input.is-display-only').exists()).toBe(true)
    const panel = () => wrapper.get('.content-settings-detail--item')
    expect(panel().findAllComponents(PerformanceCheckbox).map((checkbox: { props: (name: string) => unknown }) => checkbox.props('label'))).toEqual(['允许查看', '隐藏名称', '隐藏描述'])
    expect(panel().findAll('input[type="radio"]')).toHaveLength(0)
    expect(panel().find('.work-summary-required-setting').exists()).toBe(false)
    const apply = async () => wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0] })
    await panel().findAll('input')[1].setValue(true)
    await apply()
    expect(wrapper.find('[data-content-item-id="tag"] .template-field-label').exists()).toBe(false)
    expect(wrapper.find('[data-content-item-id="tag"] .template-field-description').exists()).toBe(false)
    expect(wrapper.get('[data-content-item-id="tag"] .tag-preview__selected-group .rich-answer').text()).toBe('这里展示用户填写内容')
    await panel().findAll('input')[2].setValue(true)
    await apply()
    expect(wrapper.find('[data-content-item-id="tag"] .template-field-description').exists()).toBe(false)
    await panel().findAll('input')[0].setValue(false)
    await apply()
    expect(panel().find('.work-summary-view-options').exists()).toBe(false)
    expect(wrapper.get('[data-content-item-id="tag"]').classes()).toContain('content-renderer-item--unavailable')
    expect(wrapper.get('[data-content-item-id="tag"]').classes()).not.toContain('content-renderer-item--hidden')
    expect(wrapper.find('[data-content-item-id="tag"] .readonly-tag-panel').exists()).toBe(true)
    expect(wrapper.find('[data-content-item-id="tag"] .performance-unavailable-overlay').exists()).toBe(true)
    await panel().get('input').setValue(true)
    await apply()
    expect(wrapper.get('[data-content-item-id="tag"]').classes()).not.toContain('content-renderer-item--unavailable')
    expect((panel().findAll('input')[1].element as HTMLInputElement).checked).toBe(true)
    expect((panel().findAll('input')[2].element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.vm.$props.itemSettings.text).toEqual({ mode: 'fill', required: false })
    wrapper.unmount()
  })

  it.each([
    ['work_summary', { id: 'item', label: '工作总结', hint: '' }, ['允许查看']],
    ['rating', { id: 'item', label: '评级', hint: '' }, ['允许查看', '隐藏名称']],
    ['custom', { id: 'item', label: '文本', hint: '', questionType: 'text' }, ['允许查看', '隐藏名称', '隐藏描述']],
    ['custom', { id: 'item', label: '标签', hint: '', questionType: 'tag', options: [{ id: 'a', label: '标签A' }] }, ['允许查看', '隐藏名称', '隐藏描述']],
  ] as const)('configures result-view %s content visibility settings', async (type, item, labels) => {
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content: { ...content, type, items: [item] } as any,
      active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: false, allowMultiple: false, allowView: true },
      itemSettings: { item: { mode: 'view', required: false, allowView: true } },
      rootSettingsEnabled: true, itemSettingsEnabled: true, rootSettingsVariant: 'result-view-root', itemSettingsVariant: 'result-view-item',
    } })
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--root .performance-checkbox__label').map(label => label.text())).toEqual(['允许查看', '隐藏描述'])
    await wrapper.get('[data-content-item-id="item"]').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--item .performance-checkbox__label').map(label => label.text())).toEqual(labels)
    wrapper.unmount()
  })

  it('enables root and item settings independently rather than inferring them from variant names', async () => {
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content, active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: true, allowMultiple: true }, itemSettings: {},
      rootSettingsEnabled: false, itemSettingsEnabled: true, rootSettingsVariant: 'generic-root', itemSettingsVariant: 'generic-item',
    } })
    expect(wrapper.find('.content-settings-detail--root').exists()).toBe(false)
    expect(wrapper.find('.configured-content-card__description').exists()).toBe(true)
    expect(wrapper.find('.configured-content-card__add-item').exists()).toBe(false)
    await wrapper.get('[data-content-item-id="item-1"]').trigger('click')
    expect(wrapper.find('.content-settings-detail--item').exists()).toBe(true)
    await wrapper.setProps({ rootSettingsEnabled: true, itemSettingsEnabled: false })
    expect(wrapper.find('.content-settings-detail--item').exists()).toBe(false)
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.find('.content-settings-detail--root').exists()).toBe(true)
  })

  it.each(['work_summary', 'custom'] as const)('enables evaluation modes for supported %s items and renders readonly view previews', async type => {
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content: { ...content, type, items: [{ id: 'item-1', label: '查看项', hint: '填写提示', questionType: 'tag' }, { id: 'text', label: '文本题', hint: '', questionType: 'text' }] },
      active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: false, allowMultiple: false },
      itemSettings: { 'item-1': { mode: 'fill', required: true }, text: { mode: 'fill', required: false } },
      rootSettingsEnabled: false, itemSettingsEnabled: true, rootSettingsVariant: 'generic-root', itemSettingsVariant: 'evaluation-item',
    } })
    await wrapper.get('[data-content-item-id="item-1"]').trigger('click')
    const fillGroups = type === 'custom' ? ['显示设置', '填写设置', '必填项设置'] : ['填写设置', '必填项设置']
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(fillGroups)
    expect(wrapper.findAll('.content-settings-detail--item input[type="radio"]').map(input => input.attributes('value'))).toEqual(['fill', 'hidden', 'view'])
    for (const mode of ['hidden', 'view'] as const) {
      await wrapper.get(`.content-settings-detail--item input[value="${mode}"]`).setValue()
      const settings = (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0]
      await wrapper.setProps({ itemSettings: settings })
      expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(type === 'custom' ? ['显示设置', '填写设置'] : ['填写设置'])
      expect(settings.text).toEqual({ mode: 'fill', required: false })
    }
    expect(wrapper.get('[data-content-item-id="item-1"]').find('.performance-rich-text-box').exists()).toBe(false)
    expect(wrapper.get('[data-content-item-id="item-1"]').find('.content-renderer-view-preview').exists()).toBe(true)
    await wrapper.get('[data-content-item-id="item-1"]').trigger('click')
    expect(wrapper.find('.content-settings-detail--item').exists()).toBe(true)
    await wrapper.get('.content-settings-detail--item input[value="fill"]').setValue()
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0] })
    expect(wrapper.find('.work-summary-required-setting').exists()).toBe(true)
    if (type === 'custom') {
      await wrapper.get('[data-content-item-id="text"]').trigger('click')
      expect(wrapper.find('.content-settings-detail--item').exists()).toBe(true)
    }
    wrapper.unmount()
  })

  it('keeps evaluation custom-tag display settings when switching fill modes', async () => {
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content: { ...content, type: 'custom', items: [{ id: 'tag', label: '标签题', hint: '题目描述', questionType: 'tag', options: [{ id: 'a', label: '选项A' }] }] },
      active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: false, allowMultiple: false },
      itemSettings: { tag: { mode: 'fill', required: true, hideName: false, hideDescription: false } },
      rootSettingsEnabled: true, itemSettingsEnabled: true, rootSettingsVariant: 'evaluation-360-root', itemSettingsVariant: 'evaluation-item',
    } })
    await wrapper.get('[data-content-item-id="tag"]').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '填写设置', '必填项设置'])
    const display = wrapper.get('.content-settings-detail--item')
    await display.findAll('input[type="checkbox"]')[0].setValue(true)
    await display.findAll('input[type="checkbox"]')[1].setValue(true)
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0] })
    await wrapper.get('.content-settings-detail--item input[value="view"]').setValue()
    await wrapper.setProps({ itemSettings: (wrapper.emitted('update:item-settings')!.at(-1) as [typeof wrapper.vm.$props.itemSettings])[0] })
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '填写设置'])
    expect(wrapper.findAll('.content-settings-detail--item input[type="checkbox"]')).toHaveLength(2)
    expect((wrapper.findAll('.content-settings-detail--item input[type="checkbox"]')[0].element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.findAll('.content-settings-detail--item input[type="checkbox"]')[1].element as HTMLInputElement).checked).toBe(true)
    wrapper.unmount()
  })

  it('shows result-communication settings for custom-tag items', async () => {
    const wrapper = mount(PerformanceConfiguredContentBlock, { props: {
      content: { ...content, type: 'custom', items: [{ id: 'tag', label: '标签题', hint: '题目描述', questionType: 'tag', options: [{ id: 'a', label: '选项A' }] }] },
      active: true, expanded: true, dragging: false, index: 0, count: 1, toolbarVisible: false,
      rootSettings: { hideDescription: false, allowMultiple: false },
      itemSettings: { tag: { mode: 'fill', required: true } },
      rootSettingsEnabled: true, itemSettingsEnabled: true, rootSettingsVariant: 'result-communication-root', itemSettingsVariant: 'result-communication-item',
    } })
    await wrapper.get('[data-content-item-id="tag"]').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '填写设置', '必填项设置'])
    wrapper.unmount()
  })

  it('does not mount the rule panel when the stage does not opt in', () => {
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
