<template>
  <h3 class="report-secondary-heading performance-report-section-title">
    <span>{{ label }}</span>
    <InfoOutlinedIcon class="performance-report-section-title__icon" />
  </h3>
</template>

<script setup lang="ts">
import InfoOutlinedIcon from './InfoOutlinedIcon.vue'

defineProps<{ label: string }>()
</script>

<style scoped>
.performance-report-section-title { display: flex; align-items: center; gap: 4px; height: 40px; margin: 0; color: #1f2329; font-size: 16px; line-height: 24px; font-weight: 500; }
.performance-report-section-title__icon { flex: 0 0 16px; width: 16px; height: 16px; color: #646a73; }
</style>
