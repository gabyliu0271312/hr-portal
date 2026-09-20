<template>
  <div class="section-card-header">
    <span class="header-bar" aria-hidden="true"></span>
    <span class="header-title">{{ title }}</span>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<style scoped>
.section-card-header { display: flex; height: 24px; align-items: flex-start; margin-bottom: 14px; line-height: 24px; }
.header-bar { flex: 0 0 auto; width: 2px; height: 16px; margin-top: 4px; margin-right: 8px; background: #3370ff; }
.header-title { color: #1f2329; font-size: 16px; font-weight: 600; line-height: 24px; }
</style>
