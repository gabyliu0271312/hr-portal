<script setup lang="ts">
import PerformanceTextField from './PerformanceTextField.vue'
import type { TagFillQuestionTag } from './tagFillQuestionFixtures'

const props = defineProps<{
  modelValue: TagFillQuestionTag
  canRemove: boolean
  submitted: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: TagFillQuestionTag]
  remove: []
}>()

function update<K extends keyof TagFillQuestionTag>(key: K, value: TagFillQuestionTag[K]) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <article class="tag-card">
    <button v-if="canRemove" class="tag-remove" type="button" aria-label="删除标签" @click="emit('remove')">⌫</button>
    <label class="form-field">
      <span class="field-label">名称<span class="required-mark">*</span></span>
      <PerformanceTextField :model-value="modelValue.name" placeholder="请输入标签名称" :maxlength="100" :invalid="submitted && !modelValue.name.trim()" @update:model-value="update('name', $event)" />
      <span v-if="submitted && !modelValue.name.trim()" class="field-error">名称为必填</span>
    </label>
    <label class="form-field">
      <span class="field-label">说明</span>
      <PerformanceTextField :model-value="modelValue.description" type="textarea" placeholder="请输入标签说明（选填）" :maxlength="20000" show-count @update:model-value="update('description', $event)" />
    </label>
    <label class="form-field">
      <span class="field-label">提示</span>
      <PerformanceTextField :model-value="modelValue.prompt" type="textarea" placeholder="请输入提示（选填）" :maxlength="20000" show-count @update:model-value="update('prompt', $event)" />
    </label>
  </article>
</template>

<style scoped>
.tag-card { position: relative; margin-bottom: 8px; padding: 20px; border-radius: 8px; background: #f5f6f7; }
.tag-remove { position: absolute; top: 4px; right: 4px; width: 24px; height: 24px; border: 0; background: transparent; color: #646a73; cursor: pointer; }
.form-field { display: block; margin: 0 0 20px; }
.form-field:last-child { margin-bottom: 0; }
.field-label { display: block; margin-bottom: 8px; font-weight: 600; }
.required-mark { margin-left: 2px; color: #f54a45; }
.field-error { display: block; margin-top: 2px; color: #f54a45; font-size: 13px; }
:deep(.performance-text-field) { width: 100% !important; }
:deep(.native-textarea) { resize: vertical; }
</style>
