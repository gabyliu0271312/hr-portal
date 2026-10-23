<template>
  <header class="performance-assessment-preview-header">
    <component :is="headingTag">{{ name || '未命名名称' }}</component>
    <p v-if="description" :class="descriptionClass">{{ description }}</p>
  </header>
</template>
<script setup lang="ts">
withDefaults(defineProps<{ name?: string; description?: string; headingTag?: 'h2' | 'h3' | 'strong'; descriptionClass?: string }>(), { headingTag: 'strong', descriptionClass: '' })
</script>
<style scoped>
.performance-assessment-preview-header{position:relative;display:block;margin:0 0 16px;padding:0 0 0 10px}.performance-assessment-preview-header::before{position:absolute;top:5px;left:0;width:2px;height:14px;background:var(--color-primary,#3370ff);content:''}.performance-assessment-preview-header :is(strong,h2,h3){display:block;margin:0;color:inherit;font-size:16px;font-weight:600;line-height:24px}.performance-assessment-preview-header p{margin:2px 0 0;color:var(--color-text-secondary,#646a73);font-size:14px;line-height:22px;white-space:pre-wrap;overflow-wrap:anywhere}
</style>
