import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'
import PerformanceRichTextEditor from './PerformanceRichTextEditor.vue'
import PerformanceTagRichTextInput from './PerformanceTagRichTextInput.vue'
import PerformanceTemplateFieldRenderer from './PerformanceTemplateFieldRenderer.vue'
import templateFieldRendererSource from './PerformanceTemplateFieldRenderer.vue?raw'
import { performanceTemplateAddedInstance, performanceTemplateInitialAnswers } from './performanceTemplateAnswers'

const sections = [
  {
    id: 'summary', name: '工作总结', allow_multiple: true,
    fields: [
      { id: 'rich', type: 'rich_text' as const, label: '总结' },
      { id: 'rating', type: 'rating' as const, label: '评级', options: [{ id: 'five', label: '5星', color: '#d9f5d6' }] },
      { id: 'tag', type: 'tag_with_followup' as const, label: '贡献', options: [{ id: 'good', label: '做得好的' }] },
    ],
  },
]

describe('PerformanceTemplateRenderer', () => {
  it('renders the same registered field schema in readonly mode', () => {
    const wrapper = mount(PerformanceTemplateRenderer, {
      props: { mode: 'readonly', sections, answers: { rich: ['<ol><li>保留格式</li></ol>'], rating: ['five'], tag: [{ tags: ['good'], note: '<p>补充说明</p>' }] } },
    })

    expect(wrapper.find('.template-section-instance').exists()).toBe(true)
    expect(wrapper.get('.performance-assessment-preview-header h2').text()).toBe('工作总结')
    expect(wrapper.get('.rich-answer ol li').text()).toBe('保留格式')
    expect(wrapper.get('.readonly-rating-badge').text()).toBe('5星')
    expect(wrapper.get('.readonly-tag-panel .tag-preview__selected-tag').text()).toContain('做得好的')
    expect(wrapper.text()).toContain('补充说明')
  })

  it('shows rating code, label and configured background together in readonly mode', () => {
    const wrapper = mount(PerformanceTemplateRenderer, { props: {
      mode: 'readonly', sections: [{ id: 'grades', name: '评级内容', fields: [
        { id: 'grade', type: 'rating', label: '年度评级', options: [{ id: 'level-a', code: 'A', label: '优秀', color: '#3370ff' }] },
      ] }], answers: { grade: 'level-a' },
    } })
    expect(wrapper.get('.readonly-field-rating .template-field-label').text()).toBe('年度评级')
    expect(wrapper.get('.readonly-rating-badge').text()).toBe('A')
    expect(wrapper.get('.readonly-rating-badge').attributes('style')).toContain('background-color: rgb(51, 112, 255)')
    expect(wrapper.get('.readonly-rating-label').text()).toBe('优秀')
  })

  it('uses the same answer accessor for edit updates and repeated sections', async () => {
    const wrapper = mount(PerformanceTemplateRenderer, {
      props: { mode: 'edit', title: '工作总结', sections, answers: { rich: ['第一条'], rating: [''], tag: [{ tags: [], notes: {} }] }, errors: {}, editable: true },
    })

    await wrapper.get('.performance-add-another-button').trigger('click')
    expect(wrapper.emitted('update-answer')).toEqual(expect.arrayContaining([
      ['rich', ['第一条', '']],
      ['rating', ['', '']],
      ['tag', [{ tags: [], notes: {} }, { tags: [], notes: {} }]],
    ]))
  })

  it.each(['edit', 'readonly'] as const)('hides configured field labels without removing their controls in %s mode', (mode) => {
    const wrapper = mount(PerformanceTemplateRenderer, { props: {
      mode, editable: mode === 'edit', sections: [{ id: 'names', name: '内容', fields: [
        { id: 'text', type: 'rich_text', label: '隐藏文本名', required: true, hide_name: true },
        { id: 'rating', type: 'rating', label: '隐藏评级名', hide_name: true, options: [{ id: 'a', label: '优秀' }] },
        { id: 'visible', type: 'rich_text', label: '保留名称' },
      ] }], answers: { text: '文本内容', rating: 'a' },
    } })
    expect(wrapper.find('[data-field-id="text"] .template-field-label').exists()).toBe(false)
    expect(wrapper.find('[data-field-id="rating"] .template-field-label').exists()).toBe(false)
    expect(wrapper.get('[data-field-id="visible"] .template-field-label').text()).toBe('保留名称')
    expect(wrapper.find('[data-field-id="text"]').exists()).toBe(true)
    expect(wrapper.find('[data-field-id="rating"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it.each(['edit', 'readonly'] as const)('applies tag name and description visibility independently in %s mode', async mode => {
    const field = { id: 'tag', type: 'tag_with_followup' as const, label: '标签题', description: '标签题描述', hide_name: true, hide_description: false, options: [{ id: 'a', label: '选项A', placeholder: '补充提示' }] }
    const wrapper = mount(PerformanceTemplateRenderer, { props: { mode, editable: true, sections: [{ id: 'tags', name: '标签内容', fields: [field] }], answers: { tag: { tags: ['a'], notes: { a: '已填写答案' } } } } })
    expect(wrapper.find('.template-field-label').exists()).toBe(false)
    expect(wrapper.find('.template-field-description').exists()).toBe(mode === 'edit')
    if (mode === 'edit') expect(wrapper.get('.template-field-description').text()).toBe('标签题描述')
    await wrapper.setProps({ sections: [{ id: 'tags', name: '标签内容', fields: [{ ...field, hide_name: false, hide_description: true }] }] })
    expect(wrapper.get('.template-field-label').text()).toBe('标签题')
    expect(wrapper.find('.template-field-description').exists()).toBe(false)
    expect(wrapper.text()).toContain('选项A')
    if (mode === 'edit') expect(wrapper.get('.tag-rich-input').attributes('data-placeholder')).toBe('补充提示')
    expect(wrapper.text()).toContain('已填写答案')
    wrapper.unmount()
  })

  it('uses shared tag field layout for employee editing and keeps readonly answers non-interactive', async () => {
    const field = { id: 'tag', type: 'tag_with_followup' as const, label: '贡献', description: '题目描述', required: true, options: [{ id: 'a', label: '选项A', placeholder: '补充提示' }] }
    const answers = { tag: { tags: ['a'], notes: { a: '<p>原有答案</p>' } } }
    const wrapper = mount(PerformanceTemplateRenderer, { props: { mode: 'edit', editable: true, sections: [{ id: 'tags', name: '标签', fields: [field] }], answers } })
    expect(wrapper.getComponent(PerformanceTemplateFieldRenderer).props('editable')).toBe(true)
    expect(wrapper.get('.template-field-label strong').text()).toBe('贡献')
    expect(wrapper.get('.template-field-description.tag-preview__description').text()).toBe('题目描述')
    expect(wrapper.find('.tag-followup > .tag-options.tag-checks + .tag-rich-text-input').exists()).toBe(true)
    expect(wrapper.get('.tag-rich-input').attributes('contenteditable')).toBe('true')
    await wrapper.get('.tag-options input').setValue(false)
    expect(wrapper.emitted('update-answer')?.at(-1)).toEqual(['tag', { tags: [], notes: { a: '<p>原有答案</p>' } }])
    await wrapper.setProps({ mode: 'readonly' })
    expect(wrapper.get('.template-field-label strong').text()).toBe('贡献')
    expect(wrapper.find('.template-field-description').exists()).toBe(false)
    expect(wrapper.get('.readonly-tag-panel .tag-preview__selected-group .rich-answer p').text()).toBe('原有答案')
    expect(wrapper.find('.template-field-label em').exists()).toBe(false)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('owns the shared tag layout without a context-specific business variant', () => {
    expect(templateFieldRendererSource).toContain('.template-field-description{margin:4px 0 8px;')
    expect(templateFieldRendererSource).toContain('.tag-options{display:flex;flex-wrap:wrap;gap:0 24px;margin:0 0 12px;padding:4px 12px 12px;box-sizing:border-box;border-radius:8px;background:#f8f9fa}')
    expect(templateFieldRendererSource).toContain('.tag-options :deep(.performance-checkbox){width:auto;max-width:100%;height:auto;min-height:22px;margin-top:8px;align-items:flex-start}')
    expect(templateFieldRendererSource).toContain('.tag-options :deep(.performance-checkbox__label){min-width:0;height:auto;flex:0 1 auto;overflow-wrap:anywhere}')
  })

  it('skips only the current unknown instance and restores retained answers on switching back', async () => {
    const fields = [{ id: 'grade', type: 'rating' as const, label: '评级', allow_unknown: true, required: true, options: [{ id: 'a', label: 'A' }] }, { id: 'note', type: 'rich_text' as const, label: '说明', required: true }]
    const wrapper = mount(PerformanceTemplateRenderer, { props: { mode: 'edit', editable: true, sections: [{ id: 'rating', name: '评级内容', allow_multiple: true, fields }], answers: { grade: ['__unknown__', 'a'], note: ['保留说明', ''] }, errors: { 'note:0': '旧错误', 'note:1': '说明必填' } } })
    expect(wrapper.get('[data-field-id="note:0"] .rich-input').attributes('contenteditable')).toBe('false')
    expect(wrapper.find('[data-field-id="note:0"] .field-error').exists()).toBe(false)
    expect(wrapper.get('[data-field-id="note:1"] .rich-input').attributes('contenteditable')).toBe('true')
    expect(wrapper.get('[data-field-id="note:1"] .field-error').text()).toBe('说明必填')
    await wrapper.get('[data-field-id="grade:0"] .rating-option').trigger('click')
    expect(wrapper.emitted('update-answer')?.at(-1)).toEqual(['grade', ['a', 'a']])
    await wrapper.setProps({ answers: { grade: ['a', 'a'], note: ['保留说明', ''] } })
    expect(wrapper.get('[data-field-id="note:0"] .rich-input').attributes('contenteditable')).toBe('true')
    expect(wrapper.get('[data-field-id="note:0"] .rich-input').text()).toBe('保留说明')
    wrapper.unmount()
    const readonly = mount(PerformanceTemplateRenderer, { props: { mode: 'readonly', sections: [{ id: 'rating', name: '评级', fields: [fields[0]] }], answers: { grade: '__unknown__' } } })
    expect(readonly.get('.readonly-rating-badge').text()).toBe('不了解')
    readonly.unmount()
  })

  it('initializes tag defaults only for unanswered fields and preserves explicit empty answers', () => {
    const defaultSections = [{ id: 'tags', name: '标签', fields: [{ id: 'tag', type: 'tag_with_followup' as const, label: '标签题', default_all: true, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }] }]
    expect(performanceTemplateInitialAnswers(defaultSections, {})).toEqual({ tag: { tags: ['a', 'b'], notes: {} } })
    for (const value of [null, [], { tags: [], notes: {} }]) {
      expect(performanceTemplateInitialAnswers(defaultSections, { tag: value })).toEqual({ tag: value })
    }
    const repeat = { ...defaultSections[0], allow_multiple: true }
    const added = performanceTemplateAddedInstance(repeat, { tag: [{ tags: [], notes: {} }] })
    expect(added.tag).toEqual([{ tags: [], notes: {} }, { tags: ['a', 'b'], notes: {} }])
  })

  it('keeps readonly fields immutable within an editable repeatable form', async () => {
    const readonly = { id: 'source', type: 'tag_with_followup' as const, label: '来源', readonly: true, required: true, default_all: true, options: [{ id: 'a', label: '亮点' }] }
    const writable = { id: 'note', type: 'rich_text' as const, label: '本环节说明' }
    const schema = [{ id: 'mixed', name: '混合内容', allow_multiple: true, fields: [readonly, writable] }]
    expect(performanceTemplateInitialAnswers(schema, {})).toEqual({})
    const answers = { source: [{ tags: ['a'], notes: { a: '<p>已提交来源</p>' } }], note: ['本环节答案'] }
    const wrapper = mount(PerformanceTemplateRenderer, { props: { mode: 'edit', editable: true, sections: schema, answers } })
    const source = wrapper.get('[data-field-id="source:0"]')
    expect(source.get('.readonly-tag-panel').text()).toContain('已提交来源')
    expect(source.find('[contenteditable="true"]').exists()).toBe(false)
    expect(source.find('.template-field-label em').exists()).toBe(false)
    wrapper.findAllComponents(PerformanceTemplateFieldRenderer)[0].vm.$emit('update:value', { tags: [], notes: {} })
    expect(wrapper.emitted('update-answer')).toBeUndefined()
    await wrapper.get('.performance-add-another-button').trigger('click')
    expect(wrapper.emitted('update-answer')).toEqual([['note', ['本环节答案', '']]])
    await wrapper.setProps({ answers: { ...answers, note: ['本环节答案', '新增答案'] } })
    await wrapper.findAll('.repeatable-instance-remove')[1].trigger('click')
    expect(wrapper.emitted('update-answer')?.at(-1)).toEqual(['note', ['本环节答案']])
    expect(wrapper.emitted('update-answer')?.some(event => event[0] === 'source')).toBe(false)
    wrapper.unmount()
  })

  it('routes the shared tag toolbar only to its active note and falls back after removal', async () => {
    const component = { id: 'tag', type: 'tag_with_followup' as const, label: '标签题', options: [{ id: 'a', label: '亮点' }, { id: 'b', label: '改进' }] }
    const wrapper = mount(PerformanceTemplateRenderer, { props: { mode: 'edit', editable: true, sections: [{ id: 'tags', name: '标签', fields: [component] }], answers: { tag: { tags: ['a', 'b'], notes: { a: '<p>Alpha</p>', b: '<p>Beta</p>' } } } }, attachTo: document.body })
    const editors = () => wrapper.findAll('.tag-rich-input')
    const beta = editors()[1].element
    const range = document.createRange()
    range.selectNodeContents(beta)
    document.getSelection()?.removeAllRanges()
    document.getSelection()?.addRange(range)
    await editors()[1].trigger('mouseup')
    await wrapper.get('.tag-rich-text-input [aria-label="粗体"]').trigger('mousedown')
    await wrapper.get('.tag-rich-text-input [aria-label="粗体"]').trigger('click')
    expect(editors()[1].find('strong').text()).toBe('Beta')
    expect(editors()[0].find('strong').exists()).toBe(false)
    expect(wrapper.emitted('update-answer')?.at(-1)).toEqual(['tag', expect.objectContaining({ tags: ['a', 'b'], notes: expect.objectContaining({ a: '<p>Alpha</p>', b: expect.stringContaining('<strong>Beta</strong>') }) })])
    await wrapper.setProps({ answers: { tag: { tags: ['a'], notes: { a: '<p>Alpha</p>', b: '<strong>Beta</strong>' } } } })
    await wrapper.get('.tag-rich-text-input [aria-label="斜体"]').trigger('click')
    expect(wrapper.findAllComponents(PerformanceTagRichTextInput)).toHaveLength(1)
    expect(wrapper.findAllComponents(PerformanceRichTextEditor)).toHaveLength(1)
    expect(wrapper.findAll('.tag-rich-text-input [role="toolbar"]')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows a controlled error for an unregistered field type', () => {
    const wrapper = mount(PerformanceTemplateRenderer, {
      props: { mode: 'readonly', sections: [{ id: 'future', name: '未来类型', fields: [{ id: 'unknown', type: 'score' as never, label: '评分' }] }], answers: {} },
    })
    expect(wrapper.get('.unsupported-template-field').text()).toBe('不支持的填写类型')
  })
})
