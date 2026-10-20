<script setup lang="ts">
import type { PerformanceReviewer360Tag } from '@/api/performance'
import PerformanceDragHandle from './PerformanceDragHandle.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceTextField from './PerformanceTextField.vue'

type Field = Exclude<keyof PerformanceReviewer360Tag, 'id'>
const props = withDefaults(defineProps<{
  tag: PerformanceReviewer360Tag
  index: number
  multiple?: boolean
  multilingual?: boolean
  dragging?: boolean
  disabled?: boolean
  errors?: Partial<Record<Field, string>>
}>(), { multiple: false, multilingual: false, dragging: false, disabled: false, errors: () => ({}) })
const emit = defineEmits<{
  update: [tag: PerformanceReviewer360Tag]
  remove: [id: string]
}>()
const groups = [
  { label: '名称', fields: [{ key: 'name_zh', language: '中文' }, { key: 'name_en', language: '英文' }] },
  { label: '描述', fields: [{ key: 'description_zh', language: '中文' }, { key: 'description_en', language: '英文' }] },
] as const
function update(field: Field, value: string) {
  if (!props.disabled) emit('update', { ...props.tag, [field]: value })
}
</script>

<template>
  <div class="reviewer-tag-row" :data-sortable-index="index">
    <PerformanceDragHandle v-if="multiple" class="reviewer-tag-drag" :label="`拖拽第${index + 1}个标签`" :dragging="dragging" :disabled="disabled" />
    <div class="reviewer-tag-card">
      <div v-for="group in groups" :key="group.label" class="reviewer-tag-group">
        <label class="reviewer-tag-label" :for="`reviewer-tag-${tag.id}-${group.fields[0].key}`">{{ group.label }}</label>
        <template v-for="field in group.fields" :key="field.key">
          <div v-if="field.language === '中文' || multilingual" class="reviewer-tag-field">
            <PerformanceTextField
              :model-value="tag[field.key]"
              :input-id="`reviewer-tag-${tag.id}-${field.key}`"
              variant="feishu-input"
              :placeholder="`请输入${field.language}${group.label}`"
              :aria-label="`第${index + 1}个标签${field.language}${group.label}`"
              :disabled="disabled"
              :invalid="!!errors[field.key]"
              @update:model-value="update(field.key, $event)"
            >
              <template #suffix><span class="reviewer-tag-language">{{ field.language }}</span></template>
            </PerformanceTextField>
            <p v-if="errors[field.key]" class="reviewer-tag-error" role="alert">{{ errors[field.key] }}</p>
          </div>
        </template>
      </div>
    </div>
    <div class="reviewer-tag-delete">
      <PerformanceIconButton icon="DeleteTrashOutlined" :label="`删除第${index + 1}个标签`" :disabled="disabled" @click="!disabled && emit('remove', tag.id)" />
    </div>
  </div>
</template>

<style scoped>
.reviewer-tag-row { display: flex; align-items: stretch; min-width: 0; margin-bottom: var(--spacing-2); box-sizing: border-box; }
.reviewer-tag-drag { height: auto; color: var(--color-text-secondary); }
.reviewer-tag-drag :deep(.universe-icon) { color: var(--color-text-secondary); }
.reviewer-tag-drag:focus-visible { outline-color: var(--color-action-primary); }
.reviewer-tag-card { flex: 1 1 0; min-width: 0; padding: var(--spacing-4); border-radius: var(--radius-lg); background: var(--performance-page-surface); }
.reviewer-tag-group + .reviewer-tag-group { margin-top: var(--spacing-2); }
.reviewer-tag-label { display: block; margin-bottom: var(--spacing-2); color: var(--color-text-primary); font-weight: 600; line-height: 22px; }
.reviewer-tag-field + .reviewer-tag-field { margin-top: var(--spacing-2); }
.reviewer-tag-field :deep(.feishu-input-wrap) { width: 100%; height: 32px; background: var(--color-bg-card); }
.reviewer-tag-field :deep(.feishu-input-wrap .native-input) { width: 100%; flex: 1 1 auto; min-width: 0; height: 22px; }
.reviewer-tag-field :deep(.feishu-input-placeholder) { width: 100%; }
.reviewer-tag-field :deep(.feishu-input-wrap:has(.error)) { border-color: var(--performance-field-border-invalid); }
.reviewer-tag-language { display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: var(--radius-sm); background: var(--performance-workbench-editor-language-tag-bg); color: var(--color-text-primary); font-size: var(--font-size-sm); line-height: 20px; white-space: nowrap; }
.reviewer-tag-delete { display: flex; align-items: center; margin-left: var(--spacing-1); }
.reviewer-tag-delete :deep(.performance-icon-button) { flex: 0 0 auto; }
.reviewer-tag-error { margin: 2px 0 0; color: var(--performance-field-error-color); font-size: var(--font-size-md); line-height: 22px; overflow-wrap: anywhere; }
</style>
