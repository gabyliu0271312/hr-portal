import type { PerformanceCalibrationSettings, PerformanceTemplateContent } from '@/api/performance'
import type { AssessmentContentType } from './PerformanceAssessmentContentLayers.vue'

export type ContentSlot = 'fill' | 'reference' | 'adjustment' | 'view'
export type ContentSettingsOwner = 'none' | 'root' | 'item'
export type ItemSettingsVariant = 'calibration-work-summary' | 'calibration-custom-text' | 'calibration-custom-tag' | 'calibration-rating' | 'work-summary' | 'custom-text' | 'custom-tag' | 'rating' | 'prompt' | 'evaluation-work-summary' | 'evaluation-custom-text' | 'evaluation-custom-tag' | 'evaluation-rating' | 'result-communication-work-summary' | 'result-communication-custom-text' | 'result-communication-custom-tag' | 'result-communication-rating' | 'result-view-work-summary' | 'result-view-rating' | 'result-view-custom-text' | 'result-view-tag'
export type EvaluationExecutorKind = 'reviewer_360' | 'direct_manager' | 'other'
export interface ItemSettingsCapabilities {
  hideName: boolean
  hideDescription?: boolean
  allowView?: boolean
  onlyWhenFilling?: boolean
  mode: boolean
  required: boolean
  levelRules?: boolean
  viewResults?: boolean
  modeDisabled?: boolean
  requiredDisabled?: boolean
  allowModify?: boolean
}
export const itemSettingsCapabilities: Record<ItemSettingsVariant, ItemSettingsCapabilities> = {
  'calibration-work-summary': { hideName: false, mode: true, required: true, viewResults: true, modeDisabled: true, requiredDisabled: true, allowModify: true },
  'calibration-custom-text': { hideName: true, mode: true, required: true, viewResults: true, modeDisabled: true, requiredDisabled: true, allowModify: true },
  'calibration-custom-tag': { hideName: true, hideDescription: true, mode: true, required: true, viewResults: true, modeDisabled: true, requiredDisabled: true, allowModify: true },
  'calibration-rating': { hideName: true, mode: false, required: true, levelRules: true, requiredDisabled: true, allowModify: true },
  'work-summary': { hideName: false, mode: true, required: true },
  'custom-text': { hideName: true, mode: true, required: true },
  'custom-tag': { hideName: true, hideDescription: true, mode: true, required: true },
  rating: { hideName: true, mode: false, required: true, levelRules: true },
  prompt: { hideName: false, mode: false, required: false, allowView: true, onlyWhenFilling: true },
  'evaluation-work-summary': { hideName: false, mode: true, required: true, viewResults: true },
  'evaluation-custom-text': { hideName: true, mode: true, required: true, viewResults: true },
  'evaluation-custom-tag': { hideName: true, hideDescription: true, mode: true, required: true, viewResults: true },
  'evaluation-rating': { hideName: true, mode: false, required: true, levelRules: true },
  'result-communication-work-summary': { hideName: false, mode: true, required: true, viewResults: true },
  'result-communication-custom-text': { hideName: true, mode: true, required: true, viewResults: true },
  'result-communication-custom-tag': { hideName: true, hideDescription: true, mode: true, required: true, viewResults: true },
  'result-communication-rating': { hideName: true, mode: false, required: true, levelRules: true },
  'result-view-work-summary': { hideName: false, mode: false, required: false, allowView: true },
  'result-view-rating': { hideName: true, mode: false, required: false, allowView: true },
  'result-view-custom-text': { hideName: true, hideDescription: true, mode: false, required: false, allowView: true },
  'result-view-tag': { hideName: true, hideDescription: true, mode: false, required: false, allowView: true },
}
export function getItemSettingsVariant(content: { type: string; questionType?: 'text' | 'tag' }, item?: { kind?: 'rating' | 'fill' | 'prompt'; questionType?: 'text' | 'tag' }): ItemSettingsVariant {
  if (content.type === 'prompt' || item?.kind === 'prompt') return 'prompt'
  if (item?.kind === 'rating' || content.type === 'rating' && item?.kind === undefined) return 'rating'
  if (content.type === 'custom' || content.type === 'rating' && item?.kind === 'fill') return (item?.questionType || content.questionType || 'text') === 'tag' ? 'custom-tag' : 'custom-text'
  return 'work-summary'
}

export function supportsEvaluationView(content: { type: string; questionType?: 'text' | 'tag' }, item?: { kind?: 'rating' | 'fill' | 'prompt'; questionType?: 'text' | 'tag' }) {
  const variant = getItemSettingsVariant(content, item)
  return variant === 'work-summary' || variant === 'custom-text' || variant === 'custom-tag'
}

export function supportsEvaluationItemSettings(content: { type: string; questionType?: 'text' | 'tag' }, item?: { kind?: 'rating' | 'fill' | 'prompt'; questionType?: 'text' | 'tag' }) {
  return supportsEvaluationView(content, item) || getItemSettingsVariant(content, item) === 'rating'
}

