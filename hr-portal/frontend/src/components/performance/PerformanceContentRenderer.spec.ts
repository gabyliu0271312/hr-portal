import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceContentRenderer from './PerformanceContentRenderer.vue'
import contentRendererSource from './PerformanceContentRenderer.vue?raw'
import PerformanceRichTextToolbar from './PerformanceRichTextToolbar.vue'
import PerformanceTemplateFieldRenderer from './PerformanceTemplateFieldRenderer.vue'

const content = {
  type: 'work_summary' as const,
  name: '工作总结',
  description: '本周产出',
  items: [{ id: 'item-1', label: '本周工作', richText: '<p>完成项目</p>' }],
}

describe('performance content shared primitives', () => {
  it('stops item selection from bubbling into the content root', async () => {
    const host = document.createElement('div')
    host.addEventListener('click', () => { throw new Error('item click escaped the selection frame') })
    const wrapper = mount(PerformanceContentRenderer, { attachTo: host, props: { content, interactive: true } })
    await wrapper.get('[data-content-item-id="item-1"]').trigger('click')
    expect(wrapper.emitted('select-item')).toEqual([['item-1']])
    wrapper.unmount()
    host.remove()
  })

  it('renders configured content with the shared readonly toolbar', () => {
    const wrapper = mount(PerformanceContentRenderer, { props: { content } })
    const toolbar = wrapper.getComponent(PerformanceRichTextToolbar)
    expect(toolbar.props('readonly')).toBe(true)
    expect(toolbar.findAll('button')).toHaveLength(0)
    expect(wrapper.get('.performance-assessment-rich-text-field__label').text()).toContain('本周工作')
    expect(wrapper.get('.content-renderer-editor__body').html()).toContain('<p>完成项目</p>')
  })

  it('uses the configured item hint when its rich-text content is empty', () => {
    const wrapper = mount(PerformanceContentRenderer, { props: { content: { ...content, items: [{ id: 'item-1', label: '本周工作', hint: '请说明本周工作成果', richText: '' }] } } })
    expect(wrapper.get('.content-renderer-editor__body').text()).toBe('请说明本周工作成果')
  })

  it('preserves line breaks in the configured item hint', () => {
    const wrapper = mount(PerformanceContentRenderer, { props: { content: { ...content, items: [{ id: 'item-1', label: '本周工作', hint: '第一行提示\n第二行提示', richText: '' }] } } })
    expect(wrapper.get('.content-renderer-editor__body').text()).toBe('第一行提示\n第二行提示')
    expect(contentRendererSource).toContain('white-space:pre-wrap')
  })

  it('keeps the item selection frame in the same layout box as its hover frame', () => {
    const wrapper = mount(PerformanceContentRenderer, { props: { content, interactive: true, selectedItemId: 'item-1' } })
    const item = wrapper.get('[data-content-item-id="item-1"]')
    expect(item.classes()).toContain('content-renderer-item--selected')
    expect(item.classes()).toContain('content-renderer-item--interactive')
  })
  it('uses item required settings for text items regardless of content type', async () => {
    const custom = { type: 'custom' as const, name: '文本型填写题', description: '', items: [{ id: 'text-item', label: '填写题名称', richText: '' }] }
    const wrapper = mount(PerformanceContentRenderer, { props: { content: custom, interactive: true, itemSettings: { 'text-item': { mode: 'fill', required: true } } } })
    expect(wrapper.get('.performance-assessment-rich-text-field__label i').text()).toBe('*')
    await wrapper.setProps({ itemSettings: { 'text-item': { mode: 'fill', required: false } } })
    expect(wrapper.find('.performance-assessment-rich-text-field__label i').exists()).toBe(false)
  })

  it.each([
    { type: 'custom' as const, itemType: 'text' as const, contentType: 'tag' as const, hidden: true },
    { type: 'custom' as const, itemType: undefined, contentType: undefined, hidden: true },
    { type: 'custom' as const, itemType: undefined, contentType: 'text' as const, hidden: true },
    { type: 'custom' as const, itemType: 'tag' as const, contentType: 'text' as const, hidden: false },
    { type: 'custom' as const, itemType: undefined, contentType: 'tag' as const, hidden: false },
    { type: 'work_summary' as const, itemType: 'text' as const, contentType: undefined, hidden: false },
  ])('limits name hiding to custom text items: %o', async ({ type, itemType, contentType, hidden }) => {
    const wrapper = mount(PerformanceContentRenderer, { props: {
      content: { type, questionType: contentType, items: [{ id: 'item', label: '题目名称', questionType: itemType }] },
      itemSettings: { item: { mode: 'fill', required: true, hideName: true } },
    } })
    expect(wrapper.get('[data-content-item-id="item"]').classes().includes('content-renderer-item--name-hidden')).toBe(hidden)
    expect(contentRendererSource).toContain('.content-renderer-item--name-hidden :deep(.performance-assessment-rich-text-field__label){display:none}')
    const isTag = type === 'custom' && (itemType || contentType) === 'tag'
    expect(wrapper.find('.performance-rich-text-box').exists()).toBe(!isTag)
    expect(wrapper.find('.tag-followup').exists()).toBe(isTag)
    expect(wrapper.find(isTag ? '.template-field-label' : '.performance-assessment-rich-text-field__label').exists()).toBe(!isTag)
    await wrapper.setProps({ itemSettings: { item: { mode: 'fill', required: true, hideName: false } } })
    expect(wrapper.get('[data-content-item-id="item"]').classes()).not.toContain('content-renderer-item--name-hidden')
    expect(wrapper.get(isTag ? '.template-field-label' : '.performance-assessment-rich-text-field__label').text()).toBe('题目名称*')
  })

  it('previews custom tags with local item options and item-first default-all settings', async () => {
    const wrapper = mount(PerformanceContentRenderer, { props: { content: {
      type: 'custom', questionType: 'text', defaultAll: true,
      options: [{ id: 'global', label: '块级标签' }],
      items: [{ id: 'tag', label: '标签题', questionType: 'tag', defaultAll: true, options: [{ id: 'local', label: '本地标签', placeholder: '本地提示' }] }],
    } } })
    expect(wrapper.findAll('.tag-options .performance-checkbox__label').map(item => item.text())).toEqual(['本地标签'])
    expect(wrapper.getComponent(PerformanceTemplateFieldRenderer).props('field').placeholder).toBeUndefined()
    expect(wrapper.get('.tag-options input').attributes('disabled')).toBeDefined()
    expect((wrapper.get('.tag-options input').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('.tag-preview__selected-tag').text()).toBe('本地标签')
    expect(wrapper.get('.tag-rich-input').attributes('data-placeholder')).toBe('本地提示')
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    await wrapper.setProps({ content: { type: 'custom', questionType: 'tag', defaultAll: true, options: [{ id: 'fallback', label: '块级兼容' }], items: [{ id: 'tag', label: '标签题', defaultAll: false }] } })
    expect(wrapper.get('.tag-options').text()).toBe('块级兼容')
    expect((wrapper.get('.tag-options input').element as HTMLInputElement).checked).toBe(false)
    await wrapper.setProps({ content: { type: 'custom', questionType: 'tag', defaultAll: true, options: [{ id: 'fallback', label: '块级兼容' }], items: [{ id: 'tag', label: '标签题', options: [] }] } })
    expect(wrapper.get('.empty-options').text()).toBe('暂无可用标签选项')
    await wrapper.setProps({ content: { type: 'custom', questionType: 'tag', defaultAll: true, items: [{ id: 'tag', label: '标签题', hint: '只展示为题目描述', options: [{ id: 'a', label: '选项A', placeholder: '' }, { id: 'b', label: '选项B' }] }] } })
    expect(wrapper.get('.template-field-description').text()).toBe('只展示为题目描述')
    expect(wrapper.findAll('.tag-rich-input').map(node => node.attributes('data-placeholder'))).toEqual(['请输入补充说明', '请输入补充说明'])
    wrapper.unmount()
  })

  it('keeps tag configuration previews in the shared field structure without creating answers', async () => {
    const wrapper = mount(PerformanceContentRenderer, { props: {
      content: { type: 'custom', items: [{ id: 'tag', label: '标签题', hint: '题目描述', questionType: 'tag', defaultAll: true, options: [{ id: 'a', label: '选项A', placeholder: '补充提示' }] }] },
      interactive: true, itemSettings: { tag: { mode: 'fill', required: true } },
    } })
    const renderer = wrapper.getComponent(PerformanceTemplateFieldRenderer)
    expect(renderer.props('mode')).toBe('edit')
    expect(renderer.props('editable')).toBe(false)
    expect(wrapper.get('.template-field-label strong').text()).toBe('标签题')
    expect(wrapper.get('.template-field-description.tag-preview__description').text()).toBe('题目描述')
    expect(wrapper.find('.tag-followup > .tag-options.tag-checks + .tag-rich-text-input').exists()).toBe(true)
    expect(wrapper.get('.tag-rich-input').attributes('contenteditable')).toBe('false')
    expect(wrapper.get('.tag-rich-input').attributes('data-placeholder')).toBe('补充提示')
    await wrapper.get('.tag-options input').trigger('change')
    expect(renderer.emitted('update:value')).toBeUndefined()
    expect(wrapper.emitted('update-answer')).toBeUndefined()
    expect(contentRendererSource).not.toMatch(/:deep\(\.(?:tag-options|tag-followup|template-field-description)\)/)
    wrapper.unmount()
  })

  it('retains selectable hidden tag management and uses readonly fields only for view previews', async () => {
    const wrapper = mount(PerformanceContentRenderer, { props: {
      content: { type: 'custom', defaultAll: true, items: [{ id: 'tag', label: '隐藏题', hint: '说明', questionType: 'tag', options: [{ id: 'a', label: '选项A' }] }] },
      interactive: true, itemSettings: { tag: { mode: 'hidden', required: true } }, readonlyEmptyAnswerText: '这里展示用户填写内容',
    } })
    const item = wrapper.get('[data-content-item-id="tag"]')
    expect(item.classes()).toContain('content-renderer-item--hidden')
    expect(item.attributes('aria-disabled')).toBe('true')
    expect(wrapper.find('.content-renderer-hidden-icon svg').exists()).toBe(true)
    expect(wrapper.find('.tag-followup').exists()).toBe(true)
    expect(wrapper.find('.template-field-label em').exists()).toBe(false)
    await item.trigger('click')
    expect(wrapper.emitted('select-item')).toEqual([['tag']])
    await wrapper.setProps({ itemSettings: { tag: { mode: 'view', required: true } } })
    expect(wrapper.getComponent(PerformanceTemplateFieldRenderer).props('mode')).toBe('readonly')
    expect(wrapper.find('.content-renderer-hidden-icon').exists()).toBe(false)
    expect(wrapper.find('.readonly-tag-panel').exists()).toBe(true)
    expect(wrapper.find('.tag-rich-text-input.is-display-only').exists()).toBe(true)
    expect(wrapper.find('.tag-preview__selected-group').exists()).toBe(true)
    expect(wrapper.get('.tag-preview__selected-group .rich-answer').text()).toBe('这里展示用户填写内容')
    expect(wrapper.find('.template-field-description').exists()).toBe(false)
    wrapper.unmount()
  })

  it('uses one configurable preview phrase for rich text and tag view items', async () => {
    const wrapper = mount(PerformanceContentRenderer, { props: {
      content: { type: 'custom', items: [
        { id: 'text', label: '文本题', questionType: 'text', hint: '不应展示的描述' },
        { id: 'tag', label: '标签题', questionType: 'tag', hint: '不应展示的标签描述', options: [{ id: 'a', label: '标签A' }, { id: 'b', label: '标签B' }] },
      ] },
      itemSettings: { text: { mode: 'view', required: true }, tag: { mode: 'view', required: true } },
      readonlyEmptyAnswerText: '自定义预览文案',
    } })
    expect(wrapper.get('[data-content-item-id="text"] .rich-answer').text()).toBe('自定义预览文案')
    expect(wrapper.find('[data-content-item-id="text"] [role="toolbar"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-content-item-id="tag"] .tag-preview__selected-group')).toHaveLength(2)
    expect(wrapper.findAll('[data-content-item-id="tag"] .rich-answer').map(answer => answer.text())).toEqual(['自定义预览文案', '自定义预览文案'])
    expect(wrapper.find('[data-content-item-id="tag"] .performance-rich-toolbar, [data-content-item-id="tag"] button, [data-content-item-id="tag"] input').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('不应展示的标签描述')
    await wrapper.setProps({ readonlyEmptyAnswerText: '更新后的预览' })
    expect(wrapper.findAll('.rich-answer').map(answer => answer.text())).toEqual(['更新后的预览', '更新后的预览', '更新后的预览'])
  })

  it('uses the shared readonly presentation for rating view previews', () => {
    const wrapper = mount(PerformanceContentRenderer, { props: {
      content: { type: 'rating', items: [{ id: 'rating', label: '年度评级', hint: '不显示的描述' }], options: [{ id: 'level-a', code: 'A', label: '优秀', color: '#3370ff' }] },
      itemSettings: { rating: { mode: 'view', required: false } },
    } })
    expect(wrapper.get('.readonly-field-rating .template-field-label').text()).toBe('年度评级')
    expect(wrapper.get('.readonly-rating-badge').text()).toBe('A')
    expect(wrapper.get('.readonly-rating-label').text()).toBe('优秀')
    expect(wrapper.get('.readonly-rating-badge').attributes('style')).toContain('background-color: rgb(51, 112, 255)')
    expect(wrapper.find('.performance-rating-control').exists()).toBe(false)
  })

  it('adds a single unknown preview option without changing source levels', async () => {
    const levels = [{ id: 'a', label: 'A' }, { id: '__unknown__', label: '旧不了解' }]
    const wrapper = mount(PerformanceContentRenderer, { props: { content: { type: 'rating', items: [{ id: 'rating', label: '评级' }], options: levels, settings: { allowUnknown: true } } } })
    expect(wrapper.findAll('.performance-rating-control__option').map(option => option.text())).toEqual(['A', '不了解'])
    expect(levels[1].label).toBe('旧不了解')
    await wrapper.setProps({ content: { type: 'rating', items: [{ id: 'rating', label: '评级' }], options: levels.slice(0, 1), settings: { allowUnknown: false } } })
    expect(wrapper.findAll('.performance-rating-control__option').map(option => option.text())).toEqual(['A'])
    wrapper.unmount()
  })

  it('renders rating levels from the selected rule snapshot', () => {
    const rating = { type: 'rating' as const, name: '评分评级', description: '', items: [{ id: 'annual', label: '年度综合评级' }], options: [{ id: 's', label: '卓越' }, { id: 'a', label: '符合预期' }] }
    const wrapper = mount(PerformanceContentRenderer, { props: { content: rating } })
    expect(wrapper.findAll('.content-renderer-rating')).toHaveLength(1)
    expect(wrapper.findAll('.content-renderer-rating__levels .performance-rating-control__option').map(item => item.text())).toEqual(['卓越', '符合预期'])
    expect(wrapper.text()).not.toContain('1星')
  })

  it('renders dropdown mode from the same rating snapshot', () => {
    const rating = { type: 'rating' as const, name: '评分评级', description: '', ratingDisplayMode: '下拉样式' as const, items: [{ id: 'annual', label: '年度综合评级' }], options: [{ id: 's', label: '卓越' }, { id: 'a', label: '符合预期' }] }
    const wrapper = mount(PerformanceContentRenderer, { props: { content: rating } })
    expect(wrapper.get('.performance-rating-control').classes()).toContain('is-dropdown')
    expect(wrapper.get('.rating-select-preview').text()).toContain('请选择等级')
    expect(wrapper.find('.performance-rating-control__labels').exists()).toBe(false)
  })

  it('keeps the six commands and icon contract in editable mode', () => {
    const wrapper = mount(PerformanceRichTextToolbar, { props: { active: { bold: true } } })
    expect(wrapper.findAll('button')).toHaveLength(6)
    expect(wrapper.findAll('button').map((button) => button.attributes('data-icon'))).toEqual([
      'BoldOutlined', 'ItalicOutlined', 'UnderlineOutlined', 'OrderListOutlined', 'DisorderListOutlined', 'GlobalLinkOutlined',
    ])
    expect(wrapper.find('button[data-icon="BoldOutlined"]').classes()).toContain('active')
  })
})
