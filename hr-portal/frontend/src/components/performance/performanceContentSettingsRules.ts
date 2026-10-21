import type { AssessmentContentType } from './PerformanceAssessmentContentLayers.vue'

export type ContentSlot = 'fill' | 'reference' | 'adjustment' | 'view'
export type ContentSettingsOwner = 'none' | 'root' | 'item'
export type ItemSettingsVariant = 'work-summary' | 'custom-text' | 'custom-tag' | 'rating'
export interface ItemSettingsCapabilities {
  hideName: boolean
  hideDescription?: boolean
  mode: boolean
  required: boolean
  levelRules?: boolean
}
export const itemSettingsCapabilities: Record<ItemSettingsVariant, ItemSettingsCapabilities> = {
  'work-summary': { hideName: false, mode: true, required: true },
  'custom-text': { hideName: true, mode: true, required: true },
  'custom-tag': { hideName: true, hideDescription: true, mode: true, required: true },
  rating: { hideName: true, mode: false, required: true, levelRules: true },
}
export function getItemSettingsVariant(content: { type: string; questionType?: 'text' | 'tag' }, item?: { questionType?: 'text' | 'tag' }): ItemSettingsVariant {
  if (content.type === 'rating') return 'rating'
  if (content.type === 'custom') return (item?.questionType || content.questionType || 'text') === 'tag' ? 'custom-tag' : 'custom-text'
  return 'work-summary'
}

export function getRootSettingsCapabilities(content: { type: string; questionType?: 'text' | 'tag'; items: { questionType?: 'text' | 'tag' }[] }) {
  return { allowMultiple: content.type === 'work_summary', allowUnknown: content.type === 'rating' }
}

export interface StageContentRule {
  visibleSlots: readonly ContentSlot[]
  forbiddenSlots: readonly ContentSlot[]
  rootSettingsEnabled: boolean
  itemSettingsEnabled: boolean
  rootSettingsVariant: string
  itemSettingsVariant: string
  allowedContentTypes: readonly AssessmentContentType[]
}

const genericRule: StageContentRule = {
  visibleSlots: ['fill', 'reference'],
  forbiddenSlots: ['adjustment', 'view'],
  rootSettingsEnabled: false,
  itemSettingsEnabled: false,
  rootSettingsVariant: 'generic-root',
  itemSettingsVariant: 'generic-item',
  allowedContentTypes: ['work_summary', 'rating', 'custom'],
}

export const stageContentRules: Record<string, StageContentRule> = {
  work_summary: {
    ...genericRule,
    visibleSlots: ['fill'],
    forbiddenSlots: ['reference', 'adjustment', 'view'],
    rootSettingsEnabled: true,
    itemSettingsEnabled: true,
    rootSettingsVariant: 'work-summary-root',
    itemSettingsVariant: 'work-summary-item',
  },
  reviewer_360_invite: genericRule,
  reviewer_360_confirm: genericRule,
  evaluation: genericRule,
  calibration: {
    ...genericRule,
    visibleSlots: ['adjustment', 'reference'],
    forbiddenSlots: ['fill', 'view'],
  },
  result_communication: genericRule,
  result_view: {
    ...genericRule,
    visibleSlots: ['view'],
    forbiddenSlots: ['fill', 'reference', 'adjustment'],
    allowedContentTypes: ['work_summary', 'rating', 'custom'],
  },
  result_reconsideration: {
    ...genericRule,
    rootSettingsVariant: 'appeal-root',
  },
}

export const contentSlotLabels: Record<ContentSlot, string> = {
  fill: '配置填写内容',
  reference: '配置参考内容',
  adjustment: '配置供调整内容',
  view: '配置查看内容',
}

export function getStageContentRule(nodeType?: string): StageContentRule {
  return stageContentRules[nodeType || ''] || genericRule
}

export function getStageContentTabs(nodeType?: string) {
  return getStageContentRule(nodeType).visibleSlots.map((key) => ({ key, label: contentSlotLabels[key] }))
}
