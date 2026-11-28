<template>
  <PerformanceDialogShell
    :model-value="modelValue"
    title="详情页顶部字段展示设置"
    width="var(--performance-dialog-wide-width)"
    :loading="saving"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="detail-field-dialog__content">
      <p class="detail-field-dialog__section-title">效果预览</p>
      <PerformanceFieldPreview :name="previewName" :fields="previewFields" :avatar-url="previewAvatarUrl" />
      <p class="detail-field-dialog__section-title detail-field-dialog__section-title--fields">选择可见字段</p>
      <div class="detail-field-dialog__fields">
        <div v-for="option in options" :key="option.id" class="detail-field-dialog__field">
          <UiCheckbox
            :model-value="draft.includes(option.id)"
            :disabled="saving || option.disabled"
            @update:model-value="toggle(option.id, $event)"
          >{{ option.label }}</UiCheckbox>
        </div>
      </div>
      <p v-if="error" class="detail-field-dialog__error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <div class="detail-field-dialog__actions">
        <UiButton :disabled="saving" @click="emit('update:modelValue', false)">取消</UiButton>
        <UiButton variant="primary" :loading="saving" @click="submit">确定</UiButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFieldPreview from './PerformanceFieldPreview.vue'
import UiButton from '../ui/UiButton.vue'
import UiCheckbox from '../ui/UiCheckbox.vue'
import type { PerformanceFieldOption } from './performanceFieldSettings'

const props = withDefaults(defineProps<{
  modelValue: boolean
  value: string[]
  options: PerformanceFieldOption[]
  saving: boolean
  error?: string
  previewName?: string
  previewAvatarUrl?: string
}>(), {
  error: '',
  previewName: '赵六七',
  previewAvatarUrl: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [field: string[]]
}>()

const draft = ref<string[]>([])
const previewFields = computed(() => props.options
  .filter(option => draft.value.includes(option.id))
  .map(option => option.previewLabel || option.label))

watch(() => props.modelValue, open => {
  if (open) draft.value = [...props.value]
}, { immediate: true })

function toggle(id: string, checked: boolean) {
  if (props.saving) return
  draft.value = checked ? [...draft.value, id] : draft.value.filter(value => value !== id)
}

function submit() {
  if (props.saving) return
  emit('save', props.options.filter(option => draft.value.includes(option.id)).map(option => option.id))
}
</script>

<style scoped>
.detail-field-dialog__section-title { margin: 0 0 var(--spacing-2); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: var(--input-line-height); }
.detail-field-dialog__section-title--fields { margin-top: var(--spacing-6); margin-bottom: 0; }
.detail-field-dialog__fields { display: flex; flex-wrap: wrap; }
.detail-field-dialog__field { display: flex; width: 50%; padding-top: var(--spacing-2); box-sizing: border-box; }
.detail-field-dialog__field :deep(.ui-checkbox) { min-height: var(--input-line-height); }
.detail-field-dialog__error { margin: var(--spacing-2) 0 0; color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
.detail-field-dialog__actions { display: flex; justify-content: flex-end; gap: var(--performance-dialog-footer-button-gap); }
.detail-field-dialog__actions :deep(.performance-button) { min-width: var(--performance-dialog-footer-button-min-width); }
</style>
