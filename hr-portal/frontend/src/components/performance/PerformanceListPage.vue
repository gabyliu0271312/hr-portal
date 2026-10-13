<script setup lang="ts">
import PerformanceContentSurface from './PerformanceContentSurface.vue'

defineProps<{ title: string }>()
</script>

<template>
  <div class="list-page">
    <div class="list-page-heading">
      <div class="list-page-title">{{ title }}</div>
      <div v-if="$slots['title-actions']" class="list-page-title-actions"><slot name="title-actions" /></div>
    </div>
    <slot name="header" />
    <PerformanceContentSurface class="list-page-content">
      <slot />
    </PerformanceContentSurface>
  </div>
</template>

<style scoped>
.list-page {
  min-height: 0;
  height: calc(100vh - 96px);
  display: flex;
  flex-direction: column;
  color: #1f2329;
}
.list-page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-3);
  height: 26px;
  margin-bottom: var(--spacing-4);
}
.list-page-title-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  flex: 0 0 auto;
  height: var(--performance-control-height);
}
.list-page-title {
  min-width: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
}
.list-page-content {
  flex: 1 1 0%;
  min-height: auto;
}
</style>
