<template>
  <h3 class="report-secondary-heading performance-report-section-title">
    <span>{{ label }}</span>
    <PerformanceInfoPopover class="performance-report-section-title__icon" :content="info" :aria-label="`${label}说明`" />
  </h3>
</template>

<script setup lang="ts">
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'

defineProps<{ label: string; info?: string }>()
</script>

<style scoped>
.performance-report-section-title { display: flex; align-items: center; gap: var(--performance-info-icon-gap); height: 40px; margin: 0; color: #1f2329; font-size: 16px; line-height: 24px; font-weight: 500; }
.performance-report-section-title__icon { flex: 0 0 var(--performance-info-icon-size); color: var(--performance-info-icon-color); }
</style>
