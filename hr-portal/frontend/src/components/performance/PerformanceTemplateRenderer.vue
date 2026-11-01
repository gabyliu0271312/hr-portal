<template>
  <component :is="mode === 'edit' ? 'form' : 'div'" ref="formRef" class="performance-template-renderer" :class="mode === 'edit' ? 'performance-template-renderer--edit self-summary-form' : 'performance-template-renderer--readonly'" novalidate @submit.prevent="$emit('submit')">
    <h1 v-if="mode === 'edit' && title">{{ title }}</h1>
    <PerformanceTemplateSection v-for="section in visibleSections" :key="section.id" :section="section" :instance-keys="instanceKeys(section)" :editable="mode === 'edit' && editable && section.fields.length > 0" :mode="mode" @add="addInstance(section)" @remove="index => removeInstance(section, index)">
      <template #default="{ index }">
        <template v-for="element in displayElements(section)" :key="`${element.kind}:${element.id}`">
          <PerformancePromptDisplay v-if="element.kind === 'prompt'" class="template-content-prompt" :data-prompt-id="element.id" :value="element.prompt" />
          <PerformanceTemplateFieldRenderer v-else :data-field-id="fieldErrorKey(section, element.field, index)" :mode="mode === 'readonly' || element.field.readonly ? 'readonly' : 'edit'" :field="displayField(section, element.field, index)" :value="fieldValue(section, element.field, index)" :label="displayFieldLabel(section, element.field, index)" :editable="mode === 'edit' && editable && !element.field.readonly && (!performanceTemplateInstanceUnknown(section, index, answers) || element.field.type === 'rating')" :invalid="mode === 'edit' && !element.field.readonly && !performanceTemplateInstanceUnknown(section, index, answers) && Boolean(errors[fieldErrorKey(section, element.field, index)])" :error="errors[fieldErrorKey(section, element.field, index)]" @update:value="value => setFieldValue(section, element.field, index, value)" @queue-save="$emit('queue-save')" />
        </template>
      </template>
    </PerformanceTemplateSection>
  </component>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PerformancePromptValue, PerformanceTemplateField, PerformanceTemplateSection as TemplateSection } from '@/api/performance'
import PerformanceTemplateFieldRenderer from './PerformanceTemplateFieldRenderer.vue'
import PerformanceTemplateSection from './PerformanceTemplateSection.vue'
import PerformancePromptDisplay from './PerformancePromptDisplay.vue'
import { performanceTemplateAddedInstance, performanceTemplateFieldErrorKey, performanceTemplateFieldValue, performanceTemplateInstanceCount, performanceTemplateInstanceUnknown, performanceTemplateRemovedInstance, performanceTemplateUpdatedFieldValue } from './performanceTemplateAnswers'

const props = withDefaults(defineProps<{ mode: 'edit' | 'readonly'; title?: string; sections: TemplateSection[]; answers: Record<string, unknown>; errors?: Record<string, string>; editable?: boolean }>(), { title: '', errors: () => ({}), editable: false })
const emit = defineEmits<{ 'update-answer': [id: string, value: unknown]; 'queue-save': []; submit: [] }>()
const formRef = ref<HTMLFormElement | null>(null)
type DisplayElement = { kind: 'field'; id: string; field: PerformanceTemplateField } | { kind: 'prompt'; id: string; prompt: PerformancePromptValue }
function displayElements(section: TemplateSection): DisplayElement[] {
  return (section.elements ?? section.fields.map(field => ({ kind: 'field' as const, id: field.id }))).flatMap((element): DisplayElement[] => {
    if (element.kind === 'prompt') return element.prompt.allowView === false || (element.prompt.onlyWhenFilling && (props.mode !== 'edit' || !props.editable)) ? [] : [element]
    const field = section.fields.find(field => field.id === element.id)
    return field ? [{ ...element, field }] : []
  })
}
const visibleSections = computed(() => props.sections.filter(section => displayElements(section).length > 0))
function instanceKeys(section: TemplateSection) { return Array.from({ length: performanceTemplateInstanceCount(section, props.answers) }, (_, index) => `${section.id}:${index}`) }
function fieldValue(section: TemplateSection, field: PerformanceTemplateField, index: number) { return performanceTemplateFieldValue(section, field, index, props.answers) }
function fieldErrorKey(section: TemplateSection, field: PerformanceTemplateField, index: number) { return performanceTemplateFieldErrorKey(section, field, index) }
function displayField(section: TemplateSection, field: PerformanceTemplateField, index: number) { return performanceTemplateInstanceUnknown(section, index, props.answers) ? { ...field, required: false } : field }
function displayFieldLabel(section: TemplateSection, field: PerformanceTemplateField, index: number) { return section.allow_multiple ? `${field.label} ${index + 1}` : field.label }
function updateAnswers(patch: Record<string, unknown>) { Object.entries(patch).forEach(([id, value]) => emit('update-answer', id, value)); emit('queue-save') }
function setFieldValue(section: TemplateSection, field: PerformanceTemplateField, index: number, value: unknown) { if (props.mode === 'edit' && props.editable && !field.readonly) updateAnswers({ [field.id]: performanceTemplateUpdatedFieldValue(section, field, index, value, props.answers) }) }
function addInstance(section: TemplateSection) { if (props.mode === 'edit' && props.editable) updateAnswers(performanceTemplateAddedInstance(section, props.answers)) }
function removeInstance(section: TemplateSection, index: number) { if (props.mode === 'edit' && props.editable && performanceTemplateInstanceCount(section, props.answers) > 1) updateAnswers(performanceTemplateRemovedInstance(section, index, props.answers)) }
function selectorValue(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&') }
function focusField(id: string) { const field = formRef.value?.querySelector(`[data-field-id="${selectorValue(id)}"]`) as HTMLElement | null; field?.scrollIntoView({ behavior: 'smooth', block: 'center' }); window.setTimeout(() => ((field?.querySelector('[contenteditable="true"]') || field?.querySelector('input:not([disabled]), textarea:not([disabled])') || field?.querySelector('button:not([disabled])')) as HTMLElement | null)?.focus(), 250) }
defineExpose({ focusField })
</script>
<style scoped>
.performance-template-renderer--edit{width:100%;min-width:0;max-width:100%;min-height:100%;padding:12px 30px;box-sizing:border-box;border-radius:8px;background:#fff;color:#1f2329;font:400 14px/21px var(--font-sans)}.performance-template-renderer--edit h1{margin:0 0 16px;font-size:16px;font-weight:600;line-height:24px}.performance-template-renderer--readonly{width:100%;color:#1f2329}
.template-content-prompt{margin-block:12px}
</style>
