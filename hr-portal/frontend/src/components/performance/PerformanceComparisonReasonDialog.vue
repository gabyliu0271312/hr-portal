<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceComparisonResult } from '@/api/performance'
import { performanceComparisonText } from '@/composables/usePerformanceComparison'
import UiButton from '../ui/UiButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceTextField from './PerformanceTextField.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  reason: string
  comparison: PerformanceComparisonResult | null
  taskId?: number | string
  references?: Array<{ task_id?: number | string | null; node_name: string }>
  loading?: boolean
  error?: string
}>(), { references: () => [], loading: false, error: '' })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; 'update:reason': [value: string]; confirm: [] }>()
const requiredError = ref(false)
const messages = computed(() => [...new Set(props.comparison?.matches.map(match => performanceComparisonText(match, props.taskId, props.references)) || [])])
const errorMessage = computed(() => requiredError.value ? '请填写差异理由' : props.error)
watch(() => [props.modelValue, props.reason], () => { requiredError.value = false })
function confirm() {
  if (props.loading) return
  requiredError.value = Boolean(props.comparison?.reason_required && !props.reason.trim())
  if (!requiredError.value) emit('confirm')
}
</script>

<template>
  <PerformanceDialogShell :model-value="modelValue" title="填写评估差异理由" width="var(--performance-dialog-wide-width)" :loading="loading" @update:model-value="emit('update:modelValue', $event)">
    <PerformanceFormItem class="comparison-reason-field" label="差异理由" input-id="comparison-diff-reason" :required="Boolean(comparison?.reason_required)" :invalid="Boolean(errorMessage)" :error-message="errorMessage" error-id="comparison-reason-error">
      <template #description><p v-for="message in messages" :key="message" class="comparison-reason-message">{{ message }}</p></template>
      <PerformanceTextField :model-value="reason" type="textarea" input-id="comparison-diff-reason" aria-label="差异理由" :aria-describedby="errorMessage ? 'comparison-reason-error' : undefined" :placeholder="comparison?.reason_required ? '（必填）请填写评估差异理由' : '请填写评估差异理由'" :maxlength="20000" :invalid="Boolean(errorMessage)" :disabled="loading" :auto-resize="false" @update:model-value="emit('update:reason', $event)" />
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
