<template>
  <div class="performance-template-field summary-field" :class="{ invalid, 'readonly-field-rating': mode === 'readonly' && field.type === 'rating' }">
    <div class="template-field-label field-label" :class="{ 'readonly-label': mode === 'readonly' }"><span>{{ label }}</span><em v-if="mode === 'edit' && field.required" aria-label="必填">*</em></div>
    <p v-if="!registered" class="unsupported-template-field" role="alert">不支持的填写类型</p>
    <template v-else>
    <template v-if="mode === 'readonly'">
      <template v-if="field.type === 'tag_with_followup'">
        <div class="readonly-tag-panel"><template v-if="isLegacyTagAnswer"><div class="readonly-tags"><span v-for="(tag, tagIndex) in selectedTagOptions" :key="tag.id" :class="`tag-tone-${tagIndex}`">{{ tag.label }}</span></div><div class="readonly-answer rich-answer" v-html="safeHtml(legacyTagNote)" /></template><template v-else><div v-for="(tag, tagIndex) in selectedTagOptions" :key="tag.id" class="readonly-tag-note"><span :class="`tag-tone-${tagIndex}`">{{ tag.label }}</span><div class="readonly-answer rich-answer" v-html="safeHtml(tagNotes[tag.id])" /></div></template></div>
      </template>
      <div v-else-if="field.type === 'rating'" class="readonly-rating"><span class="readonly-rating-badge" :style="ratingStyle">{{ selectedOption?.label || String(value || '—') }}</span><span v-if="selectedOption?.description" class="readonly-rating-description">{{ selectedOption.description }}</span></div>
      <div v-else-if="field.type === 'rich_text'" class="readonly-answer rich-answer" v-html="safeHtml(value)" />
      <p v-else class="unsupported-template-field" role="alert">不支持的填写类型</p>
    </template>
    <template v-else-if="field.type === 'rich_text'">
      <PerformanceRichTextBox variant="task-entry" :class="{ invalid }" :readonly="!editable" @command="applyCommand">
        <div ref="richEditor" class="rich-input" :contenteditable="editable" :data-placeholder="field.placeholder || '提示'" @input="updateRich" @blur="$emit('queue-save')" v-rich-html="String(value || '')" />
      </PerformanceRichTextBox>
    </template>
    <template v-else-if="field.type === 'rating'">
      <div class="rating-field"><PerformanceRatingControl :model-value="String(value || '')" :options="field.options || []" :display-mode="field.display_mode" :interactive="editable" :invalid="invalid" :aria-label="field.label" @update:model-value="$emit('update:value', $event)" /><span v-if="!field.options?.length" class="empty-options">暂无可用评级选项</span></div>
    </template>
    <template v-else-if="field.type === 'tag_with_followup'">
      <div :class="['tag-followup', { invalid }]">
        <div class="tag-options"><PerformanceCheckbox v-for="option in field.options || []" :key="option.id" :model-value="selectedTags.includes(option.id)" :label="option.label" :disabled="!editable" @update:model-value="checked => toggleTag(option.id, checked)" /><span v-if="!field.options?.length" class="empty-options">暂无可用标签选项</span></div>
        <div v-if="selectedTags.length" class="tag-answers"><template v-if="isLegacyTagAnswer"><div class="tag-answer legacy-tag-answer"><div class="selected-tags"><span v-for="tag in selectedTagOptions" :key="tag.id">{{ tag.label }}</span></div><PerformanceRichTextBox :readonly="!editable" @command="command => applyCommand(command, undefined, true)"><div ref="tagEditor" class="rich-input tag-rich-input" :contenteditable="editable" :data-placeholder="tagPlaceholder" @input="updateLegacyTag" @blur="$emit('queue-save')" v-rich-html="legacyTagNote" /></PerformanceRichTextBox></div></template><div v-else v-for="tag in selectedTagOptions" :key="tag.id" class="tag-answer"><div class="tag-answer-label">{{ tag.label }}<em v-if="tag.required" aria-label="必填">*</em></div><PerformanceRichTextBox :readonly="!editable" @command="command => applyCommand(command, tag.id)"><div :ref="element => setTagEditor(tag.id, element)" class="rich-input tag-rich-input" :contenteditable="editable" :data-placeholder="tag.placeholder || field.placeholder || '请输入补充说明'" @input="event => updateTag(tag.id, event)" @blur="$emit('queue-save')" v-rich-html="tagNotes[tag.id]" /></PerformanceRichTextBox></div></div>
        <div v-else class="tag-editor-placeholder">勾选标签后填写</div>
      </div>
    </template>
    <p v-if="mode === 'edit' && invalid" class="field-error">{{ error }}</p>
    </template>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, type Directive } from 'vue'
