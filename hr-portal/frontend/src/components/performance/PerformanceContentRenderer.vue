<template>
  <div class="performance-content-renderer" :class="`performance-content-renderer--${variant}`">
    <template v-if="content.type === 'rating'">
      <template v-for="item in content.items" :key="item.id">
        <PerformanceContentSelectionFrame
          variant="item"
          class="content-renderer-rating content-renderer-item--interactive"
          :class="{ 'content-renderer-item--selected': selectionKey(item.id) === selectedItemId, 'content-renderer-item--configured': hasItemSettings(item.id), 'content-renderer-item--hidden': hasItemSettings(item.id) && itemState(item.id).mode === 'hidden', 'content-renderer-rating--name-hidden': itemState(item.id).hideName }"
          :selected="selectionKey(item.id) === selectedItemId"
          :data-content-item-id="item.id"
          :aria-disabled="hasItemSettings(item.id) && itemState(item.id).mode === 'hidden'"
          @click="interactive && $emit('select-item', item.id)"
        >
          <button v-if="hasItemSettings(item.id) && itemState(item.id).mode === 'hidden'" class="content-renderer-hidden-icon" type="button" aria-label="在此环节隐藏" tabindex="-1"><PerformanceVisibleLockIcon /></button>
          <div class="content-renderer-rating__header">
            <strong v-if="!itemState(item.id).hideName">{{ item.label }}</strong><i v-if="!itemState(item.id).hideName && (!hasItemSettings(item.id) || itemState(item.id).required)">*</i>
          </div>
          <div class="content-renderer-rating__body">
            <PerformanceRatingControl class="content-renderer-rating__levels" :options="content.options || []" :display-mode="content.ratingDisplayMode" :interactive="false" />
          </div>
        </PerformanceContentSelectionFrame>
      </template>
    </template>
    <template v-else>
      <PerformanceContentSelectionFrame
        v-for="item in content.items"
        :key="item.id"
        variant="item"
        class="content-renderer-item content-renderer-item--interactive"
        :class="{ 'content-renderer-item--selected': selectionKey(item.id) === selectedItemId, 'content-renderer-item--configured': hasItemSettings(item.id), 'content-renderer-item--hidden': itemState(item.id).mode === 'hidden' }"
        :selected="selectionKey(item.id) === selectedItemId"
        :data-content-item-id="item.id"
        :aria-disabled="itemState(item.id).mode === 'hidden'"
        @click="interactive && $emit('select-item', item.id)"
      >
        <button v-if="itemState(item.id).mode === 'hidden'" class="content-renderer-hidden-icon" type="button" aria-label="在此环节隐藏" tabindex="-1"><PerformanceVisibleLockIcon /></button>
        <PerformanceAssessmentRichTextField :label="item.label" :required="itemState(item.id).required && itemState(item.id).mode === 'fill'">
          <PerformanceRichTextBox readonly>
            <div v-if="item.richText" class="content-renderer-editor__body" v-html="item.richText" />
            <div v-else class="content-renderer-editor__body">{{ item.hint || emptyText }}</div>
          </PerformanceRichTextBox>
        </PerformanceAssessmentRichTextField>
      </PerformanceContentSelectionFrame>
    </template>
  </div>
