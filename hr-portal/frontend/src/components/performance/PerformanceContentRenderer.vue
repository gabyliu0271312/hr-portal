<template>
  <div class="performance-content-renderer" :class="`performance-content-renderer--${variant}`">
    <PerformancePromptDisplay v-if="content.type === 'prompt' && content.prompt" :value="content.prompt" class="content-renderer-prompt" />
    <PerformanceContentSelectionFrame
      v-for="item in content.items"
      :key="item.id"
      variant="item"
      :class="[
        isRatingItem(item) ? 'content-renderer-rating' : 'content-renderer-item',
        'content-renderer-item--interactive',
        {
          'content-renderer-item--selected': selectionKey(item.id) === selectedItemId,
          'content-renderer-item--configured': hasItemSettings(item.id) || (item.kind === 'prompt' && variant === 'configured-card'),
          'content-renderer-item--custom-tag': isCustomTagItem(item),
          'content-renderer-item--hidden': hasItemSettings(item.id) && itemState(item.id).mode === 'hidden',
          'content-renderer-item--view': hasItemSettings(item.id) && itemState(item.id).mode === 'view',
          'content-renderer-item--name-hidden': isCustomTextItem(item) && itemState(item.id).hideName === true,
          'content-renderer-rating--name-hidden': isRatingItem(item) && itemState(item.id).hideName === true,
        },
      ]"
      :selected="selectionKey(item.id) === selectedItemId"
      :data-content-item-id="item.id"
      :aria-disabled="hasItemSettings(item.id) && itemState(item.id).mode === 'hidden'"
      @click.stop="interactive && $emit('select-item', item.id)"
    >
      <button v-if="hasItemSettings(item.id) && itemState(item.id).mode === 'hidden'" class="content-renderer-hidden-icon" type="button" aria-label="在此环节隐藏" tabindex="-1"><PerformanceVisibleLockIcon /></button>
      <template v-if="item.kind === 'prompt'">
        <PerformancePromptDisplay v-if="item.prompt" :value="item.prompt" class="content-renderer-prompt" />
      </template>
      <div v-else-if="itemState(item.id).mode === 'view'" :class="{ 'content-renderer-rating__readonly': isRatingItem(item) }">
        <PerformanceTemplateFieldRenderer class="content-renderer-view-preview" mode="readonly" :field="viewField(item)" :value="viewPreviewValue(item)" :label="item.label" :empty-answer-text="readonlyEmptyAnswerText" :hide-item-description="true" />
      </div>
      <PerformanceTemplateFieldRenderer v-else-if="isCustomTagItem(item)" mode="edit" :editable="false" :field="tagField(item)" :value="tagPreviewValue(item)" :label="item.label" />
      <template v-else-if="isRatingItem(item)">
        <div class="content-renderer-rating__header">
          <strong v-if="!itemState(item.id).hideName">{{ item.label }}</strong><i v-if="!itemState(item.id).hideName && (!hasItemSettings(item.id) || itemState(item.id).required)">*</i>
        </div>
        <div class="content-renderer-rating__body">
          <PerformanceRatingControl class="content-renderer-rating__levels performance-content-renderer__rating" :options="content.options || []" :allow-unknown="content.settings?.allowUnknown === true" :display-mode="content.ratingDisplayMode" :interactive="false" />
        </div>
      </template>
      <PerformanceAssessmentRichTextField v-else :label="item.label" :required="itemState(item.id).required && itemState(item.id).mode === 'fill'">
        <PerformanceRichTextBox readonly>
          <div v-if="item.richText" class="content-renderer-editor__body" v-html="item.richText" />
          <div v-else class="content-renderer-editor__body">{{ item.hint || emptyText }}</div>
        </PerformanceRichTextBox>
      </PerformanceAssessmentRichTextField>
    </PerformanceContentSelectionFrame>
  </div>
