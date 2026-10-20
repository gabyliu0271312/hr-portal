<script setup lang="ts">
import { ElTimePicker } from 'element-plus'

withDefaults(defineProps<{
  modelValue: string
  disabled?: boolean
  invalid?: boolean
  ariaLabel?: string
}>(), { disabled: false, invalid: false, ariaLabel: '通知时刻' })

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="performance-time-field" :class="{ 'is-invalid': invalid }">
    <ElTimePicker
      :model-value="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-invalid="invalid || undefined"
      format="HH:mm"
      value-format="HH:mm"
      placeholder="请选择时间"
      :clearable="false"
      popper-class="performance-time-field-popup"
      :popper-style="{ zIndex: 'var(--performance-popover-z-index)' }"
      @update:model-value="$emit('update:modelValue', $event || '')"
    />
  </div>
</template>

<style scoped>
.performance-time-field { width: 100%; height: var(--performance-control-height); --el-input-height: var(--performance-control-height); --el-input-border-radius: var(--performance-control-radius); --el-input-border-color: var(--performance-field-border); --el-input-focus-border-color: var(--performance-field-border-focus); --el-input-text-color: var(--color-text-primary); --el-input-bg-color: var(--color-bg-card); --el-font-size-base: var(--font-size-md); }
.performance-time-field :deep(.el-date-editor.el-input) { width: 100%; height: var(--performance-control-height); }
.performance-time-field :deep(.el-input__wrapper) { padding: var(--performance-input-padding-y) var(--performance-input-padding-x); }
.performance-time-field :deep(.el-input__prefix) { order: 2; margin-left: var(--spacing-1); }
.performance-time-field :deep(.el-input__prefix-inner > :last-child) { margin-right: 0; }
.performance-time-field :deep(.el-input__inner) { height: var(--performance-input-line-height); font-family: var(--font-sans); }
.performance-time-field.is-invalid :deep(.el-input__wrapper) { box-shadow: 0 0 0 1px var(--performance-field-border-invalid) inset; }
</style>

<style>
.performance-time-field-popup { --el-color-primary: var(--color-primary); --el-text-color-primary: var(--color-text-primary); --el-font-size-base: var(--font-size-md); font-family: var(--font-sans); }
</style>
