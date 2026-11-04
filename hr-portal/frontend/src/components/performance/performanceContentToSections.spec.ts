import { describe, expect, it } from 'vitest'
import type { PerformanceTemplateContent, PerformanceWorkflowNode } from '@/api/performance'
import { contentToSections, performanceContentKey } from './performanceContentToSections'

function item(id: string, overrides: Record<string, unknown> = {}) {
  return { id, label: `条目 ${id}`, hint: '', kind: 'fill', ...overrides } as PerformanceTemplateContent['items'][number]
}
function node(nodeType: string): PerformanceWorkflowNode {
  return { node_id: 'n1', node_type: nodeType, name: '环节', description: '', order: 0 } as PerformanceWorkflowNode
}

describe('contentToSections', () => {
  it('projects work_summary to a rich_text section and keeps description on section', () => {
    const content: PerformanceTemplateContent = {
      id: 'c-summary', type: 'work_summary', name: '工作总结', description: '请填写周期内的重点工作有效产出。',
      items: [item('i-keywork', { settings: { required: true } })],
    }
    const sections = contentToSections(node('work_summary'), [content])
    expect(sections).toHaveLength(1)
    expect(sections[0].name).toBe('工作总结')
    expect(sections[0].description).toBe('请填写周期内的重点工作有效产出。')
    expect(sections[0].allow_multiple).toBe(false)
    expect(sections[0].fields).toEqual([
      expect.objectContaining({ id: 'i-keywork', type: 'rich_text', label: '条目 i-keywork', required: true, readonly: false }),
    ])
  })

  it('projects rating content with merged options', () => {
    const content: PerformanceTemplateContent = {
      id: 'c-rating', type: 'rating', name: '综合评级', description: '',
      options: [{ id: 'o1', code: '1星', label: '符合预期' }, { id: 'o2', code: '2星', label: '超出预期' }],
      items: [item('i-rating', { kind: 'rating' })],
    }
    const sections = contentToSections(node('work_summary'), [content])
    expect(sections[0].fields[0]).toEqual(expect.objectContaining({
      id: 'i-rating', type: 'rating',
      options: [{ id: 'o1', code: '1星', label: '符合预期' }, { id: 'o2', code: '2星', label: '超出预期' }],
    }))
  })

  it('projects custom tag and single question types', () => {
    const content: PerformanceTemplateContent = {
      id: 'c-custom', type: 'custom', name: '自定义', description: '',
      items: [
        item('i-tag', { questionType: 'tag' }),
        item('i-single', { questionType: 'single' }),
        item('i-text', { questionType: 'text' }),
      ],
    }
    const sections = contentToSections(node('evaluation'), [content])
    expect(sections[0].fields.map(field => field.type)).toEqual(['tag_with_followup', 'single_select', 'rich_text'])
  })

  it('drops hidden items and prompts stay as elements', () => {
    const content: PerformanceTemplateContent = {
      id: 'c-summary', type: 'work_summary', name: '工作总结', description: '',
      items: [
        item('i-hidden', { settings: { mode: 'hidden' } }),
        item('i-visible'),
        { id: 'i-prompt', kind: 'prompt', label: '', hint: '', prompt: { title: '提示', content: '内容', color: '', scope: 'all' } },
      ],
    }
    const sections = contentToSections(node('work_summary'), [content])
    expect(sections).toHaveLength(1)
    expect(sections[0].fields.map(field => field.id)).toEqual(['i-visible'])
    expect(sections[0].elements?.map(element => element.kind)).toEqual(['field', 'prompt'])
  })

  it('strips instance suffix when allow_multiple is on (renderer appends序号)', () => {
    const content: PerformanceTemplateContent = {
      id: 'c-multi', type: 'work_summary', name: '重点工作', description: '',
      settings: { allowMultiple: true },
      items: [item('i-1', { label: '重点工作 1' })],
    }
    const sections = contentToSections(node('work_summary'), [content])
    expect(sections[0].allow_multiple).toBe(true)
    expect(sections[0].fields[0].label).toBe('重点工作')
  })

  it('marks fields readonly for readonly nodes and keeps required off', () => {
    const content: PerformanceTemplateContent = {
      id: 'c-summary', type: 'work_summary', name: '工作总结', description: '',
      items: [item('i1', { settings: { required: true } })],
    }
    const sections = contentToSections(node('result_view'), [content])
    expect(sections[0].fields[0].readonly).toBe(true)
    expect(sections[0].fields[0].required).toBe(false)
  })

  it('projects prompt-only content into a prompt element section', () => {
    const prompt: PerformanceTemplateContent = {
      id: 'c-prompt', type: 'prompt', name: '说明', description: '', items: [],
      prompt: { title: '提示', content: '说明文字', color: '', scope: 'all' },
    }
    const sections = contentToSections(node('work_summary'), [prompt])
    expect(sections).toHaveLength(1)
    expect(sections[0].fields).toEqual([])
    expect(sections[0].elements).toEqual([{ kind: 'prompt', id: 'c-prompt:prompt', prompt: prompt.prompt }])
  })

  it('skips reference content entirely', () => {
    const reference: PerformanceTemplateContent = {
      id: 'c-ref', type: 'reference', name: '引用', description: '', items: [], content_slot: 'reference',
    }
    expect(contentToSections(node('evaluation'), [reference])).toEqual([])
  })
})

describe('performanceContentKey', () => {
  it('prefers content_id over id over fallback', () => {
    expect(performanceContentKey({ content_id: 'cid', id: 'id', type: 'work_summary', name: 'x', description: '', items: [] })).toBe('cid')
    expect(performanceContentKey({ id: 'id', type: 'work_summary', name: 'x', description: '', items: [] })).toBe('id')
  })
})
