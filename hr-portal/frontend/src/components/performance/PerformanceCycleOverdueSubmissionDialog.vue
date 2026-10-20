<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { PerformanceCyclePayload } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceButton from './PerformanceButton.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  enabled?: boolean
  scope?: 'EVALUATION' | 'ALL'
  saving?: boolean
  saveError?: string
}>(), { enabled: true, scope: 'EVALUATION', saving: false, saveError: '' })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: Pick<PerformanceCyclePayload, 'overdue_submission_enabled' | 'overdue_submission_scope'>]
}>()

const draftClosed = ref(!props.enabled)
const draftScope = ref<'EVALUATION' | 'ALL'>(props.scope)

watch(() => props.modelValue, async (open) => {
  if (!open) return
  draftClosed.value = !props.enabled
  draftScope.value = props.scope
  await nextTick()
  document.querySelector<HTMLInputElement>('.cycle-overdue-submission-dialog input[type="checkbox"]')?.focus()
})

function close() {
  if (!props.saving) emit('update:modelValue', false)
}

function confirm() {
  if (props.saving) return
  emit('confirm', { overdue_submission_enabled: !draftClosed.value, overdue_submission_scope: draftScope.value })
}
</script>

<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    title="逾期任务提交机会设置"
    title-id="cycle-overdue-submission-title"
    width="600px"
    :loading="saving"
    dialog-class="cycle-overdue-submission-dialog performance-dialog--auto-header"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #description>环节截止后，未提交的任务仍有 1 次提交机会。你可在此处关闭逾期提交机会，关闭后在本周期内立即生效。</template>
    <div class="cycle-overdue-submission-form">
      <PerformanceCheckbox v-model="draftClosed" label="关闭逾期任务提交机会" :disabled="saving" />
      <div v-if="draftClosed" class="cycle-overdue-submission-options">
        <PerformanceRadioGroup
          v-model="draftScope"
          direction="vertical"
          :gap="8"
          name="cycle-overdue-submission-scope"
          aria-label="逾期任务提交机会适用范围"
          :options="[
            { value: 'EVALUATION', label: '作为最终结果或参与最终结果加权计算的评估型环节，逾期无法提交', showInfo: true },
            { value: 'ALL', label: '全部环节，逾期无法提交' },
          ]"
          :disabled="saving"
        />
      </div>
      <p v-if="saveError" class="cycle-overdue-submission-error" role="alert">{{ saveError }}</p>
    </div>
    <template #footer>
      <div class="cycle-overdue-submission-actions">
        <PerformanceButton :disabled="saving" @click="close">取消</PerformanceButton>
        <PerformanceButton variant="primary" :loading="saving" @click="confirm">确定</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.cycle-overdue-submission-form { min-width: 0; padding-top: var(--spacing-6); }
.cycle-overdue-submission-options { margin-top: var(--spacing-2); padding: var(--spacing-3); border-radius: var(--radius-lg); background: var(--color-surface-disabled); }
.cycle-overdue-submission-options :deep(.performance-radio-group) { width: 100%; align-items: flex-start; }
.cycle-overdue-submission-options :deep(.performance-radio-option) { width: 100%; min-height: 22px; height: auto; align-items: flex-start; white-space: normal; }
.cycle-overdue-submission-options :deep(.radio-label) { white-space: normal; }
.cycle-overdue-submission-error { margin: var(--spacing-3) 0 0; color: var(--performance-field-error-color); font-size: var(--font-size-sm); line-height: var(--performance-field-error-line-height); }
.cycle-overdue-submission-actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-gap); }
</style>
