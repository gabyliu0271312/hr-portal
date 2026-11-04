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

const okrRelation = {
  content_id: 'reference-okr', type: 'reference', content_slot: 'reference', name: 'OKR',
  description: '支持展示 OKR 内容、OKR 日志、OKR 异常完成情况等信息',
  reference_kind: 'more', reference_value: 'okr', items: [],
}
const fillSummary = {
  content_id: 'c-summary', type: 'work_summary', name: '工作总结', description: '请填写周期内的重点工作有效产出，包含数据、事例、项目进展等。',
  settings: { allowMultiple: true },
  items: [{ id: 'i-keywork', kind: 'fill', label: '重点工作 1', hint: '', questionType: 'text', settings: { required: true } }],
}
/** REA 该环节首条为「说明」块：标题 111 / 正文 222（bg #f0f4ff 的信息提示条） */
const fillPrompt = {
  content_id: 'c-prompt', type: 'prompt', name: '说明', description: '',
  prompt: { title: '111', content: '222', color: '#3370ff', showIcon: true },
  items: [],
}
/* REA 的评级档位：胶囊文案是 code（1星…5星），结果态显示 code + 等级名（label） */
/* 前景色按飞书 B-900 深色（结果态文字色）；REA 实测 3星 为 rgb(12, 41, 110) */
const ratingLevels = [
  { id: 'o1', code: '1星', label: '不符合预期', color: 'rgb(251, 191, 188)', foreground: 'rgb(122, 28, 22)' },
  { id: 'o2', code: '2星', label: '部分符合预期', color: 'rgb(254, 212, 164)', foreground: 'rgb(122, 71, 16)' },
  { id: 'o3', code: '3星-', label: '接近符合预期', color: 'rgb(186, 206, 253)', foreground: 'rgb(12, 41, 110)' },
  { id: 'o4', code: '3星', label: '符合预期', color: 'rgb(186, 206, 253)', foreground: 'rgb(12, 41, 110)' },
  { id: 'o5', code: '3星+', label: '超出预期', color: 'rgb(186, 206, 253)', foreground: 'rgb(12, 41, 110)' },
  { id: 'o6', code: '4星', label: '持续超出预期', color: 'rgb(183, 237, 177)', foreground: 'rgb(31, 82, 26)' },
  { id: 'o7', code: '5星', label: '卓越', color: 'rgb(205, 178, 250)', foreground: 'rgb(66, 32, 120)' },
]
const fillRating = {
  content_id: 'c-rating', type: 'rating', name: '综合评级', description: '描述',
  options: ratingLevels,
  /* 预览无真实答案：REA 参考区展示「3星 符合预期」 */
  settings: { sampleOptionId: 'o4' },
  items: [{ id: 'i-rating', kind: 'rating', label: '绩效评级', hint: '', settings: { required: true } }],
}


