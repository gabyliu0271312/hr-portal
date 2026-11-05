import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceTemplatePreviewStep from './PerformanceTemplatePreviewStep.vue'
import { performanceTemplateApi, type PerformanceWorkflowNode } from '@/api/performance'

vi.mock('@/api/performance', async importOriginal => ({
  ...(await importOriginal<typeof import('@/api/performance')>()),
  performanceTemplateApi: { getWorkflow: vi.fn() },
}))

const fillSummary = {
  content_id: 'c-summary', type: 'work_summary', name: '工作总结', description: '请填写周期内的重点工作有效产出。',
  items: [{ id: 'i-keywork', kind: 'fill', label: '重点工作 1', hint: '', questionType: 'text', settings: { required: true } }],
} as any
const fillRating = {
  content_id: 'c-rating', type: 'rating', name: '综合评级', description: '描述',
  options: [{ id: 'o1', label: '1星' }, { id: 'o2', label: '2星' }, { id: 'o3', label: '3星' }],
  items: [{ id: 'i-rating', kind: 'rating', label: '绩效评级', hint: '', settings: { required: true } }],
} as any
const promptContent = {
  content_id: 'c-prompt', type: 'prompt', name: '提示', description: '', items: [],
  prompt: { title: '111', content: '222', color: '', scope: 'all' },
} as any

function node(overrides: Partial<PerformanceWorkflowNode> & { node_id: string; name: string }): PerformanceWorkflowNode {
  return {
    node_type: 'evaluation', description: '', order: 0, executor_types: [], executor_label: '被评估人',
    executor_role_code: null, evaluation_type: null, include_final_result: false, system: false,
    allow_invite_other_executors: false, invite_executor_scope: 'ALL', invite_executor_types: [],
    require_previous_node_completion: false, content: [], ...overrides,
  } as PerformanceWorkflowNode
}

function mountStep(nodes: PerformanceWorkflowNode[]) {
  vi.mocked(performanceTemplateApi.getWorkflow).mockResolvedValue({ template_id: 1, usage_summary: { cycle_count: 0, project_count: 0 }, nodes } as any)
  return mount(PerformanceTemplatePreviewStep, { props: { templateId: 1 } })
}

