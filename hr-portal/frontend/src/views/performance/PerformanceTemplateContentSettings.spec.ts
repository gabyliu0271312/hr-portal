import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceTemplateContentSettings from './PerformanceTemplateContentSettings.vue'
import PerformanceAssessmentContentLayers from '@/components/performance/PerformanceAssessmentContentLayers.vue'
import PerformanceRatingControl from '@/components/performance/PerformanceRatingControl.vue'
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
  beforeEach(() => {
    vi.spyOn(performanceTemplateApi, 'getWorkflow').mockResolvedValue({ nodes: mockNodes } as any)
    vi.spyOn(performanceReviewQuestionApi, 'list').mockResolvedValue([])
    vi.spyOn(performanceTagFillQuestionApi, 'options').mockResolvedValue([])
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
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

  it('opens add-content layers for supported stages and filters result-view types', async () => {
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()

    await wrapper.findAll('.stage-card')[0].trigger('click')
    await wrapper.findAll('.template-operate__button')[0].trigger('click')
    expect(document.body.querySelector('#assessment-drawer-title')?.textContent).toBe('选择评估内容')
    ;(document.body.querySelector('.drawer-header .icon-button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()

    await wrapper.findAll('.stage-card')[1].trigger('click')
    await wrapper.findAll('.template-operate__button')[0].trigger('click')
    expect(document.body.querySelector('#assessment-drawer-title')?.textContent).toBe('选择评估内容')
    ;(document.body.querySelector('.drawer-header .icon-button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()

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
    ;(document.body.querySelector('.create-button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(Array.from(document.body.querySelectorAll('.create-menu [role="menuitem"]')).map((node) => node.textContent)).toEqual(['评分评级', '自定义'])
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
      { id: 101, name: '绩效评级', display_mode: '下拉样式', rule: { name: '7档绩效等级', review_type: '评级', status: 'active', config: { display_mode: '标签样式', levels: [{ id: 'excellent', name: '优秀', color: '#3370ff' }] } } },
      { id: 102, name: '评分项', rule: { name: '百分制评分', review_type: '评分', status: 'active', config: {} } },
      { id: 103, name: '停用评级', rule: { name: '停用规则', review_type: '评级', status: 'inactive', config: {} } },
    ] as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    expect(performanceReviewQuestionApi.list).toHaveBeenCalledWith('评级')
    expect(wrapper.findComponent(PerformanceAssessmentContentLayers).props('ratingOptions')).toEqual([
      expect.objectContaining({ id: '101', label: '绩效评级', description: '7档绩效等级', displayMode: '下拉样式', levels: ['优秀'], levelOptions: [{ id: 'excellent', label: '优秀', color: '#3370ff' }] }),
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

  it('refreshes configured rating content from the current assessment rule', async () => {
    vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({
      nodes: [{ ...mockNodes[0], content: [{ content_id: 'rating-content', content_slot: 'fill', type: 'rating', name: '评分评级', description: '', ratingOptionId: '101', items: [{ id: 'old', label: '旧项', hint: '' }, { id: '101', label: '旧评级名称', hint: '' }], options: [{ id: 'old-level', label: '旧等级' }] }] }],
      content_library: [],
    } as any)
    vi.mocked(performanceReviewQuestionApi.list).mockResolvedValue([
      { id: 101, name: '当前绩效评级', display_mode: '下拉样式', rule: { name: '当前评级规则', review_type: '评级', status: 'active', config: { levels: [{ id: 'current-level', code: '当前等级', color: '#3370ff' }] } } },
    ] as any)
    const wrapper = mount(PerformanceTemplateContentSettings, { props: { templateId: 1 } })
    await flushPromises()
    await wrapper.get('.stage-card').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('.content-renderer-rating')).toHaveLength(1)
    expect(wrapper.get('.content-renderer-rating > strong').text()).toBe('当前绩效评级')
    const ratingControl = wrapper.getComponent(PerformanceRatingControl)
    expect(ratingControl.props('displayMode')).toBe('下拉样式')
    expect(ratingControl.props('options').map((option: { label: string }) => option.label)).toEqual(['当前等级'])
    expect(wrapper.get('.rating-select-preview').text()).toContain('请选择等级')
    expect(wrapper.text()).not.toContain('旧项')
    expect(wrapper.text()).not.toContain('旧等级')
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
    ;(document.body.querySelector('.drawer-header .icon-button') as HTMLButtonElement).click()
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
    expect(wrapper.get('.text-normal__body').text()).toBe('暂未选择内容')
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
    expect(wrapper.get('.content-renderer-rating > strong').text()).toBe('新评估项')
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