/* ---- 其余环节：与 REA 模板 7699791798989900738 的实际内容一致 ---- */
const evalPrompt = {
  content_id: 'c-eprompt', type: 'prompt', name: '说明',
  prompt: {
    title: '',
    content: '1. 评级和评语，在上级完成「绩效沟通并开通结果」后对被评估人可见。\n2. 评语不得出现任何歧视、职场骚扰、打击报复性质的内容，请做出客观评估。',
    color: '#3370ff', showIcon: true,
  },
  items: [],
}
const summaryPlain = {
  content_id: 'c-summary2', type: 'work_summary', name: '工作总结', description: '请填写周期内的重点工作有效产出，包含数据、事例、项目进展等。',
  items: [{ id: 'i-keywork2', kind: 'fill', label: '重点工作', hint: '', questionType: 'text', settings: { required: true } }],
}
const contribution = {
  content_id: 'c-contribution', type: 'work_summary', name: '价值贡献',
  description: '基于角色职责预期，评估实际产出和贡献，包括专业上的和管理上的（若有）两个方面。',
  items: [
    { id: 'i-good', kind: 'fill', label: '做得好的', hint: '', questionType: 'text', settings: { required: true } },
    { id: 'i-improve', kind: 'fill', label: '待改进的', hint: '', questionType: 'text', settings: { required: false } },
  ],
}
const feedback360 = {
  content_id: 'c-360', type: 'work_summary', name: '360°反馈',
  items: [{ id: 'i-360', kind: 'fill', label: '360°反馈内容', hint: '', questionType: 'text', settings: { required: true } }],
}
const messageBox = {
  content_id: 'c-msg', type: 'work_summary', name: '留言',
  items: [{ id: 'i-msg', kind: 'fill', label: '留言内容', hint: '', questionType: 'text', settings: { required: false } }],
}
const feedbackPrompt = {
  content_id: 'c-fprompt', type: 'prompt', name: '说明',
  prompt: {
    title: '',
    content: '可以谈谈你在过往的协作中，看到的 TA 的闪光点。\n也可以谈谈你希望 TA 如何更好的支持你的工作。\n或者从今后协作的角度给 TA 提供一些建议吧~',
    color: '#3370ff', showIcon: true,
  },
  items: [],
}
const developmentAdvice = {
  content_id: 'c-dev', type: 'work_summary', name: '发展建议',
  items: [{ id: 'i-dev', kind: 'fill', label: '短期/长期发展建议', hint: '', questionType: 'text', settings: { required: true } }],
}
const commPrompt = {
  content_id: 'c-cprompt', type: 'prompt', name: '说明',
  prompt: {
    title: '',
    content: '1. 请先跟员工绩效面谈，再提交发展建议。提交后，员工将立即收到绩效结果。若未提交，员工将一直无法查看自己的绩效结果。\n2. 沟通时请保持专注，避免多任务处理。\n3. 请勿交流他人及团队的绩效或薪酬信息，并强调「绩效结果保密原则」；如遇无法回答的问题，请与 HRBP 沟通。',
    color: '#3370ff', showIcon: true,
  },
  items: [],
}
const selfEvalSummary = { ...contribution, content_id: 'c-contribution-self' }


const refMoreSkeleton = {
  content_id: 'ref-more', type: 'reference', content_slot: 'reference', name: '更多参考',
  reference_kind: 'more', reference_value: 'more_reference',
  description: '支持展示绩效信息、异动信息、补充信息', items: [],
}
const refNode = (key: string, label: string, target: string) => ({
  content_id: `ref-${key}`, type: 'reference', content_slot: 'reference', name: label,
  reference_kind: 'node', reference_value: target, reference_settings: { page_name: label }, items: [],
})
const refTabsEval = [refNode('summary', '工作总结', 'n1'), refNode('self', '自评', 'n2'), refNode('fb360', '360°反馈', 'n4'), okrRelation, refMoreSkeleton]
const refTabsComm = [refNode('summary', '工作总结', 'n1'), refNode('self', '自评', 'n2'), refNode('eval', '上级评估', 'n7'), refNode('fb360', '360°反馈', 'n4'), okrRelation, refMoreSkeleton]


/* ---- 结果复议处理：绩效结果组（说明 + 工作总结 + 价值贡献 + 综合评级 + 标签型填写题） ---- */
const reconNotice = { ...evalPrompt, content_id: 'c-recon-prompt' }
const reconSummary = { ...summaryPlain, content_id: 'c-recon-summary', items: [{ ...summaryPlain.items[0], id: 'i-recon-keywork' }] }
/* REA 该环节的编辑器高度按字段持久化：做得好的 188 / 待改进的 166（工作总结的重点工作 144 为默认） */
const reconContribution = {
  ...contribution, content_id: 'c-recon-contribution',
  items: [
    { ...contribution.items[0], settings: { required: true, editorHeight: 188 } },
    { ...contribution.items[1], settings: { required: false, editorHeight: 166 } },
  ],
}
const reconRating = {
  content_id: 'c-recon-rating', type: 'rating', name: '综合评级', description: '描述',
  options: ratingLevels,
  settings: { sampleOptionId: 'o4' },
  items: [{ id: 'i-recon-rating', kind: 'rating', label: '绩效评级', hint: '', settings: { required: true } }],
}
const reconTag = {
  content_id: 'c-recon-tag', type: 'custom', name: '标签型填写题', description: '描述',
  items: [{
    id: 'i-recon-tag', kind: 'fill', label: '价值贡献', questionType: 'tag',
    hint: '基于角色职责预期，评估实际产出和贡献，包括专业上的和管理上的（若有）两个方面。',
    options: [{ id: 'tag-good', label: '做得好的' }, { id: 'tag-improve', label: '待改进的' }],
    settings: { required: false },
  }],
}
const refTabsRecon = [
  refNode('r-summary', '工作总结', 'n1'), refNode('r-self', '自评', 'n2'), refNode('r-eval', '上级评估', 'n7'),
  refNode('r-comm', '结果沟通', 'n9'), refNode('r-360', '360°反馈', 'n4'), okrRelation, refMoreSkeleton,
]