import type { PerformanceTemplateField } from '@/api/performance'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceRatingControl from './PerformanceRatingControl.vue'
import PerformanceRichTextBox from './PerformanceRichTextBox.vue'
import { isRegisteredPerformanceTemplateField } from './performanceTemplateFieldRegistry'

type CommandKey = 'bold' | 'italic' | 'underline' | 'insertOrderedList' | 'insertUnorderedList' | 'link'
const props = withDefaults(defineProps<{ mode: 'edit' | 'readonly'; field: PerformanceTemplateField; value: unknown; label: string; editable?: boolean; invalid?: boolean; error?: string }>(), { editable: false, invalid: false, error: '' })
const emit = defineEmits<{ 'update:value': [value: unknown]; 'queue-save': [] }>()
const registered = computed(() => isRegisteredPerformanceTemplateField(props.field, props.mode))
const richEditor = ref<HTMLElement | null>(null)
const tagEditor = ref<HTMLElement | null>(null)
const tagEditors = ref<Record<string, HTMLElement>>({})
const selectedTags = computed(() => Array.isArray(props.value) ? props.value as string[] : (props.value as { tags?: string[] } | undefined)?.tags || [])
const tagNotes = computed(() => (props.value as { notes?: Record<string, string> } | undefined)?.notes || {})
const legacyTagNote = computed(() => (props.value as { note?: string } | undefined)?.note || '')
const isLegacyTagAnswer = computed(() => { const value = props.value as { note?: string; notes?: Record<string, string> } | undefined; return Boolean(value && !Array.isArray(value) && 'note' in value && !('notes' in value)) })
const selectedTagOptions = computed(() => { const selected = new Set(selectedTags.value); return (props.field.options || []).filter(option => selected.has(option.id)) })
const selectedOption = computed(() => props.field.options?.find(option => option.id === String(props.value || '')))
const tagPlaceholder = computed(() => selectedTagOptions.value[0]?.placeholder || props.field.placeholder || '请输入补充说明')
const ratingStyle = computed(() => selectedOption.value?.color ? { '--rating-background': selectedOption.value.color } : undefined)
const vRichHtml: Directive<HTMLElement, string> = { mounted: (element, binding) => { element.innerHTML = safeHtml(binding.value) }, updated: (element, binding) => { if (document.activeElement !== element) element.innerHTML = safeHtml(binding.value) } }
function safeHtml(value: unknown) { const template = document.createElement('template'); template.innerHTML = String(value || ''); template.content.querySelectorAll('script,style,iframe,object,embed').forEach(node => node.remove()); const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'OL', 'UL', 'LI', 'A', 'P', 'DIV', 'BR', 'SPAN']); Array.from(template.content.querySelectorAll('*')).forEach(element => { if (!allowed.has(element.tagName)) { element.replaceWith(...Array.from(element.childNodes)); return }; Array.from(element.attributes).forEach(attribute => { if (element.tagName !== 'A' || attribute.name !== 'href') element.removeAttribute(attribute.name) }); if (element.tagName === 'A') { const href = element.getAttribute('href') || ''; if (!/^(https?:|mailto:)/i.test(href)) element.removeAttribute('href'); else element.setAttribute('rel', 'noopener noreferrer') } }); return template.innerHTML }
function updateRich(event: Event) { emit('update:value', safeHtml((event.target as HTMLElement).innerHTML)) }
function setTagEditor(tag: string, element: unknown) { if (element instanceof HTMLElement) tagEditors.value[tag] = element; else delete tagEditors.value[tag] }
function updateTag(tag: string, event: Event) { emit('update:value', { tags: selectedTags.value, notes: { ...tagNotes.value, [tag]: safeHtml((event.target as HTMLElement).innerHTML) } }) }
function updateLegacyTag(event: Event) { emit('update:value', { tags: selectedTags.value, note: safeHtml((event.target as HTMLElement).innerHTML) }) }
function toggleTag(tag: string, checked: boolean) { const tags = selectedTags.value.filter(item => item !== tag); if (checked) tags.push(tag); emit('update:value', isLegacyTagAnswer.value ? { tags, note: legacyTagNote.value } : { tags, notes: tagNotes.value }) }
function applyCommand(command: CommandKey, tag?: string, legacy = false) { if (!props.editable) return; const editor = legacy ? tagEditor.value : tag ? tagEditors.value[tag] : richEditor.value; editor?.focus(); if (command === 'link') { const url = window.prompt('请输入链接'); if (url && /^(https?:|mailto:)/i.test(url)) document.execCommand('createLink', false, url) } else document.execCommand(command, false); if (!editor) return; if (legacy) emit('update:value', { tags: selectedTags.value, note: safeHtml(editor.innerHTML) }); else if (tag) emit('update:value', { tags: selectedTags.value, notes: { ...tagNotes.value, [tag]: safeHtml(editor.innerHTML) } }); else emit('update:value', safeHtml(editor.innerHTML)) }
</script>
<style scoped>
.performance-template-field{margin-bottom:16px}.performance-template-field:last-child{margin-bottom:0}.template-field-label{display:flex;align-items:center;margin-bottom:8px;color:#1f2329;font-size:14px;font-weight:600;line-height:22px}.template-field-label em{margin-left:2px;color:#f54a45;font-style:normal}.rich-input{min-height:88px;padding:4px 11px;box-sizing:border-box;outline:0;color:#1f2329;font-size:14px;line-height:22px;white-space:pre-wrap}.rich-input:empty::before{color:#8f959e;content:attr(data-placeholder)}:deep(.performance-rich-text-box.invalid),.tag-followup.invalid{border-color:#f54a45}.rating-field{min-width:0}.tag-followup{padding:0;border:1px solid transparent}.tag-options{display:flex;flex-wrap:wrap;gap:8px 24px;margin-bottom:12px}.tag-options :deep(.performance-checkbox){width:auto}.tag-answers{display:flex;flex-direction:column;gap:8px}.tag-answer{padding:6px 8px 8px;border:1px solid #dee0e3;border-radius:6px}.tag-answer :deep(.performance-rich-text-box){border:0}.tag-answer-label{margin:0 0 4px;color:#1f2329;font-size:14px;font-weight:600;line-height:22px}.tag-answer-label em{margin-left:2px;color:#f54a45;font-style:normal}.selected-tags,.readonly-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:4px}.selected-tags span,.readonly-tags span{padding:0 6px;border-radius:4px;background:rgba(20,86,240,.2);color:#002270;font-size:14px;line-height:22px}.tag-rich-input{min-height:70px}.tag-editor-placeholder{min-height:102px;padding:10px 8px;box-sizing:border-box;border:1px solid #dee0e3;border-radius:6px;color:#8f959e}.empty-options{color:#8f959e;font-size:14px}.field-error{margin:6px 0 0;color:#f54a45;font-size:12px;line-height:18px}.readonly-field-rating{display:flex;align-items:center;min-height:24px;gap:8px}.readonly-field-rating .template-field-label{margin-bottom:0}.readonly-answer{min-height:22px;color:#1f2329;font-size:14px;line-height:22px;white-space:pre-wrap;word-break:break-word}.rich-answer{padding:16px;box-sizing:border-box;background:var(--performance-review-readonly-surface);border-radius:6px}.rich-answer :deep(p){margin:0}.rich-answer :deep(ol),.rich-answer :deep(ul){margin:0;padding-left:22px}.rich-answer :deep(li){min-height:22px}.rich-answer :deep(a){color:#3370ff}.readonly-rating{display:flex;min-width:0;align-items:center;overflow:hidden;color:#124b0c;font-size:14px;line-height:22px;white-space:nowrap}.readonly-rating-badge{display:flex;min-width:44px;max-width:100%;align-items:center;justify-content:center;padding:0 10px;box-sizing:border-box;border-radius:9999px;background:var(--rating-background,#d9f5d6);color:#124b0c;line-height:22px}.readonly-rating-description{display:inline-block;margin-left:8px;overflow:hidden;text-overflow:ellipsis;color:#124b0c}.readonly-tag-panel{display:flex;flex-direction:column;padding:16px;box-sizing:border-box;background:var(--performance-review-readonly-surface);border-radius:8px}.readonly-tags{gap:0 8px}.readonly-tags span.tag-tone-1,.readonly-tags span.tag-tone-3{background:rgba(62,195,247,.2);color:#072b3d}.readonly-tag-panel .rich-answer{padding:0;background:transparent;border-radius:0}
</style>
