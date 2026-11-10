import { describe, expect, it } from 'vitest'
import type { PerformanceTemplateContent, PerformanceWorkflowNode } from '@/api/performance'
import {
  isFieldRendered,
  isFieldWritable,
  isNodeReadonly,
  isPromptVisible,
  resolveFieldSettings,
} from './performanceContentSettingsResolver'

function item(id: string, overrides: Record<string, unknown> = {}) {
  return { id, label: id, hint: '', kind: 'fill', ...overrides } as PerformanceTemplateContent['items'][number]
}
function content(overrides: Partial<PerformanceTemplateContent> = {}): PerformanceTemplateContent {
  return {
    id: 'c1', type: 'work_summary', name: '工作总结', description: '周期重点工作', items: [item('i1')],
    ...overrides,
  } as PerformanceTemplateContent
}
function node(nodeType: string): PerformanceWorkflowNode {
  return { node_id: 'n1', node_type: nodeType, name: '环节', description: '', order: 0 } as PerformanceWorkflowNode
}

describe('resolveFieldSettings', () => {
  it('maps fill mode to edit+write with item-level required', () => {
    const settings = resolveFieldSettings({ content: content(), item: item('i1', { settings: { required: true } }) })
    expect(settings.viewType).toBe('edit')
    expect(settings.permission).toBe('write')
    expect(settings.required).toBe(true)
    expect(isFieldRendered(settings)).toBe(true)
    expect(isFieldWritable(settings)).toBe(true)
  })

  it('maps hidden mode to viewType=hide (highest priority)', () => {
    const settings = resolveFieldSettings({ content: content(), item: item('i1', { settings: { mode: 'hidden' } }) })
    expect(settings.viewType).toBe('hide')
    expect(isFieldRendered(settings)).toBe(false)
  })

  it('maps view mode to edit+read: rendered but not writable', () => {
    const settings = resolveFieldSettings({ content: content(), item: item('i1', { settings: { mode: 'view' } }) })
    expect(settings.viewType).toBe('edit')
    expect(settings.permission).toBe('read')
    expect(isFieldWritable(settings)).toBe(false)
  })

  it('derives readonly from readonly node types regardless of item mode', () => {
    expect(isNodeReadonly(node('result_view'))).toBe(true)
    expect(isNodeReadonly(node('evaluation'))).toBe(false)
    const settings = resolveFieldSettings({ node: node('result_view'), content: content(), item: item('i1') })
    expect(settings.permission).toBe('read')
  })

  it('allows only projected reconsideration adjustment fields to use local write settings', () => {
    expect(isNodeReadonly(node('result_reconsideration'))).toBe(true)
    expect(resolveFieldSettings({ node: node('result_reconsideration'), content: content(), item: item('i1') }).permission).toBe('read')
    const projected = content({ content_slot: 'adjustment' })
    expect(resolveFieldSettings({ node: node('result_reconsideration'), content: projected, item: item('i1', { settings: { allowModify: true } }) }).permission).toBe('write')
    expect(resolveFieldSettings({ node: node('result_reconsideration'), content: projected, item: item('i1', { settings: { allowModify: false } }) }).permission).toBe('read')
    expect(resolveFieldSettings({ node: node('result_reconsideration'), content: projected, item: item('i1'), readonly: true }).permission).toBe('read')
  })

  it('derives readonly from content_slot=view (参考内容查看态)', () => {
    const settings = resolveFieldSettings({ content: content({ content_slot: 'view' }), item: item('i1') })
    expect(settings.permission).toBe('read')
  })

  it('honors item-level allowModify=false as readonly (校准不可调整)', () => {
    const settings = resolveFieldSettings({ content: content(), item: item('i1', { settings: { allowModify: false } }) })
    expect(settings.permission).toBe('read')
  })

  it('merges allowMultiple from root or item settings', () => {
    expect(resolveFieldSettings({ content: content({ settings: { allowMultiple: true } }), item: item('i1') }).allowMultiple).toBe(true)
    expect(resolveFieldSettings({ content: content(), item: item('i1', { settings: { allowMultiple: true } }) }).allowMultiple).toBe(true)
    expect(resolveFieldSettings({ content: content(), item: item('i1') }).allowMultiple).toBe(false)
  })

  it('merges hideName / hideDescription from item and root', () => {
    expect(resolveFieldSettings({ content: content(), item: item('i1', { settings: { hideName: true } }) }).hideName).toBe(true)
    expect(resolveFieldSettings({ content: content({ settings: { hideDescription: true } }), item: item('i1') }).hideDescription).toBe(true)
  })

  it('resolves placeholder from item hint first, then content description', () => {
    expect(resolveFieldSettings({ content: content(), item: item('i1', { hint: '请填写' }) }).placeholder).toBe('请填写')
    expect(resolveFieldSettings({ content: content(), item: item('i1', { hint: '  ' }) }).placeholder).toBe('周期重点工作')
    expect(resolveFieldSettings({ content: content(), item: item('i1') }).placeholder).toBe('周期重点工作')
  })

  it('falls back required to root when item has none', () => {
    expect(resolveFieldSettings({ content: content({ settings: { required: true } }), item: item('i1') }).required).toBe(true)
  })
})

describe('isPromptVisible', () => {
  it('hides allowView=false prompts and onlyWhenFilling outside filling', () => {
    expect(isPromptVisible({ title: 't', content: 'c', color: '', scope: 'all', allowView: false })).toBe(false)
    expect(isPromptVisible({ title: 't', content: 'c', color: '', scope: 'all', onlyWhenFilling: true }, { filling: false })).toBe(false)
    expect(isPromptVisible({ title: 't', content: 'c', color: '', scope: 'all', onlyWhenFilling: true }, { filling: true })).toBe(true)
    expect(isPromptVisible(null)).toBe(false)
  })
})
