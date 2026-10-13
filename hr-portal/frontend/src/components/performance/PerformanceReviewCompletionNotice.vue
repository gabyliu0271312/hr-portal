<template>
  <div class="performance-review-completion-notice" :class="`performance-review-completion-notice--${variant}`" role="status">
    <svg class="performance-review-completion-notice__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11.996 22.98c-6.067 0-10.983-4.918-10.983-10.984S5.93 1.013 11.996 1.013c6.066 0 10.983 4.917 10.983 10.983 0 6.066-4.917 10.984-10.983 10.984Z" fill="currentColor"/><path d="M17.537 10.746a1.38 1.38 0 0 0-.005-1.95 1.378 1.378 0 0 0-1.95-.005l-4.89 4.89-2.285-2.285a1.375 1.375 0 0 0-1.942.012 1.373 1.373 0 0 0-.013 1.942c1.178 1.175 2.356 2.348 3.53 3.528.392.394 1.03.394 1.422 0 2.037-2.051 4.087-4.09 6.133-6.132Z" fill="#fff"/></svg>
    <div class="performance-review-completion-notice__main">
      <div class="performance-review-completion-notice__description">{{ message }}</div>
      <div v-if="editable" class="performance-review-completion-notice__action"><PerformanceButton variant="secondary" size="small" class="performance-review-completion-notice__edit" aria-label="编辑已提交内容" @click="$emit('edit')"><span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="EditOutlined" aria-hidden="true"><path d="m17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 0 0 0-2H3Z" fill="currentColor"/></svg></span>编辑</PerformanceButton></div>
    </div>
  </div>
</template>
<script setup lang="ts">
import PerformanceButton from './PerformanceButton.vue'

withDefaults(defineProps<{ editable: boolean; message: string; variant?: 'default' | 'evaluation-drawer' }>(), { variant: 'default' })
defineEmits<{ edit: [] }>()
</script>
<style scoped>
.performance-review-completion-notice{display:flex;align-items:flex-start;overflow:hidden;min-width:0;margin-bottom:var(--spacing-5);padding:9px 0 9px 16px;box-sizing:border-box;border-radius:var(--radius-md);background:var(--performance-review-completion-bg);color:var(--color-text-primary);font-size:var(--font-size-md);line-height:22px}.performance-review-completion-notice__icon{flex:0 0 16px;margin:3px 8px 0 0;color:var(--performance-review-completion-icon)}.performance-review-completion-notice__main{display:flex;min-width:0;flex:1;align-items:flex-start}.performance-review-completion-notice__description{min-width:0;flex:1;padding-right:32px;word-break:break-word}.performance-review-completion-notice__action{flex:0 0 auto;padding-right:32px}.performance-review-completion-notice__edit{min-width:80px}.performance-review-completion-notice__edit :deep(svg){display:inline-block;width:12px;height:12px;overflow:hidden}.performance-review-completion-notice--evaluation-drawer{margin-bottom:12px;padding:9px 0 9px 16px;background:#e4fae1}.performance-review-completion-notice--evaluation-drawer .performance-review-completion-notice__description{padding-right:16px;color:#1f2329}.performance-review-completion-notice--evaluation-drawer .performance-review-completion-notice__action{padding-right:0}
</style>
