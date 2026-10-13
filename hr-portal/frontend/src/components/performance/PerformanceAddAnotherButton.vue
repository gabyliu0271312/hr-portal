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
.performance-add-another-button{display:inline-flex;width:54px;height:22px;align-items:center;gap:var(--spacing-1);padding:0;border:0;border-radius:var(--performance-button-radius);background:transparent;color:var(--performance-button-text-color);font:var(--performance-button-font-weight) var(--performance-button-font-size)/22px var(--font-sans);cursor:pointer;transition:color var(--duration-fast) var(--ease-standard),background-color var(--duration-fast) var(--ease-standard)}.performance-add-another-button:hover:not(:disabled){background:var(--performance-button-text-hover-background)}.performance-add-another-button:focus-visible{outline:0;box-shadow:var(--performance-button-focus-ring)}.performance-add-another-button:disabled{color:var(--color-text-placeholder);cursor:not-allowed;opacity:.7}.performance-add-another-button svg{display:block;width:14px;height:14px;flex:0 0 14px;overflow:hidden}
</style>
