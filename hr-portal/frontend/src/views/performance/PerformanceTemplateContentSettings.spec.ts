import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceTemplateOperateBar from '@/components/performance/PerformanceTemplateOperateBar.vue'
import PerformanceExpandButton from '@/components/performance/PerformanceExpandButton.vue'
import PerformanceTemplateContentSettings from './PerformanceTemplateContentSettings.vue'
import PerformanceAssessmentContentLayers from '@/components/performance/PerformanceAssessmentContentLayers.vue'
import PerformanceRatingControl from '@/components/performance/PerformanceRatingControl.vue'
import PerformancePromptModal from '@/components/performance/PerformancePromptModal.vue'
import PerformanceConfiguredContentBlock from '@/components/performance/PerformanceConfiguredContentBlock.vue'
import PerformanceTextField from '@/components/performance/PerformanceTextField.vue'
import PerformanceContentSelectionFrame from '@/components/performance/PerformanceContentSelectionFrame.vue'
import PerformanceReviewer360Content from '@/components/performance/PerformanceReviewer360Content.vue'
import reviewer360ContentSource from '@/components/performance/PerformanceReviewer360Content.vue?raw'
import selectionFrameSource from '@/components/performance/PerformanceContentSelectionFrame.vue?raw'
import contentSettingsSource from './PerformanceTemplateContentSettings.vue?raw'
import configuredBlockSource from '@/components/performance/PerformanceConfiguredContentBlock.vue?raw'
import { readFileSync } from 'node:fs'
import { performanceReviewQuestionApi, performanceTagFillQuestionApi, performanceTemplateApi } from '@/api/performance'

const mockNodes = [
  { node_id: 'n1', node_type: 'work_summary', name: '工作总结环节', executor_label: '被评估人' },
  { node_id: 'n2', node_type: 'reviewer_360_invite', name: '360°邀请环节', executor_label: '被评估人' },
  { node_id: 'n3', node_type: 'reviewer_360_confirm', name: '360°确认环节', executor_label: '直属上级' },
  { node_id: 'n4', node_type: 'evaluation', name: '评估型环节', executor_label: '360°评估人' },
  { node_id: 'n5', node_type: 'calibration', name: '校准环节', executor_label: '在项目配置时指定' },
  { node_id: 'n6', node_type: 'result_communication', name: '结果沟通', executor_label: '直属上级' },
  { node_id: 'n7', node_type: 'evaluation', name: '评估型环节', executor_label: '直属上级' },
  { node_id: 'n8', node_type: 'result_view', name: '绩效结果查看环节', executor_label: '被评估人' },
  { node_id: 'n9', node_type: 'result_reconsideration', name: '结果复议处理', executor_label: '复议处理人' },
] as any[]

function pointerEvent(type: string, values: Record<string, number>) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])))
  return event
}