</template>
<script setup lang="ts">
import { toRefs } from 'vue'
import PerformanceRichTextBox from './PerformanceRichTextBox.vue'
import PerformanceAssessmentRichTextField from './PerformanceAssessmentRichTextField.vue'
import PerformanceContentSelectionFrame from './PerformanceContentSelectionFrame.vue'
import PerformanceVisibleLockIcon from './PerformanceVisibleLockIcon.vue'
import PerformanceRatingControl from './PerformanceRatingControl.vue'
import PerformanceTemplateFieldRenderer from './PerformanceTemplateFieldRenderer.vue'
import PerformancePromptDisplay from './PerformancePromptDisplay.vue'
import type { PerformancePromptValue as PromptValue, PerformanceTemplateField, PerformanceTemplateOption } from '@/api/performance'
type ContentItem = { id: string; label: string; hint?: string; richText?: string; kind?: 'rating' | 'fill' | 'prompt'; prompt?: PromptValue; questionType?: 'text' | 'tag'; options?: PerformanceTemplateOption[]; defaultAll?: boolean }
type Content = { type: 'work_summary' | 'rating' | 'custom' | 'prompt'; prompt?: PromptValue; settings?: { allowUnknown?: boolean }; questionType?: 'text' | 'tag'; defaultAll?: boolean; items: ContentItem[]; options?: PerformanceTemplateOption[]; ratingDisplayMode?: '标签样式' | '下拉样式' }
type ItemSettings = { mode: 'fill' | 'hidden' | 'view'; required: boolean; hideName?: boolean; hideDescription?: boolean }

