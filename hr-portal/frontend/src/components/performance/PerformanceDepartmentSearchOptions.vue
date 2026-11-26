<script setup lang="ts">
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceDepartmentSearchPreview from './PerformanceDepartmentSearchPreview.vue'

defineProps<{ modelValue: boolean }>()
defineEmits<{ 'request-change': [value: boolean] }>()

const options = [
  { value: 'visible', label: '默认可见查看范围内部门树' },
  { value: 'search', label: '默认不可见部门树，搜索后可见搜索部门及其上级部门' },
]
</script>

<template>
  <div class="department-search-options" tabindex="0" aria-label="部门字段搜索配置预览" @click.capture.prevent="$emit('request-change', !modelValue)" @keydown.capture="($event.key === ' ' || $event.key === 'Enter' || $event.key.startsWith('Arrow')) && ($event.preventDefault(), $emit('request-change', !modelValue))">
    <PerformanceRadioGroup
      :model-value="modelValue ? 'visible' : 'search'"
      :options="options"
      name="department-tree-view"
      disabled
      aria-label="部门字段搜索设置"
      gap="var(--spacing-6)"
    >
      <template #after-option="{ option }"><PerformanceDepartmentSearchPreview :tree="option.value === 'visible'" /></template>
    </PerformanceRadioGroup>
  </div>
</template>

<style scoped>
.department-search-options { max-width: calc(var(--spacing-8) * 16 + var(--spacing-4)); }
.department-search-options :deep(.performance-radio-group) { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; align-items: stretch; }
.department-search-options :deep(.performance-radio-entry) { display: flex; flex-direction: column; align-items: stretch; overflow: hidden; border: var(--ui-control-border-width) solid var(--performance-template-option-border); border-radius: var(--radius-lg); }
.department-search-options :deep(.performance-radio-option) { display: flex; align-items: flex-start; box-sizing: border-box; height: auto; min-height: calc(var(--spacing-7) * 2); padding: var(--spacing-3); }
.department-search-options :deep(.performance-radio-option.checked) { background: var(--color-primary-light); }
.department-search-options:focus-visible { outline: var(--ui-control-border-width) solid var(--color-primary); outline-offset: var(--spacing-1); }
.department-search-options :deep(.performance-radio-option.disabled) { color: var(--color-text-primary); }
.department-search-options :deep(.radio-wallpaper) { margin-top: var(--spacing-1); }
.department-search-options :deep(.performance-radio-option.disabled .radio-wallpaper) { border-color: var(--color-text-placeholder); background: var(--ui-surface-background); }
.department-search-options :deep(.performance-radio-option.disabled.checked .radio-wallpaper) { border-color: var(--color-primary-hover); }
.department-search-options :deep(.radio-label) { white-space: normal; overflow-wrap: anywhere; }
.department-search-options :deep(.performance-radio-after) { display: block; margin: 0; border-top: var(--ui-control-border-width) solid var(--performance-template-option-border); }
</style>
