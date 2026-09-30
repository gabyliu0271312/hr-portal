<template>
  <div
    class="performance-metric-field-row"
    :class="{ 'is-dragging': dragging, 'is-locked': locked }"
    :style="itemStyle"
    :data-sortable-index="locked ? undefined : index"
    :data-field-id="field.id"
  >
    <PerformanceDragHandle
      v-if="!locked"
      :label="`拖拽第${index + 1}个指标字段`"
      :dragging="dragging"
      :disabled="disabled"
    />
    <span v-else class="performance-metric-field-row__lock" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="LockFilled"><path d="M6.5 8v-.5a5.5 5.5 0 1 1 11 0V8H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h2.5Zm9-.5a3.5 3.5 0 1 0-7 0V8h7v-.5Zm-1 7.5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" fill="currentColor" /></svg>
    </span>
    <PerformanceMetricFieldIcon :field-type="field.field_type" />
    <span class="performance-metric-field-row__name">{{ field.name }}</span>
    <PerformanceButton v-if="!locked" class="performance-metric-field-row__remove" variant="text" size="small" :disabled="disabled" @click="emit('remove', field.id)">移除</PerformanceButton>
  </div>
</template>

<script setup lang="ts">
import type { PerformanceMetricTypeFieldOption } from '@/api/performanceMetricTypes'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDragHandle from './PerformanceDragHandle.vue'
import PerformanceMetricFieldIcon from './PerformanceMetricFieldIcon.vue'

withDefaults(defineProps<{
  field: PerformanceMetricTypeFieldOption
  locked?: boolean
  dragging?: boolean
  disabled?: boolean
  index?: number
  itemStyle?: Record<string, string>
}>(), {
  locked: false,
  dragging: false,
  disabled: false,
  index: 0,
  itemStyle: () => ({}),
})

const emit = defineEmits<{ remove: [id: number] }>()
</script>

<style scoped>
.performance-metric-field-row { display: flex; align-items: center; align-self: stretch; width: 100%; height: 34px; min-width: 0; min-height: 34px; margin-top: 8px; padding: 6px 8px; box-sizing: border-box; border-radius: 4px; background: rgba(31, 35, 41, 0.08); color: var(--color-text-primary); font: 400 14px/22px var(--font-sans); }
.performance-metric-field-row.is-locked { margin-top: 0; }
.performance-metric-field-row.is-dragging { opacity: .72; box-shadow: var(--shadow-popover); }
.performance-metric-field-row :deep(.performance-drag-handle) { display: inline-flex; align-self: center; flex: 0 0 16px; width: 16px; height: 22px; margin-right: 8px; }
.performance-metric-field-row :deep(.performance-drag-handle svg) { width: 16px; height: 16px; }
.performance-metric-field-row__lock { display: inline-flex; flex: 0 0 14px; width: 14px; height: 14px; align-items: center; justify-content: center; margin-right: 8px; color: var(--color-text-secondary); }
.performance-metric-field-row__lock svg { display: block; width: 14px; height: 14px; }
.performance-metric-field-row :deep(.performance-metric-field-icon) { display: inline-flex; flex: 0 0 14px; width: 14px; height: 14px; align-items: center; justify-content: center; margin-right: 8px; }
.performance-metric-field-row :deep(.performance-metric-field-icon svg) { display: block; width: 14px; height: 14px; }
.performance-metric-field-row__name { min-width: 0; flex: 1 1 auto; overflow: hidden; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.performance-metric-field-row__remove { flex: 0 0 auto; width: auto; height: 22px; min-height: 22px; margin-left: 8px; padding: 2px 4px; font-size: 14px; line-height: 18px; }
</style>
