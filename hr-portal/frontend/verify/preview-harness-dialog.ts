/**
 * 校验入口（弹窗通道）：与 preview-harness.ts 同一批桩数据，
 * 但把「模板预览」挂在真实的全屏弹窗壳里（PerformanceTemplatePreviewDialog），
 * 用于测量容器层是否会带来滚动条 / 高度不确定，进而影响三栏分割线位置。
 */
import { createApp, h } from 'vue'
import PerformanceTemplatePreviewDialog from '@/components/performance/PerformanceTemplatePreviewDialog.vue'
import { performanceTemplateApi } from '@/api/performance'
import '../src/styles/index.css'
import { nodes } from './preview-node-fixture'

;(performanceTemplateApi as unknown as { getWorkflow: () => Promise<unknown> }).getWorkflow = async () => ({ template_id: 1, nodes })

createApp({
  render: () => h(PerformanceTemplatePreviewDialog, { open: true, templateId: 1, name: '测试模板' }),
}).mount('#app')
