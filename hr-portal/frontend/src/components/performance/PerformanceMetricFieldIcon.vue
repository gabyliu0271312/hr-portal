<template>
  <span class="performance-metric-field-icon" aria-hidden="true">
    <svg v-if="fieldType === 'percentage'" width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="SheetPercentOutlined"><path d="M17.841 2.799a1 1 0 0 1 1.598 1.203l-13.24 17.57a1 1 0 1 1-1.597-1.203l13.24-17.57ZM7.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM21 17.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-2 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" fill="currentColor" /></svg>
    <svg v-else-if="fieldType === 'number'" width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="NumberOutlined"><path d="M8.774 2.14a1 1 0 0 1 .85 1.129L9.242 6h6.98l.423-3.01a1 1 0 1 1 1.98.279L18.242 6H22a1 1 0 1 1 0 2h-4.04l-.984 7H20a1 1 0 1 1 0 2h-3.305l-.575 4.093a1 1 0 1 1-1.98-.278L14.674 17h-6.98l-.575 4.093a1 1 0 1 1-1.98-.278L5.674 17H2a1 1 0 1 1 0-2h3.956l.984-7H4a1 1 0 1 1 0-2h3.221l.423-3.01a1 1 0 0 1 1.13-.85ZM14.956 15l.984-7H8.96l-.984 7h6.98Z" fill="currentColor" /></svg>
    <svg v-else-if="fieldType === 'person'" width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="PersonAdmitOutlined"><path d="M15.5 6.5a5 5 0 1 0-10.002.002A5 5 0 0 0 15.5 6.5Zm-5 3a3.001 3.001 0 1 1 0-6 3.001 3.001 0 0 1 0 6ZM4 19c0-.346.045-.68.125-1 .445-1.725 2.01-3 3.875-3h4.5v-2H8a6 6 0 0 0-6 6v1c0 1.1.9 2 2 2h8.5v-2H4v-1Zm16.565-3.293a1 1 0 0 1 1.414 1.414l-4.404 4.404a1 1 0 0 1-1.414 0l-2.454-2.454a1 1 0 1 1 1.414-1.414l1.747 1.747 3.697-3.697Z" fill="currentColor" /></svg>
    <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="StyleOutlined"><path d="M8.437 4.898 5.447 13h6.063L8.437 4.898Zm6.025 15.881L12.269 15h-7.56l-2.131 5.78a1 1 0 1 1-1.873-.703L7.02 2.982c.491-1.31 2.344-1.31 2.835 0l6.48 17.095a1 1 0 1 1-1.872.702ZM15.056 5a1 1 0 1 0 0 2H23a1 1 0 0 1 0-2h-7.944Zm1.055 7a1 1 0 0 1 1-1H23a1 1 0 1 1 0 2h-5.89a1 1 0 1 1-1-1Zm3.056 5a1 1 0 1 0 0 2H23a1 1 0 0 0-0-2-0h-3.833Z" fill="currentColor" /></svg>
  </span>
</template>

<script setup lang="ts">
import type { MetricFieldType } from '@/api/performanceMetricFields'

defineProps<{ fieldType: MetricFieldType | 'person' }>()
</script>

<style scoped>
.performance-metric-field-icon { display: inline-flex; width: 14px; height: 14px; align-items: center; justify-content: center; color: currentColor; }
.performance-metric-field-icon svg { display: block; width: 14px; height: 14px; }
</style>
