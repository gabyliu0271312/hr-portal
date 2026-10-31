<template>
  <footer class="self-summary-footer">
    <PerformanceButton variant="primary" :disabled="submitting || !submitAllowed || !editable" :loading="submitting" @click="$emit('submit')">{{ submitting ? '提交中…' : '提交' }}</PerformanceButton>
    <PerformanceButton variant="secondary" :disabled="submitting" @click="$emit('cancel')">取消</PerformanceButton>
    <span role="status">{{ message }}</span>
  </footer>
</template>

<script setup lang="ts">
import PerformanceButton from './PerformanceButton.vue'

defineProps<{ submitting: boolean; submitAllowed: boolean; editable: boolean; message: string }>()
defineEmits<{ submit: []; cancel: [] }>()
</script>

<style scoped>
.self-summary-footer{position:relative;right:auto;bottom:auto;left:auto;z-index:1;display:flex;width:100%;height:64px;min-height:64px;flex:0 0 64px;align-items:center;gap:var(--performance-button-gap);padding:0 var(--spacing-5);box-sizing:border-box;background:var(--color-bg-card);box-shadow:0 -1px 0 var(--color-line-divider)}.self-summary-footer :deep(.performance-button){min-width:var(--performance-button-min-width)}.self-summary-footer span{color:var(--color-text-placeholder);font-size:var(--font-size-md);line-height:21px}
@media(max-width:640px){.self-summary-footer{height:auto;min-height:64px;flex:0 0 auto;flex-wrap:wrap;padding:12px 16px;row-gap:8px}.self-summary-footer span{min-width:0;flex-basis:100%;overflow-wrap:anywhere}}
</style>
