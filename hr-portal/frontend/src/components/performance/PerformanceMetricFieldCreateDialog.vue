<template>
  <PerformanceDialogShell v-model="open" :title="mode === 'edit' ? '编辑字段' : '新建字段'" :loading="saving">
    <form id="metric-field-create-form" @submit.prevent="submit">
      <PerformanceLocalizedInput
        v-model="form.name"
        label="名称"
        input-id="metric-field-name"
        placeholder="请输入"
        required
        :maxlength="128"
        :disabled="saving"
        :invalid="Boolean(nameError)"
        :error-message="nameError"
        @update:model-value="nameError = ''"
        @add-language="notice = '添加英文功能暂未接入'"
      />
      <PerformanceFormItem label="字段类型" required :hint="typeLocked ? '该字段已被指标类型使用，不允许修改类型' : ''">
        <PerformanceRadioGroup
          v-model="form.field_type"
          name="metric-field-type"
          aria-label="字段类型"
          :options="typeOptions"
          :disabled="saving || typeLocked"
        />
      </PerformanceFormItem>
      <p v-if="notice" class="metric-field-notice" role="status">{{ notice }}</p>
      <p v-if="errorMessage" class="metric-field-error" role="alert">{{ errorMessage }}</p>
    </form>
    <template #footer>
      <div class="metric-field-footer">
        <PerformanceButton variant="secondary" :disabled="saving" @click="open = false">取消</PerformanceButton>
        <PerformanceButton variant="primary" :loading="saving" @click="submit">确定</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { type MetricFieldDraft, metricFieldTypeLabels } from '@/api/performanceMetricFields'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceLocalizedInput from './PerformanceLocalizedInput.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode?: 'create' | 'edit'
  initialValue?: MetricFieldDraft | null
  typeLocked?: boolean
  saving?: boolean
  errorMessage?: string
}>(), { mode: 'create', initialValue: null, typeLocked: false, saving: false, errorMessage: '' })
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: MetricFieldDraft]
}>()
const open = computed({ get: () => props.modelValue, set: value => { if (!props.saving) emit('update:modelValue', value) } })
const form = reactive<MetricFieldDraft>({ name: '', field_type: 'text' })
const nameError = ref('')
const notice = ref('')
const typeOptions = (['text', 'number', 'percentage'] as const).map(value => ({ value, label: metricFieldTypeLabels[value] }))

function submit() {
  if (props.saving) return
  const name = form.name.trim()
  nameError.value = !name ? '请输入名称' : name.length > 128 ? '名称不能超过128个字符' : ''
  if (nameError.value) {
    document.getElementById('metric-field-name')?.focus()
    return
  }
  emit('confirm', { name, field_type: props.typeLocked && props.initialValue ? props.initialValue.field_type : form.field_type })
}
watch(() => props.typeLocked, locked => {
  if (locked && props.initialValue) form.field_type = props.initialValue.field_type
})
watch(() => props.modelValue, async value => {
  if (!value) return
  form.name = props.mode === 'edit' ? props.initialValue?.name || '' : ''
  form.field_type = props.mode === 'edit' ? props.initialValue?.field_type || 'text' : 'text'
  nameError.value = ''
  notice.value = ''
  await nextTick()
  document.getElementById('metric-field-name')?.focus()
}, { immediate: true })
</script>

<style scoped>
#metric-field-create-form { margin: 0; }
.metric-field-footer { display: flex; justify-content: flex-end; gap: var(--spacing-3); }
.metric-field-notice, .metric-field-error { margin: var(--spacing-2) 0 0; font-size: var(--font-size-sm); line-height: var(--performance-input-line-height); }
.metric-field-notice { color: var(--color-text-secondary); }
.metric-field-error { color: var(--performance-field-error-color); }
</style>