const nodes = [
  {
    node_id: 'n1', name: '填写工作总结', node_type: 'work_summary', order: 0, executor_label: '被评估人',
    include_final_result: false, content: [okrRelation, fillPrompt, fillSummary, fillRating],
  },
  { node_id: 'n2', name: '自评', content_page_name: '填写自评', node_type: 'work_summary', order: 1, executor_label: '被评估人', include_final_result: false, content: [selfEvalSummary, fillRating] },
  { node_id: 'n3', name: '360°邀请环节', node_type: 'reviewer_360_invite', order: 2, executor_label: '被评估人', include_final_result: false, content: [okrRelation] },
  { node_id: 'n4', name: '360°反馈（自愿评估）', node_type: 'work_summary', order: 3, executor_label: '360°评估人', include_final_result: false, content: [okrRelation, feedbackPrompt, feedback360, messageBox] },
  { node_id: 'n5', name: '评估型环节', node_type: 'work_summary', order: 4, executor_label: '360°评估人', include_final_result: false, content: [okrRelation] },
  { node_id: 'n6', name: '虚线上级评估', node_type: 'work_summary', order: 5, executor_label: '虚线上级', include_final_result: false, content: [okrRelation] },
  { node_id: 'n7', name: '直接上级评估', node_type: 'work_summary', order: 6, executor_label: '直属上级', include_final_result: false, content: [...refTabsEval, evalPrompt, summaryPlain, contribution, fillRating] },
  { node_id: 'n8', name: '绩效校准', content_page_name: '上级评估', node_type: 'calibration', order: 7, executor_label: '在项目配置时指定', include_final_result: false, content: [...refTabsEval, evalPrompt, summaryPlain, contribution, fillRating] },
  { node_id: 'n9', name: '绩效沟通并开通结果', node_type: 'work_summary', order: 8, executor_label: '直属上级', include_final_result: false, content: [...refTabsComm, commPrompt, developmentAdvice] },
  { node_id: 'n10', name: '查看绩效结果', node_type: 'result_view', order: 9, executor_label: '被评估人', include_final_result: true, content: [okrRelation, fillSummary, fillRating] },
  { node_id: 'n11', name: '结果复议处理', content_page_name: '绩效结果复议处理', node_type: 'result_reconsideration', order: 10, executor_label: '复议处理人', include_final_result: false, content: [...refTabsRecon, reconNotice, reconSummary, reconContribution, reconRating, reconTag] },
]

;(performanceTemplateApi as unknown as { getWorkflow: () => Promise<unknown> }).getWorkflow = async () => ({ template_id: 1, nodes })

document.body.style.margin = '0'
document.body.style.overflow = 'hidden'

createApp({
  render: () => h('div', { style: 'width:1680px;height:950px;display:flex;flex-direction:column;overflow:hidden' }, [
    h('div', { style: 'height:56px;flex:none;background:#fff;border-bottom:1px solid #eff0f1' }),
    h('div', { style: 'flex:1;min-height:0;width:1680px' }, [h(PerformanceTemplatePreviewStep, { templateId: 1 })]),
  ]),
}).mount('#app')
