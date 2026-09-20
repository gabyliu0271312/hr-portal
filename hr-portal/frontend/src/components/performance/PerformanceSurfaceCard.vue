<template>
  <div class="surface-card">
    <PerformanceSectionCardHeader v-if="title" :title="title">
      <slot name="header-extra" />
    </PerformanceSectionCardHeader>
    <slot />
  </div>
</template>

<script setup lang="ts">
import PerformanceSectionCardHeader from './PerformanceSectionCardHeader.vue'

defineProps<{
  title?: string
}>()
</script>

<style scoped>
.surface-card { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; box-sizing: border-box; padding: 20px; border-radius: 8px; background: var(--performance-content-surface-background, #fff); box-shadow: rgba(31, 35, 41, 0.03) 0 4px 16px 4px, rgba(31, 35, 41, 0.02) 0 4px 8px 0, rgba(31, 35, 41, 0.02) 0 2px 4px -4px; font-size: 14px; line-height: 21px; color: #1f2329; }
</style>
