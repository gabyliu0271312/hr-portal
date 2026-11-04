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
    // 右栏含提示条与评级控件（复用内容设置的 PerformanceContentRenderer 渲染链路）
    expect(panels[1].text()).toContain('111')
    expect(panels[1].text()).toContain('1星')
    expect(panels[1].findAll('.performance-content-renderer__rating')).toHaveLength(1)
  })

  it('renders result view as single panel without footer', async () => {
    const nodes = [node({ node_id: 'n8', node_type: 'result_view', name: '查看绩效结果', content: [fillSummary] })]
    const wrapper = mountStep(nodes)
    await flushPromises()
    expect(wrapper.findAll('.ptp-panel')).toHaveLength(1)
    expect(wrapper.find('.ptp-tab').text()).toBe('配置查看内容')
    expect(wrapper.find('.ptp-footer').exists()).toBe(false)
    // 内容以查看态渲染（复用内容设置渲染器的 view 模式，而非填写编辑框）
    expect(wrapper.text()).toContain('绩效结果')
    expect(wrapper.findAll('.content-renderer-item--view')).toHaveLength(1)
    expect(wrapper.find('.performance-rich-text-box').exists()).toBe(false)
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

  it('shows error state when workflow loading fails', async () => {
    vi.mocked(performanceTemplateApi.getWorkflow).mockRejectedValue(new Error('网络错误'))
    const wrapper = mount(PerformanceTemplatePreviewStep, { props: { templateId: 1 } })
    await flushPromises()
    expect(wrapper.find('.ptp-loading--error').text()).toBe('网络错误')
  })
})
