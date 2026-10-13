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
.surface-card { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; box-sizing: border-box; padding: var(--spacing-5); border-radius: var(--radius-lg); background: var(--performance-content-surface-background); box-shadow: var(--shadow-dialog); font-size: var(--font-size-md); line-height: 21px; color: var(--color-text-primary); }
</style>