export function supportsResultViewSettings(content: { type: string; questionType?: 'text' | 'tag' }, item?: { kind?: 'rating' | 'fill' | 'prompt'; questionType?: 'text' | 'tag' }) {
  return ['work-summary', 'rating', 'custom-text', 'custom-tag'].includes(getItemSettingsVariant(content, item))
}

export function supportsStageItemView(nodeType: string | undefined, content: { type: string; questionType?: 'text' | 'tag' }, item?: { kind?: 'rating' | 'fill' | 'prompt'; questionType?: 'text' | 'tag' }) {
  if (nodeType === 'calibration') return supportsEvaluationView(content, item)
  if (nodeType === 'evaluation') return supportsEvaluationView(content, item)
  if (nodeType === 'result_communication') return ['work-summary', 'custom-text', 'custom-tag'].includes(getItemSettingsVariant(content, item))
  return false
}

export function getEvaluationExecutorKind(executorLabel?: string, executorTypes: readonly string[] = []): EvaluationExecutorKind {
  if (executorLabel?.includes('360') || executorTypes.some(type => /360|REVIEWER/i.test(type))) return 'reviewer_360'
  if (executorLabel?.includes('直属') || executorLabel?.includes('直接') || executorLabel?.includes('实线') || executorTypes.includes('DIRECT_MANAGER')) return 'direct_manager'
  return 'other'
}

export function getRootSettingsCapabilities(content: { type: string; questionType?: 'text' | 'tag'; items: { kind?: 'rating' | 'fill' | 'prompt'; questionType?: 'text' | 'tag' }[] }, variant = '') {
  if (content.type === 'prompt') return { allowMultiple: false, allowUnknown: false }
  if (variant === 'evaluation-360-root') return { allowMultiple: content.type === 'work_summary', allowUnknown: content.type === 'rating' }
  if (variant === 'evaluation-direct-root') return { allowMultiple: content.type === 'work_summary', allowUnknown: false }
  if (variant === 'result-communication-root') return { allowMultiple: content.type === 'work_summary', allowUnknown: false }
  if (variant === 'result-view-root') return { allowMultiple: false, allowUnknown: false, allowView: true }
  return { allowMultiple: content.type === 'work_summary', allowUnknown: content.type === 'rating' && content.items.some(item => item.kind !== 'fill' && item.kind !== 'prompt') }
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
  evaluation: {
    ...genericRule,
    itemSettingsEnabled: true,
    itemSettingsVariant: 'evaluation-item',
  },
  calibration: {
    ...genericRule,
    visibleSlots: ['adjustment'],
    itemSettingsEnabled: true,
    itemSettingsVariant: 'calibration-item',
    forbiddenSlots: ['fill', 'reference', 'view'],
  },
  result_communication: {
    ...genericRule,
    rootSettingsEnabled: true,
    itemSettingsEnabled: true,
    rootSettingsVariant: 'result-communication-root',
    itemSettingsVariant: 'result-communication-item',
  },
  result_view: {
    ...genericRule,
    visibleSlots: ['view'],
    forbiddenSlots: ['fill', 'reference', 'adjustment'],
    rootSettingsEnabled: true,
    itemSettingsEnabled: true,
    rootSettingsVariant: 'result-view-root',
    itemSettingsVariant: 'result-view-item',
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

export function getStageContentRule(nodeType?: string, evaluationExecutorKind: EvaluationExecutorKind = 'other'): StageContentRule {
  const rule = stageContentRules[nodeType || ''] || genericRule
  if (nodeType === 'evaluation' && evaluationExecutorKind !== 'other') {
    return {
      ...rule,
      rootSettingsEnabled: true,
      rootSettingsVariant: evaluationExecutorKind === 'reviewer_360' ? 'evaluation-360-root' : 'evaluation-direct-root',
    }
  }
  return rule
}

export function getStageContentTabs(nodeType?: string, evaluationExecutorKind: EvaluationExecutorKind = 'other') {
  return getStageContentRule(nodeType, evaluationExecutorKind).visibleSlots.map((key) => ({ key, label: contentSlotLabels[key] }))
}

export function supportsCalibrationItemSettings(content: { type: string }, item?: { kind?: 'rating' | 'fill' | 'prompt' }) {
  return ['work-summary', 'custom-text', 'custom-tag', 'rating'].includes(getItemSettingsVariant(content, item))
}

export function resolveCalibrationContents(contents: PerformanceTemplateContent[], settings: PerformanceCalibrationSettings = {}): PerformanceTemplateContent[] {
  return contents.map(content => ({
    ...content,
    content_slot: 'adjustment',
    items: content.items.map(item => {
      if (!supportsCalibrationItemSettings(content, item)) return item
      const override = settings[content.content_id || content.id || `${content.type}-${content.name}`]?.items?.[item.id]
      return {
        ...item,
        settings: {
          ...item.settings,
          ...(override?.hideName !== undefined ? { hideName: override.hideName } : {}),
          ...(override?.hideDescription !== undefined ? { hideDescription: override.hideDescription } : {}),
          ...(override?.levelRulesEnabled !== undefined ? { levelRulesEnabled: override.levelRulesEnabled } : {}),
          allowModify: override?.allowModify !== false,
        },
      }
    }),
  }))
}
