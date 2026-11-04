<script setup lang="ts">
/**
 * 模板预览弹窗：在弹层中以只读三栏布局预览已保存的绩效模板。
 * 复用向导第 4 步的 PerformanceTemplatePreviewStep（同一数据源与渲染逻辑）。
 */
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceTemplatePreviewStep from './PerformanceTemplatePreviewStep.vue'

defineProps<{ open: boolean; templateId: number | null; name?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<template>
  <PerformanceDialogShell
    :model-value="open"
    :title="`模板预览${name ? ` · ${name}` : ''}`"
    width="min(1240px, calc(100vw - 64px))"
    dialog-class="performance-template-preview-dialog"
    @update:model-value="emit('update:open', $event)"
  >
    <PerformanceTemplatePreviewStep v-if="open && templateId" :key="templateId" :template-id="templateId" />
    <p v-else class="preview-empty" role="status">暂无可预览的模板</p>
  </PerformanceDialogShell>
</template>

<style scoped>
/* 预览步骤按视口高度自撑，弹层 body 定高并去掉内边距，让三栏贴边铺满 */
:deep(.performance-dialog__body) { height: min(74vh, 780px); padding: 0; overflow: hidden; }
.preview-empty { margin: 0; padding: 48px 0; text-align: center; color: var(--color-text-secondary); font-size: var(--font-size-md); }
</style>
