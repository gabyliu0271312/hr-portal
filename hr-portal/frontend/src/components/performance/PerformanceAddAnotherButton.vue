<template>
  <button class="performance-add-another-button" type="button" :disabled="disabled" :aria-label="label" @click="$emit('click')">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="AddOutlined" aria-hidden="true"><path d="M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 1 0 2 0v-8h8a1 1 0 1 0 0-2h-8V3a1 1 0 0 0-1-1Z" fill="currentColor" /></svg>
    <span>{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label?: string; disabled?: boolean }>(), { label: '添加', disabled: false })
defineEmits<{ click: [] }>()
</script>

<style scoped>
.performance-add-another-button{display:inline-flex;width:54px;height:22px;align-items:center;gap:4px;padding:0;border:0;background:transparent;color:#3370ff;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer}.performance-add-another-button:disabled{cursor:not-allowed;opacity:.5}.performance-add-another-button svg{display:block;width:14px;height:14px;flex:0 0 14px;overflow:hidden}
</style>
