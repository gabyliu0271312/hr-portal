<script setup lang="ts">
/**
 * 模板预览弹窗：以全屏页形式呈现三栏预览，与 REA「模板预览」页保持同一视口几何
 * （左栏 320 + 中/右各 (100vw-320)/2，1680 视口下即 320 / 679.3 / 679.3）。
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
    width="100vw"
    dialog-class="performance-template-preview-dialog"
    @update:model-value="emit('update:open', $event)"
  >
    <PerformanceTemplatePreviewStep v-if="open && templateId" :key="templateId" :template-id="templateId" />
    <p v-else class="preview-empty" role="status">暂无可预览的模板</p>
  </PerformanceDialogShell>
</template>

<style scoped>
/* 全屏页：顶部 56（对齐 REA 页头）+ 三栏铺满剩余高度；弹层去掉圆角/阴影/内边距 */
:deep(.performance-dialog-overlay) { padding: 0; }
:deep(.performance-dialog) { width: 100vw; height: 100vh; max-width: none; max-height: none; border-radius: 0; box-shadow: none; }
:deep(.performance-dialog__header) { display: flex; align-items: center; height: 56px; min-height: 56px; padding: 0 24px; box-sizing: border-box; border-bottom: 1px solid #eff0f1; }
:deep(.performance-dialog__header h2) { font-size: 16px; font-weight: 600; line-height: 22px; }
:deep(.performance-dialog__close) { top: 16px; right: 20px; }
:deep(.performance-dialog__body) { flex: 1; min-height: 0; height: auto; margin: 0; padding: 0; overflow: hidden; }
:deep(.performance-dialog__footer) { display: none; }
.preview-empty { margin: 0; padding: 48px 0; text-align: center; color: #646a73; font-size: 14px; }
</style>
