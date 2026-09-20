<template>
  <form v-if="mode === 'edit'" ref="formRef" class="performance-template-renderer performance-template-renderer--edit self-summary-form" novalidate @submit.prevent="$emit('submit')">
    <h1 v-if="title">{{ title }}</h1>
    <PerformanceTemplateSection v-for="section in sections" :key="section.id" :section="section" :instance-keys="instanceKeys(section)" :editable="editable" mode="edit" @add="addInstance(section)" @remove="index => removeInstance(section, index)">
      <template #default="{ index }"><PerformanceTemplateFieldRenderer v-for="field in section.fields" :key="field.id" :data-field-id="fieldErrorKey(section, field, index)" mode="edit" :field="field" :value="fieldValue(section, field, index)" :label="displayFieldLabel(section, field, index)" :editable="editable" :invalid="Boolean(errors[fieldErrorKey(section, field, index)])" :error="errors[fieldErrorKey(section, field, index)]" @update:value="value => setFieldValue(section, field, index, value)" @queue-save="$emit('queue-save')" /></template>
    </PerformanceTemplateSection>
  </form>
  <div v-else class="performance-template-renderer performance-template-renderer--readonly">
    <PerformanceTemplateSection v-for="section in sections" :key="section.id" :section="section" :instance-keys="instanceKeys(section)" :editable="false" mode="readonly">
      <template #default="{ index }"><PerformanceTemplateFieldRenderer v-for="field in section.fields" :key="field.id" :data-field-id="fieldErrorKey(section, field, index)" mode="readonly" :field="field" :value="fieldValue(section, field, index)" :label="displayFieldLabel(section, field, index)" /></template>
    </PerformanceTemplateSection>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import type { PerformanceTemplateField, PerformanceTemplateSection as TemplateSection } from '@/api/performance'
import PerformanceTemplateFieldRenderer from './PerformanceTemplateFieldRenderer.vue'
import PerformanceTemplateSection from './PerformanceTemplateSection.vue'
import { performanceTemplateAddedInstance, performanceTemplateFieldErrorKey, performanceTemplateFieldValue, performanceTemplateInstanceCount, performanceTemplateRemovedInstance, performanceTemplateUpdatedFieldValue } from './performanceTemplateAnswers'

const props = withDefaults(defineProps<{ mode: 'edit' | 'readonly'; title?: string; sections: TemplateSection[]; answers: Record<string, unknown>; errors?: Record<string, string>; editable?: boolean }>(), { title: '', errors: () => ({}), editable: false })
const emit = defineEmits<{ 'update-answer': [id: string, value: unknown]; 'queue-save': []; submit: [] }>()
const formRef = ref<HTMLFormElement | null>(null)
function instanceKeys(section: TemplateSection) { return Array.from({ length: performanceTemplateInstanceCount(section, props.answers) }, (_, index) => `${section.id}:${index}`) }
function fieldValue(section: TemplateSection, field: PerformanceTemplateField, index: number) { return performanceTemplateFieldValue(section, field, index, props.answers) }
function fieldErrorKey(section: TemplateSection, field: PerformanceTemplateField, index: number) { return performanceTemplateFieldErrorKey(section, field, index) }
function displayFieldLabel(section: TemplateSection, field: PerformanceTemplateField, index: number) { return section.allow_multiple ? `${field.label} ${index + 1}` : field.label }
function updateAnswers(patch: Record<string, unknown>) { Object.entries(patch).forEach(([id, value]) => emit('update-answer', id, value)); emit('queue-save') }
function setFieldValue(section: TemplateSection, field: PerformanceTemplateField, index: number, value: unknown) { if (props.editable) updateAnswers({ [field.id]: performanceTemplateUpdatedFieldValue(section, field, index, value, props.answers) }) }
function addInstance(section: TemplateSection) { if (props.editable) updateAnswers(performanceTemplateAddedInstance(section, props.answers)) }
function removeInstance(section: TemplateSection, index: number) { if (props.editable && performanceTemplateInstanceCount(section, props.answers) > 1) updateAnswers(performanceTemplateRemovedInstance(section, index, props.answers)) }
function selectorValue(value: string) { return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&') }
function focusField(id: string) { const field = formRef.value?.querySelector(`[data-field-id="${selectorValue(id)}"]`) as HTMLElement | null; field?.scrollIntoView({ behavior: 'smooth', block: 'center' }); window.setTimeout(() => (field?.querySelector('button:not([disabled]), input:not([disabled]), [contenteditable="true"]') as HTMLElement | null)?.focus(), 250) }
defineExpose({ focusField })
</script>
<style scoped>
.performance-template-renderer--edit{width:calc(100vw - 24px);min-height:100%;padding:12px 30px;box-sizing:border-box;border-radius:8px;background:#fff;color:#1f2329;font:400 14px/21px var(--font-sans)}.performance-template-renderer--edit h1{margin:0 0 16px;font-size:16px;font-weight:600;line-height:24px}.performance-template-renderer--readonly{width:100%;color:#1f2329}
</style>
