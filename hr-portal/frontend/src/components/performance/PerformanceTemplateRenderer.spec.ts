import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'
import PerformanceRichTextEditor from './PerformanceRichTextEditor.vue'
import PerformanceReadonlyAnswer from './PerformanceReadonlyAnswer.vue'
import PerformanceTagRichTextInput from './PerformanceTagRichTextInput.vue'
import PerformanceTemplateFieldRenderer from './PerformanceTemplateFieldRenderer.vue'
import templateFieldRendererSource from './PerformanceTemplateFieldRenderer.vue?raw'
import richTextBoxSource from './PerformanceRichTextBox.vue?raw'
import richTextEditorSource from './PerformanceRichTextEditor.vue?raw'
import type { PerformanceTemplateSection } from '@/api/performance'
import { performanceTemplateAddedInstance, performanceTemplateInitialAnswers, performanceTemplateWritableAnswers } from './performanceTemplateAnswers'

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
  it('gates tag input hover eligibility on editability without changing readonly answers', async () => {
    const answer = { tags: ['a'], notes: { a: '保留答案' } }
    const wrapper = mount(PerformanceTagRichTextInput, { props: { modelValue: answer, options: [{ id: 'a', label: '标签A' }], editable: true } })
    expect(wrapper.classes()).toContain('is-editable')
    await wrapper.setProps({ editable: false })
    expect(wrapper.classes()).not.toContain('is-editable')
    expect(wrapper.get('[contenteditable]').attributes('contenteditable')).toBe('false')
    expect(wrapper.text()).toContain('保留答案')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.setProps({ editable: true, displayOnly: true })
    expect(wrapper.classes()).not.toContain('is-editable')
    expect(wrapper.classes()).toContain('is-display-only')
    wrapper.unmount()
  })

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
    if (mode === 'edit') expect(wrapper.get('.tag-rich-input').attributes('data-placeholder')).toBeUndefined()
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

  it.each(['edit', 'readonly'] as const)('keeps page and inline prompts in content order in %s mode', mode => {
    const prompt = { title: '页面提示', content: '如实评价', color: '#3370ff', scope: 'all' as const }
    const schema: PerformanceTemplateSection[] = [
      { id: 'page', name: '', fields: [], elements: [{ kind: 'prompt', id: 'page', prompt }] },
      { id: 'mixed', name: '反馈内容', fields: [{ id: 'first', type: 'rich_text', label: '第一题' }, { id: 'last', type: 'rich_text', label: '第二题' }], elements: [
        { kind: 'field', id: 'first' }, { kind: 'prompt', id: 'inline', prompt: { ...prompt, title: '题间提示' } }, { kind: 'field', id: 'last' },
      ] },
    ]
    const wrapper = mount(PerformanceTemplateRenderer, { props: { mode, editable: true, title: '360°评估', sections: schema, answers: {} } })
    expect(wrapper.findAll('[data-section-id]').map(item => item.attributes('data-section-id'))).toEqual(['page', 'mixed'])
    const mixed = wrapper.get('[data-section-id="mixed"] .template-section-instance')
    expect(Array.from(mixed.element.children).map(element => element.getAttribute('data-field-id') || element.getAttribute('data-prompt-id'))).toEqual(['first', 'inline', 'last'])
    expect(wrapper.find('[data-section-id="page"] .template-section-header').exists()).toBe(false)
    expect(wrapper.findAll('.performance-prompt-display')).toHaveLength(2)
    expect(performanceTemplateWritableAnswers(schema, { first: '答案', page: '伪造提示答案', inline: '伪造' })).toEqual({ first: '答案' })
    expect(wrapper.emitted('update-answer')).toBeUndefined()
    wrapper.unmount()
  })

  it('filters unavailable prompts and filling-only prompts without showing empty headings', async () => {
    const prompt = { title: '说明', content: '填写时可见', color: '#3370ff', scope: 'all' as const }
    const schema: PerformanceTemplateSection[] = [{ id: 'p', name: '', fields: [], elements: [
      { kind: 'prompt', id: 'denied', prompt: { ...prompt, content: '禁止查看', allowView: false } },
      { kind: 'prompt', id: 'filling', prompt: { ...prompt, onlyWhenFilling: true } },
    ] }]
    const wrapper = mount(PerformanceTemplateRenderer, { props: { mode: 'edit', editable: true, sections: schema, answers: {} } })
    expect(wrapper.text()).toContain('填写时可见')
    expect(wrapper.text()).not.toContain('禁止查看')
    await wrapper.setProps({ editable: false })
    expect(wrapper.find('[data-section-id]').exists()).toBe(false)
    await wrapper.setProps({ mode: 'readonly', editable: true })
    expect(wrapper.find('.performance-prompt-display').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows a controlled error for an unregistered field type', () => {
    const wrapper = mount(PerformanceTemplateRenderer, {
      props: { mode: 'readonly', sections: [{ id: 'future', name: '未来类型', fields: [{ id: 'unknown', type: 'score' as never, label: '评分' }] }], answers: {} },
    })
    expect(wrapper.get('.unsupported-template-field').text()).toBe('不支持的填写类型')
  })
  it.each(['default', 'task-entry', 'tag'] as const)('keeps a long %s hint outside editable answers and restores it only when empty', async variant => {
    const placeholder = `${'请填写完整工作事例。'.repeat(80)}
${'NoBreakText'.repeat(80)}`
    const wrapper = mount(PerformanceRichTextEditor, { props: { variant, placeholder } })
    const input = wrapper.get('.rich-input')
    const layout = wrapper.get('.next-remix-rich-text-editor-content')
    expect(layout.attributes('data-rich-placeholder')).toBe(placeholder)
    expect(input.text().replace(/​/g, '')).toBe('')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    input.element.innerHTML = '真实答案'
    await input.trigger('input')
    expect(layout.attributes('data-rich-placeholder')).toBeUndefined()
    expect(input.attributes('data-placeholder')).toBeUndefined()
    expect(JSON.stringify(wrapper.emitted('update:modelValue'))).not.toContain('请填写')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toContain('真实答案')
    input.element.innerHTML = ''
    await input.trigger('input')
    expect(layout.attributes('data-rich-placeholder')).toBe(placeholder)
    const cleared = document.createElement('div')
    cleared.innerHTML = String(wrapper.emitted('update:modelValue')?.at(-1)?.[0])
    expect(cleared.textContent?.replace(/​/g, '')).toBe('')
    await wrapper.setProps({ readonly: true })
    expect(input.attributes('contenteditable')).toBe('false')
    expect(input.element.querySelectorAll('.ace-line')).toHaveLength(1)
    wrapper.unmount()
  })

  it('uses an in-flow grid hint instead of an absolute zero-height overlay', () => {
    expect(richTextBoxSource).not.toContain('.rich-input[data-placeholder]::before')
    expect(richTextEditorSource).toContain('.next-remix-rich-text-editor-content[data-rich-placeholder]::before){grid-area:1 / 1;')
    expect(richTextEditorSource).toContain('white-space:pre-wrap;overflow-wrap:anywhere;')
  })

  it('repairs empty DOM, removes duplicate placeholders and splits retyped content at the caret', async () => {
    const wrapper = mount(PerformanceRichTextEditor, { attachTo: document.body, props: { placeholder: '默认提示' } })
    const input = wrapper.get('[contenteditable="true"]')
    ;(input.element as HTMLElement).focus()
    input.element.innerHTML = ''
    await input.trigger('input')
    expect(input.element.querySelectorAll('.ace-line')).toHaveLength(1)
    expect(input.attributes('data-placeholder')).toBe('默认提示')
    expect(wrapper.find('.rich-placeholder').exists()).toBe(false)
    const backspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    input.element.dispatchEvent(backspace)
    expect(backspace.defaultPrevented).toBe(true)
    input.element.innerHTML = '重新填写'
    const selection = document.getSelection()!
    const range = document.createRange()
    range.setStart(input.element.firstChild!, 2)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    await input.trigger('input')
    expect(input.attributes('data-placeholder')).toBeUndefined()
    await input.trigger('keydown', { key: 'Enter' })
    expect(Array.from(input.element.querySelectorAll('.ace-line')).map(line => line.textContent?.replace(/​/g, ''))).toEqual(['重新', '填写'])
    expect(input.element.children[1].contains(selection.anchorNode)).toBe(true)
    wrapper.unmount()
  })

  it('focuses the rich-text body instead of the toolbar after required validation', async () => {
    vi.useFakeTimers()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = vi.fn()
    const wrapper = mount(PerformanceTemplateRenderer, { attachTo: document.body, props: { mode: 'edit', editable: true, sections: [{ id: 's', name: '总结', fields: [{ id: 'required', type: 'rich_text', label: '必填', required: true }] }], answers: {} } })
    try {
      wrapper.vm.focusField('required')
      await vi.advanceTimersByTimeAsync(250)
      expect(document.activeElement).toBe(wrapper.get('[contenteditable="true"]').element)
      expect(document.querySelector('.rich-toolbar-tooltip')).toBeNull()
    } finally { wrapper.unmount(); Element.prototype.scrollIntoView = original; vi.useRealTimers() }
  })

  it('does not publish intermediate composition or intercept IME confirmation Enter', async () => {
    const wrapper = mount(PerformanceRichTextEditor, { attachTo: document.body })
    const input = wrapper.get('[contenteditable="true"]')
    ;(input.element as HTMLElement).focus()
    await input.trigger('compositionstart')
    input.element.innerHTML = '中文'
    await input.trigger('input')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })
    input.element.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(false)
    await input.trigger('compositionend')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toContain('中文')
    expect(input.element.querySelector('.ace-line')).not.toBeNull()
    wrapper.unmount()
  })

  it('replaces a multi-line selection at Enter and retains list formatting', async () => {
    const wrapper = mount(PerformanceRichTextEditor, { attachTo: document.body, props: { modelValue: '<p>abc</p><p>def</p>' } })
    const input = wrapper.get('[contenteditable="true"]')
    ;(input.element as HTMLElement).focus()
    const leaves = input.element.querySelectorAll('[data-leaf]')
    const range = document.createRange()
    range.setStart(leaves[0].firstChild!, 1)
    range.setEnd(leaves[1].firstChild!, 2)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    await input.trigger('keydown', { key: 'Enter' })
    expect(input.element.textContent?.replace(/​/g, '')).toBe('af')
    expect(Array.from(input.element.querySelectorAll(':scope > .ace-line')).map(line => line.textContent?.replace(/​/g, ''))).toEqual(['a', 'f'])
    await wrapper.setProps({ modelValue: '<ul><li>列表内容</li></ul>' })
    ;(input.element as HTMLElement).focus()
    const listCaret = document.createRange()
    listCaret.selectNodeContents(input.element.querySelector('li')!)
    listCaret.collapse(false)
    selection.removeAllRanges()
    selection.addRange(listCaret)
    await input.trigger('keydown', { key: 'Enter' })
    expect(input.element.querySelectorAll('ul')).toHaveLength(2)
    wrapper.unmount()
  })

  it('preserves inline marks and trailing text when splitting a line', async () => {
    const wrapper = mount(PerformanceRichTextEditor, { attachTo: document.body, props: { modelValue: '<p><strong>abcd</strong></p>' } })
    const input = wrapper.get('[contenteditable="true"]')
    ;(input.element as HTMLElement).focus()
    const text = input.element.querySelector('strong')!.textContent!
    const node = input.element.querySelector('strong [data-leaf]')?.firstChild || input.element.querySelector('strong')!.firstChild!
    const range = document.createRange()
    range.setStart(node, 2)
    range.collapse(true)
    const selection = document.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    await input.trigger('keydown', { key: 'Enter' })
    expect(text).toBe('abcd')
    expect(Array.from(input.element.querySelectorAll('.ace-line')).map(line => line.textContent?.replace(/​/g, ''))).toEqual(['ab', 'cd'])
    expect(input.element.children[0].querySelector('strong')?.textContent).toBe('ab')
    expect(input.element.children[1].querySelector('strong')?.textContent).toBe('cd')
    wrapper.unmount()
  })

  it.each(['OL', 'UL'])('downgrades an empty %s item before merging with the preceding line', async type => {
    const wrapper = mount(PerformanceRichTextEditor, { attachTo: document.body, props: { modelValue: `<${type}><li>第一项</li><li>第二项</li><li></li></${type}>` } })
    const input = wrapper.get('[contenteditable="true"]')
    ;(input.element as HTMLElement).focus()
    const third = input.element.children[2]
    const range = document.createRange()
    range.setStart(third.querySelector('[data-enter]')!.firstChild!, 1)
    range.collapse(true)
    const selected = document.getSelection()!
    selected.removeAllRanges()
    selected.addRange(range)
    const backspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    input.element.dispatchEvent(backspace)
    expect(backspace.defaultPrevented).toBe(true)
    expect(input.element.children).toHaveLength(3)
    expect(input.element.querySelectorAll('li')).toHaveLength(2)
    expect(input.element.children[2].classList.contains('list-indent1')).toBe(type === 'OL')
    expect(input.element.children[2].contains(selected.anchorNode)).toBe(true)
    expect(input.element.children[1].textContent).toContain('第二项')
    if (type === 'OL') {
      await input.trigger('keydown', { key: 'Backspace' })
      expect(input.element.children).toHaveLength(3)
      expect(input.element.children[2].classList.contains('list-indent1')).toBe(false)
    }
    wrapper.unmount()
  })

  it('handles beforeinput list deletion, keeps marks and ignores non-boundary deletions and IME', async () => {
    const wrapper = mount(PerformanceRichTextEditor, { attachTo: document.body, props: { modelValue: '<ol><li>前项</li><li><strong><em><u>正文</u></em></strong></li><li>后项</li></ol>' } })
    const input = wrapper.get('[contenteditable="true"]')
    ;(input.element as HTMLElement).focus()
    const node = input.element.children[1].querySelector('[data-leaf]')!.firstChild!
    const range = document.createRange()
    range.setStart(node, 1)
    range.collapse(true)
    const selected = document.getSelection()!
    selected.removeAllRanges()
    selected.addRange(range)
    const middle = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true })
    input.element.dispatchEvent(middle)
    expect(middle.defaultPrevented).toBe(false)
    range.setStart(node, 0)
    range.collapse(true)
    selected.removeAllRanges()
    selected.addRange(range)
    const forward = new InputEvent('beforeinput', { inputType: 'deleteContentForward', bubbles: true, cancelable: true })
    input.element.dispatchEvent(forward)
    expect(forward.defaultPrevented).toBe(false)
    const ime = new KeyboardEvent('keydown', { key: 'Backspace', isComposing: true, bubbles: true, cancelable: true })
    input.element.dispatchEvent(ime)
    expect(ime.defaultPrevented).toBe(false)
    const backward = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true })
    input.element.dispatchEvent(backward)
    expect(backward.defaultPrevented).toBe(true)
    expect(input.element.children[1].querySelector('strong em u')?.textContent).toBe('正文')
    expect(input.element.children[1].classList.contains('list-indent1')).toBe(true)
    expect(input.element.children[1].contains(selected.anchorNode)).toBe(true)
    expect(Array.from(input.element.querySelectorAll('ol')).map(list => list.getAttribute('start'))).toEqual(['1', '1'])
    await input.trigger('keydown', { key: 'Enter' })
    expect(input.element.children[2].classList.contains('list-indent1')).toBe(true)
    wrapper.unmount()
  })

  it('retains safe list metadata and numbering in readonly answers without allowing active attributes', () => {
    const html = '<div class="ace-line list-div injected" onclick="bad()"><ol class="r-list r-list-number injected" start="2" style="color:red"><li data-start="2" onmouseover="bad()"><strong><em><u>第二项</u></em></strong></li></ol></div><div class="ace-line list-indent1"><span>缩进行</span></div><ul><li>无序项</li></ul>'
    const wrapper = mount(PerformanceReadonlyAnswer, { props: { field: { id: 'r', label: '正文', type: 'rich_text' }, value: html } })
    expect(wrapper.get('.rich-answer').classes()).toContain('performance-rich-text-content')
    expect(wrapper.get('ol').attributes('start')).toBe('2')
    expect(wrapper.get('ol li').attributes('data-start')).toBe('2')
    expect(wrapper.get('strong em u').text()).toBe('第二项')
    expect(wrapper.find('.list-indent1').exists()).toBe(true)
    expect(wrapper.find('[onclick], [onmouseover], [style], .injected').exists()).toBe(false)
    wrapper.unmount()
  })

  it('reconstructs legacy split ordered-list numbering and leaves old answers unchanged', async () => {
    const value = '<div><ol><li>第一项</li></ol></div><div><ol><li>第二项</li></ol></div><p>中间段落</p><ol><li>新列表</li><li>下一项</li></ol>'
    const wrapper = mount(PerformanceReadonlyAnswer, { props: { field: { id: 'r', label: '正文', type: 'rich_text' }, value } })
    expect(wrapper.findAll('ol li').map(item => item.attributes('data-start'))).toEqual(['1', '2', '1', '2'])
    expect(wrapper.props('value')).toBe(value)
    const editor = mount(PerformanceRichTextEditor, { props: { modelValue: value } })
    const serialized = editor.get('[contenteditable="true"]').element.innerHTML
    await wrapper.setProps({ value: serialized })
    expect(wrapper.findAll('ol li').map(item => item.attributes('data-start'))).toEqual(['1', '2', '1', '2'])
    editor.unmount()
    wrapper.unmount()
  })

  it('downgrades a single empty ordered item before the empty-editor guard and does not intercept a selected range', async () => {
    const wrapper = mount(PerformanceRichTextEditor, { attachTo: document.body, props: { modelValue: '<ol><li></li></ol>' } })
    const input = wrapper.get('[contenteditable="true"]')
    ;(input.element as HTMLElement).focus()
    const range = document.createRange()
    range.setStart(input.element.querySelector('[data-enter]')!.firstChild!, 1)
    range.collapse(true)
    const selected = document.getSelection()!
    selected.removeAllRanges()
    selected.addRange(range)
    await input.trigger('keydown', { key: 'Backspace' })
    expect(input.element.querySelector('ol')).toBeNull()
    expect(input.element.querySelector('.list-indent1')).not.toBeNull()
    await wrapper.setProps({ modelValue: '<ol><li>选中文字</li></ol>' })
    range.selectNodeContents(input.element.querySelector('li')!)
    selected.removeAllRanges()
    selected.addRange(range)
    const backspace = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
    input.element.dispatchEvent(backspace)
    expect(backspace.defaultPrevented).toBe(false)
    expect(input.element.querySelector('ol')).not.toBeNull()
    wrapper.unmount()
  })

})
