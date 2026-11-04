/**
 * 校验入口（向导通道）：把「模板预览」挂进与 PerformanceTemplateCreate.vue 同构的整页壳
 * （.full-screen-modal + .full-screen-modal-content），验证第 4 步容器不会让三栏高度/宽度漂移。
 */
import { createApp, h } from 'vue'
import PerformanceTemplatePreviewStep from '@/components/performance/PerformanceTemplatePreviewStep.vue'
import { performanceTemplateApi } from '@/api/performance'
import '../src/styles/index.css'
import { nodes } from './preview-node-fixture'

;(performanceTemplateApi as unknown as { getWorkflow: () => Promise<unknown> }).getWorkflow = async () => ({ template_id: 1, nodes })

createApp({
  render: () => h(PerformanceTemplatePreviewStep, { templateId: 1 }),
}).mount('#wizard-root')