</template>
<script setup lang="ts">
import { toRefs } from 'vue'
import PerformanceRichTextBox from './PerformanceRichTextBox.vue'
import PerformanceAssessmentRichTextField from './PerformanceAssessmentRichTextField.vue'
import PerformanceContentSelectionFrame from './PerformanceContentSelectionFrame.vue'
import PerformanceVisibleLockIcon from './PerformanceVisibleLockIcon.vue'
import PerformanceRatingControl from './PerformanceRatingControl.vue'
type ContentItem = { id: string; label: string; hint?: string; richText?: string }
type Content = { type: 'work_summary' | 'rating' | 'custom'; items: ContentItem[]; options?: Array<{ id: string; label: string; color?: string }>; ratingDisplayMode?: '标签样式' | '下拉样式' }
type ItemSettings = { mode: 'fill' | 'hidden'; required: boolean; hideName?: boolean }
const props = withDefaults(defineProps<{
  content: Content
  variant?: 'configured-card' | 'editor-preview' | 'drawer-summary'
  emptyText?: string
  interactive?: boolean
  selectedItemId?: string | null
  selectionPrefix?: string
  itemSettings?: Record<string, ItemSettings>
}>(), { variant: 'configured-card', emptyText: '请输入内容', interactive: false, selectedItemId: null, selectionPrefix: '', itemSettings: () => ({}) })
const { content, variant, emptyText, interactive, selectedItemId } = toRefs(props)
defineEmits<{ 'select-item': [itemId: string] }>()
const selectionKey = (itemId: string) => props.selectionPrefix ? `${props.selectionPrefix}:${itemId}` : itemId
const hasItemSettings = (itemId: string) => Object.prototype.hasOwnProperty.call(props.itemSettings, itemId)
const itemState = (itemId: string): ItemSettings => props.itemSettings[itemId] || { mode: 'fill', required: false }
</script>
<style scoped>
.performance-content-renderer{min-width:0;color:#1f2329}
.performance-content-renderer--editor-preview{padding:0 34px 16px}
.content-renderer-rating{position:relative;margin:16px 0 0}
.content-renderer-rating__header{min-height:24px;line-height:24px}.content-renderer-rating__header>strong{font-size:16px;font-weight:600;line-height:24px}.content-renderer-rating__header>i{margin-left:3px;color:#f54a45;font-style:normal}.content-renderer-rating__body{margin-top:12px}.content-renderer-rating--name-hidden .content-renderer-rating__header{display:none}.content-renderer-rating--name-hidden .content-renderer-rating__body{margin-top:0}
.content-renderer-item{position:relative}
.content-renderer-item--interactive{padding:8px;border:2px solid transparent;border-radius:6px;box-sizing:border-box;cursor:pointer}
.content-renderer-item--configured{width:100%;min-height:185.333px;margin:0;padding:16px 22px 10.333px;border-radius:4px}
.content-renderer-item--configured.content-renderer-rating{min-height:92px;margin:0;padding:16px 22px 10.333px}
.content-renderer-item--configured.content-renderer-rating>strong{line-height:24px}
.content-renderer-item--configured.content-renderer-rating--name-hidden{min-height:62px;margin:0;padding:0 22px 10.333px}
.content-renderer-rating--name-hidden .content-renderer-rating__levels{margin-top:0}
.content-renderer-item.is-selected{border-color:#3370ff;box-shadow:none}
.content-renderer-item--configured :deep(.performance-assessment-rich-text-field){margin:0}
.content-renderer-item--configured :deep(.performance-assessment-rich-text-field__label){margin-bottom:3px;font-size:14px;line-height:22px}
.content-renderer-hidden-icon{position:absolute;top:4px;right:8px;z-index:2;display:grid;place-items:center;width:24px;height:24px;padding:4px;border:0;background:transparent;color:#8f959e;pointer-events:none}
.content-renderer-hidden-icon svg{display:block;width:16px;height:16px;overflow:hidden}
.content-renderer-item--hidden :deep(.performance-assessment-rich-text-field__label),.content-renderer-item--hidden :deep(.performance-rich-text-box),.content-renderer-item--hidden .content-renderer-editor__body{color:#8f959e}
.content-renderer-item--hidden :deep(.performance-rich-text-box){border-color:#dee0e3;background:#fff;pointer-events:none}
.content-renderer-item--hidden :deep(.performance-rich-toolbar){color:#bbbfc4}
.content-renderer-editor__body{min-height:90px;padding:6px 10px;color:#646a73;font-size:14px;line-height:22px;white-space:pre-wrap}
</style>
