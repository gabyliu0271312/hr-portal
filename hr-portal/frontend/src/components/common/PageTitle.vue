<template>
  <div class="page-title">
    <div class="page-title-text" :title="title">{{ title }}</div>
    <div v-if="description" class="page-title-desc">{{ description }}</div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
}>(), { description: '' })
</script>

<style scoped>
.page-title { min-width: 0; }
.page-title-text { box-sizing: border-box; color: var(--page-title-color); font-size: var(--page-title-size); font-weight: var(--page-title-weight); line-height: var(--page-title-line-height); }
.page-title-desc { color: var(--page-title-desc-color); font-size: var(--page-title-desc-size); font-weight: 400; line-height: var(--page-title-desc-line-height); margin: var(--page-title-gap-with-desc) 0 var(--page-title-gap-bottom); }
</style>
