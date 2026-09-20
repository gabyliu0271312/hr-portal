<script setup lang="ts">
import PerformanceContentSurface from './PerformanceContentSurface.vue'

defineProps<{ title: string }>()
</script>

<template>
  <div class="list-page">
    <div class="list-page-title">{{ title }}</div>
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
.list-page-title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
  line-height: 26px;
}
.list-page-content {
  flex: 1 1 0%;
  min-height: auto;
}
</style>