const props = withDefaults(defineProps<{
  content: Content
  variant?: 'configured-card' | 'editor-preview' | 'drawer-summary'
  emptyText?: string
  readonlyEmptyAnswerText?: string
  interactive?: boolean
  selectedItemId?: string | null
  selectionPrefix?: string
  itemSettings?: Record<string, ItemSettings>
}>(), { variant: 'configured-card', emptyText: '请输入内容', readonlyEmptyAnswerText: '', interactive: false, selectedItemId: null, selectionPrefix: '', itemSettings: () => ({}) })
const { content, variant, emptyText, interactive, selectedItemId } = toRefs(props)
defineEmits<{ 'select-item': [itemId: string] }>()
const selectionKey = (itemId: string) => props.selectionPrefix ? `${props.selectionPrefix}:${itemId}` : itemId
const isPromptItem = (item: ContentItem) => item.kind === 'prompt'
const isRatingItem = (item: ContentItem) => item.kind === 'rating' || (content.value.type === 'rating' && item.kind === undefined)
const isFillItem = (item: ContentItem) => !isPromptItem(item) && !isRatingItem(item)
const hasItemSettings = (itemId: string) => {
  const item = content.value.items.find(candidate => candidate.id === itemId)
  return Boolean(item && !isPromptItem(item) && Object.prototype.hasOwnProperty.call(props.itemSettings, itemId))
}
const itemState = (itemId: string): ItemSettings => props.itemSettings[itemId] || { mode: 'fill', required: false }
const isCustomTextItem = (item: ContentItem) => isFillItem(item) && (content.value.type === 'custom' || content.value.type === 'rating' && item.kind === 'fill') && (item.questionType || content.value.questionType || 'text') === 'text'
const isCustomTagItem = (item: ContentItem) => isFillItem(item) && (content.value.type === 'custom' || content.value.type === 'rating' && item.kind === 'fill') && (item.questionType || content.value.questionType || 'text') === 'tag'
const tagField = (item: ContentItem): PerformanceTemplateField => ({ id: item.id, type: 'tag_with_followup', label: item.label, description: item.hint, hide_name: itemState(item.id).hideName === true, hide_description: itemState(item.id).hideDescription === true, required: itemState(item.id).required && itemState(item.id).mode === 'fill', options: item.options ?? content.value.options ?? [] })
const viewField = (item: ContentItem): PerformanceTemplateField => {
  if (isRatingItem(item)) return { id: item.id, type: 'rating', label: item.label, required: false, hide_name: itemState(item.id).hideName === true, options: content.value.options || [], display_mode: content.value.ratingDisplayMode }
  if (isCustomTagItem(item)) return { ...tagField(item), required: false }
  return { id: item.id, type: 'rich_text', label: item.label, required: false, hide_name: itemState(item.id).hideName === true }
}
const viewPreviewValue = (item: ContentItem) => {
  if (isRatingItem(item)) return content.value.options?.[0]?.id || ''
  if (isCustomTagItem(item)) {
    const options = tagField(item).options || []
    return { tags: options.map(option => option.id), notes: Object.fromEntries(options.map(option => [option.id, ''])) }
  }
  return ''
}
const tagPreviewValue = (item: ContentItem) => ({ tags: (item.defaultAll ?? content.value.defaultAll) ? tagField(item).options!.map(option => option.id) : [], notes: {} })
</script>
<style scoped>
.performance-content-renderer{min-width:0;color:#1f2329}
.performance-content-renderer--editor-preview{padding:0 34px 16px}
.content-renderer-prompt{margin:0}
.content-renderer-rating{position:relative;margin:16px 0 0}
.content-renderer-rating__readonly :deep(.performance-template-field){display:flex;align-items:center;gap:8px}.content-renderer-rating__readonly :deep(.template-field-label){margin:0}.content-renderer-rating__readonly :deep(.readonly-rating){min-width:0}
.content-renderer-rating__header{min-height:24px;line-height:24px}.content-renderer-rating__header>strong{font-size:16px;font-weight:600;line-height:24px}.content-renderer-rating__header>i{margin-left:3px;color:#f54a45;font-style:normal}.content-renderer-rating__body{margin-top:12px}.content-renderer-rating--name-hidden .content-renderer-rating__header{display:none}.content-renderer-rating--name-hidden .content-renderer-rating__body{margin-top:0}
.content-renderer-item{position:relative}
.content-renderer-item--view :deep(.readonly-tag-panel){background:var(--performance-review-readonly-surface)}.content-renderer-view-preview{pointer-events:none}
.content-renderer-item--interactive{padding:var(--spacing-2);border:var(--performance-content-item-border-width) solid transparent;border-radius:var(--radius-md);box-sizing:border-box;cursor:pointer}
.content-renderer-item--configured{width:100%;min-height:0;margin:0;padding:var(--performance-readonly-item-padding-block) var(--performance-readonly-item-padding-inline);border-radius:var(--radius-sm)}
.content-renderer-item--configured.content-renderer-rating>strong{line-height:var(--performance-header-title-line-height)}
.content-renderer-item--configured.content-renderer-rating--name-hidden{padding-block:var(--spacing-2)}
.content-renderer-rating--name-hidden .content-renderer-rating__levels{margin-top:0}
.content-renderer-item.is-selected{border-color:#3370ff;box-shadow:none}
.content-renderer-item--configured :deep(.performance-assessment-rich-text-field){margin:0}
.content-renderer-item--configured :deep(.performance-assessment-rich-text-field__label){margin-bottom:3px;font-size:14px;line-height:22px}
.content-renderer-hidden-icon{position:absolute;top:4px;right:8px;z-index:2;display:grid;place-items:center;width:24px;height:24px;padding:4px;border:0;background:transparent;color:#8f959e;pointer-events:none}
.content-renderer-hidden-icon svg{display:block;width:16px;height:16px;overflow:hidden}
.content-renderer-item--hidden :deep(.performance-template-field){opacity:.5;pointer-events:none}
.content-renderer-item--hidden :deep(.performance-assessment-rich-text-field__label),.content-renderer-item--hidden :deep(.performance-rich-text-box),.content-renderer-item--hidden .content-renderer-editor__body{color:#8f959e}
.content-renderer-item--name-hidden :deep(.performance-assessment-rich-text-field__label){display:none}
.content-renderer-item--hidden :deep(.performance-rich-text-box){border-color:#dee0e3;background:#fff;pointer-events:none}
.content-renderer-item--hidden :deep(.performance-rich-toolbar){color:#bbbfc4}
.content-renderer-editor__body{min-height:90px;padding:6px 10px;color:#646a73;font-size:14px;line-height:22px;white-space:pre-wrap}
</style>
