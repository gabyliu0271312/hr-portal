import type { AssessmentContentType } from './PerformanceAssessmentContentLayers.vue'

export type ContentSlot = 'fill' | 'reference' | 'adjustment' | 'view'
export type ContentSettingsOwner = 'none' | 'root' | 'item'

export interface StageContentRule {
  visibleSlots: readonly ContentSlot[]
  forbiddenSlots: readonly ContentSlot[]
  rootSettingsVariant: string
  itemSettingsVariant: string
  allowedContentTypes: readonly AssessmentContentType[]
}

const genericRule: StageContentRule = {
  visibleSlots: ['fill', 'reference'],
  forbiddenSlots: ['adjustment', 'view'],
  rootSettingsVariant: 'generic-root',
  itemSettingsVariant: 'generic-item',
  allowedContentTypes: ['work_summary', 'rating', 'custom'],
}

export const stageContentRules: Record<string, StageContentRule> = {
  work_summary: {
    ...genericRule,
    visibleSlots: ['fill'],
    forbiddenSlots: ['reference', 'adjustment', 'view'],
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
    allowedContentTypes: ['rating', 'custom'],
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
