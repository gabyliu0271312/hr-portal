<template>
  <div
    class="filter-condition-row"
    :style="itemStyle"
    :data-sortable-index="index"
  >
    <div class="filter-condition-row__main">
      <UiDragHandle :label="`拖拽调整${item.label}顺序`" :dragging="dragging" :disabled="disabled" />
      <span class="filter-condition-row__label" :title="item.label">{{ item.label }}</span>
    </div>
    <div class="filter-condition-row__default">
      <PerformanceCheckbox
        hide-label
        :model-value="item.default"
        :label="item.label"
        :disabled="disabled || item.disable_set_default"
        checked-color="var(--ui-checkbox-checked)"
        @update:model-value="$emit('toggle', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import UiDragHandle from '../ui/UiDragHandle.vue'
import type { PerformanceFilterCondition } from './performanceFieldSettings'

withDefaults(defineProps<{
  item: PerformanceFilterCondition
  index: number
  dragging?: boolean
  disabled?: boolean
  itemStyle?: Record<string, string>
}>(), {
  dragging: false,
  disabled: false,
  itemStyle: () => ({}),
})

defineEmits<{ toggle: [value: boolean] }>()
</script>

<style scoped>
.filter-condition-row { display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; padding: var(--performance-settings-list-row-padding-block) var(--spacing-2); border-radius: var(--radius-sm); background: var(--performance-settings-list-row-surface); color: var(--color-text-primary); font-size: var(--font-size-md); line-height: var(--performance-input-line-height); margin-bottom: var(--performance-settings-list-row-gap); }
.filter-condition-row__main { display: flex; flex: 1; align-items: center; min-width: 0; }
.filter-condition-row__main :deep(.performance-drag-handle) { height: var(--performance-input-line-height); margin-right: var(--spacing-2); }
.filter-condition-row__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.filter-condition-row__default { flex: 0 0 var(--performance-settings-list-row-default-column-width); width: var(--performance-settings-list-row-default-column-width); margin-left: var(--spacing-4); }
</style>
