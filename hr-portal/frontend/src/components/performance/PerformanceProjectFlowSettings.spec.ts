import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PerformanceWorkflowNode } from '@/api/performance'
import PerformanceProjectFlowSettings from './PerformanceProjectFlowSettings.vue'

const node = (node_type: string, order: number): PerformanceWorkflowNode => ({
  node_id: `${node_type}-${order}`,
  node_type,
  name: ({
    work_summary: '工作总结环节',
    reviewer_360_invite: '360°邀请环节',
    reviewer_360_confirm: '360°确认环节',
    evaluation: '评估型环节',
    calibration: '校准环节',
    result_communication: '结果沟通环节',
    result_view: '绩效结果查看环节',
    result_reconsideration: '结果复议处理',
  } as Record<string, string>)[node_type] || node_type,
  description: '',
  order,
  executor_types: [],
  executor_label: '被评估人',
  evaluation_type: null,
  include_final_result: false,
  system: false,
  allow_invite_other_executors: false,
  invite_executor_scope: 'ALL',
  invite_executor_types: [],
  require_previous_node_completion: false,
})

describe('PerformanceProjectFlowSettings', () => {
  it('renders template nodes in order and reuses the stage icon for every node', () => {
    const types = ['work_summary', 'reviewer_360_invite', 'reviewer_360_confirm', 'evaluation', 'calibration', 'result_communication', 'result_view', 'result_reconsideration']
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: types.map((type, index) => node(type, index + 1)) } })

    expect(wrapper.findAll('.flow-node-card')).toHaveLength(8)
    expect(wrapper.findAll('.flow-node-header h2').map(item => item.text())).toEqual([
      '工作总结环节', '360°邀请环节', '360°确认环节', '评估型环节', '校准环节', '结果沟通环节', '绩效结果查看环节', '结果复议处理',
    ])
    expect(wrapper.findAll('.flow-node-icon svg')).toHaveLength(8)
    expect(wrapper.find('.invite-settings').exists()).toBe(true)
    expect(wrapper.find('.calibration-settings').exists()).toBe(true)
    expect(wrapper.find('.result-view-settings').exists()).toBe(true)
    expect(wrapper.find('.reconsideration-settings').exists()).toBe(true)
  })

  it('renders a header and shared phase delete control for each calibration phase', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)] } })

    expect(wrapper.get('.rule-table-header').text()).toContain('校准人')
    expect(wrapper.get('.rule-table-header').text()).toContain('校准范围')
    expect(wrapper.get('.rule-table-header').text()).toContain('是否允许授权他人')
    expect(wrapper.findAll('.rule-actions button').map(button => button.text())).toEqual(['编辑', '删除'])
    expect(wrapper.get('.phase-heading .performance-icon-button').attributes('aria-label')).toBe('删除第 1 阶段')

    await wrapper.get('.add-phase').trigger('click')
    expect(wrapper.findAll('.phase-heading')).toHaveLength(2)
    await wrapper.findAll('.phase-heading .performance-icon-button')[0].trigger('click')
    expect(wrapper.findAll('.phase-heading')).toHaveLength(1)
  })

  it('persists editable flow settings through v-model without changing template nodes', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, {
      props: { nodes: [node('reviewer_360_invite', 1), node('result_view', 2)] },
    })

    await wrapper.get('.outline-button').trigger('click')
    await wrapper.get('#default-invite').setValue('NONE')
    await wrapper.get('.outline-button').trigger('click')
    await wrapper.get('.result-view-settings input').setValue(true)

    const updates = wrapper.emitted('update:modelValue') || []
    const latest = updates.at(-1)?.[0] as { node_settings: Record<string, Record<string, unknown>> }
    expect(latest.node_settings['reviewer_360_invite-1'].invite).toMatchObject({ default_invite: 'NONE' })
    expect(latest.node_settings['result_view-2'].result_view).toMatchObject({ opening_mode: 'AUTOMATIC' })
    expect(wrapper.findAll('.flow-node-card h2').map(item => item.text())).toEqual(['360°邀请环节', '绩效结果查看环节'])
  })
})
