<script setup lang="ts">
import { ref, watch } from 'vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import type { PerformanceManagerStandard } from './performanceFieldSettings'

const props = defineProps<{
  modelValue: boolean
  value: PerformanceManagerStandard
  options: { value: string; label: string }[]
  saving: boolean
  error: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [value: PerformanceManagerStandard]
}>()
const draft = ref<PerformanceManagerStandard>({ manager_standard: 'inservice_direct_underling', specific_employee_types: [] })
const invalid = ref(false)
const standards = [
  { value: 'inservice_direct_underling', label: '有在职直属下级时，可被认定为管理者。' },
  { value: 'specific_employee_type_underling', label: '有指定人员类型的在职直属下级时，可被认定为管理者。' },
]
watch(() => props.modelValue, open => {
  if (!open) return
  draft.value = { ...props.value, specific_employee_types: [...props.value.specific_employee_types] }
  invalid.value = false
}, { immediate: true })
function setStandard(value: string) {
  if (value === 'inservice_direct_underling' || value === 'specific_employee_type_underling') draft.value.manager_standard = value
}
function setTypes(value: string | string[] | null) {
  draft.value.specific_employee_types = Array.isArray(value) ? value : []
  invalid.value = false
}
function submit() {
  if (props.saving) return
  const specific = draft.value.manager_standard === 'specific_employee_type_underling'
  invalid.value = specific && !draft.value.specific_employee_types.length
  if (invalid.value) return
  emit('save', { ...draft.value, specific_employee_types: specific ? [...draft.value.specific_employee_types] : [] })
}
</script>

<template>
  <PerformanceDialogShell :model-value="modelValue" title="设置管理者的判定标准" width="var(--performance-dialog-wide-width)" :loading="saving" @update:model-value="emit('update:modelValue', $event)">
    <div class="manager-standard-dialog">
      <PerformanceRadioGroup :model-value="draft.manager_standard" @update:model-value="setStandard" :options="standards" name="manager-standard" direction="vertical" gap="var(--spacing-2)" aria-label="管理者判定标准" :disabled="saving" />
      <div v-if="draft.manager_standard === 'specific_employee_type_underling'" class="manager-standard-dialog__types">
        <div class="manager-standard-dialog__label"><PerformanceRequiredLabel label="指定人员类型" /></div>
        <PerformanceSearchSelect :model-value="draft.specific_employee_types" :options="options" multiple aria-label="指定人员类型" :disabled="saving" @update:model-value="setTypes" />
        <div v-if="invalid" class="manager-standard-dialog__error" role="alert">请选择指定人员类型</div>
      </div>
      <div v-if="error" class="manager-standard-dialog__error" role="alert">{{ error }}</div>
    </div>
    <template #footer>
      <div class="manager-standard-dialog__actions">
        <UiButton :disabled="saving" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" :loading="saving" @click="submit">确定</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<style scoped>
.manager-standard-dialog { min-height: var(--performance-manager-standard-body-min-height); }
.manager-standard-dialog :deep(.performance-radio-group) { width: 100%; }
.manager-standard-dialog :deep(.performance-radio-entry) { width: 100%; }
.manager-standard-dialog :deep(.performance-radio-option) { height: auto; min-height: var(--performance-input-line-height); align-items: flex-start; }
.manager-standard-dialog :deep(.radio-wallpaper) { margin-top: var(--performance-manager-standard-radio-offset); }
.manager-standard-dialog :deep(.radio-label) { white-space: normal; overflow-wrap: anywhere; }
.manager-standard-dialog__types { margin-top: var(--spacing-2); margin-left: var(--spacing-5); padding: var(--spacing-4) var(--spacing-5) var(--spacing-5); border-radius: var(--radius-lg); background: var(--performance-review-readonly-surface); }
.manager-standard-dialog__label { margin-bottom: var(--spacing-2); line-height: var(--performance-input-line-height); }
.manager-standard-dialog__actions { display: flex; justify-content: flex-end; gap: var(--spacing-3); }
.manager-standard-dialog__actions :deep(.performance-button) { min-width: var(--performance-dialog-button-width); }
.manager-standard-dialog__error { margin-top: var(--performance-field-error-gap); color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
</style>
