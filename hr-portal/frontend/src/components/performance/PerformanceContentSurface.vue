<script setup lang="ts">
withDefaults(defineProps<{ variant?: 'default' | 'table' }>(), { variant: 'default' })
</script>

<template>
  <section class="performance-content-surface" :class="`is-${variant}`">
    <slot />
  </section>
</template>

<style scoped>
.performance-content-surface {
  box-sizing: border-box;
  width: 100%;
  min-height: 0;
  padding: var(--performance-content-surface-padding);
  border-radius: var(--performance-content-surface-radius);
  background: var(--performance-content-surface-background);
  box-shadow: var(--performance-content-surface-shadow);
}
.performance-content-surface.is-table { padding: var(--performance-table-surface-padding); }
</style>
