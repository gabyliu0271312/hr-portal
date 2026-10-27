<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceProjectTemplate } from '@/api/performance'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceTemplatePreviewButton from './PerformanceTemplatePreviewButton.vue'

const props = defineProps<{
  open: boolean
  modelValue: number | null
  templates: PerformanceProjectTemplate[]
  loading?: boolean
  error?: string
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:modelValue': [value: number]
  retry: []
}>()
const draft = ref('')
watch(() => props.open, open => { if (open) draft.value = props.modelValue ? String(props.modelValue) : '' }, { immediate: true })
const options = computed(() => props.templates.map(item => ({ value: String(item.template_id), label: item.name, description: item.description, disabled: item.status !== 'active' })))
const canConfirm = computed(() => !props.loading && !props.error && props.templates.some(item => String(item.template_id) === draft.value && item.status === 'active'))
function close() { emit('update:open', false) }
function confirm() {
  if (!canConfirm.value) return
  emit('update:modelValue', Number(draft.value))
  close()
}
</script>

<template>
  <PerformanceDialogShell :model-value="open" title="选择绩效模板" width="var(--performance-template-picker-width)" @update:model-value="emit('update:open', $event)">
    <p v-if="loading" class="template-state" role="status">正在加载绩效模板...</p>
    <div v-else-if="error" class="template-state" role="alert"><p>{{ error }}</p><PerformanceButton variant="text" @click="emit('retry')">重试</PerformanceButton></div>
    <p v-else-if="!templates.length" class="template-state" role="status">当前周期尚未配置绩效模板，请先在周期的评估设置中选择模板。</p>
    <PerformanceRadioGroup v-else v-model="draft" :options="options" name="project-template" direction="vertical" variant="card" :gap="20" aria-label="绩效模板">
      <template #label="{ option }">
        <span class="template-name" :title="option.label">{{ option.label }}</span>
        <span class="template-description" :title="option.description || ''">{{ option.description || '暂无描述' }}</span>
      </template>
      <template #after-option="{ option }"><PerformanceTemplatePreviewButton :name="option.label" /></template>
    </PerformanceRadioGroup>
    <template #footer><div class="template-footer"><PerformanceButton variant="secondary" @click="close">取消</PerformanceButton><PerformanceButton variant="primary" :disabled="!canConfirm" @click="confirm">确定</PerformanceButton></div></template>
  </PerformanceDialogShell>
</template>

<style scoped>
.template-name { display: block; overflow: hidden; font-size: var(--font-size-md); font-weight: 600; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.template-description { display: block; overflow: hidden; color: var(--performance-template-description-color); font-size: var(--font-size-md); font-weight: 400; line-height: 20px; text-overflow: ellipsis; white-space: nowrap; }
.template-state { margin: 0; color: var(--performance-template-description-color); font-size: var(--font-size-md); line-height: 22px; }
.template-footer { display: flex; justify-content: flex-end; gap: var(--performance-button-gap); }
</style>
