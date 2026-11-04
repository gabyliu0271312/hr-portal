<script setup lang="ts">
/**
 * 模板预览弹窗：以全屏页形式呈现三栏预览，与 REA「模板预览」页保持同一视口几何
 * （左栏 320 + 分割线 1 + 中/右各 (100vw-321)/2，1680 视口下即 320 / 1 / 679 / 1 / 679）。
 * 复用向导第 4 步的 PerformanceTemplatePreviewStep（同一数据源与渲染逻辑）。
 *
 * 注意：弹窗壳的 DOM 渲染在 Teleport(body) 内，本组件的 scoped :deep() 在祖先链上
 * 找不到 data-v 属性，覆写会整体失效（padding / 高度 / overflow 回退成默认值，
 * 预览根节点高度随内容变化 → 三栏分割线切换环节或页签时漂移）。
 * 因此全屏形态统一走弹窗壳的 fullscreen 变体。
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
    fullscreen
    dialog-class="performance-template-preview-dialog"
    @update:model-value="emit('update:open', $event)"
  >
    <PerformanceTemplatePreviewStep v-if="open && templateId" :key="templateId" :template-id="templateId" />
    <p v-else class="preview-empty" role="status">暂无可预览的模板</p>
  </PerformanceDialogShell>
</template>

<style scoped>
.preview-empty { margin: 0; padding: 48px 0; text-align: center; color: #646a73; font-size: 14px; }
</style>
