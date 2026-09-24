<template>
  <footer class="performance-drawer-footer" :class="`performance-drawer-footer--${variant}`">
    <PerformanceButton variant="primary" @click="$emit('confirm')">{{ confirmText }}</PerformanceButton>
    <PerformanceButton variant="secondary" @click="$emit('cancel')">{{ cancelText }}</PerformanceButton>
  </footer>
</template>

<script setup lang="ts">
import PerformanceButton from './PerformanceButton.vue'

withDefaults(defineProps<{ confirmText?: string; cancelText?: string; variant?: 'default' | 'captured' }>(), { confirmText: '确定', cancelText: '取消', variant: 'default' })
defineEmits<{ confirm: []; cancel: [] }>()
</script>

<style scoped>
.performance-drawer-footer{display:flex;align-items:center;flex:0 0 var(--performance-drawer-footer-height);padding:12px var(--performance-drawer-footer-padding-x);box-sizing:border-box;border-top:1px solid var(--color-line-divider);background:var(--color-bg-card);box-shadow:0 1px 6px rgba(31,35,41,.12);z-index:1;gap:var(--performance-button-gap)}.performance-drawer-footer :deep(.performance-button){min-width:var(--performance-button-min-width)}.performance-drawer-footer--captured{flex-basis:72px;padding:var(--spacing-5)}
</style>
