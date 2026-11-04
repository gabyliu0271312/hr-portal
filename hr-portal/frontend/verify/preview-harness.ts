/**
 * 临时校验入口：用真实组件 + 桩数据在 1680×950 视口渲染「模板预览」，
 * 供 Playwright 读取几何/文本矩形并与 REA DOM 实测值逐项比对（不做截图比对）。
 * 桩数据的环节名称、执行人、顺序与 REA 模板 7699791798989900738 完全一致，
 * 这样左栏与面板骨架可以直接逐像素对照。
 */
import { createApp, h } from 'vue'
import PerformanceTemplatePreviewStep from '@/components/performance/PerformanceTemplatePreviewStep.vue'
import { performanceTemplateApi } from '@/api/performance'
import '../src/styles/index.css'

import { nodes } from './preview-node-fixture'

;(performanceTemplateApi as unknown as { getWorkflow: () => Promise<unknown> }).getWorkflow = async () => ({ template_id: 1, nodes })

document.body.style.margin = '0'
document.body.style.overflow = 'hidden'

createApp({
  render: () => h('div', { style: 'width:1680px;height:950px;display:flex;flex-direction:column;overflow:hidden' }, [
    h('div', { style: 'height:56px;flex:none;background:#fff;border-bottom:1px solid #eff0f1' }),
    h('div', { style: 'flex:1;min-height:0;width:1680px' }, [h(PerformanceTemplatePreviewStep, { templateId: 1 })]),
  ]),
}).mount('#app')