describe('PerformanceTemplatePreviewStep', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('aligns block title and field labels to the same left edge (REA x=1021 全左对齐)', async () => {
    // REA 实测：模板预览右栏块标题「工作总结」/ 描述 / 字段「重点工作 1」左缘完全一致（x=1021），
    // 渲染器不得引入自身水平 padding（块标题在渲染器外，字段在渲染器内，padding 必须归零）。
    // jsdom 不注入 scoped 样式，这里做结构断言：渲染器在 .ptp-block 内、无内联 padding，
    // 像素校验由浏览器 harness（verify/preview-harness）执行。
    const wrapper = mountStep([node({ node_id: 'n1', node_type: 'work_summary', name: '填写工作总结', content: [fillSummary] })])
    await flushPromises()
    const blockTitle = wrapper.find('.ptp-block__title')
    const fieldLabel = wrapper.find('.template-field-label')
    expect(blockTitle.exists()).toBe(true)
    expect(fieldLabel.exists()).toBe(true)
    // 渲染器在 .ptp-block 内（块标题与字段同一内容列容器）
    const renderer = wrapper.find('.performance-template-renderer')
    const block = wrapper.find('.ptp-block')
    expect(renderer.exists()).toBe(true)
    expect(block.element.contains(renderer.element)).toBe(true)
    // 无内联水平 padding（样式由 .ptp :deep 覆盖归零，见 PerformanceTemplatePreviewStep.vue）
    const rendererEl = renderer.element as HTMLElement
    expect(rendererEl.style.paddingLeft || rendererEl.style.padding).toBe('')
  })

  it('renders stage cards and switches preview per stage with zero extra requests', async () => {
    const nodes = [
      node({ node_id: 'n1', node_type: 'work_summary', name: '填写工作总结', content: [promptContent, fillSummary, fillRating] }),
      node({ node_id: 'n2', node_type: 'evaluation', name: '直接上级评估' }),
    ]
    const wrapper = mountStep(nodes)
    await flushPromises()
    expect(performanceTemplateApi.getWorkflow).toHaveBeenCalledTimes(1)
    const cards = wrapper.findAll('.ptp-stage-card')
    expect(cards).toHaveLength(2)
    expect(cards[0].text()).toContain('执行人：被评估人')
    // 默认选中第一环节：右栏渲染填写内容
    expect(wrapper.find('.ptp-panel:last-of-type').text()).toContain('重点工作 1')
    expect(wrapper.find('.ptp-panel:last-of-type').text()).toContain('综合评级')
    // 切换环节不发新请求
    await cards[1].trigger('click')
    expect(performanceTemplateApi.getWorkflow).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.ptp-panel:last-of-type').text()).toContain('暂未配置供参考内容')
  })

  it('uses the shared executor display labels for every workflow stage', async () => {
    const nodes = [
      node({ node_id: 'reviewee', name: '自评', executor_label: '被评估人', executor_role_code: 'assessment.reviewee' }),
      node({ node_id: 'manager', name: '上级评估', executor_label: '实线上级', executor_role_code: 'assessment.line_manager', executor_types: ['DIRECT_MANAGER', 'LEVEL_1_MANAGER'] }),
      node({ node_id: 'dotted', name: '虚线上级评估', executor_label: '虚线上级', executor_role_code: 'assessment.dotted_manager' }),
      node({ node_id: 'calibration', node_type: 'calibration', name: '校准', executor_label: '在项目配置时指定', executor_role_code: 'assessment.calibrator' }),
      node({ node_id: 'reconsideration', node_type: 'result_reconsideration', name: '结果复议处理', executor_label: 'HRBP、指定人员', executor_role_code: null }),
    ]
    const wrapper = mountStep(nodes)
    await flushPromises()
    expect(wrapper.findAll('.ptp-stage-card__executor').map(item => item.text())).toEqual([
      '执行人：被评估人',
      '执行人：直属上级、隔 1 级上级',
      '执行人：虚线上级',
      '执行人：在项目配置时指定',
      '执行人：复议处理人',
    ])
    wrapper.unmount()
  })

  it('renders reference panel resolving node references and prompt banners', async () => {
    const nodes = [
      node({ node_id: 'n1', node_type: 'work_summary', name: '填写工作总结', content: [fillSummary] }),
      node({
        node_id: 'n2', node_type: 'evaluation', name: '直接上级评估',
        content: [
          { ...fillSummary, content_slot: 'reference', reference_kind: 'node', reference_value: 'n1' } as any,
          promptContent, fillSummary, fillRating,
        ],
      }),
    ]
    const wrapper = mountStep(nodes)
    await flushPromises()
    // 切换到配置了参考内容的第二环节
    await wrapper.findAll('.ptp-stage-card')[1].trigger('click')
    const panels = wrapper.findAll('.ptp-panel')
    expect(panels).toHaveLength(2)
    expect(panels[0].text()).toContain('配置参考内容')
    expect(panels[0].text()).toContain('被评估人')
    // 参考页签 = 来源环节名，内容解析自来源环节的填写内容
    expect(panels[0].text()).toContain('填写工作总结')
    expect(panels[0].text()).toContain('重点工作 1')
    // 右栏含提示条与评级控件（复用真实填写渲染器：prompt 说明块 + PerformanceRatingControl）
    expect(panels[1].text()).toContain('111')
    expect(panels[1].text()).toContain('1星')
    expect(panels[1].findAll('.performance-rating-control')).toHaveLength(1)
  })

  it('renders result view as single panel without footer', async () => {
    const nodes = [node({ node_id: 'n8', node_type: 'result_view', name: '查看绩效结果', content: [fillSummary] })]
    const wrapper = mountStep(nodes)
    await flushPromises()
    expect(wrapper.findAll('.ptp-panel')).toHaveLength(1)
    expect(wrapper.find('.ptp-tab').text()).toBe('配置查看内容')
    expect(wrapper.find('.ptp-footer').exists()).toBe(false)
    // 内容以查看态渲染（复用真实渲染器 readonly 态：评级/富文本走只读答案，而非填写编辑框）
    expect(wrapper.text()).toContain('绩效结果')
    expect(wrapper.findAll('.readonly-rating, .readonly-answer')).toHaveLength(1)
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    // REA read 态：富文本显示占位文案（previewValue 生效），不再是空白
    expect(wrapper.text()).toContain('这里展示用户填写的内容')
  })

  it('renders rating sample option in result view readonly state (REA 3星符合预期)', async () => {
    // 查看绩效结果里评级只读：显示示例档位（sampleOptionId），而非空白
    const ratingContent = {
      content_id: 'c-rating', type: 'rating', name: '综合评级', description: '',
      options: [{ id: 'o1', code: '1星', label: '待改进' }, { id: 'o2', code: '3星', label: '符合预期' }],
      settings: { sampleOptionId: 'o2' },
      items: [{ id: 'i-rating', kind: 'rating', label: '绩效评级', hint: '', settings: { required: true } }],
    } as any
    const wrapper = mountStep([node({ node_id: 'n8', node_type: 'result_view', name: '查看绩效结果', content: [ratingContent] })])
    await flushPromises()
    // 只读评级展示示例档位「3星 符合预期」（previewValue=o2 → selectedOption）
    expect(wrapper.text()).toContain('3星')
    expect(wrapper.text()).toContain('符合预期')
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
  })

  it('renders 360° feedback block in result view for 360°评估人 source references', async () => {
    // REA：查看绩效结果单面板内，360°反馈作为独立区块（标题 + 展开详情 + 时间戳 + 展开条目）
    const reviewer360 = node({ node_id: 'n360', node_type: 'evaluation', name: '360°反馈（自愿评估）', executor_label: '360°评估人' })
    const reference = {
      content_id: 'ref-360', type: 'reference', content_slot: 'reference', name: '360°反馈（自愿评估）',
      reference_kind: 'node', reference_value: 'n360', items: [],
    } as any
    const wrapper = mountStep([
      node({ node_id: 'n8', node_type: 'result_view', name: '查看绩效结果', content: [fillSummary, reference] }),
      reviewer360,
    ])
    await flushPromises()
    // 360°反馈区块渲染在右栏（单面板）
    const block = wrapper.find('.pr360-block')
    expect(block.exists()).toBe(true)
    expect(block.text()).toContain('360°反馈（自愿评估）')
    expect(block.find('.pr360-toggle').text()).toBe('展开详情')
    // 默认收起：不显示条目，点展开后显示
    expect(wrapper.findAll('.pr360-item')).toHaveLength(0)
    await block.find('.pr360-toggle').trigger('click')
    expect(wrapper.findAll('.pr360-item')).toHaveLength(2)
    expect(wrapper.text()).toContain('360°反馈内容')
    expect(wrapper.text()).toContain('留言内容')
  })

  it('renders calibration with adjustment tab and final-node contents', async () => {
    const nodes = [
      node({ node_id: 'n7', node_type: 'evaluation', name: '直接上级评估', include_final_result: true, content: [fillSummary, fillRating] }),
      node({ node_id: 'n5', node_type: 'calibration', name: '绩效校准' }),
    ]
    const wrapper = mountStep(nodes)
    await flushPromises()
    await wrapper.findAll('.ptp-stage-card')[1].trigger('click')
    const right = wrapper.find('.ptp-panel:last-of-type')
    expect(right.find('.ptp-tab').text()).toBe('配置供调整内容')
    expect(right.text()).toContain('工作总结')
    expect(right.text()).toContain('综合评级')
  })

  it('renders invite form for reviewer_360_invite as single panel', async () => {
    const nodes = [node({ node_id: 'n2', node_type: 'reviewer_360_invite', name: '360°邀请环节' })]
    const wrapper = mountStep(nodes)
    await flushPromises()
    expect(wrapper.findAll('.ptp-panel')).toHaveLength(1)
    expect(wrapper.text()).toContain('搜索成员')
    expect(wrapper.text()).toContain('按关系')
    expect(wrapper.text()).toContain('已邀请列表：当前共 0 人')
    expect(wrapper.findAll('.ptp-invite-row')).toHaveLength(4)
  })

  it('renders built-in OKR for work_summary stage even without reference config (固有展示)', async () => {
    // 填写工作总结在内容设置未配置任何参考内容，但模板预览（与前端一致）固有展示 OKR 页签
    const wrapper = mountStep([node({ node_id: 'n1', node_type: 'work_summary', name: '填写工作总结', content: [fillSummary] })])
    await flushPromises()
    const tabs = wrapper.findAll('.ptp-ref-tab')
    expect(tabs.map(tab => tab.text())).toEqual(['OKR'])
    const panel = wrapper.findAll('.ptp-panel')[0]
    expect(panel.text()).toContain('OKR 内容')
    expect(panel.text()).toContain('OKR 详情')
    expect(panel.findAll('.okr-objective__tag, .okr-kr__tag').map(tag => tag.text())).toEqual(['O\u00a01', 'KR\u00a01', 'KR\u00a02'])
  })

  it('renders 360° evaluation detail for references whose source executor is 360°评估人', async () => {
    // 360°反馈环节 = 流程设置里执行人为「360°评估人」的评估环节；
    // 参考区对其渲染 360°评估详情视图（信息条 + 表头 + 详情视图 + 空评估条目）
    const reviewer360 = node({ node_id: 'n360', node_type: 'evaluation', name: '360°反馈（自愿评估）', executor_label: '360°评估人' })
    const reference = {
      content_id: 'ref-360', type: 'reference', content_slot: 'reference', name: '360°反馈（自愿评估）',
      reference_kind: 'node', reference_value: 'n360', items: [],
    } as any
    const wrapper = mountStep([
      node({ node_id: 'n1', node_type: 'work_summary', name: '填写工作总结', content: [fillSummary] }),
      node({ node_id: 'n2', node_type: 'evaluation', name: '直接上级评估', executor_label: '直属上级', content: [reference] }),
      reviewer360,
    ])
    await flushPromises()
    await wrapper.findAll('.ptp-stage-card')[1].trigger('click')
    const panel = wrapper.findAll('.ptp-panel')[0]
    // 360°评估详情视图：信息条 + 表头 + 详情视图 + 卡片 + 空评估条目
    expect(panel.text()).toContain('已评估')
    expect(panel.text()).toContain('评估维度')
    expect(panel.text()).toContain('员工关系')
    expect(panel.text()).toContain('人员类型')
    expect(panel.text()).toContain('详情视图')
    expect(panel.text()).toContain('所属部门')
    expect(panel.findAll('.r360-form__item')).toHaveLength(2)
  })

  it('renders built-in OKR skeleton for more-reference relations', async () => {
    // 内容设置「配置参考内容 → 更多参考内容 → OKR」落库为 reference_kind='more' + reference_value='okr'
    const okrRelation = {
      content_id: 'reference-okr', type: 'reference', content_slot: 'reference', name: 'OKR',
      description: '支持展示 OKR 内容、OKR 日志、OKR 异常完成情况等信息',
      reference_kind: 'more', reference_value: 'okr', items: [],
    } as any
    const nodes = [
      node({ node_id: 'n2', node_type: 'evaluation', name: '直接上级评估', content: [okrRelation, fillSummary] }),
    ]
    const wrapper = mountStep(nodes)
    await flushPromises()
    // 中栏出现 OKR 页签
    const tabs = wrapper.findAll('.ptp-ref-tab')
    expect(tabs.map(tab => tab.text())).toContain('OKR')
    const panel = wrapper.findAll('.ptp-panel')[0]
    // 内置骨架：期间选择器 / OKR 详情 / O1 / KR 占位
    expect(panel.text()).toContain('OKR 内容')
    expect(panel.text()).toContain(`${new Date().getFullYear()} 年度 OKR`)
    expect(panel.text()).toContain('OKR 详情')
    expect(panel.text()).toContain('展示内容以实际数据为准')
    expect(panel.findAll('.okr-objective__tag, .okr-kr__tag').map(tag => tag.text())).toEqual(['O\u00a01', 'KR\u00a01', 'KR\u00a02'])
    expect(panel.text()).toContain('进度')
    expect(panel.text()).toContain('权重')
    expect(panel.findAll('.okr-kr__badge').map(badge => badge.text())).toEqual(['正常', '正常'])
  })

  it('renders more_reference units and team stats placeholder', async () => {
    const moreRelation = {
      content_id: 'reference-more', type: 'reference', content_slot: 'reference', name: '更多参考',
      description: '支持展示绩效信息、异动信息、补充信息等其他信息',
      reference_kind: 'more', reference_value: 'more_reference', items: [],
    } as any
    const wrapper = mountStep([node({ node_id: 'n2', node_type: 'evaluation', name: '直接上级评估', content: [moreRelation] })])
    await flushPromises()
    const panel = wrapper.findAll('.ptp-panel')[0]
    expect(panel.findAll('.ref-block__unit-title').map(unit => unit.text())).toEqual(['绩效信息', '异动信息', '补充信息'])
    wrapper.unmount()
  })

  it('keeps the three-column skeleton stable across stages and reference tabs', async () => {
    // 回归：中/右分割线曾是 grid 的 1px 间隙（依靠容器背景露出），容器高度一旦被内容撑开
    // （弹窗壳的整页覆写失效时就会发生），分割线长度和位置会随环节 / 页签切换而变。
    // 现在分割线是与左栏同款的独立 1px 元素，DOM 结构必须恒定：[面板][分割线][面板]。
    const reference = (key: string, target: string) => ({
      content_id: `ref-${key}`, type: 'reference', content_slot: 'reference', name: key,
      reference_kind: 'node', reference_value: target, items: [],
    }) as any
    const nodes = [
      node({ node_id: 'n1', node_type: 'work_summary', name: '填写工作总结', content: [fillSummary] }),
      node({
        node_id: 'n2', node_type: 'evaluation', name: '直接上级评估',
        content: [reference('a', 'n1'), reference('b', 'n1'), promptContent, fillSummary, fillRating],
      }),
      node({
        node_id: 'n3', node_type: 'evaluation', name: '绩效沟通并开通结果',
        content: [reference('c', 'n1'), fillRating],
      }),
    ]
    const wrapper = mountStep(nodes)
    await flushPromises()

    const skeleton = () => wrapper.find('.ptp-panels').element.children.length
    const shape = () => Array.from(wrapper.find('.ptp-panels').element.children)
      .map(el => `${el.tagName.toLowerCase()}.${(el.className || '').split(' ').filter(Boolean)[0]}`)

    // n2：两个参考页签来回切换
    await wrapper.findAll('.ptp-stage-card')[1].trigger('click')
    expect(shape()).toEqual(['section.ptp-panel', 'div.ptp-divider', 'section.ptp-panel'])
    const tabs = wrapper.findAll('.ptp-ref-tab')
    expect(tabs.length).toBeGreaterThan(1)
    for (let i = 0; i < tabs.length; i++) {
      await tabs[i].trigger('click')
      expect(shape()).toEqual(['section.ptp-panel', 'div.ptp-divider', 'section.ptp-panel'])
      expect(skeleton()).toBe(3)
    }
    // n3：另一个环节，仍是同一骨架（分割线数量与顺序不变）
    await wrapper.findAll('.ptp-stage-card')[2].trigger('click')
    expect(shape()).toEqual(['section.ptp-panel', 'div.ptp-divider', 'section.ptp-panel'])
  })

  it('shows error state when workflow loading fails', async () => {
    vi.mocked(performanceTemplateApi.getWorkflow).mockRejectedValue(new Error('网络错误'))
    const wrapper = mount(PerformanceTemplatePreviewStep, { props: { templateId: 1 } })
    await flushPromises()
    expect(wrapper.find('.ptp-loading--error').text()).toBe('网络错误')
  })

  it('renders fill contents via the real renderer: editable rich text editor', async () => {
    const nodes = [node({ node_id: 'n1', node_type: 'work_summary', name: '填写工作总结', content: [fillSummary] })]
    const wrapper = mountStep(nodes)
    await flushPromises()
    // 复用真实填写渲染器：富文本是可聚焦的 contenteditable 编辑器（不是只读复刻盒）
    const editor = wrapper.find('[data-slate-editor="true"]')
    expect(editor.exists()).toBe(true)
    expect(editor.attributes('contenteditable')).toBe('true')
    // 必填星号按内容设置渲染
    expect(wrapper.find('.performance-template-renderer').text()).toContain('*')
  })

  it('adds and removes instances for allow_multiple contents (与填写页一致)', async () => {
    const multiSummary = {
      ...fillSummary,
      content_id: 'c-multi',
      settings: { allowMultiple: true },
      items: [{ id: 'i-keywork', kind: 'fill', label: '重点工作 1', hint: '请填写', questionType: 'text', settings: { required: true } }],
    } as any
    const wrapper = mountStep([node({ node_id: 'n1', node_type: 'work_summary', name: '填写工作总结', content: [multiSummary] })])
    await flushPromises()
    const addButton = wrapper.find('.performance-add-another-button')
    expect(addButton.exists()).toBe(true)
    // 初始 1 组：标题不带序号（「重点工作」），填写页从第 1 组开始显示「重点工作 1」前不加序号
    expect(wrapper.find('.template-field-label').text()).toContain('重点工作')
    await addButton.trigger('click')
    // 追加后 2 组实例，第二组标题带序号「重点工作 2」，且出现删除图标
    const labels = wrapper.findAll('.template-field-label').map(label => label.text())
    expect(labels.length).toBe(2)
    expect(labels[1]).toContain('重点工作 2')
    expect(wrapper.find('.performance-icon-button').exists()).toBe(true)
    // 删除第二组后回到 1 组
    await wrapper.find('.performance-icon-button').trigger('click')
    expect(wrapper.findAll('.template-field-label')).toHaveLength(1)
  })
})
