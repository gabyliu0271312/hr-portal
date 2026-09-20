<template>
  <header class="performance-assessment-preview-header">
    <strong>{{ name || '未命名名称' }}</strong>
    <p v-if="description">{{ description }}</p>
  </header>
</template>
<script setup lang="ts">
defineProps<{ name?: string; description?: string }>()
</script>
<style scoped>
.performance-assessment-preview-header{position:relative;display:block;margin:0 0 18px;padding:0 0 0 10px}.performance-assessment-preview-header::before{position:absolute;top:0;left:0;width:2px;height:26px;background:#3370ff;content:''}.performance-assessment-preview-header strong{display:block;font-size:18px;font-weight:600;line-height:26px}.performance-assessment-preview-header p{margin:2px 0 0;color:#646a73;font-size:14px;line-height:22px}
</style>
