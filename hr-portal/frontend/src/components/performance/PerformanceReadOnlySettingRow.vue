<template>
  <div class="readonly-setting-row" @click="toggleLabel">
    <PerformanceCheckbox :model-value="checked" :label="label" :disabled="disabled" :checked-color="'var(--color-primary-hover)'" @update:model-value="$emit('update:checked', $event)" />
  </div>
</template>

<script setup lang="ts">
import PerformanceCheckbox from './PerformanceCheckbox.vue'

const props = defineProps<{ label: string; checked: boolean; disabled?: boolean }>()
const emit = defineEmits<{ 'update:checked': [value: boolean] }>()

function toggleLabel(event: MouseEvent) {
  if (!props.disabled && (event.target as HTMLElement).closest('.performance-checkbox__label')) {
    emit('update:checked', !props.checked)
  }
}
</script>

<style scoped>
.readonly-setting-row { min-width: 0; }
.readonly-setting-row :deep(.performance-checkbox) { height: auto; min-height: 22px; align-items: flex-start; color: var(--color-text-primary); }
.readonly-setting-row :deep(.performance-checkbox__label) { flex: 1; min-width: 0; height: auto; overflow-wrap: anywhere; cursor: pointer; }
.readonly-setting-row :deep(.ud__checkbox__wallpaper) { border-color: var(--color-text-placeholder); background: var(--color-bg-card); }
.readonly-setting-row :deep(.ud__checkbox__wallpaper--checked) { border-color: transparent; background: var(--color-primary-hover); }
</style>
