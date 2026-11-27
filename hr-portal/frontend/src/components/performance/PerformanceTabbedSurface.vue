<template>
  <PerformanceLineTabs class="tabbed-surface" :model-value="modelValue" :tabs="tabs" sticky @update:model-value="emit('update:modelValue', $event)">
    <PerformanceSurfaceCard class="tabbed-surface-card">
      <slot />
    </PerformanceSurfaceCard>
  </PerformanceLineTabs>
</template>

<script lang="ts">
export const performanceAnalysisTabs = [
  { key: 'members', label: '成员列表' },
  { key: 'matrix', label: '矩阵分析' },
  { key: 'reports', label: '统计报表' },
]
</script>

<script setup lang="ts">
import PerformanceLineTabs, { type PerformanceLineTab } from './PerformanceLineTabs.vue'
import PerformanceSurfaceCard from './PerformanceSurfaceCard.vue'

defineProps<{ modelValue: string; tabs: PerformanceLineTab[] }>()
const emit = defineEmits<{ 'update:modelValue': [key: string] }>()
</script>

<style scoped>
.tabbed-surface { flex: 1 0 auto; --performance-review-table-sticky-top: var(--performance-tab-area-height); }
.tabbed-surface :deep(.line-tabs-content), .tabbed-surface :deep(.line-tabs-pane), .tabbed-surface-card { flex: 1 0 auto; }
.tabbed-surface :deep(.line-tabs-content), .tabbed-surface :deep(.line-tabs-pane) { display: flex; flex-direction: column; }
.tabbed-surface-card :deep(.project-report-root) { margin-top: calc(-1 * var(--performance-review-surface-inset)); margin-bottom: 0; }
</style>
