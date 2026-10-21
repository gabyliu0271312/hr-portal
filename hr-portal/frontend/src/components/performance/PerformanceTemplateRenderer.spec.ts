import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'
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
    expect(wrapper.find('.template-section-title-line').exists()).toBe(true)
    expect(wrapper.get('.rich-answer ol li').text()).toBe('保留格式')
    expect(wrapper.get('.readonly-rating-badge').text()).toBe('5星')
    expect(wrapper.get('.readonly-tags').text()).toContain('做得好的')
    expect(wrapper.text()).toContain('补充说明')
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

  it('shows a controlled error for an unregistered field type', () => {
    const wrapper = mount(PerformanceTemplateRenderer, {
      props: { mode: 'readonly', sections: [{ id: 'future', name: '未来类型', fields: [{ id: 'unknown', type: 'score' as never, label: '评分' }] }], answers: {} },
    })
    expect(wrapper.get('.unsupported-template-field').text()).toBe('不支持的填写类型')
  })
})
