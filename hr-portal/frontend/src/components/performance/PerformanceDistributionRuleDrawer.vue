<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { PerformanceDistributionAssessmentOption, PerformanceDistributionRule } from '@/api/performance'
import PerformanceDistributionRuleEditor from './PerformanceDistributionRuleEditor.vue'
import PerformanceDrawerFooter from './PerformanceDrawerFooter.vue'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  assessmentOptions?: PerformanceDistributionAssessmentOption[]
  usedAssessmentIds?: string[]
  initialValue?: PerformanceDistributionRule | null
  saving?: boolean
  saveError?: string
}>(), { assessmentOptions: () => [], usedAssessmentIds: () => [], initialValue: null, saving: false, saveError: '' })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; confirm: [value: PerformanceDistributionRule]; cancel: [] }>()
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const submitted = ref(false)
const draft = reactive<PerformanceDistributionRule>(emptyRule())

function emptyRule(): PerformanceDistributionRule {
  return { assessment_item_id: '', min_people_count: 0, conditions: [{ control_mode: 'HARD', grade_codes: [], operator: 'GTE', value: 0, unit: 'PERCENT' }], rounding_method: 'ROUND' }
}
function cloneRule(value: PerformanceDistributionRule) { return JSON.parse(JSON.stringify(value)) as PerformanceDistributionRule }
function reset() {
  Object.assign(draft, props.initialValue ? cloneRule(props.initialValue) : emptyRule())
  submitted.value = false
}
function cancel() { reset(); emit('cancel'); open.value = false }
function submit() {
  submitted.value = true
  const invalid = !draft.assessment_item_id || draft.min_people_count < 0 || !draft.conditions.length || draft.conditions.some(condition => !condition.grade_codes.length || condition.value <= 0 || (condition.unit === 'PERCENT' && condition.value > 100))
  if (invalid) return
  emit('confirm', cloneRule(draft))
}
watch(() => props.modelValue, value => { if (value) reset() })
</script>

<template>
  <PerformanceDrawerShell v-model="open" title="添加分布规则" width="680px" variant="captured" body-class="performance-distribution-rule-drawer__body" @close="cancel">
    <form class="distribution-rule-form" novalidate @submit.prevent="submit">
      <PerformanceDistributionRuleEditor
        :model-value="draft"
        :assessment-options="assessmentOptions"
        :used-assessment-ids="usedAssessmentIds"
        :submitted="submitted"
        :disabled="saving"
        @update:model-value="Object.assign(draft, $event)"
      />
      <p v-if="saveError" class="distribution-save-error" role="alert">{{ saveError }}</p>
    </form>
    <template #footer><PerformanceDrawerFooter variant="captured" :confirm-disabled="saving" @confirm="submit" @cancel="cancel" /></template>
  </PerformanceDrawerShell>
</template>

<style scoped>
.distribution-rule-form{display:flex;flex-direction:column;width:100%;min-width:0;padding:var(--spacing-5) var(--spacing-6);box-sizing:border-box;overflow:auto;color:var(--color-text-primary)}
.distribution-assessment-summary{display:flex;align-items:center;flex-wrap:wrap;gap:var(--spacing-1);margin:var(--spacing-2) 0 0;color:var(--color-text-secondary);font-size:var(--font-size-md);line-height:22px}.distribution-assessment-summary span{display:inline-flex;align-items:center;min-height:24px;padding:1px 6px;border-radius:var(--radius-sm);background:var(--performance-select-tag-background);color:var(--performance-select-tag-text)}
.distribution-applicable-count{display:flex;align-items:center;gap:var(--spacing-2);width:288px}
.distribution-applicable-count>span{flex:0 0 120px;height:var(--performance-control-height);padding:4px var(--performance-select-padding-x);box-sizing:border-box;border:1px solid var(--performance-field-border);border-radius:var(--performance-control-radius);background:var(--color-bg-card);font-size:var(--font-size-md);line-height:22px}
.distribution-condition-list{display:flex;flex-direction:column;gap:var(--spacing-2);margin-bottom:var(--spacing-2)}
.distribution-rule-form :deep(.performance-form-item__label){gap:var(--spacing-1)}
.distribution-rule-form :deep(.performance-form-item__description){font-size:var(--font-size-md);line-height:20px}
.distribution-save-error{margin:0;color:var(--performance-field-error-color);font-size:var(--performance-field-error-font-size);line-height:var(--performance-field-error-line-height)}
@media(max-width:720px){.performance-distribution-rule-drawer__body{overflow-x:auto!important}.distribution-rule-form{min-width:640px}}
</style>
