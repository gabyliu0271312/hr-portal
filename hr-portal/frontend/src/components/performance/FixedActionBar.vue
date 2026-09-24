<script setup lang="ts">
import PerformanceButton from './PerformanceButton.vue'

withDefaults(defineProps<{ submitting?: boolean }>(), { submitting: false })

const emit = defineEmits<{
  submit: []
  preview: []
  cancel: []
}>()
</script>

<template>
  <footer class="full-screen-modal-footer">
    <slot>
      <PerformanceButton variant="primary" class="full-screen-modal-footer-button" :loading="submitting" @click="emit('submit')">提交</PerformanceButton>
      <PerformanceButton variant="secondary" class="full-screen-modal-footer-button preview-button" @click="emit('preview')">预览</PerformanceButton>
      <PerformanceButton variant="secondary" class="full-screen-modal-footer-button cancel-button" @click="emit('cancel')">取消</PerformanceButton>
    </slot>
  </footer>
</template>

<style scoped>
.full-screen-modal-footer {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  min-height: var(--performance-fullscreen-footer-height);
  padding: 8px max(0px, calc((100% - var(--performance-form-surface-width)) / 2));
  box-sizing: border-box;
  background: var(--color-bg-card);
  gap: var(--performance-button-gap);
}
.full-screen-modal-footer :deep(.performance-button) { width: var(--performance-button-min-width); }
.full-screen-modal-footer :deep(.performance-button + .performance-button) { margin-left: 0; }
</style>
