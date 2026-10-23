<template>
  <div class="performance-template-field summary-field" :class="{ invalid, 'performance-template-field--tag': field.type === 'tag_with_followup', 'readonly-field-rating': mode === 'readonly' && field.type === 'rating' }">
    <div v-if="!field.hide_name" class="template-field-label field-label" :class="{ 'readonly-label': mode === 'readonly' }"><strong><span>{{ label }}</span></strong><em v-if="mode === 'edit' && field.required" aria-label="必填">*</em></div>
    <p v-if="field.type === 'tag_with_followup' && field.description && !field.hide_description" class="template-field-description tag-preview__description">{{ field.description }}</p>
    <p v-if="!registered" class="unsupported-template-field" role="alert">不支持的填写类型</p>
    <template v-else>
    <template v-if="mode === 'readonly'">
      <template v-if="field.type === 'tag_with_followup'">
        <div class="readonly-tag-panel"><template v-if="isLegacyTagAnswer"><div class="readonly-tags"><span v-for="(tag, tagIndex) in selectedTagOptions" :key="tag.id" :class="`tag-tone-${tagIndex}`">{{ tag.label }}</span></div><div class="readonly-answer rich-answer" v-html="safeHtml(legacyTagNote)" /></template><template v-else><div v-for="(tag, tagIndex) in selectedTagOptions" :key="tag.id" class="readonly-tag-note"><span :class="`tag-tone-${tagIndex}`">{{ tag.label }}</span><div class="readonly-answer rich-answer" v-html="safeHtml(tagNotes[tag.id])" /></div></template></div>
      </template>
      <div v-else-if="field.type === 'rating'" class="readonly-rating"><span class="readonly-rating-badge" :style="ratingStyle">{{ value === '__unknown__' ? '不了解' : selectedOption?.label || String(value || '—') }}</span><span v-if="selectedOption?.description" class="readonly-rating-description">{{ selectedOption.description }}</span></div>
      <div v-else-if="field.type === 'rich_text'" class="readonly-answer rich-answer" v-html="safeHtml(value)" />
      <p v-else class="unsupported-template-field" role="alert">不支持的填写类型</p>
    </template>
    <template v-else-if="field.type === 'rich_text'">
      <PerformanceRichTextEditor variant="task-entry" :class="{ invalid }" :readonly="!editable" :model-value="String(value || '')" :placeholder="field.placeholder || '提示'" @update:model-value="$emit('update:value', $event)" @queue-save="$emit('queue-save')" />
    </template>
    <template v-else-if="field.type === 'rating'">
      <div class="rating-field"><PerformanceRatingControl :model-value="String(value || '')" :options="field.options || []" :allow-unknown="field.allow_unknown === true" :display-mode="field.display_mode" :interactive="editable" :invalid="invalid" :aria-label="field.label" @update:model-value="$emit('update:value', $event)" /><span v-if="!field.options?.length" class="empty-options">暂无可用评级选项</span></div>
    </template>
    <template v-else-if="field.type === 'tag_with_followup'">
      <div :class="['tag-followup', { invalid }]">
        <div class="tag-options tag-checks"><PerformanceCheckbox v-for="option in field.options || []" :key="option.id" :model-value="selectedTags.includes(option.id)" :label="option.label" :disabled="!editable" @update:model-value="checked => toggleTag(option.id, checked)" /><span v-if="!field.options?.length" class="empty-options">暂无可用标签选项</span></div>
        <PerformanceTagRichTextInput :model-value="value" :options="field.options || []" :editable="editable" :invalid="invalid" :placeholder="field.placeholder || '请输入补充说明'" @update:model-value="$emit('update:value', $event)" @queue-save="$emit('queue-save')" />
      </div>
    </template>
    <p v-if="mode === 'edit' && invalid" class="field-error">{{ error }}</p>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceTemplateField } from '@/api/performance'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceRatingControl from './PerformanceRatingControl.vue'
import PerformanceRichTextEditor from './PerformanceRichTextEditor.vue'
import PerformanceTagRichTextInput from './PerformanceTagRichTextInput.vue'
import { isRegisteredPerformanceTemplateField } from './performanceTemplateFieldRegistry'

