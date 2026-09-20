<template>
  <div class="page-title">
    <div class="page-title-text" :title="title">{{ title }}</div>
    <div v-if="$slots.default || $slots.actions" class="page-title-actions">
      <slot />
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<style scoped>
.page-title { display: flex; min-width: 0; align-items: flex-start; gap: var(--performance-page-title-gap); }
.page-title-text { flex: 1; min-width: 0; overflow: hidden; box-sizing: border-box; color: var(--performance-page-title-color); font-size: var(--performance-page-title-size); font-weight: var(--performance-page-title-weight); line-height: var(--performance-page-title-line-height); white-space: nowrap; text-overflow: ellipsis; }
.page-title-actions { display: flex; flex: none; align-items: flex-start; gap: var(--performance-page-title-gap); }
</style>
