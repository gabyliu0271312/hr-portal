<template>
  <div class="performance-filter-actions" :class="{ 'performance-filter-actions--wide': size === 'default' }" role="group" aria-label="筛选操作">
    <UiButton :size="size" variant="primary" class="performance-filter-actions__button" :disabled="confirmDisabled" @click="emit('confirm')">{{ confirmText }}</UiButton>
    <UiButton :size="size" variant="secondary" class="performance-filter-actions__button" @click="emit('cancel')">{{ cancelText }}</UiButton>
    <UiButton v-if="showClear" :size="size" variant="link" class="performance-filter-actions__button" @click="emit('clear')">{{ clearText }}</UiButton>
  </div>
</template>

<script setup lang="ts">
import UiButton from '../ui/UiButton.vue'

withDefaults(defineProps<{
  showClear?: boolean
  size?: 'small' | 'default'
  confirmText?: string
  cancelText?: string
  clearText?: string
  confirmDisabled?: boolean
}>(), {
  showClear: true,
  size: 'small',
  confirmText: '确定',
  cancelText: '取消',
  clearText: '清除',
  confirmDisabled: false,
})
const emit = defineEmits<{ confirm: []; cancel: []; clear: [] }>()
</script>

<style scoped>
.performance-filter-actions {
  position: sticky;
  bottom: calc(-1 * var(--performance-popover-padding-y));
  z-index: 1;
  display: flex;
  flex-direction: row-reverse;
  gap: var(--performance-filter-action-gap);
  padding: var(--performance-filter-footer-padding);
  background: var(--color-bg-card);
}
.performance-filter-actions :deep(.performance-button) { min-width: var(--performance-filter-action-width); }
.performance-filter-actions--wide :deep(.performance-button) { min-width: var(--performance-button-min-width); }
</style>
