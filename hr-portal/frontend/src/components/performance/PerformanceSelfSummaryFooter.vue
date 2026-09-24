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
.self-summary-footer{position:fixed;right:0;bottom:0;left:0;z-index:99;display:flex;width:100%;height:63px;min-height:63px;flex:none;align-items:center;gap:var(--performance-button-gap);padding:0 var(--spacing-5);box-sizing:border-box;background:var(--color-bg-card);box-shadow:0 -1px 0 var(--color-line-divider)}.self-summary-footer :deep(.performance-button){min-width:var(--performance-button-min-width)}.self-summary-footer span{color:var(--color-text-placeholder);font-size:var(--font-size-md);line-height:21px}
</style>
