<template>
  <div class="tag-rich-text-input tag-preview__editor" :class="{ 'has-selection': selectedOptions.length, invalid, 'is-display-only': displayOnly }" aria-label="标签填写区域">
    <PerformanceRichTextToolbar v-if="selectedOptions.length && !displayOnly" :readonly="!editable" :active="currentEditor()?.active" @before-command="currentEditor()?.rememberSelection()" @command="currentEditor()?.command($event)" />
    <div class="tag-preview__selected-groups tag-answers">
      <div v-if="legacy && selectedOptions.length" class="tag-preview__selected-group tag-answer legacy-tag-answer">
        <div class="tag-preview__selected selected-tags"><span v-for="option in selectedOptions" :key="option.id" class="tag-preview__selected-tag">{{ option.label }}<button v-if="editable && !displayOnly" type="button" :aria-label="`删除${option.label}`" @click="remove(option.id)">×</button></span></div>
        <slot name="answer" :value="legacyNote"><PerformanceRichTextEditor :ref="element => setEditor('legacy', element)" variant="tag" hide-toolbar input-class="tag-rich-input" :readonly="!editable || displayOnly" :model-value="legacyNote" :placeholder="displayOnly && !legacyNote ? emptyAnswerText : selectedOptions[0]?.placeholder || placeholder" @update:model-value="updateLegacy" @activate="activeId = 'legacy'" @queue-save="$emit('queue-save')" /></slot>
      </div>
      <template v-else>
        <div v-for="option in selectedOptions" :key="option.id" class="tag-preview__selected-group tag-answer">
          <div class="tag-preview__selected"><span class="tag-preview__selected-tag">{{ option.label }}<em v-if="option.required && !displayOnly" aria-label="必填">*</em><button v-if="editable && !displayOnly" type="button" :aria-label="`删除${option.label}`" @click="remove(option.id)">×</button></span></div>
          <slot name="answer" :value="notes[option.id] || ''"><PerformanceRichTextEditor :ref="element => setEditor(option.id, element)" variant="tag" hide-toolbar input-class="tag-rich-input" :readonly="!editable || displayOnly" :model-value="notes[option.id] || ''" :placeholder="displayOnly && !notes[option.id] ? emptyAnswerText : option.placeholder || placeholder" @update:model-value="value => updateNote(option.id, value)" @activate="activeId = option.id" @queue-save="$emit('queue-save')" /></slot>
        </div>
      </template>
    </div>
    <div v-if="!selectedOptions.length && !displayOnly" class="tag-preview__hint tag-editor-placeholder">勾选标签后填写</div>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PerformanceTemplateOption } from '@/api/performance'
import PerformanceRichTextEditor from './PerformanceRichTextEditor.vue'
import PerformanceRichTextToolbar from './PerformanceRichTextToolbar.vue'

const props = withDefaults(defineProps<{ modelValue: unknown; options: PerformanceTemplateOption[]; editable?: boolean; invalid?: boolean; placeholder?: string; displayOnly?: boolean; emptyAnswerText?: string }>(), { editable: true, invalid: false, placeholder: '请输入补充说明', displayOnly: false, emptyAnswerText: '' })
const emit = defineEmits<{ 'update:modelValue': [value: { tags: string[]; notes?: Record<string, string>; note?: string }]; 'queue-save': [] }>()
const selectedTags = computed<string[]>(() => Array.isArray(props.modelValue) ? props.modelValue : (props.modelValue as { tags?: string[] } | undefined)?.tags || [])
const selectedOptions = computed(() => props.options.filter(option => selectedTags.value.includes(option.id)))
const notes = computed(() => (props.modelValue as { notes?: Record<string, string> } | undefined)?.notes || {})
const legacy = computed(() => { const value = props.modelValue; return Boolean(value && !Array.isArray(value) && typeof value === 'object' && 'note' in value && !('notes' in value)) })
const legacyNote = computed(() => (props.modelValue as { note?: string } | undefined)?.note || '')
const activeId = ref('')
const editors: Record<string, InstanceType<typeof PerformanceRichTextEditor>> = {}
function setEditor(id: string, element: unknown) { if (element) editors[id] = element as InstanceType<typeof PerformanceRichTextEditor>; else delete editors[id] }
function currentEditor() { const id = legacy.value ? 'legacy' : selectedOptions.value.some(option => option.id === activeId.value) ? activeId.value : selectedOptions.value[0]?.id; return id ? editors[id] : undefined }
function updateNote(id: string, value: string) { if (props.editable && !props.displayOnly) emit('update:modelValue', { tags: selectedTags.value, notes: { ...notes.value, [id]: value } }) }
function updateLegacy(value: string) { if (props.editable && !props.displayOnly) emit('update:modelValue', { tags: selectedTags.value, note: value }) }
function remove(id: string) { if (props.editable && !props.displayOnly) { const tags = selectedTags.value.filter(tag => tag !== id); emit('update:modelValue', legacy.value ? { tags, note: legacyNote.value } : { tags, notes: notes.value }); emit('queue-save') } }
</script>
<style scoped>
.tag-rich-text-input{display:flex;flex-direction:column;width:100%;min-width:0;max-width:100%;min-height:78px;padding:6px 8px 0;box-sizing:border-box;border:1px solid #dee0e3;border-radius:6px;background:#fff}
.tag-rich-text-input:hover,.tag-rich-text-input:focus-within{border-color:#3370ff}
.tag-rich-text-input.invalid,.tag-rich-text-input.invalid:hover,.tag-rich-text-input.invalid:focus-within{border-color:#f54a45}
.has-selection{min-height:0}.tag-rich-text-input.is-display-only{min-height:0;padding:16px;border:0;background:var(--performance-review-readonly-surface);pointer-events:none}
.tag-rich-text-input> :deep(.performance-rich-toolbar){flex:none;height:32px;gap:0;padding:0 2px 8px 0}
.tag-rich-text-input> :deep(.performance-rich-toolbar button),.tag-rich-text-input> :deep(.performance-rich-toolbar .rich-toolbar-icon){margin:0 4px;border-radius:6px}
.tag-preview__selected-groups{display:flex;flex:none;flex-direction:column;min-width:0;gap:4px}
.tag-preview__selected-group{display:flex;flex-direction:column;min-width:0;max-width:100%;margin-bottom:8px}
.tag-preview__selected{display:flex;flex-wrap:wrap;align-items:center;min-width:0;min-height:24px;margin:0 0 4px;gap:4px}
.tag-preview__selected-tag{display:inline-flex;align-items:center;max-width:100%;padding:0 6px;border-radius:4px;background:rgba(20,86,240,.2);color:#002270;font-size:14px;line-height:22px;overflow-wrap:anywhere}
.tag-preview__selected-group:nth-child(even) .tag-preview__selected-tag{background:rgba(62,195,247,.2);color:#072b3d}
.tag-preview__selected-tag button{flex:none;width:16px;height:16px;margin-left:4px;padding:0;border:0;border-radius:50%;background:transparent;color:currentColor;font-size:16px;line-height:14px;cursor:pointer}
.tag-preview__selected-tag button:hover,.tag-preview__selected-tag button:focus-visible{background:rgba(0,34,112,.12)}
.tag-preview__selected-tag em{margin-left:2px;color:#f54a45;font-style:normal}
.tag-preview__hint{margin:0;color:#8f959e;font-size:14px;line-height:22px}
</style>
