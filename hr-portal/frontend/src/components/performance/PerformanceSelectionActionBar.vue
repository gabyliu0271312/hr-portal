<template>
  <footer class="performance-selection-action-bar">
    <div class="performance-selection-action-bar__actions">
      <PerformanceButton variant="primary" :disabled="!selectedCount || !capabilities.canRemind || loading" @click="emit('action', 'remind')">催办</PerformanceButton>
      <PerformanceButton variant="secondary" :disabled="!selectedCount || !capabilities.canAuthorize || loading" @click="emit('action', 'authorize')">授权他人处理</PerformanceButton>
      <PerformanceButton variant="secondary" :disabled="!selectedCount || !capabilities.canTransfer || loading" @click="emit('action', 'transfer')">转交他人处理</PerformanceButton>
      <span class="selected-count">已选择 {{ selectedCount }} 条</span>
      <PerformanceButton variant="text" :disabled="!selectedCount || loading" @click="emit('clear')">清除</PerformanceButton>
    </div>
  </footer>
</template>

<script setup lang="ts">
import type { ReminderCapabilities } from './performanceReminder'
import PerformanceButton from './PerformanceButton.vue'

defineProps<{ selectedCount: number; capabilities: ReminderCapabilities; loading?: boolean }>()
const emit = defineEmits<{ action: ['remind' | 'authorize' | 'transfer']; clear: [] }>()
</script>

<style scoped>
.performance-selection-action-bar{position:fixed;right:0;bottom:0;z-index:3;display:flex;align-items:center;height:60px;padding:0 var(--spacing-5);box-sizing:border-box;background:var(--color-bg-card);box-shadow:var(--shadow-popover)}.performance-selection-action-bar__actions{display:flex;align-items:center;gap:var(--performance-button-gap)}.performance-selection-action-bar :deep(.performance-button){min-width:var(--performance-button-min-width)}.performance-selection-action-bar :deep(.performance-button:first-child){margin-right:var(--spacing-3)}.performance-selection-action-bar .selected-count{margin-left:var(--spacing-2);color:var(--color-text-secondary);font-size:var(--font-size-md);line-height:var(--performance-button-line-height)}
</style>
