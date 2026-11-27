<template>
  <PerformanceSurfaceCard v-if="contained" class="tabbed-contained-surface">
    <slot name="before-tabs" />
    <PerformanceLineTabs class="tabbed-surface tabbed-surface--contained" :model-value="modelValue" :tabs="tabs" flush sticky @update:model-value="emit('update:modelValue', $event)">
      <slot />
    </PerformanceLineTabs>
  </PerformanceSurfaceCard>
  <PerformanceLineTabs v-else class="tabbed-surface" :model-value="modelValue" :tabs="tabs" sticky @update:model-value="emit('update:modelValue', $event)">
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

defineProps<{ modelValue: string; tabs: PerformanceLineTab[]; contained?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [key: string] }>()
</script>

<style scoped>
.tabbed-surface { flex: 1 0 auto; --performance-review-table-sticky-top: var(--performance-tab-area-height); }
.tabbed-surface--contained { --performance-review-table-sticky-top: calc(var(--performance-tab-area-height) + var(--performance-review-tabs-alignment-offset)); }
.tabbed-surface--contained.sticky :deep(.line-tabs-holder) { top: calc(var(--performance-review-tabs-alignment-offset) - var(--performance-review-surface-inset)); }
.tabbed-surface :deep(.line-tabs-content), .tabbed-surface :deep(.line-tabs-pane), .tabbed-surface-card { flex: 1 0 auto; }
.tabbed-surface :deep(.line-tabs-content), .tabbed-surface :deep(.line-tabs-pane) { display: flex; flex-direction: column; }
.tabbed-surface-card :deep(.project-report-root) { margin-top: calc(-1 * var(--performance-review-surface-inset)); margin-bottom: 0; }
.tabbed-contained-surface { flex: 1 0 auto; }
.tabbed-surface--contained :deep(.line-tabs-holder) { background: var(--performance-content-surface-background); }
.tabbed-surface--contained :deep(.line-tabs-holder)::before { content: ''; position: absolute; top: calc(-1 * var(--performance-review-tabs-alignment-offset)); right: 0; left: 0; height: var(--performance-review-tabs-alignment-offset); background: var(--performance-content-surface-background); }
.tabbed-surface--contained :deep(.line-tabs-content) { background: transparent; }
</style>
