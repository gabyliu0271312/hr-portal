<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceComparisonReason, PerformanceComparisonResult } from '@/api/performance'
import { performanceComparisonReasonGroups, performanceComparisonText } from '@/composables/usePerformanceComparison'
import UiButton from '../ui/UiButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceTextField from './PerformanceTextField.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  reason: string
  reasons?: PerformanceComparisonReason[]
  comparison: PerformanceComparisonResult | null
  taskId?: number | string
  references?: Array<{ task_id?: number | string | null; node_name: string }>
  loading?: boolean
  error?: string
}>(), { references: () => [], loading: false, error: '' })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; 'update:reason': [value: string]; 'update:reasons': [value: PerformanceComparisonReason[]]; confirm: [] }>()
const requiredErrors = ref<string[]>([])
const grouped = computed(() => props.comparison?.groups !== undefined)
const fields = computed(() => performanceComparisonReasonGroups(props.comparison).map((group, index, groups) => ({
  group,
  value: grouped.value ? props.reasons?.find(item => item.rule_id === group.rule_id)?.diff_reason ?? '' : props.reason,
  label: groups.length > 1 ? `差异理由 ${index + 1}` : '差异理由',
  id: groups.length > 1 ? `comparison-diff-reason-${index}` : 'comparison-diff-reason',
  errorId: groups.length > 1 ? `comparison-reason-error-${index}` : 'comparison-reason-error',
  error: requiredErrors.value.includes(group.rule_id) ? '请填写差异理由' : '',
  messages: [...new Set(group.matches.map(match => performanceComparisonText(match, props.taskId, props.references)))],
})))
watch(() => [props.modelValue, props.reason, props.reasons, props.comparison], () => { requiredErrors.value = [] })
function updateReason(group: PerformanceComparisonResult, value: string) {
  if (!grouped.value) { emit('update:reason', value); return }
  const reasons = (props.reasons || []).filter(item => item.rule_id !== group.rule_id)
  emit('update:reasons', [...reasons, { rule_id: group.rule_id, diff_reason: value, comparison_context: group.context }])
}
function confirm() {
  if (props.loading) return
  requiredErrors.value = fields.value.filter(field => field.group.reason_required && !field.value.trim()).map(field => field.group.rule_id)
  if (!requiredErrors.value.length) emit('confirm')
}
</script>

<template>
  <PerformanceDialogShell :model-value="modelValue" title="填写评估差异理由" width="var(--performance-dialog-wide-width)" :loading="loading" @update:model-value="emit('update:modelValue', $event)">
    <PerformanceFormItem v-for="field in fields" :key="field.group.rule_id" class="comparison-reason-field" :label="field.label" :input-id="field.id" :required="field.group.reason_required" :invalid="Boolean(field.error || error)" :error-message="field.error || error" :error-id="field.errorId">
      <template #description><p v-for="message in field.messages" :key="message" class="comparison-reason-message">{{ message }}</p></template>
      <PerformanceTextField :model-value="field.value" type="textarea" :input-id="field.id" :aria-label="field.label" :aria-describedby="field.error || error ? field.errorId : undefined" :placeholder="field.group.reason_required ? '（必填）请填写评估差异理由' : '请填写评估差异理由'" :maxlength="20000" :invalid="Boolean(field.error || error)" :disabled="loading" :auto-resize="false" @update:model-value="updateReason(field.group, $event)" />
    </PerformanceFormItem>
    <template #footer>
      <div class="comparison-reason-actions">
        <UiButton variant="secondary" :disabled="loading" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" :loading="loading" :disabled="loading" @click="confirm">确定</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.comparison-reason-field{--performance-textarea-min-height:var(--performance-comparison-reason-min-height);--performance-input-textarea-padding-bottom:var(--performance-input-padding-y)}
.comparison-reason-field :deep(.native-textarea){overflow-y:auto}
.comparison-reason-message{margin:0;color:var(--color-text-secondary);font-size:var(--font-size-md);line-height:var(--performance-input-line-height)}
.comparison-reason-actions{display:flex;justify-content:flex-end;gap:var(--performance-dialog-footer-gap)}
</style>