describe('PerformanceTemplateContentSettings', () => {
  it('saves, reorders, edits and reopens page prompts alongside mixed content', async () => {
    const mixed = { id: 'mixed', content_id: 'mixed', type: 'rating', name: '混合评级', description: '', ratingOptionId: 'rating', items: [
      { id: 'rating', kind: 'rating', label: '评级', hint: '' },
      { id: 'fill', kind: 'fill', label: '说明', hint: '', questionType: 'text' },
      { id: 'inline', kind: 'prompt', label: '', hint: '', prompt: { title: '内部提示', content: '内部说明', color: '#3B82F6', scope: 'all' } },
    ] }
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({ nodes: [{ ...mockNodes[0], content: [mixed] }] } as any)
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => ({ ...payload } as any))
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 }, global: { stubs: { Teleport: true } } })
    await flushPromises()
    await wrapper.get('.stage-card').trigger('click')
    const emitPrompt = async (title: string, content: string) => {
      wrapper.getComponent(PerformanceTemplateOperateBar).vm.$emit('action', 'add-prompt')
      await wrapper.vm.$nextTick()
      wrapper.getComponent(PerformancePromptModal).vm.$emit('save', { title, content, color: '#3B82F6', scope: 'all' })
      await wrapper.vm.$nextTick()
    }
    await emitPrompt('页面提示', '页面说明')
    const sortable = wrapper.getComponent({ name: 'PerformanceSortableList' })
    sortable.vm.$emit('reorder', 1, 0)
    await wrapper.vm.$nextTick()
    wrapper.getComponent(PerformanceAssessmentContentLayers).vm.$emit('confirm', [mixed])
    await wrapper.vm.$nextTick()
    expect(wrapper.findAllComponents(PerformanceConfiguredContentBlock).map(block => block.props('content').type)).toEqual(['prompt', 'rating'])
    wrapper.findAllComponents(PerformanceConfiguredContentBlock)[0].vm.$emit('edit')
    await wrapper.vm.$nextTick()
    expect(wrapper.getComponent(PerformancePromptModal).props('initialValue')).toMatchObject({ title: '页面提示', content: '页面说明' })
    wrapper.getComponent(PerformancePromptModal).vm.$emit('save', { title: '更新提示', content: '更新说明', color: '#3B82F6', scope: 'cycle' })
    await wrapper.vm.$nextTick()
    await (wrapper.vm as any).save()
    const saved = update.mock.calls.at(-1)![1]
    expect(saved.nodes[0].content!.map(content => content.type)).toEqual(['prompt', 'rating'])
    expect(saved.nodes[0].content![0].prompt).toEqual({ title: '更新提示', content: '更新说明', color: '#3B82F6', scope: 'cycle' })
    expect(saved.nodes[0].content![1].items.map(item => item.kind)).toEqual(['rating', 'fill', 'prompt'])
    wrapper.unmount()
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue(saved as any)
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 }, global: { stubs: { Teleport: true } } })
    await flushPromises()
    await reopened.get('.stage-card').trigger('click')
    expect(reopened.findAllComponents(PerformanceConfiguredContentBlock).map(block => block.props('content').name)).toEqual(['更新提示', '混合评级'])
    expect(reopened.text()).toContain('更新说明')
    expect(reopened.text()).toContain('内部说明')
    reopened.unmount()
  })

  beforeEach(() => {
    vi.spyOn(performanceTemplateApi, 'getWorkflow').mockResolvedValue({ nodes: mockNodes } as any)
    vi.spyOn(performanceReviewQuestionApi, 'list').mockResolvedValue([])
    vi.spyOn(performanceTagFillQuestionApi, 'options').mockResolvedValue([])
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it.each(['work_summary', 'evaluation', 'result_view', 'result_communication'] as const)('keeps %s configuration available without employee preview', async nodeType => {
    const node = { ...mockNodes.find(candidate => candidate.node_type === nodeType), node_id: 'current', node_type: nodeType }
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({ nodes: [node] } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.get('.stage-card').trigger('click')
    expect(wrapper.find('.employee-preview-entry, .employee-preview, .employee-preview-error').exists()).toBe(false)
    expect(wrapper.get('.text-normal').text()).toContain('内容设置')
    expect(wrapper.find('.content-stage-renderer').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps configuration and unsaved content available without employee preview', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.find('.stage-card').trigger('click')
    wrapper.getComponent(PerformanceAssessmentContentLayers).vm.$emit('confirm', [{ content_id: 'draft', type: 'work_summary', name: '未保存内容', description: '', items: [{ id: 'visible', label: '可见题', hint: '' }] }])
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.configured-content-panel').text()).toContain('未保存内容')
    expect(wrapper.get('.text-normal').text()).toContain('内容设置')
    expect(wrapper.find('.employee-preview-entry, .employee-preview, .employee-preview-error').exists()).toBe(false)
    wrapper.unmount()
  })



  it('keeps result-view content configuration without employee preview', async () => {
    const tags = { content_id: 'tags', content_slot: 'view', type: 'custom', name: '终评标签', items: [{ id: 'allowed', label: '允许题', questionType: 'tag', options: [{ id: 'a', label: '协作' }] }] }
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({ nodes: [{ ...mockNodes[7], content: [tags] }] } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.get('.stage-card').trigger('click')
    expect(wrapper.get('.configured-content-panel').text()).toContain('终评标签')
    expect(wrapper.find('.employee-preview-entry, .employee-preview, .employee-preview-error').exists()).toBe(false)
    wrapper.unmount()
  })

  it('persists result tag allow-view and display flags independently and reopens them', async () => {
    const tags = { content_id: 'tags', type: 'custom', name: '终评标签', description: '模块说明', items: [{ id: 'tag', label: '标签题', hint: '题目描述', questionType: 'tag', options: [{ id: 'a', label: '协作' }] }] }
    const nodes = [
      { ...mockNodes[6], include_final_result: true, content: [{ ...tags, content_slot: 'fill' }] },
      { ...mockNodes[7], content: [{ ...tags, content_slot: 'view' }] },
    ]
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({ nodes } as any)
    const save = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => ({ nodes: payload.nodes, content_library: payload.content_library } as any))
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[1].trigger('click')
    await wrapper.get('[data-content-item-id="tag"]').trigger('click')
    const panel = () => wrapper.get('.content-settings-detail--item')
    expect(panel().text()).toContain('允许查看')
    await panel().findAll('input')[1].setValue(true)
    await panel().findAll('input')[2].setValue(true)
    await panel().findAll('input')[0].setValue(false)
    await (wrapper.vm as any).save()
    const saved = save.mock.calls.at(-1)![1].nodes
    expect(saved[1].content![0].items[0].settings).toMatchObject({ allowView: false, hideName: true, hideDescription: true })
    expect(saved[0].content![0].items[0].settings?.allowView).toBeUndefined()
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({ nodes: saved } as any)
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await reopened.findAll('.stage-card')[1].trigger('click')
    await reopened.get('[data-content-item-id="tag"]').trigger('click')
    expect(reopened.find('.work-summary-view-options').exists()).toBe(false)
    await reopened.get('.content-settings-detail--item input').setValue(true)
    expect((reopened.findAll('.work-summary-view-options input')[0].element as HTMLInputElement).checked).toBe(true)
    expect((reopened.findAll('.work-summary-view-options input')[1].element as HTMLInputElement).checked).toBe(true)
    expect(reopened.find('.template-field-label').exists()).toBe(false)
    expect(reopened.find('.template-field-description').exists()).toBe(false)
    await (reopened.vm as any).save()
    expect(save.mock.calls.at(-1)![1].nodes[1].content![0].items[0].settings?.allowView).toBe(true)
    const drawer = reopened.getComponent(PerformanceAssessmentContentLayers)
    drawer.vm.$emit('confirm', [{ ...tags, id: 'tags' }])
    await reopened.vm.$nextTick()
    await (reopened.vm as any).save()
    expect(save.mock.calls.at(-1)![1].nodes[1].content![0].items[0].settings).toMatchObject({ allowView: true, hideName: true, hideDescription: true })
    wrapper.unmount()
    reopened.unmount()
  })

  it('shares dashed hover and solid selection tokens between headings and content blocks', async () => {
    const tokenSource = readFileSync('src/styles/tokens.css', 'utf8')
    expect(tokenSource).toContain('--performance-content-hover-outline: 1px dashed var(--performance-content-hover-border)')
    expect(selectionFrameSource).toContain('outline: var(--performance-content-hover-outline)')
    expect(selectionFrameSource).toContain('box-shadow: var(--performance-content-selected-shadow)')
    expect(contentSettingsSource.replace(/\r\n/g, '\n')).toContain('.text-normal__divider {\n  position: relative;\n  z-index: 31;')
    expect(configuredBlockSource).toContain('position:fixed;top:104px')
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    wrapper.getComponent(PerformanceAssessmentContentLayers).vm.$emit('confirm', [{ content_id: 'block', type: 'work_summary', name: '内容块', description: '', items: [{ id: 'item', label: '问题', hint: '' }] }])
    await wrapper.vm.$nextTick()
    expect(wrapper.findAllComponents(PerformanceContentSelectionFrame)).toHaveLength(3)
    const divider = wrapper.get('.text-normal__divider').element
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.get('.text-normal__divider').element).toBe(divider)
    expect(wrapper.find('.content-settings-detail--root').exists()).toBe(true)
    await wrapper.get('.template-section__heading').trigger('click')
    expect(wrapper.findAll('.performance-content-selection-frame.is-selected')).toHaveLength(1)
    expect(wrapper.get('.template-section__heading').classes()).toContain('is-selected')
    expect(wrapper.find('.content-settings-detail--root').exists()).toBe(false)
    await wrapper.get('[data-content-item-id="item"]').trigger('click')
    expect(wrapper.findAll('.performance-content-selection-frame.is-selected')).toHaveLength(1)
    expect(wrapper.get('.template-section__heading').classes()).not.toContain('is-selected')
    expect(wrapper.find('.page-name-settings').exists()).toBe(false)
    await wrapper.get('.template-section__heading').trigger('keydown', { key: 'Enter' })
    expect(wrapper.findAll('.performance-content-selection-frame.is-selected')).toHaveLength(1)
    expect(wrapper.get('.template-section__heading').attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('edits only the page name, preserves it per node, and reopens the saved payload', async () => {
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => payload as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    await wrapper.get('.template-section__heading').trigger('click')
    const input = wrapper.getComponent(PerformanceTextField)
    expect(input.props('variant')).toBe('feishu-input')
    expect(input.props('modelValue')).toBe('工作总结环节')
    await input.get('input').setValue('  本季度工作总结  ')
    expect(wrapper.get('.template-section__title').text()).toBe('本季度工作总结')
    expect(wrapper.findAll('.stage-card__title')[0].text()).toBe('工作总结环节')
    await wrapper.findAll('.stage-card')[2].trigger('click')
    expect(wrapper.find('.page-name-settings').exists()).toBe(false)
    expect(wrapper.get('.template-section__title').text()).toBe('360°确认环节')
    await wrapper.findAll('.stage-card')[0].trigger('click')
    expect(wrapper.get('.template-section__title').text()).toBe('本季度工作总结')
    await (wrapper.vm as any).save()
    const payload = update.mock.calls[0][1]
    expect(payload.nodes[0]).toMatchObject({ name: '工作总结环节', content_page_name: '本季度工作总结' })
    expect(payload.nodes[2].content_page_name).toBeUndefined()
    expect(payload.content_library).toEqual([])
    expect(wrapper.get('.template-section__title').text()).toBe('本季度工作总结')
    wrapper.unmount()
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue(payload as any)
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await reopened.findAll('.stage-card')[0].trigger('click')
    await reopened.get('.template-section__heading').trigger('click')
    expect((reopened.get('#content-page-name').element as HTMLInputElement).value).toBe('本季度工作总结')
    reopened.unmount()
  })

  it('blocks empty page names, locates the invalid node, and retains input after API failure', async () => {
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockRejectedValue(new Error('保存失败'))
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    await wrapper.get('.template-section__heading').trigger('click')
    await wrapper.get('#content-page-name').setValue(' ')
    await wrapper.findAll('.stage-card')[2].trigger('click')
    await expect((wrapper.vm as any).save()).rejects.toThrow('页面名称长度必须为 1-100')
    expect(update).not.toHaveBeenCalled()
    expect(wrapper.get('.page-name-settings__error').text()).toBe('页面名称长度必须为 1-100')
    expect(wrapper.get('.stage-card.selected .stage-card__title').text()).toBe('工作总结环节')
    await wrapper.get('#content-page-name').setValue('待保存页面')
    await expect((wrapper.vm as any).save()).rejects.toThrow('保存失败')
    expect(wrapper.get('.template-section__title').text()).toBe('待保存页面')
    expect((wrapper.get('#content-page-name').element as HTMLInputElement).value).toBe('待保存页面')
    wrapper.unmount()
  })

  it('clears selection on tab changes and disables names on used templates', async () => {
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({ nodes: mockNodes, usage_summary: { cycle_count: 1, project_count: 0 } } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[3].trigger('click')
    await wrapper.get('.template-section__heading').trigger('click')
    expect(wrapper.get('#content-page-name').attributes('disabled')).toBeDefined()
    await wrapper.findAll('.content-tab')[1].trigger('click')
    expect(wrapper.find('.page-name-settings').exists()).toBe(false)
    await wrapper.findAll('.content-tab')[0].trigger('click')
    expect(wrapper.get('.template-section__heading').classes()).not.toContain('is-selected')
    wrapper.unmount()
  })

  it('shows rating item display settings inside a work-summary stage', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.find('.stage-card').trigger('click')
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)
    layer.vm.$emit('confirm', [{ type: 'rating', name: '评分评级', description: '', items: [{ id: 'rating-item', label: '季度评级', hint: '' }], options: [{ id: 'a', label: '符合预期' }] }])
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-content-item-id="rating-item"]').trigger('click')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('隐藏名称')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('必填项设置')
    await wrapper.get('.content-settings-detail--item input[type="checkbox"]').setValue(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[data-content-item-id="rating-item"] strong').exists()).toBe(false)
    expect(wrapper.find('[data-content-item-id="rating-item"] > i').exists()).toBe(false)
  })
  it('saves and reopens rating unknown root settings without changing grade definitions', async () => {
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => payload as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.find('.stage-card').trigger('click')
    wrapper.findComponent(PerformanceAssessmentContentLayers).vm.$emit('confirm', [{ content_id: 'rating-unknown', type: 'rating', name: '评级内容', description: '', items: [{ id: 'r', label: '评级题', hint: '' }], options: [{ id: 'a', label: 'A' }] }])
    await wrapper.vm.$nextTick()
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--root legend').map(group => group.text())).toEqual(['显示设置', '评估设置'])
    await wrapper.findAll('.content-settings-detail--root input')[1].setValue(true)
    expect(wrapper.findAll('.performance-rating-control__option').map(option => option.text())).toEqual(['A', '不了解'])
    await (wrapper.vm as any).save()
    const payload = update.mock.calls[0][1]
    expect(payload.nodes[0].content?.[0].settings?.allowUnknown).toBe(true)
    expect(payload.nodes[0].content?.[0].options).toEqual([{ id: 'a', label: 'A' }])
    wrapper.unmount()
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue(payload as any)
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await reopened.find('.stage-card').trigger('click')
    await reopened.get('.configured-content-card__row').trigger('click')
    expect((reopened.findAll('.content-settings-detail--root input')[1].element as HTMLInputElement).checked).toBe(true)
    expect(reopened.findAll('.performance-rating-control__option').map(option => option.text())).toEqual(['A', '不了解'])
    reopened.unmount()
  })

  it('toggles custom text names independently and preserves hideName through save and reopen', async () => {
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => payload as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    wrapper.getComponent(PerformanceAssessmentContentLayers).vm.$emit('confirm', [{
      content_id: 'custom-text', type: 'custom', name: '自定义内容', description: '', items: [
        { id: 'text-1', label: '第一题', hint: '填写内容', questionType: 'text' },
        { id: 'text-2', label: '第二题', hint: '', questionType: 'text' },
      ],
    }])
    await wrapper.vm.$nextTick()
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--root legend').map(group => group.text())).toEqual(['显示设置'])
    expect(wrapper.get('.content-settings-detail--root').text()).not.toContain('允许添加多个')
    await wrapper.get('[data-content-item-id="text-1"]').trigger('click')
    expect(wrapper.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '填写设置', '必填项设置'])
    await wrapper.get('.content-settings-detail--item input[type="checkbox"]').setValue(true)
    expect(wrapper.get('[data-content-item-id="text-1"]').classes()).toContain('content-renderer-item--name-hidden')
    expect(wrapper.get('[data-content-item-id="text-2"]').classes()).not.toContain('content-renderer-item--name-hidden')
    await wrapper.findAll('.stage-card')[1].trigger('click')
    await wrapper.findAll('.stage-card')[0].trigger('click')
    expect(wrapper.get('[data-content-item-id="text-1"]').classes()).toContain('content-renderer-item--name-hidden')
    await (wrapper.vm as any).save()
    const payload = update.mock.calls[0][1]
    expect(payload.nodes[0].content?.[0].items.map(item => item.settings?.hideName)).toEqual([true, false])
    expect(payload.content_library?.find(content => content.content_id === 'custom-text')?.items[0].settings?.hideName).not.toBe(true)
    wrapper.unmount()

    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue(payload as any)
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await reopened.findAll('.stage-card')[0].trigger('click')
    await reopened.get('.configured-content-card__row').trigger('click')
    expect(reopened.findAll('.content-settings-detail--root legend').map(group => group.text())).toEqual(['显示设置'])
    await reopened.get('[data-content-item-id="text-1"]').trigger('click')
    expect(reopened.findAll('.content-settings-detail--item legend').map(group => group.text())).toEqual(['显示设置', '填写设置', '必填项设置'])
    const checkbox = reopened.get('.content-settings-detail--item input[type="checkbox"]')
    expect((checkbox.element as HTMLInputElement).checked).toBe(true)
    expect(reopened.get('[data-content-item-id="text-1"]').classes()).toContain('content-renderer-item--name-hidden')
    await checkbox.setValue(false)
    expect(reopened.get('[data-content-item-id="text-1"]').classes()).not.toContain('content-renderer-item--name-hidden')
    expect(reopened.get('[data-content-item-id="text-1"] .performance-assessment-rich-text-field__label').text()).toBe('第一题*')
    reopened.unmount()
  })

  it.each([false, true])('persists rating level rule toggle %s independently through save and reopen', async enabled => {
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => payload as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.find('.stage-card').trigger('click')
    wrapper.findComponent(PerformanceAssessmentContentLayers).vm.$emit('confirm', [{ content_id: 'rating-rules', type: 'rating', name: '评分评级', description: '', items: [{ id: 'rating-item', label: '季度评级', hint: '' }], options: [{ id: 'a', label: '符合预期' }] }])
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-content-item-id="rating-item"]').trigger('click')
    const toggle = wrapper.get('.rating-level-rule-settings .performance-switch')
    expect(toggle.attributes('aria-checked')).toBe('false')
    await toggle.trigger('click')
    if (!enabled) await toggle.trigger('click')
    expect(wrapper.find('.rating-level-rule-settings__details').exists()).toBe(enabled)
    await wrapper.findAll('.stage-card')[1].trigger('click')
    await wrapper.findAll('.stage-card')[0].trigger('click')
    await wrapper.get('[data-content-item-id="rating-item"]').trigger('click')
    expect(wrapper.get('.rating-level-rule-settings .performance-switch').attributes('aria-checked')).toBe(String(enabled))
    await (wrapper.vm as any).save()
    const payload = update.mock.calls[0][1]
    expect(payload.nodes[0].content?.[0].items[0].settings).toMatchObject({ levelRulesEnabled: enabled, required: true, hideName: false })
    expect(payload.content_library?.[0].items[0].settings?.levelRulesEnabled).not.toBe(true)
    wrapper.unmount()
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue(payload as any)
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await reopened.find('.stage-card').trigger('click')
    await reopened.get('[data-content-item-id="rating-item"]').trigger('click')
    expect(reopened.get('.rating-level-rule-settings .performance-switch').attributes('aria-checked')).toBe(String(enabled))
    expect(reopened.find('.rating-level-rule-settings__details').exists()).toBe(enabled)
    reopened.unmount()
  })

  it('renders the result reconsideration fixed preview with shared collapse, title line, and action bar', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[8].trigger('click')

    expect(wrapper.get('.result-reconsideration-section').text()).toContain('复议理由')
    expect(wrapper.get('.template-section__title').text()).toBe('结果复议处理')
    expect(wrapper.get('.result-reconsideration-section__preview').text()).toBe('这里展示被评估人发起复议时填写的内容')
    expect(wrapper.get('.result-reconsideration-section').findComponent(PerformanceExpandButton).exists()).toBe(true)
    expect(wrapper.get('.result-reconsideration-section').findComponent(PerformanceTemplateOperateBar).exists()).toBe(true)
    expect(wrapper.get('.result-reconsideration-section').find('.performance-assessment-preview-header').exists()).toBe(true)

    const collapse = wrapper.get('.result-reconsideration-section .performance-expand-button')
    expect(collapse.classes()).toContain('is-hover-only')
    expect(collapse.attributes('aria-label')).toBe('收起复议理由')
    await collapse.trigger('click')
    expect(wrapper.find('.result-reconsideration-section__preview').exists()).toBe(false)
    expect(wrapper.get('.text-normal__body').text()).toBe('暂未选择内容')

    await wrapper.get('.result-reconsideration-section__frame').trigger('click')
    expect(wrapper.get('.text-normal__body').text()).toBe('暂无可配置内容')
    expect(wrapper.get('.result-reconsideration-section__frame').classes()).toContain('is-selected')

    await wrapper.findAll('.stage-card')[0].trigger('click')
    expect(wrapper.find('.result-reconsideration-section').exists()).toBe(false)
    wrapper.unmount()
  })
  it('renders the three-column architecture and workflow-driven stage list in API order', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    expect(wrapper.find('.stage-panel').exists()).toBe(true)
    expect(wrapper.find('.content-canvas').exists()).toBe(true)
    expect(wrapper.find('.content-tabs__divider').exists()).toBe(true)
    expect(wrapper.get('.text-normal__title').text()).toBe('内容设置')
    expect(wrapper.get('.text-normal__body').text()).toBe('暂未选择内容')
    expect(wrapper.findAll('.stage-card')).toHaveLength(9)
    expect(wrapper.findAll('.stage-card__title').map((node) => node.text())).toEqual([
      '工作总结环节',
      '360°邀请环节',
      '360°确认环节',
      '评估型环节',
      '校准环节',
      '结果沟通',
      '评估型环节',
      '绩效结果查看环节',
      '结果复议处理',
    ])
  })

  it('updates the selected stage without changing the empty right-panel contract', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    expect(wrapper.findAll('.stage-card')[0].classes()).toContain('selected')
    expect(wrapper.get('.text-normal__body').text()).toBe('暂未选择内容')
    expect(wrapper.get('.template-section__title').text()).toBe('工作总结环节')
    expect(wrapper.findAll('.template-operate__button').map((button) => button.text())).toEqual(['添加内容', '添加提示'])
  })

  it('opens all assessment content with the shared drawer and keeps the normal add-content title', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()

    const allContentButton = wrapper.get('.all-content-button')
    expect(allContentButton.get('svg').attributes('data-icon')).toBe('ArrangeOutlined')
    expect(allContentButton.get('svg').attributes('width')).toBe('14')
    expect(allContentButton.get('svg').attributes('height')).toBe('14')
    expect(allContentButton.findAll('path').map(path => path.attributes('d'))).toEqual([
      'M2.467 11.5a1 1 0 0 1 1.366-.366L12 15.846l8.167-4.712a1 1 0 0 1 1 1.732l-8.534 4.923a1.267 1.267 0 0 1-1.266 0l-8.534-4.923a1 1 0 0 1-.366-1.366Z',
      'M2.453 16.193a1 1 0 0 1 1.354-.407L12 20.198l8.192-4.412a1 1 0 1 1 .949 1.761l-8.54 4.599a1.267 1.267 0 0 1-1.202 0l-8.54-4.599a1 1 0 0 1-.406-1.354ZM12 4.267l5.942 3.169L12 11 6.058 7.436 12 4.266Zm.502-2a1.067 1.067 0 0 0-1.004 0L2.83 6.89a.533.533 0 0 0-.023.928l8.643 5.186c.338.203.76.203 1.098 0l8.643-5.186a.533.533 0 0 0-.023-.928l-8.667-4.622Z',
    ])
    await allContentButton.trigger('click')
    expect(wrapper.getComponent(PerformanceAssessmentContentLayers).props('title')).toBe('全部评估内容')
    expect(document.body.querySelector('#assessment-drawer-title')?.textContent).toBe('全部评估内容')

    ;(document.body.querySelector('.drawer-header .icon-button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    await wrapper.find('.template-operate__button').trigger('click')
    expect(wrapper.getComponent(PerformanceAssessmentContentLayers).props('title')).toBe('选择评估内容')
    expect(document.body.querySelector('#assessment-drawer-title')?.textContent).toBe('选择评估内容')
  })

  it('derives the middle tabs from the selected workflow node and moves the active ink', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    expect(wrapper.findAll('.content-tab').map((tab) => tab.text())).toEqual(['配置填写内容', '配置参考内容'])
    await wrapper.findAll('.content-tab')[1].trigger('click')
    expect(wrapper.findAll('.content-tab')[1].classes()).toContain('content-tab--active')
    await wrapper.findAll('.stage-card')[0].trigger('click')
    expect(wrapper.findAll('.content-tab').map((tab) => tab.text())).toEqual(['配置填写内容'])
    expect(wrapper.get('.content-tab').classes()).toContain('content-tab--active')
  })

  it('opens shared content layers and restricts result-view selection by source instead of type', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()

    await wrapper.findAll('.stage-card')[0].trigger('click')
    await wrapper.findAll('.template-operate__button')[0].trigger('click')
    expect(document.body.querySelector('#assessment-drawer-title')?.textContent).toBe('选择评估内容')
    ;(document.body.querySelector('.drawer-header .icon-button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('.stage-card')[1].trigger('click')
    expect(wrapper.findAll('.template-operate__button').map(button => button.text())).toEqual(['添加提示'])
    expect(wrapper.findAll('.template-operate__item')).toHaveLength(1)
    await wrapper.get('.template-operate__button').trigger('click')
    expect(wrapper.getComponent(PerformancePromptModal).props('open')).toBe(true)
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('添加提示')
    expect(document.body.querySelector('#assessment-drawer-title')).toBeNull()
    ;([...document.body.querySelectorAll('.prompt-modal__footer button')].find(button => button.textContent === '取消') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.getComponent(PerformancePromptModal).props('open')).toBe(false)

    await wrapper.findAll('.stage-card')[3].trigger('click')
    await wrapper.findAll('.template-operate__button')[0].trigger('click')
    expect(document.body.querySelector('#assessment-drawer-title')?.textContent).toBe('选择评估内容')
    expect(Array.from(document.body.querySelectorAll('.create-menu [role="menuitem"]')).map((node) => node.textContent)).toEqual([])
    ;(document.body.querySelector('.create-button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(Array.from(document.body.querySelectorAll('.create-menu [role="menuitem"]')).map((node) => node.textContent)).toEqual(['工作总结', '评分评级', '自定义'])
    ;(document.body.querySelector('.drawer-header .icon-button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.stage-card')[7].trigger('click')
    await wrapper.findAll('.template-operate__button')[0].trigger('click')
    expect(document.body.querySelector('.create-button')).not.toBeNull()
    expect(document.body.querySelector('.created-item__edit')).toBeNull()
    expect(document.body.textContent).not.toContain('仅可选择终评环节执行人「未配置」填写的内容')
    expect(wrapper.findComponent(PerformanceAssessmentContentLayers).props('selectableContentIds')).toEqual([])
  })

  it('reuses the same 360 content component for invitation and confirmation previews', async () => {
    expect(contentSettingsSource).toContain("import PerformanceReviewer360Content from '@/components/performance/PerformanceReviewer360Content.vue'")
    expect(reviewer360ContentSource).toContain('pointer-events:none')
    expect(contentSettingsSource).not.toContain('.reviewer-360-content__table{')
    expect(contentSettingsSource).toContain('<PerformanceReviewer360Content')
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[1].trigger('click')
    expect(wrapper.findAllComponents(PerformanceReviewer360Content)).toHaveLength(1)
    expect(wrapper.getComponent(PerformanceReviewer360Content).props('pageTitle')).toBe('360°邀请环节')
    await wrapper.findAll('.stage-card')[2].trigger('click')
    expect(wrapper.findAllComponents(PerformanceReviewer360Content)).toHaveLength(1)
    expect(wrapper.getComponent(PerformanceReviewer360Content).props('pageTitle')).toBe('360°确认环节')
    expect(wrapper.find('.reviewer-360-content__actions').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shows the updated empty settings copy after selecting either 360 preview root', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    for (const stageIndex of [1, 2]) {
      await wrapper.findAll('.stage-card')[stageIndex].trigger('click')
      expect(wrapper.get('.text-normal__body').text()).toBe('暂未选择内容')
      await wrapper.get('.reviewer-360-content__body').trigger('click')
      expect(wrapper.get('.text-normal__body').text()).toBe('暂无可配置内容')
      await wrapper.get('.template-section__heading').trigger('click')
      expect(wrapper.find('.text-normal__body').exists()).toBe(false)
      expect(wrapper.get('.page-name-settings').text()).toContain('页面名称')
      expect(wrapper.get('.reviewer-360-content__body').classes()).not.toContain('is-selected')
      await wrapper.get('.reviewer-360-content__body').trigger('click')
      await wrapper.findAll('.content-tab')[1].trigger('click')
      expect(wrapper.get('.text-normal__body').text()).toBe('暂未选择内容')
      expect(wrapper.findComponent(PerformanceReviewer360Content).exists()).toBe(false)
    }
    wrapper.unmount()
  })

  it.each([1, 2])('renders the captured non-interactive 360 preview in fill tab for stage %s', async (stageIndex) => {
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => payload as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[stageIndex].trigger('click')
    const preview = wrapper.get('.reviewer-360-content')
    expect(preview.get('.template-section__title').text()).toBe(mockNodes[stageIndex].name)
    expect(wrapper.get('.template-section__heading').classes()).not.toContain('is-selected')
    expect(wrapper.get('.reviewer-360-content__body').classes()).not.toContain('is-selected')
    await wrapper.get('.template-section__heading').trigger('click')
    expect(wrapper.get('.template-section__heading').classes()).toContain('is-selected')
    expect(wrapper.get('.page-name-settings').text()).toContain('页面名称')
    expect(wrapper.get('.reviewer-360-content__body').classes()).not.toContain('is-selected')
    await wrapper.get('.reviewer-360-content__body').trigger('click')
    expect(wrapper.get('.template-section__heading').classes()).not.toContain('is-selected')
    expect(wrapper.get('.reviewer-360-content__body').classes()).toContain('is-selected')
    expect(preview.get('.reviewer-360-content__intro').text()).toBe('通过「搜索」添加 360° 评估人已邀请 0 人，除系统默认邀请外，仍需邀请至少 5 人。上级和 HRBP 也可以给员工邀请 360° 评估人。')
    expect(preview.get('.reviewer-360-content__search').text()).toBe('搜索成员')
    expect(preview.get('.reviewer-360-content__list-title').text()).toBe('已邀请列表：当前共 0 人')
    expect(preview.findAll('[role="radio"]').map(item => [item.text(), item.attributes('aria-checked')])).toEqual([['按关系', 'true'], ['按邀请人', 'false']])
    expect(preview.findAll('tr').map(row => row.findAll('td').map(cell => cell.text()))).toEqual([
      ['相同上级同事', ''], ['不同上级同事', ''], ['虚线上级', ''], ['直属下级', ''],
    ])
    expect(preview.findAll('input, textarea, select')).toHaveLength(0)
    expect(preview.get('[tabindex="0"]').attributes('aria-label')).toBe('选择页面标题')
    expect(preview.findAll('button')).toHaveLength(1)
    expect(preview.get('button').text()).toBe('添加提示')
    await preview.get('button').trigger('click')
    expect(wrapper.getComponent(PerformancePromptModal).props('open')).toBe(true)
    wrapper.getComponent(PerformancePromptModal).vm.$emit('update:open', false)
    await wrapper.vm.$nextTick()
    await (wrapper.vm as any).save()
    expect(update.mock.calls[0][1].nodes.find(node => node.node_id === mockNodes[stageIndex].node_id)?.content).toEqual([])
    expect(update.mock.calls[0][1].content_library).toEqual([])
    await wrapper.findAll('.content-tab')[1].trigger('click')
    expect(wrapper.find('.reviewer-360-content').exists()).toBe(false)
    expect(wrapper.get('.reference-entry-bar button').text()).toBe('选择参考内容')
    await wrapper.findAll('.stage-card')[2].trigger('click')
    expect(wrapper.find('.reviewer-360-content').exists()).toBe(true)
    expect(wrapper.get('.text-normal__body').text()).toBe('暂未选择内容')
    await wrapper.findAll('.stage-card')[3].trigger('click')
    expect(wrapper.find('.reviewer-360-content').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([[1, false], [1, true], [2, false], [2, true]])('reuses the prompt dialog for 360 fill stage %s with existing content: %s', async (stageIndex, hasContent) => {
    const content = { content_id: 'legacy-invite', content_slot: 'fill', type: 'custom', name: '已有邀请内容', description: '', items: [] }
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({
      nodes: [{ ...mockNodes[stageIndex], content: hasContent ? [content] : [] }, mockNodes[stageIndex === 1 ? 2 : 1], mockNodes[3]],
    } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    expect(wrapper.findAll('.template-operate__button').map(button => button.text())).toEqual(['添加提示'])
    expect(wrapper.findAll('.template-operate__item')).toHaveLength(1)
    expect(wrapper.find('.configured-content-footer').exists()).toBe(hasContent)
    if (hasContent) expect(wrapper.get('.configured-content-panel').text()).toContain('已有邀请内容')

    await wrapper.get('.template-operate__button').trigger('click')
    const prompt = wrapper.getComponent(PerformancePromptModal)
    expect(prompt.props('open')).toBe(true)
    expect(wrapper.getComponent(PerformanceAssessmentContentLayers).props('open')).toBe(false)
    const confirm = document.body.querySelector('.prompt-modal__footer button') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    const textarea = document.body.querySelector('.prompt-modal__body textarea') as HTMLTextAreaElement
    textarea.value = '请邀请熟悉你工作表现的同事'
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(confirm.disabled).toBe(false)
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(prompt.emitted('save')?.[0][0]).toEqual(expect.objectContaining({ content: '请邀请熟悉你工作表现的同事' }))
    expect(prompt.props('open')).toBe(false)

    await wrapper.findAll('.content-tab')[1].trigger('click')
    expect(wrapper.get('.reference-entry-bar button').text()).toBe('选择参考内容')
    await wrapper.get('.reference-entry-bar button').trigger('click')
    expect(document.body.querySelector('.reference-drawer')).not.toBeNull()
    ;(document.body.querySelector('.reference-drawer__footer button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.stage-card')[1].trigger('click')
    expect(wrapper.findAll('.template-operate__button').map(button => button.text())).toEqual(['添加提示'])
    await wrapper.findAll('.stage-card')[2].trigger('click')
    expect(wrapper.findAll('.template-operate__button').map(button => button.text())).toEqual(['添加内容', '添加提示'])
    wrapper.unmount()
  })

  it('reuses the configured item selection component for reviewer 360 confirmation without selecting its stage heading', async () => {
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({
      nodes: [{ ...mockNodes[2], content: [{ content_id: 'confirm-content', content_slot: 'fill', type: 'custom', name: '确认内容', description: '', items: [{ id: 'confirm-item', label: '确认问题', hint: '' }] }] }],
    } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    expect(wrapper.get('.template-section__title').text()).toBe('360°确认环节')
    expect(wrapper.findAll('[data-content-item-id="confirm-item"]').length).toBe(1)
    await wrapper.get('.reviewer-360-content__body').trigger('click')
    expect(wrapper.get('.text-normal__body').text()).toBe('暂无可配置内容')
    await wrapper.get('[data-content-item-id="confirm-item"]').trigger('click')
    expect(wrapper.get('.text-normal__body').text()).toBe('暂未选择内容')
    expect(wrapper.get('.reviewer-360-content__body').classes()).not.toContain('is-selected')
    expect(wrapper.get('[data-content-item-id="confirm-item"]').classes()).toContain('is-selected')
    expect(wrapper.get('.configured-content-card').classes()).not.toContain('is-selected')
    expect(wrapper.get('.template-section__heading').classes()).not.toContain('is-selected')
  })

  it('renders the captured result section and keeps non-final contents visible but disabled', async () => {
    const finalContent = { content_id: 'final-content', content_slot: 'fill', type: 'work_summary', name: '终评意见', description: '', items: [{ id: 'final-item', label: '意见', hint: '' }] }
    const otherContent = { ...finalContent, content_id: 'other-content', name: '自评意见' }
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({
      nodes: [{ ...mockNodes[6], include_final_result: true, executor_label: '实线上级', executor_types: ['DIRECT_MANAGER'], content: [finalContent] }, mockNodes[7]],
      content_library: [otherContent, finalContent],
    } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    expect(wrapper.find('.result-view-section').exists()).toBe(false)
    await wrapper.findAll('.stage-card')[1].trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.content-tab').map(tab => tab.text())).toEqual(['配置查看内容'])
    expect(wrapper.get('.result-view-section h2').text()).toBe('绩效结果')
    expect(wrapper.get('.result-view-section__empty').text()).toBe('此区域应添加终评环节执行人「直属上级」填写的内容')
    expect(wrapper.get('.result-view-section__content').attributes('aria-label')).toBe('选择页面标题')
    expect(wrapper.get('.result-view-section__content').classes()).not.toContain('is-selected')
    await wrapper.get('.result-view-section__content').trigger('click')
    expect(wrapper.get('.result-view-section__content').classes()).toContain('is-selected')
    expect(wrapper.get('.page-name-settings').text()).toContain('页面名称')
    expect((wrapper.get('#content-page-name').element as HTMLInputElement).value).toBe('绩效结果')
    await wrapper.get('.result-view-section .template-operate__button').trigger('click')
    await flushPromises()
    const layer = wrapper.getComponent(PerformanceAssessmentContentLayers)
    expect(layer.props('open')).toBe(true)
    expect(layer.props('availableContents')).toHaveLength(2)
    const rows = [...document.body.querySelectorAll('.created-item')]
    expect(rows).toHaveLength(2)
    expect(document.body.querySelector('.content-selection-restriction')).toBeNull()
    expect(document.body.querySelector('.create-button')).not.toBeNull()
    expect(document.body.querySelector('.created-item__edit')).not.toBeNull()
    expect((rows.find(row => row.textContent?.includes('自评意见'))?.querySelector('input') as HTMLInputElement).disabled).toBe(true)
    const allowed = rows.find(row => row.textContent?.includes('终评意见'))?.querySelector('input') as HTMLInputElement
    expect(allowed.disabled).toBe(false)
    allowed.click()
    await wrapper.vm.$nextTick()
    ;(document.body.querySelector('.drawer-footer .button--primary') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.configured-content-panel').text()).toContain('终评意见')
    expect(wrapper.find('.result-view-section__empty').exists()).toBe(false)
  })

  it('uses current final content instead of the previously selected view copy', async () => {
    const source = { content_id: 'same', type: 'custom', name: '最新终评意见', description: '', items: [{ id: 'item', label: '最新问题', hint: '' }] }
    const stale = { ...source, name: '旧终评意见', items: [{ id: 'item', label: '旧问题', hint: '' }], content_slot: 'view' }
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({
      nodes: [{ ...mockNodes[6], include_final_result: true, content: [{ ...source, content_slot: 'fill' }] }, { ...mockNodes[7], content: [stale] }],
      content_library: [stale],
    } as any)
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => payload as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[1].trigger('click')
    await wrapper.get('.configured-content-footer .template-operate__button').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.created-list')?.textContent).toContain('最新终评意见')
    expect(document.body.querySelector('.created-list')?.textContent).not.toContain('旧终评意见')
    ;(document.body.querySelector('.drawer-footer .button--primary') as HTMLButtonElement).click()
    await flushPromises()
    await (wrapper.vm as any).save()
    expect(update.mock.calls[0][1].nodes[1].content?.[0].name).toBe('最新终评意见')
    expect(update.mock.calls[0][1].content_library?.find(content => content.content_id === 'same')?.name).toBe('旧终评意见')
  })

  it('persists result view and other references independently and reopens binding-only content', async () => {
    const content = { content_id: 'final', type: 'custom', name: '终评意见', description: '', items: [{ id: 'item', label: '意见', hint: '' }] }
    const nodes = [{ ...mockNodes[6], include_final_result: true, content_bindings: { fill: ['final'] } }, { ...mockNodes[7], content_bindings: { view: ['final'] } }]
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({ nodes, content_library: [content] } as any)
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => payload as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[1].trigger('click')
    expect(wrapper.get('.configured-content-panel').text()).toContain('终评意见')
    await wrapper.get('.result-view-reference-entry button').trigger('click')
    const okr = document.body.querySelector('.reference-drawer__group:nth-of-type(2) input') as HTMLInputElement
    okr.click()
    await wrapper.vm.$nextTick()
    ;([...document.body.querySelectorAll('.reference-drawer__footer button')].find(node => node.textContent === '确认') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.configured-content-panel').text()).toContain('终评意见')
    expect(wrapper.get('.result-view-references').text()).toContain('OKR')
    await (wrapper.vm as any).save()
    const view = update.mock.calls[0][1].nodes[1]
    expect(view.content_bindings).toEqual({ view: ['final'], reference: ['reference-okr'] })
    await wrapper.findAll('.stage-card')[0].trigger('click')
    await wrapper.findAll('.stage-card')[1].trigger('click')
    expect(wrapper.get('.configured-content-panel').text()).toContain('终评意见')
    expect(wrapper.get('.result-view-references').text()).toContain('OKR')
  })

  it('loads tag fill questions from assessment management for the custom tag selector', async () => {
    vi.mocked(performanceTagFillQuestionApi.options).mockResolvedValue([
      { id: '301', name: '价值贡献', description: '说明', tags: [{ id: 'tag-1', name: '做得好的', description: '', prompt: '填写亮点' }] },
    ])
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()

    expect(performanceTagFillQuestionApi.options).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(PerformanceAssessmentContentLayers).props('tagOptions')).toEqual([
      { id: '301', label: '价值贡献', description: '说明', defaultFields: [{ label: '做得好的', content: '填写亮点' }] },
    ])
  })

  it('loads only active rating questions and maps their rule name as the option description', async () => {
    vi.mocked(performanceReviewQuestionApi.list).mockResolvedValue([
      { id: 101, name: '绩效评级', display_mode: '下拉样式', rule: { name: '7档绩效等级', review_type: '评级', status: 'active', config: { display_mode: '标签样式', levels: [{ id: 'excellent', code: 'A', name: '优秀', color: '#3370ff' }] } } },
      { id: 102, name: '评分项', rule: { name: '百分制评分', review_type: '评分', status: 'active', config: {} } },
      { id: 103, name: '停用评级', rule: { name: '停用规则', review_type: '评级', status: 'inactive', config: {} } },
    ] as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    expect(performanceReviewQuestionApi.list).toHaveBeenCalledWith('评级')
    expect(wrapper.findComponent(PerformanceAssessmentContentLayers).props('ratingOptions')).toEqual([
      expect.objectContaining({ id: '101', label: '绩效评级', description: '7档绩效等级', displayMode: '下拉样式', levels: ['优秀'], levelOptions: [{ id: 'excellent', code: 'A', label: '优秀', color: '#3370ff' }] }),
    ])
    await wrapper.findAll('.stage-card')[3].trigger('click')
    await wrapper.find('.template-operate__button').trigger('click')
    await (document.body.querySelector('.create-button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    await (Array.from(document.body.querySelectorAll('.create-menu [role="menuitem"]')).find((node) => node.textContent === '评分评级') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    ;(document.body.querySelector('.select-shell > button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()

    const options = Array.from(document.body.querySelectorAll('.option-menu [role="option"]'))
    expect(options).toHaveLength(1)
    expect(options[0].textContent).toContain('绩效评级')
    expect(options[0].textContent).toContain('7档绩效等级')
    expect(options[0].textContent).not.toContain('评分项')
    expect(options[0].textContent).not.toContain('停用评级')
  })

  it('preserves the local rating definition and settings when rating options refresh', async () => {
    let resolveQuestions!: (questions: any[]) => void
    vi.mocked(performanceReviewQuestionApi.list).mockReturnValue(new Promise(resolve => { resolveQuestions = resolve }))
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({
      nodes: [{ ...mockNodes[0], content: [{ content_id: 'rating-content', content_slot: 'fill', type: 'rating', name: '评分评级', description: '', ratingOptionId: '101', ratingDisplayMode: '标签样式', settings: { customRoot: { enabled: true } }, items: [{ id: 'old', label: '旧项', hint: '' }, { id: '101', label: '本地评级名称', hint: '本地提示', settings: { required: false, customItem: { enabled: true } } }], options: [{ id: 'local-level', label: '本地等级' }] }] }],
      content_library: [],
    } as any)
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => payload as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.get('.stage-card').trigger('click')
    await wrapper.get('[data-content-item-id="101"]').trigger('click')
    await wrapper.get('.content-settings-detail--item input[type="checkbox"]').setValue(true)
    resolveQuestions([{ id: 101, name: '当前全局评级', display_mode: '下拉样式', rule: { name: '当前评级规则', review_type: '评级', status: 'active', config: { levels: [{ id: 'current-level', name: '当前等级' }] } } }])
    await flushPromises()

    expect(wrapper.findAll('.content-renderer-rating')).toHaveLength(1)
    const control = wrapper.getComponent(PerformanceRatingControl)
    expect(control.props('displayMode')).toBe('标签样式')
    expect(control.props('options')).toEqual([{ id: 'local-level', label: '本地等级' }])
    expect(wrapper.find('.content-renderer-rating__header strong').exists()).toBe(false)
    await (wrapper.vm as any).save()
    const local = update.mock.calls[0][1].nodes[0].content![0]
    expect(local.settings).toEqual({ hideDescription: false, allowMultiple: false, customRoot: { enabled: true } })
    expect(local.items).toEqual([{ id: '101', label: '本地评级名称', hint: '本地提示', settings: { mode: 'fill', required: false, hideName: true, customItem: { enabled: true } } }])
    expect(local.options).toEqual([{ id: 'local-level', label: '本地等级' }])
    wrapper.unmount()
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue(update.mock.calls[0][1] as any)
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await reopened.get('.stage-card').trigger('click')
    expect(reopened.find('.content-renderer-rating__header strong').exists()).toBe(false)
    await reopened.get('[data-content-item-id="101"]').trigger('click')
    expect(reopened.findAll('.content-settings-detail--item input[type="checkbox"]').map(input => (input.element as HTMLInputElement).checked)).toEqual([true, false])
    reopened.unmount()
  })

  it('fills missing rating definitions without replacing explicit empty options', async () => {
    vi.mocked(performanceReviewQuestionApi.list).mockResolvedValue([{ id: 101, name: '当前绩效评级', display_mode: '下拉样式', rule: { name: '规则', review_type: '评级', status: 'active', config: { levels: ['优秀'] } } }] as any)
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({ nodes: [{ ...mockNodes[0], content: [
      { content_id: 'missing', type: 'rating', name: '缺失定义', ratingOptionId: '101', items: [] },
      { content_id: 'empty', type: 'rating', name: '空选项', ratingOptionId: '101', items: [{ id: '101', label: '', hint: '' }], options: [] },
    ] }] } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.get('.stage-card').trigger('click')
    const controls = wrapper.findAllComponents(PerformanceRatingControl)
    expect(wrapper.findAll('.content-renderer-rating__header strong').map(item => item.text())).toEqual(['当前绩效评级', ''])
    expect(controls[0].props('options').map((option: { label: string }) => option.label)).toEqual(['优秀'])
    expect(controls[1].props('options')).toEqual([])
    wrapper.unmount()
  })

  it('shows only the captured reference entry bar for an empty reference tab', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[3].trigger('click')
    expect(wrapper.find('.reference-entry-bar').exists()).toBe(false)
    expect(wrapper.findAll('.content-tab').map((tab) => tab.text())).toEqual(['配置填写内容', '配置参考内容'])
    await wrapper.findAll('.content-tab')[1].trigger('click')
    expect(wrapper.find('.content-card--reference').exists()).toBe(false)
    expect(wrapper.find('.template-section').exists()).toBe(false)
    expect(wrapper.find('.configured-content-panel').exists()).toBe(false)
    const pane = wrapper.get('.reference-entry-pane')
    expect(pane.element.contains(wrapper.get('.reference-entry-bar').element)).toBe(true)
    expect(pane.get('button').text()).toBe('选择参考内容')
    await pane.get('button').trigger('click')
    const referenceDrawer = document.body.querySelector('.reference-drawer')
    expect(referenceDrawer).not.toBeNull()
    expect(referenceDrawer?.querySelector('.reference-drawer__title-text')?.textContent).toBe('选择参考内容')
    expect(referenceDrawer?.querySelector('.reference-drawer__panel')?.className).toContain('reference-drawer__panel')
  })

  it('opens the reference drawer with node candidates and fixed more options, then confirm writes reference contents', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[3].trigger('click')
    await wrapper.findAll('.content-tab')[1].trigger('click')
    await wrapper.get('.reference-entry-bar button').trigger('click')
    await wrapper.vm.$nextTick()

    const groupTitles = [...document.body.querySelectorAll('.reference-drawer__group-title')].map((node) => node.textContent)
    expect(groupTitles).toEqual(['评估环节内容', '更多参考内容'])
    const nodeCards = [...document.body.querySelectorAll('.reference-drawer__group:nth-of-type(1) .reference-option-card__text')].map((node) => node.textContent)
    expect(nodeCards).toEqual(['工作总结环节', '360°邀请环节', '360°确认环节', '校准环节', '结果沟通', '评估型环节', '绩效结果查看环节', '结果复议处理'])
    const moreCards = [...document.body.querySelectorAll('.reference-drawer__group:nth-of-type(2) .reference-option-card__text')].map((node) => node.textContent)
    expect(moreCards).toEqual(['OKR', '更多参考', '团队统计'])

    const okrInput = document.body.querySelector('.reference-drawer__group:nth-of-type(2) .reference-option-card__input') as HTMLInputElement
    okrInput.click()
    await wrapper.vm.$nextTick()
    ;([...document.body.querySelectorAll('.reference-drawer__footer button')].find((node) => node.textContent === '确认') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()

    expect(document.body.querySelector('.reference-drawer')).toBeNull()
    expect(wrapper.get('.configured-content-panel').text()).toContain('OKR')
  })

  it('keeps same-id node definitions and nested settings independent from library seeds through save and reopen', async () => {
    const seed = { content_id: 'shared', type: 'custom', name: '初始种子', description: '种子描述', settings: { customRoot: { source: 'seed' } }, items: [{ id: 'item', label: '种子题目', hint: '种子提示', questionType: 'tag', options: [{ id: 'tag', label: '种子标签' }], settings: { customItem: { source: 'seed' } } }] }
    const second = { ...seed, name: '第二环节独立定义', items: [{ ...seed.items[0], label: '第二环节题目', options: [{ id: 'tag', label: '第二环节标签' }], settings: { customItem: { source: 'second' } } }] }
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({ nodes: [
      { ...mockNodes[0], node_id: 'first', content_bindings: { fill: ['shared'] } },
      { ...mockNodes[0], node_id: 'second', content: [second], content_bindings: { fill: ['shared'] } },
      { ...mockNodes[0], node_id: 'third', content_bindings: { fill: ['shared'] } },
    ], content_library: [seed] } as any)
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => payload as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    const block = wrapper.getComponent(PerformanceConfiguredContentBlock)
    const local = block.props('content') as any
    local.name = '第一环节独立定义'
    local.items[0].label = '第一环节题目'
    local.items[0].options[0].label = '第一环节标签'
    ;(block.props('rootSettings') as any).customRoot.source = 'first'
    ;(block.props('itemSettings').item as any).customItem.source = 'first'
    await wrapper.get('.configured-content-card__row').trigger('click')
    await wrapper.findAll('.content-settings-detail--root input[type="checkbox"]')[0].setValue(true)
    await wrapper.get('[data-content-item-id="item"]').trigger('click')
    const tagSettings = wrapper.get('.content-settings-detail--item')
    expect(tagSettings.findAll('legend').map(group => group.text())).toEqual(['显示设置', '填写设置', '必填项设置'])
    await tagSettings.findAll('input[type="checkbox"]')[0].setValue(true)
    await tagSettings.findAll('input[type="checkbox"]')[1].setValue(true)
    await tagSettings.findAll('input[type="checkbox"]')[2].setValue(false)
    expect(wrapper.find('.template-field-label').exists()).toBe(false)
    expect(wrapper.find('.template-field-description').exists()).toBe(false)
    await wrapper.findAll('.stage-card')[1].trigger('click')
    expect(wrapper.get('.configured-content-card').text()).toContain('第二环节独立定义')
    expect(wrapper.get('.tag-options').text()).toBe('第二环节标签')
    await wrapper.findAll('.stage-card')[2].trigger('click')
    expect(wrapper.get('.configured-content-card').text()).toContain('初始种子')
    expect(wrapper.get('.tag-options').text()).toBe('种子标签')
    await (wrapper.vm as any).save()
    const payload = update.mock.calls[0][1]
    expect(payload.content_library![0]).toMatchObject(seed)
    const first = payload.nodes[0].content![0] as any
    expect(first).toMatchObject({ content_id: 'shared', name: '第一环节独立定义', settings: { hideDescription: true, allowMultiple: false, customRoot: { source: 'first' } } })
    expect(first.items[0]).toMatchObject({ label: '第一环节题目', options: [{ id: 'tag', label: '第一环节标签' }], settings: { mode: 'fill', required: false, hideName: true, hideDescription: true, customItem: { source: 'first' } } })
    expect(payload.nodes[1].content![0]).toMatchObject(second)
    expect(payload.nodes[2].content![0]).toMatchObject(seed)
    expect(seed.items[0].options[0].label).toBe('种子标签')
    wrapper.unmount()
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue(payload as any)
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    for (const [index, name, tag] of [[0, '第一环节独立定义', '第一环节标签'], [1, '第二环节独立定义', '第二环节标签'], [2, '初始种子', '种子标签']] as const) {
      await reopened.findAll('.stage-card')[index].trigger('click')
      expect(reopened.get('.configured-content-card').text()).toContain(name)
      expect(reopened.get('.tag-options').text()).toBe(tag)
      expect(reopened.find('.template-field-label').exists()).toBe(index !== 0)
      expect(reopened.find('.template-field-description').exists()).toBe(index !== 0)
      if (index === 0) {
        await reopened.get('[data-content-item-id="item"]').trigger('click')
        const checked = reopened.findAll('.content-settings-detail--item input[type="checkbox"]').map(control => (control.element as HTMLInputElement).checked)
        expect(checked).toEqual([true, true, false])
      }
    }
    reopened.unmount()
  })

  it('hides the reference entry bar once reference content is configured', async () => {
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({
      nodes: [{ ...mockNodes[3], content: [{ content_id: 'ref-1', content_slot: 'reference', type: 'custom', name: '参考材料', description: '', items: [] }] }],
      content_library: [],
    } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    await wrapper.findAll('.content-tab')[1].trigger('click')
    expect(wrapper.find('.reference-entry-bar').exists()).toBe(false)
    expect(wrapper.find('.configured-content-panel').exists()).toBe(true)
  })

  it('projects confirmed assessment content into the configuration panel', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)
    layer.vm.$emit('confirm', [{ type: 'work_summary', name: '总结内容', description: '描述', items: [{ id: 'i1', label: '本周产出', hint: '' }] }])
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.configured-content-panel').text()).toContain('总结内容')
    expect(wrapper.find('.configured-content-panel').text()).toContain('本周产出')
    expect(wrapper.get('.configured-content-card__description').text()).toBe('描述')
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.get('.configured-content-card').classes()).toContain('is-selected')
    expect(wrapper.get('.configured-content-card__row').classes()).not.toContain('is-selected')
    expect(wrapper.get('.configured-content-card__row').classes()).not.toContain('is-focused')
    expect(wrapper.find('.content-settings-detail--root').exists()).toBe(true)
    expect(wrapper.get('.content-settings-detail--root').text()).toContain('显示设置')
    expect(wrapper.get('.content-settings-detail--root').text()).toContain('隐藏描述')
    expect(wrapper.get('.content-settings-detail--root').text()).toContain('允许添加多个')
    expect(wrapper.get('.content-settings-detail--root').text()).not.toContain('在此环节填写')
    expect(wrapper.get('.content-settings-detail--root').text()).not.toContain('必填项设置')
    await wrapper.get('[data-content-item-id="i1"]').trigger('click')
    expect(wrapper.find('.content-settings-detail--item').exists()).toBe(true)
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('在此环节填写')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('在此环节隐藏')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('必填项设置')
    expect(wrapper.get('.content-settings-detail--item').text()).not.toContain('隐藏描述')
    expect(wrapper.get('.content-settings-detail--item').text()).not.toContain('允许添加多个')
  })
  it('persists allowMultiple in the configured content snapshot', async () => {
    const updateWorkflow = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockResolvedValue({ nodes: mockNodes } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    wrapper.findComponent(PerformanceAssessmentContentLayers).vm.$emit('confirm', [{ type: 'work_summary', name: '总结内容', description: '', items: [{ id: 'i1', label: '本周产出', hint: '' }] }])
    await wrapper.vm.$nextTick()
    await wrapper.get('.configured-content-card__row').trigger('click')
    await wrapper.findAll('.content-settings-detail--root input[type="checkbox"]')[1].setValue(true)
    await (wrapper.vm as any).save()

    const payload = updateWorkflow.mock.calls[0][1]
    const content = payload.nodes.flatMap(node => node.content || []).find(item => item.name === '总结内容')
    expect(content?.settings).toEqual({ hideDescription: false, allowMultiple: true })
  })

  it('persists every configured stage instead of only the active stage', async () => {
    const updateWorkflow = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockResolvedValue({ nodes: mockNodes } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)
    layer.vm.$emit('confirm', [{ type: 'work_summary', name: '首环节内容', description: '', items: [{ id: 'first-item', label: '首项', hint: '' }] }])
    await wrapper.findAll('.stage-card')[3].trigger('click')
    layer.vm.$emit('confirm', [{ type: 'work_summary', name: '当前环节内容', description: '', items: [{ id: 'current-item', label: '当前项', hint: '' }] }])
    await wrapper.vm.$nextTick()
    await (wrapper.vm as any).save()

    const payload = updateWorkflow.mock.calls[0][1]
    expect(payload.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ node_id: 'n1', content: [expect.objectContaining({ name: '首环节内容' })] }),
      expect.objectContaining({ node_id: 'n4', content: [expect.objectContaining({ name: '当前环节内容' })] }),
    ]))
  })


  it('keeps configured blocks independent per stage and per content tab', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)

    await wrapper.findAll('.stage-card')[0].trigger('click')
    layer.vm.$emit('confirm', [{ type: 'work_summary', name: '工作总结块', description: '', items: [{ id: 'work-item', label: '工作项', hint: '' }] }])
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.configured-content-panel').text()).toContain('工作总结块')

    await wrapper.findAll('.stage-card')[1].trigger('click')
    expect(wrapper.find('.configured-content-panel').exists()).toBe(false)
    await wrapper.findAll('.template-operate__button')[0].trigger('click')
    expect(wrapper.findComponent(PerformanceAssessmentContentLayers).props('initialContents')).toEqual([])
    expect(wrapper.getComponent(PerformancePromptModal).props('open')).toBe(true)
    expect(wrapper.getComponent(PerformanceAssessmentContentLayers).props('open')).toBe(false)
    ;([...document.body.querySelectorAll('.prompt-modal__footer button')].find(button => button.textContent === '取消') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('.stage-card')[3].trigger('click')
    await wrapper.findAll('.content-tab')[1].trigger('click')
    expect(wrapper.find('.configured-content-panel').exists()).toBe(false)
  })


  it('persists configured content and hydrates it on reopen', async () => {
    const updateWorkflow = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockResolvedValue({ nodes: mockNodes } as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[3].trigger('click')
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)
    layer.vm.$emit('confirm', [{ type: 'work_summary', name: '已保存总结', description: '', items: [{ id: 'saved-item', label: '已保存填写项', hint: '' }] }])
    await wrapper.vm.$nextTick()
    await (wrapper.vm as any).save()

    expect(updateWorkflow).toHaveBeenCalledWith(1, expect.objectContaining({
      nodes: expect.arrayContaining([expect.objectContaining({ node_id: 'n4', content: [expect.objectContaining({ name: '已保存总结' })] })]),
    }))

    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({
      nodes: mockNodes.map((node) => node.node_id === 'n4' ? { ...node, content: [{ type: 'work_summary', name: '重开总结', description: '', items: [{ id: 'reopen-item', label: '重开填写项', hint: '' }] }] } : node),
    } as any)
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await reopened.findAll('.stage-card')[3].trigger('click')
    expect(reopened.find('.configured-content-panel').text()).toContain('重开总结')
    expect(reopened.find('.configured-content-panel').text()).toContain('重开填写项')
  })

  it('scopes root and item selection to the rendered content card', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)
    layer.vm.$emit('confirm', [
      { type: 'work_summary', name: '第一块', description: '', items: [{ id: 'same-item', label: '相同填写项', hint: '' }] },
      { type: 'work_summary', name: '第二块', description: '', items: [{ id: 'same-item', label: '相同填写项', hint: '' }] },
    ])
    await wrapper.vm.$nextTick()

    const cards = wrapper.findAll('.configured-content-card')
    expect(cards).toHaveLength(2)
    await cards[0].find('.configured-content-card__row').trigger('click')
    expect(wrapper.findAll('.performance-content-selection-frame--root.is-selected')).toHaveLength(1)
    await cards[0].find('[data-content-item-id="same-item"]').trigger('click')
    expect(wrapper.findAll('.performance-content-selection-frame--item.is-selected')).toHaveLength(1)
    expect(wrapper.findAll('.performance-content-selection-frame--root.is-selected')).toHaveLength(0)
  })

  it('applies the captured work-summary root and item settings without crossing owners', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[0].trigger('click')
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)
    layer.vm.$emit('confirm', [{ type: 'work_summary', name: '工作总结', description: '描述', items: [{ id: 'fill-item', label: '填写题名称', hint: '' }] }])
    await wrapper.vm.$nextTick()

    const card = wrapper.get('.configured-content-card')
    await card.get('.configured-content-card__row').trigger('click')
    let rootCheckboxes = wrapper.findAll('.content-settings-detail--root input[type="checkbox"]')
    expect(rootCheckboxes).toHaveLength(2)
    expect(wrapper.get('.content-settings-detail--root').text()).not.toContain('在此环节填写')

    await rootCheckboxes[0].setValue(true)
    expect(card.classes()).toContain('hides-description')
    expect(card.find('.configured-content-card__description').exists()).toBe(false)
    await rootCheckboxes[0].setValue(false)
    expect(card.classes()).not.toContain('hides-description')
    expect(card.get('.configured-content-card__description').text()).toBe('描述')

    await rootCheckboxes[1].setValue(true)
    expect(card.classes()).toContain('allows-multiple')
    expect(card.get('.configured-content-card__add-item').text()).toBe('添加')
    expect(card.find('[data-icon="AddOutlined"]').exists()).toBe(true)
    await card.get('.configured-content-card__add-item').trigger('click')
    expect(card.findAll('[data-content-item-id]')).toHaveLength(1)

    await card.get('.configured-content-card__row').trigger('click')
    rootCheckboxes = wrapper.findAll('.content-settings-detail--root input[type="checkbox"]')
    await rootCheckboxes[1].setValue(false)
    expect(card.find('.configured-content-card__add-item').exists()).toBe(false)

    await card.findAll('[data-content-item-id]')[0].trigger('click')
    let itemRadios = wrapper.findAll('.content-settings-detail--item input[type="radio"]')
    expect(itemRadios).toHaveLength(2)
    expect(wrapper.get('.content-settings-detail--item').text()).not.toContain('隐藏描述')
    expect(wrapper.get('.content-settings-detail--item').text()).not.toContain('允许添加多个')

    await itemRadios[1].setValue()
    const firstItem = card.get('[data-content-item-id="fill-item"]')
    expect(firstItem.classes()).toContain('content-renderer-item--hidden')
    expect(firstItem.find('[data-icon="VisibleLockOutlined"]').exists()).toBe(true)
    expect(wrapper.find('.work-summary-required-setting').exists()).toBe(false)
    expect(firstItem.find('.performance-assessment-rich-text-field__label i').exists()).toBe(false)

    itemRadios = wrapper.findAll('.content-settings-detail--item input[type="radio"]')
    await itemRadios[0].setValue()
    expect(card.find('[data-icon="VisibleLockOutlined"]').exists()).toBe(false)
    expect(wrapper.find('.work-summary-required-setting').exists()).toBe(true)

    const required = wrapper.get('.content-settings-detail--item input[type="checkbox"]')
    await required.setValue(false)
    expect(firstItem.find('.performance-assessment-rich-text-field__label i').exists()).toBe(false)
    await required.setValue(true)
    expect(firstItem.get('.performance-assessment-rich-text-field__label i').text()).toBe('*')

    await card.get('.configured-content-card__row').trigger('click')
    expect(wrapper.find('.content-settings-detail--root').exists()).toBe(true)
    expect(wrapper.get('.content-settings-detail--root').text()).not.toContain('必填项设置')
  })

  it('applies the complete content-rule component by stage variant instead of content type', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)

    await wrapper.findAll('.stage-card')[0].trigger('click')
    layer.vm.$emit('confirm', [{ type: 'custom', name: '复用区块', description: '描述', items: [{ id: 'custom-item', label: '填写项', hint: '' }] }])
    await wrapper.vm.$nextTick()
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.find('.content-settings-detail--root').exists()).toBe(true)

    await wrapper.findAll('.stage-card')[3].trigger('click')
    layer.vm.$emit('confirm', [{ type: 'work_summary', name: '非应用环节内容', description: '描述', items: [{ id: 'other-item', label: '填写项', hint: '' }] }])
    await wrapper.vm.$nextTick()
    await wrapper.get('.configured-content-card__row').trigger('click')
    expect(wrapper.find('.content-settings-detail--root').exists()).toBe(false)
    expect(wrapper.find('.text-normal__body').exists()).toBe(false)
  })

  it.each(['work_summary', 'custom'] as const)('saves and reopens evaluation %s view mode without enabling other slots or item types', async type => {
    const update = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => payload as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.findAll('.stage-card')[3].trigger('click')
    wrapper.getComponent(PerformanceAssessmentContentLayers).vm.$emit('confirm', [{
      content_id: 'evaluation-view', type, name: '查看内容', description: '', items: [
        { id: 'view', label: '查看题', hint: '', questionType: 'tag' },
        { id: 'fill', label: '填写题', hint: '', questionType: 'tag' },
      ],
    }])
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-content-item-id="view"]').trigger('click')
    expect(wrapper.get('.content-settings-detail--item').text()).toContain('在此环节查看被评估人的填写结果')
    await wrapper.get('.content-settings-detail--item input[value="view"]').setValue()
    expect(wrapper.get('[data-content-item-id="view"]').find('.content-renderer-view-preview').exists()).toBe(true)
    expect(wrapper.find('.work-summary-required-setting').exists()).toBe(false)
    await wrapper.findAll('.stage-card')[6].trigger('click')
    await wrapper.findAll('.stage-card')[3].trigger('click')
    await wrapper.get('[data-content-item-id="view"]').trigger('click')
    expect((wrapper.get('.content-settings-detail--item input[value="view"]').element as HTMLInputElement).checked).toBe(true)
    await wrapper.findAll('.content-tab')[1].trigger('click')
    wrapper.getComponent(PerformanceAssessmentContentLayers).vm.$emit('confirm', [{ content_id: 'reference-view', type, name: '参考', description: '', items: [{ id: 'reference', label: '参考题', hint: '', questionType: 'tag' }] }])
    await wrapper.vm.$nextTick()
    await wrapper.get('[data-content-item-id="reference"]').trigger('click')
    expect(wrapper.find('.content-settings-detail--item').exists()).toBe(false)
    await (wrapper.vm as any).save()
    const payload = update.mock.calls[0][1]
    const saved = payload.nodes.find(node => node.node_id === 'n4')!.content!.find(content => content.content_slot === 'fill')!
    expect(saved.items.map(item => item.settings?.mode)).toEqual(['view', 'fill'])
    wrapper.unmount()
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue(payload as any)
    const reopened = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await reopened.findAll('.stage-card')[3].trigger('click')
    await reopened.get('[data-content-item-id="view"]').trigger('click')
    expect((reopened.get('.content-settings-detail--item input[value="view"]').element as HTMLInputElement).checked).toBe(true)
    expect(reopened.get('[data-content-item-id="view"]').find('.performance-rich-text-box').exists()).toBe(false)
    expect(reopened.get('[data-content-item-id="fill"]').find('.performance-rich-text-box').exists()).toBe(type === 'work_summary')
    reopened.unmount()
  })

  it('normalizes legacy duplicate rating items to the explicitly selected question', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)
    layer.vm.$emit('confirm', [{
      type: 'rating', name: '评分评级', description: '', ratingOptionId: 'new',
      items: [{ id: 'old', label: '旧评估项', hint: '' }, { id: 'new', label: '新评估项', hint: '' }],
      options: [{ id: 'excellent', label: '优秀', color: '#3370ff' }],
    }])
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.content-renderer-rating')).toHaveLength(1)
    expect(wrapper.get('.content-renderer-rating__header strong').text()).toBe('新评估项')
    expect(wrapper.text()).not.toContain('旧评估项')
    expect(wrapper.findAll('.content-renderer-rating__levels .performance-rating-control__option').map(item => item.text())).toEqual(['优秀'])
  })

  it('exposes captured card actions, enforces move boundaries, and deletes a configured card', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)
    layer.vm.$emit('confirm', [
      { type: 'work_summary', name: 'First', description: '', items: [{ id: 'a', label: 'A', hint: '' }] },
      { type: 'rating', name: 'Second', description: '', items: [{ id: 'b', label: 'B', hint: '' }] },
    ])
    await wrapper.vm.$nextTick()

    const cards = () => wrapper.findAll('.configured-content-card')
    await cards()[0].trigger('mouseenter')
    const actions = cards()[0].findAll('.captured-actions .performance-icon-button')
    expect(actions).toHaveLength(4)
    expect(actions[0].attributes('disabled')).toBeDefined()
    expect(actions[1].attributes('disabled')).toBeUndefined()
    expect(cards()[0].find('.performance-expand-button').exists()).toBe(true)
    expect(cards()[0].find('[data-icon="DragOutlined"]').exists()).toBe(true)

    await actions[1].trigger('click')
    expect(cards().map((card) => card.find('strong').text())).toEqual(['Second', 'First'])
    await cards()[0].trigger('mouseenter')
    await cards()[0].find('[aria-label="Delete content"]').trigger('click')
    expect(cards()).toHaveLength(1)
    expect(cards()[0].find('strong').text()).toBe('First')
  })
  it('reorders different-height content cards through the shared sortable list', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    const layer = wrapper.findComponent(PerformanceAssessmentContentLayers)
    layer.vm.$emit('confirm', [
      { type: 'work_summary', name: 'Short card', description: '', items: [{ id: 'a', label: 'A', hint: '' }] },
      { type: 'rating', name: 'Expanded card', description: 'More details', items: [{ id: 'b', label: 'B', hint: '' }, { id: 'c', label: 'C', hint: '' }] },
    ])
    await wrapper.vm.$nextTick()

    const cards = wrapper.findAll('.configured-content-card')
    cards.forEach((card, index) => {
      vi.spyOn(card.element, 'getBoundingClientRect').mockReturnValue({
        top: index === 0 ? 0 : 64,
        left: 0,
        right: 800,
        bottom: index === 0 ? 56 : 160,
        width: 800,
        height: index === 0 ? 56 : 96,
        x: 0,
        y: index === 0 ? 0 : 64,
        toJSON: () => ({}),
      } as DOMRect)
    })

    await cards[0].find('[data-drag-handle]').trigger('pointerdown', { button: 0, pointerId: 10, clientX: 20, clientY: 20 })
    window.dispatchEvent(pointerEvent('pointermove', { pointerId: 10, clientX: 20, clientY: 100 }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.configured-content-sortable-list [data-sortable-placeholder]').exists()).toBe(true)
    window.dispatchEvent(pointerEvent('pointerup', { pointerId: 10, clientX: 20, clientY: 100 }))
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.configured-content-card').map((card) => card.find('strong').text())).toEqual(['Expanded card', 'Short card'])
  })
})