const props = withDefaults(defineProps<{ mode: 'edit' | 'readonly'; field: PerformanceTemplateField; value: unknown; label: string; editable?: boolean; invalid?: boolean; error?: string }>(), { editable: false, invalid: false, error: '' })
const emit = defineEmits<{ 'update:value': [value: unknown]; 'queue-save': [] }>()
const registered = computed(() => isRegisteredPerformanceTemplateField(props.field, props.mode))
const selectedTags = computed(() => Array.isArray(props.value) ? props.value as string[] : (props.value as { tags?: string[] } | undefined)?.tags || [])
const tagNotes = computed(() => (props.value as { notes?: Record<string, string> } | undefined)?.notes || {})
const legacyTagNote = computed(() => (props.value as { note?: string } | undefined)?.note || '')
const isLegacyTagAnswer = computed(() => { const value = props.value as { note?: string; notes?: Record<string, string> } | undefined; return Boolean(value && !Array.isArray(value) && 'note' in value && !('notes' in value)) })
const selectedTagOptions = computed(() => { const selected = new Set(selectedTags.value); return (props.field.options || []).filter(option => selected.has(option.id)) })
const selectedOption = computed(() => props.field.options?.find(option => option.id === String(props.value || '')))
const ratingStyle = computed(() => selectedOption.value?.color ? { '--rating-background': selectedOption.value.color } : undefined)
function safeHtml(value: unknown) { const template = document.createElement('template'); template.innerHTML = String(value || ''); template.content.querySelectorAll('script,style,iframe,object,embed').forEach(node => node.remove()); const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'OL', 'UL', 'LI', 'A', 'P', 'DIV', 'BR', 'SPAN']); Array.from(template.content.querySelectorAll('*')).forEach(element => { if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); return }; Array.from(element.attributes).forEach(attribute => { if (element.tagName !== 'A' || attribute.name !== 'href') element.removeAttribute(attribute.name) }); if (element.tagName === 'A') { const href = element.getAttribute('href') || ''; if (!/^(https?:|mailto:)/i.test(href)) element.removeAttribute('href'); else element.setAttribute('rel', 'noopener noreferrer') } }); return template.innerHTML }
function toggleTag(tag: string, checked: boolean) { if (!props.editable) return; const tags = selectedTags.value.filter(item => item !== tag); if (checked) tags.push(tag); emit('update:value', isLegacyTagAnswer.value ? { tags, note: legacyTagNote.value } : { tags, notes: tagNotes.value }) }
</script>
<style scoped>
.template-field-description{margin:4px 0 8px;color:var(--color-text-secondary);font-size:14px;line-height:22px;white-space:pre-wrap;overflow-wrap:anywhere}
.performance-template-field--tag .template-field-label{margin-bottom:8px}.performance-template-field--tag .template-field-label:has(+.template-field-description){margin-bottom:0}.template-field-label strong{min-width:0;font:inherit;overflow-wrap:anywhere}
.tag-options{display:flex;flex-wrap:wrap;gap:0 24px;margin:0 0 12px;padding:4px 12px 12px;box-sizing:border-box;border-radius:8px;background:#f8f9fa}.tag-options :deep(.performance-checkbox){width:auto;max-width:100%;height:auto;min-height:22px;margin-top:8px;align-items:flex-start}.tag-options :deep(.performance-checkbox__label){min-width:0;height:auto;flex:0 1 auto;overflow-wrap:anywhere}
.performance-template-field{min-width:0;max-width:100%;margin-bottom:16px}.performance-template-field:last-child{margin-bottom:0}.template-field-label{display:flex;align-items:center;margin-bottom:8px;color:#1f2329;font-size:14px;font-weight:600;line-height:22px}.template-field-label em{margin-left:2px;color:#f54a45;font-style:normal}:deep(.performance-rich-text-box.invalid),.tag-followup.invalid{border-color:#f54a45}.rating-field{min-width:0}.tag-followup{min-width:0}.selected-tags,.readonly-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}.selected-tags span,.readonly-tags span{padding:0 6px;border-radius:4px;background:rgba(20,86,240,.2);color:#002270;font-size:14px;line-height:22px}.empty-options{color:#8f959e;font-size:14px}.field-error{margin:6px 0 0;color:#f54a45;font-size:12px;line-height:18px}.readonly-field-rating{display:flex;align-items:center;min-height:24px;gap:8px}.readonly-field-rating .template-field-label{margin-bottom:0}.readonly-answer{min-height:22px;color:#1f2329;font-size:14px;line-height:22px;white-space:pre-wrap;word-break:break-word}.rich-answer{padding:16px;box-sizing:border-box;background:var(--performance-review-readonly-surface);border-radius:6px}.rich-answer :deep(p){margin:0}.rich-answer :deep(ol),.rich-answer :deep(ul){margin:0;padding-left:22px}.rich-answer :deep(li){min-height:22px}.rich-answer :deep(a){color:#3370ff}.readonly-rating{display:flex;min-width:0;align-items:center;overflow:hidden;color:#124b0c;font-size:14px;line-height:22px;white-space:nowrap}.readonly-rating-badge{display:flex;min-width:44px;max-width:100%;align-items:center;justify-content:center;padding:0 10px;box-sizing:border-box;border-radius:9999px;background:var(--rating-background,#d9f5d6);color:#124b0c;line-height:22px}.readonly-rating-description{display:inline-block;margin-left:8px;overflow:hidden;text-overflow:ellipsis;color:#124b0c}.readonly-tag-panel{display:flex;flex-direction:column;padding:16px;box-sizing:border-box;background:var(--performance-review-readonly-surface);border-radius:8px}.readonly-tags{gap:0 8px}.readonly-tags span.tag-tone-1,.readonly-tags span.tag-tone-3{background:rgba(62,195,247,.2);color:#072b3d}.readonly-tag-panel .rich-answer{padding:0;background:transparent;border-radius:0}
</style>
