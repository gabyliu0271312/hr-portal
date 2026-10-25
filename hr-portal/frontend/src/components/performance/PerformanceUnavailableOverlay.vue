<template>
  <span class="performance-unavailable-overlay" role="img" aria-label="不允许查看">
    <span class="performance-unavailable-overlay__veil" aria-hidden="true"></span>
    <span class="performance-unavailable-overlay__icon" aria-hidden="true"><PerformanceVisibleLockIcon /></span>
  </span>
</template>

<script setup lang="ts">
import PerformanceVisibleLockIcon from './PerformanceVisibleLockIcon.vue'
</script>

<style scoped>
.performance-unavailable-overlay{position:absolute;inset:0;z-index:2;pointer-events:none;border-radius:inherit}.performance-unavailable-overlay__veil{position:absolute;inset:0;border-radius:inherit;background:var(--performance-content-unavailable-overlay)}.performance-unavailable-overlay__icon{position:absolute;top:var(--spacing-1);right:var(--spacing-2);z-index:1;display:grid;place-items:center;width:var(--performance-icon-button-size);height:var(--performance-icon-button-size);padding:var(--spacing-1);box-sizing:border-box;color:var(--performance-content-unavailable-icon)}.performance-unavailable-overlay__icon svg{display:block;width:var(--performance-icon-size);height:var(--performance-icon-size);overflow:hidden}
</style>
