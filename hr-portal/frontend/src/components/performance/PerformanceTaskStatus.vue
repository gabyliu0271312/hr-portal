<template>
  <span class="performance-task-status" :class="`is-${normalizedStatus}`" :aria-label="label">
    <span class="performance-task-status__dot" aria-hidden="true"></span>
    <span>{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { normalizePerformanceTaskStatus, performanceTaskStatusLabel, type PerformanceTaskStatus } from './performanceTaskStatus'

const props = defineProps<{
  status?: string | null
  dueAt?: string | null
  allowRejected?: boolean
}>()

const normalizedStatus = computed<PerformanceTaskStatus>(() => normalizePerformanceTaskStatus(props.status, props.dueAt, props.allowRejected))
const label = computed(() => performanceTaskStatusLabel(normalizedStatus.value))
</script>

<style scoped>
.performance-task-status{display:inline-flex;min-width:var(--performance-task-status-min-width);min-height:var(--performance-task-status-line-height);align-items:baseline;box-sizing:border-box;color:var(--color-text-primary);font-size:var(--font-size-md);font-weight:400;line-height:var(--performance-task-status-line-height);white-space:nowrap}
.performance-task-status__dot{display:block;align-self:center;flex:0 0 var(--performance-task-status-dot-size);width:var(--performance-task-status-dot-size);height:var(--performance-task-status-dot-size);margin-right:var(--performance-task-status-gap);border-radius:50%;background:var(--performance-task-status-pending)}
.performance-task-status.is-pending .performance-task-status__dot{background:var(--performance-task-status-pending)}
.performance-task-status.is-completed .performance-task-status__dot{background:var(--performance-task-status-completed)}
.performance-task-status.is-overdue .performance-task-status__dot{background:var(--performance-task-status-overdue)}
.performance-task-status.is-rejected{align-items:center}
.performance-task-status.is-rejected .performance-task-status__dot{position:relative;top:var(--performance-task-status-rejected-offset);background:var(--performance-task-status-rejected)}
</style>
