<template>
  <footer class="performance-drawer-footer" :class="`performance-drawer-footer--${variant}`">
    <PerformanceButton class="performance-drawer-footer__confirm" variant="primary" :disabled="confirmDisabled" @click="$emit('confirm')">{{ confirmText }}</PerformanceButton>
    <PerformanceButton v-if="continueText" class="performance-drawer-footer__continue" variant="continue" @click="$emit('continue')">{{ continueText }}</PerformanceButton>
    <PerformanceButton class="performance-drawer-footer__cancel" variant="secondary" @click="$emit('cancel')">{{ cancelText }}</PerformanceButton>
  </footer>
</template>

<script setup lang="ts">
import PerformanceButton from './PerformanceButton.vue'

withDefaults(defineProps<{ confirmText?: string; continueText?: string; cancelText?: string; confirmDisabled?: boolean; variant?: 'default' | 'captured' | 'captured-invite' }>(), { confirmText: '确定', continueText: '', cancelText: '取消', confirmDisabled: false, variant: 'default' })
defineEmits<{ confirm: []; continue: []; cancel: [] }>()
</script>

<style scoped>
.performance-drawer-footer{display:flex;align-items:center;flex:0 0 var(--performance-drawer-footer-height);padding:12px var(--performance-drawer-footer-padding-x);box-sizing:border-box;border-top:1px solid var(--color-line-divider);background:var(--color-bg-card);box-shadow:0 1px 6px rgba(31,35,41,.12);z-index:1;gap:var(--performance-button-gap)}.performance-drawer-footer :deep(.performance-button){min-width:var(--performance-button-min-width)}.performance-drawer-footer--captured{flex-basis:72px;padding:var(--spacing-5)}.performance-drawer-footer--captured-invite{flex-basis:81px;padding:24px}
</style>
