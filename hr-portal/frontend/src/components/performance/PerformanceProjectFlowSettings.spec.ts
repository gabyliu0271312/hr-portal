import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { performanceProjectApi } from '@/api/performance'
import type { PerformanceWorkflowNode } from '@/api/performance'
import PerformanceProjectFlowSettings from './PerformanceProjectFlowSettings.vue'
import PerformanceCalibrationConditionGroup from './PerformanceCalibrationConditionGroup.vue'

const node = (node_type: string, order: number, executor_role_code: string | null = 'assessment.reviewee'): PerformanceWorkflowNode => ({
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
  executor_role_code,
  evaluation_type: null,
  include_final_result: false,
  system: false,
  allow_invite_other_executors: false,
  invite_executor_scope: 'ALL',
  invite_executor_types: [],
  require_previous_node_completion: false,
})
const reviewer360Node = (order: number) => node('evaluation', order, 'assessment.reviewer_360')

describe('PerformanceProjectFlowSettings', () => {
  beforeEach(() => { vi.spyOn(performanceProjectApi, 'calibrationPreview').mockResolvedValue({}) })
  afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })
  it('renders template nodes in order and reuses the stage icon for every node', () => {
    const types = ['work_summary', 'reviewer_360_invite', 'reviewer_360_confirm', 'evaluation', 'calibration', 'result_communication', 'result_view', 'result_reconsideration']
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: types.map((type, index) => node(type, index + 1, type === 'evaluation' ? 'assessment.reviewer_360' : undefined)) } })

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

  it('shows the 360° settings only on the first reviewer-360 node', () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [
      node('evaluation', 1, 'assessment.reviewee'),
      node('evaluation', 2, 'assessment.line_manager'),
      reviewer360Node(3),
      reviewer360Node(4),
    ] } })

    expect(wrapper.findAll('.invite-settings')).toHaveLength(1)
    expect(wrapper.findAll('.flow-node-card')[2].find('.invite-settings').exists()).toBe(true)
    expect(wrapper.findAll('.flow-node-card')[3].find('.invite-settings').exists()).toBe(false)
    expect(wrapper.findAll('.flow-node-card')[0].text()).not.toContain('「360°评估人设置」')
    expect(wrapper.findAll('.flow-node-card')[1].text()).not.toContain('「360°评估人设置」')
    expect(wrapper.findAll('.flow-node-card')[2].text()).toContain('「360°评估人设置」在首个 360° 环节设置，对所有 360° 环节生效')
    wrapper.unmount()
  })

  it('renders distribution controls inline without an empty-state surface', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)], distributionAssessmentOptions: [{ id: 'grade', label: '绩效等级', grade_options: [{ value: 'A', label: 'A' }] }] } })
    const heading = wrapper.get('.calibration-distribution-heading')
    expect(heading.text()).toBe('绩效结果强制 / 建议分布')
    expect(heading.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    expect(wrapper.find('.distribution-settings').exists()).toBe(false)
    await heading.get('[role="switch"]').trigger('click')
    expect(wrapper.get('[aria-label="分布规则配置模式"]').classes()).toContain('performance-radio-group--horizontal')
    expect(wrapper.text()).not.toContain('暂未配置分布规则')
    expect(wrapper.find('.distribution-rule-summary__row').exists()).toBe(false)
    expect(wrapper.get('.distribution-add-rule').text()).toBe('＋ 添加分布规则')
  })

  it('keeps distribution rules when disabled and opens scoped rule configuration without a placeholder', async () => {
    const initial = { node_settings: { 'calibration-1': { calibration: {
      force_distribution_enabled: true,
      distribution: { mode: 'UNIFIED' as const, scope_configured: false, rules: [{ assessment_item_id: 'grade', min_people_count: 8, rounding_method: 'ROUND' as const, conditions: [{ control_mode: 'HARD' as const, grade_codes: ['level-1'], operator: 'GTE' as const, value: 20, unit: 'PERCENT' as const }] }] },
      phases: [{ rules: [{ subject_type: 'PERSON' as const, operator: 'INCLUDE' as const, scope: 'PROJECT_ALL' as const, allow_authorize: false }] }],
    } } }, node_times: {} }
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)], modelValue: initial, distributionAssessmentOptions: [{ id: 'grade', label: '综合评级', grade_options: [{ value: '1星', label: '1星', legacy_value: 'level-1' }] }] } })
    const card = wrapper.get('.distribution-rule-summary__row')
    expect(card.text()).toContain('分布规则 1')
    expect(card.text()).toContain('综合评级')
    expect(card.text()).toContain('大于等于 8 人')
    expect(card.text()).toContain('强制')
    expect(card.text()).toContain('1星')
    expect(card.text()).toContain('大于等于 20 %')
    expect(card.text()).toContain('四舍五入')
    expect(card.findAll('.performance-icon-button')).toHaveLength(2)
    expect(card.findAll('.performance-icon-button').map(button => button.attributes('aria-label'))).toEqual(['编辑分布规则 1', '删除分布规则 1'])
    expect(card.text()).not.toContain('编辑')
    expect(card.text()).not.toContain('删除')
    await wrapper.get('[aria-label="绩效结果强制建议分布"]').trigger('click')
    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as any
    expect(emitted.node_settings['calibration-1'].calibration.force_distribution_enabled).toBe(false)
    expect(emitted.node_settings['calibration-1'].calibration.distribution.rules).toHaveLength(1)
    await wrapper.get('[aria-label="绩效结果强制建议分布"]').trigger('click')
    const scopeRadio = wrapper.findAll('input[type="radio"]')[1]
    await scopeRadio.setValue()
    expect(wrapper.find('.distribution-scope-placeholder').exists()).toBe(false)
  })

  it('opens the distribution drawer and adds a unified rule', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)], distributionAssessmentOptions: [{ id: 'grade', label: '绩效等级', grade_options: [{ value: 'A', label: 'A' }] }] } })
    await wrapper.get('[aria-label="绩效结果强制建议分布"]').trigger('click')
    await wrapper.get('.distribution-add-rule').trigger('click')
    expect(document.body.querySelector('[aria-label="添加分布规则"]')).not.toBeNull()
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

  it('opens the captured calibration rule drawer without inserting until confirmation', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)], peopleOptions: [{ value: 'E001', label: '员工（E001）' }] } })

    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    await wrapper.get('.add-rule').trigger('click')
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    const drawer = document.body.querySelector('[aria-label="校准规则编辑"]') as HTMLElement
    expect(drawer).not.toBeNull()
    expect(document.body.querySelector('.performance-drawer__header h2')?.textContent).toBe('添加校准规则')
    expect(document.body.querySelector('.performance-drawer-footer--captured')).not.toBeNull()

    const confirm = document.body.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(drawer.querySelector('[role="alert"]')?.textContent).toContain('校准人')
    const conditionGroup = wrapper.findComponent(PerformanceCalibrationConditionGroup)
    const subject = conditionGroup.props('modelValue') as { conditions: Array<{ field: 'employee' | 'calibrator_relation'; operator: 'INCLUDE' | 'EXCLUDE'; values: string[] }> }
    conditionGroup.vm.$emit('update:modelValue', { conditions: [{ ...subject.conditions[0], values: ['E001'] }] })
    await wrapper.vm.$nextTick()
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(drawer.querySelector('[role="alert"]')?.textContent).toContain('校准范围')
    const scopeGroups = wrapper.findAllComponents(PerformanceCalibrationConditionGroup)
    const scope = scopeGroups[1].props('modelValue') as { conditions: Array<{ field: 'employee' | 'calibrator_relation'; operator: 'INCLUDE' | 'EXCLUDE'; values: string[] }> }
    scopeGroups[1].vm.$emit('update:modelValue', { conditions: [{ ...scope.conditions[0], values: ['DIRECT_SUBORDINATES'] }] })
    await wrapper.vm.$nextTick()
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)
    wrapper.unmount()
  })

  it('saves calibration groups through PATCH, reads GET, and reopens the returned rule', async () => {
    const nodeSettings = { 'calibration-1': { calibration: { force_distribution_enabled: false, phases: [{ rules: [{ subject_type: 'PERSON' as const, operator: 'INCLUDE' as const, scope: 'PROJECT_ALL' as const, allow_authorize: false }] }] } } }
    const initial = { node_settings: nodeSettings, node_times: {} }
    let persisted = structuredClone(initial) as typeof initial | { node_settings: Record<string, any>; node_times: Record<string, any> }
    const update = vi.spyOn(performanceProjectApi, 'update').mockImplementation(async (_id, payload) => {
      persisted = structuredClone(payload.flow_settings!)
      return { flow_settings: persisted } as Awaited<ReturnType<typeof performanceProjectApi.update>>
    })
    const get = vi.spyOn(performanceProjectApi, 'get').mockImplementation(async () => ({ flow_settings: structuredClone(persisted) }) as Awaited<ReturnType<typeof performanceProjectApi.get>>)
    const projectPayload = { name: '项目一', description: null, administrators: [], flow_settings: initial }
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)], modelValue: initial, projectId: 12, projectPayload } })
    await wrapper.get('.add-rule').trigger('click')
    const groups = wrapper.findAllComponents(PerformanceCalibrationConditionGroup)
    groups[0].vm.$emit('update:modelValue', { conditions: [{ field: 'employee', operator: 'INCLUDE', values: ['E001'] }] })
    groups[1].vm.$emit('update:modelValue', { conditions: [{ field: 'calibrator_relation', operator: 'INCLUDE', values: ['INDIRECT_SUBORDINATES'] }] })
    await wrapper.vm.$nextTick()
    ;(document.body.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(get).toHaveBeenCalledWith(12))
    expect(update).toHaveBeenCalledWith(12, { ...projectPayload, flow_settings: expect.any(Object) })
    const rules = update.mock.calls[0][1].flow_settings!.node_settings['calibration-1'].calibration!.phases[0].rules
    expect(rules).toHaveLength(2)
    expect(rules[1].scope_groups?.[0].conditions[0].values).toEqual(['INDIRECT_SUBORDINATES'])
    expect(document.body.querySelector('[aria-label="校准规则编辑"]')).toBeNull()
    await wrapper.findAll('.rule-actions button')[2].trigger('click')
    const scope = document.body.querySelector('.calibration-rule-section:nth-child(2) .calibration-value-select')!
    expect(scope.textContent).toContain('校准人的隔级下级')
    wrapper.unmount()
    update.mockRestore()
    get.mockRestore()
  })

  it('retains the calibration draft and existing rules when PATCH fails', async () => {
    const update = vi.spyOn(performanceProjectApi, 'update').mockRejectedValue(new Error('network'))
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)], projectId: 12, projectPayload: { name: '项目一', description: null, administrators: [] } } })
    await wrapper.get('.add-rule').trigger('click')
    const groups = wrapper.findAllComponents(PerformanceCalibrationConditionGroup)
    groups[0].vm.$emit('update:modelValue', { conditions: [{ field: 'employee', operator: 'INCLUDE', values: ['E001'] }] })
    groups[1].vm.$emit('update:modelValue', { conditions: [{ field: 'calibrator_relation', operator: 'INCLUDE', values: ['DIRECT_SUBORDINATES'] }] })
    await wrapper.vm.$nextTick()
    ;(document.body.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.body.querySelector('.calibration-rule-error')?.textContent).toContain('保存失败'))
    expect(document.body.querySelector('[aria-label="校准规则编辑"]')).not.toBeNull()
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
    update.mockRestore()
  })

  it('keeps the saved PATCH response when GET refresh fails without submitting twice', async () => {
    const savedFlow = { node_settings: { 'calibration-1': { calibration: { force_distribution_enabled: false, phases: [{ rules: [
      { subject_type: 'PERSON' as const, operator: 'INCLUDE' as const, scope: 'PROJECT_ALL' as const, allow_authorize: false },
      { subject_type: 'PERSON' as const, operator: 'INCLUDE' as const, scope: 'RULE' as const, allow_authorize: false, subject_groups: [{ conditions: [{ field: 'employee' as const, operator: 'INCLUDE' as const, values: ['E001'] }] }], scope_groups: [{ conditions: [{ field: 'calibrator_relation' as const, operator: 'INCLUDE' as const, values: ['DIRECT_SUBORDINATES'] }] }] },
    ] }] } } }, node_times: {} }
    const update = vi.spyOn(performanceProjectApi, 'update').mockResolvedValue({ flow_settings: savedFlow } as unknown as Awaited<ReturnType<typeof performanceProjectApi.update>>)
    const get = vi.spyOn(performanceProjectApi, 'get').mockRejectedValue(new Error('read failed'))
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)], projectId: 12, projectPayload: { name: '项目一', description: null, administrators: [] } } })
    await wrapper.get('.add-rule').trigger('click')
    const groups = wrapper.findAllComponents(PerformanceCalibrationConditionGroup)
    groups[0].vm.$emit('update:modelValue', { conditions: [{ field: 'employee', operator: 'INCLUDE', values: ['E001'] }] })
    groups[1].vm.$emit('update:modelValue', { conditions: [{ field: 'calibrator_relation', operator: 'INCLUDE', values: ['DIRECT_SUBORDINATES'] }] })
    await wrapper.vm.$nextTick()
    ;(document.body.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(get).toHaveBeenCalledOnce())
    expect(update).toHaveBeenCalledOnce()
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)
    await vi.waitFor(() => expect(document.body.querySelector('[aria-label="校准规则编辑"]')).toBeNull())
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({ node_settings: savedFlow.node_settings })
    wrapper.unmount()
    update.mockRestore()
    get.mockRestore()
  })

  it('drops the calibration rule draft when the drawer is cancelled or closed', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)] } })

    await wrapper.get('.add-rule').trigger('click')
    const cancel = document.body.querySelector('.performance-drawer-footer__cancel') as HTMLButtonElement
    cancel.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(document.body.querySelector('[aria-label="校准规则编辑"]')).toBeNull()

    await wrapper.get('.add-rule').trigger('click')
    const close = document.body.querySelector('.performance-drawer__close') as HTMLButtonElement
    close.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(document.body.querySelector('[aria-label="校准规则编辑"]')).toBeNull()
    wrapper.unmount()
  })

  it('discards 360° invitation draft when cancelled or closed', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [reviewer360Node(1)] } })
    const openDrawer = async () => {
      await wrapper.get('.outline-button').trigger('click')
      return document.body.querySelector('[aria-label="360°评估人设置"]') as HTMLElement
    }

    let drawer = await openDrawer()
    const input = drawer.querySelector('input[aria-label="最少邀请人数"]') as HTMLInputElement
    input.value = '9'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    ;(drawer.querySelector('.performance-drawer-footer__cancel') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.invite-summary').text()).toContain('5 人')

    drawer = await openDrawer()
    expect((drawer.querySelector('input[aria-label="最少邀请人数"]') as HTMLInputElement).value).toBe('5')
    ;(drawer.querySelector('.performance-drawer__close') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('opens max-invite options only from its selector', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [reviewer360Node(1)] } })
    await wrapper.get('.outline-button').trigger('click')
    const drawer = document.body.querySelector('[aria-label="360°评估人设置"]') as HTMLElement
    const selector = drawer.querySelector('.invite-settings-prefix-select') as HTMLElement
    expect(document.body.querySelector('[aria-label="最多邀请人数提示方式选项"]')).toBeNull()
    ;(drawer.querySelector('input[aria-label="最多邀请人数"]') as HTMLInputElement).focus()
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[aria-label="最多邀请人数提示方式选项"]')).toBeNull()
    selector.click()
    await wrapper.vm.$nextTick()
    const popup = document.body.querySelector('[aria-label="最多邀请人数提示方式选项"]') as HTMLElement
    expect(popup).not.toBeNull()
    expect(popup.querySelectorAll('[role="option"]')).toHaveLength(2)
    const limitOption = Array.from(popup.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(option => option.textContent?.includes('限制值'))!
    expect(limitOption.disabled).toBe(false)
    limitOption.click()
    await wrapper.vm.$nextTick()
    expect(selector.textContent).toContain('限制值')
    selector.click()
    await wrapper.vm.$nextTick()
    const reopenedPopup = document.body.querySelector('[aria-label="最多邀请人数提示方式选项"]') as HTMLElement
    expect(Array.from(reopenedPopup.querySelectorAll('[role="option"]')).find(option => option.textContent?.includes('限制值'))?.getAttribute('aria-selected')).toBe('true')
    const suggested = Array.from(reopenedPopup.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(option => option.textContent?.includes('建议值'))!
    suggested.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[aria-label="最多邀请人数提示方式选项"]')).not.toBeNull()
    suggested.click()
    await wrapper.vm.$nextTick()
    expect(selector.textContent).toContain('建议值')
    expect(document.body.querySelector('[aria-label="最多邀请人数提示方式选项"]')).toBeNull()
    selector.click()
    await wrapper.vm.$nextTick()
    ;(drawer.querySelector('input[aria-label="最多邀请人数"]') as HTMLInputElement).dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[aria-label="最多邀请人数提示方式选项"]')).toBeNull()
    wrapper.unmount()
  })

  it('requires a larger second prompt count before confirmation', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [reviewer360Node(1)] } })
    await wrapper.get('.outline-button').trigger('click')
    const drawer = document.body.querySelector('[aria-label="360°评估人设置"]') as HTMLElement
    const maximum = drawer.querySelector('input[aria-label="最多邀请人数"]') as HTMLInputElement
    const setNumber = async (input: HTMLInputElement, value: string) => {
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await wrapper.vm.$nextTick()
    }
    const prompt = drawer.querySelector('input[aria-label="邀请到指定人数后二次触发提示"]') as HTMLInputElement
    expect(prompt.disabled).toBe(true)
    await setNumber(maximum, '5')
    expect(drawer.textContent).toContain('需大于最少邀请人数')
    expect(prompt.disabled).toBe(false)
    await setNumber(maximum, '8')
    expect(drawer.textContent).not.toContain('需大于最少邀请人数')
    prompt.click()
    await wrapper.vm.$nextTick()
    expect(drawer.querySelector('input[aria-label="二次触发提示人数"]')).not.toBeNull()
    expect(document.activeElement).not.toBe(drawer.querySelector('input[aria-label="二次触发提示人数"]'))
    expect(drawer.querySelector('.invite-settings-second-prompt [role="alert"]')).toBeNull()
    expect(drawer.querySelector('.invite-settings-second-prompt .performance-number-input.is-invalid')).toBeNull()
    expect(drawer.querySelector('.invite-settings-second-prompt')?.textContent).not.toContain('二次触发提示人数')
    expect(drawer.querySelectorAll('.invite-settings-prefix-select')).toHaveLength(2)
    const secondSelector = drawer.querySelectorAll('.invite-settings-prefix-select')[1] as HTMLElement
    secondSelector.click()
    await wrapper.vm.$nextTick()
    const secondPopup = document.body.querySelector('[aria-label="二次触发提示方式选项"]') as HTMLElement
    expect(secondPopup.querySelectorAll('[role="option"]')).toHaveLength(2)
    const secondLimitOption = Array.from(secondPopup.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(option => option.textContent?.includes('限制值'))!
    secondLimitOption.click()
    await wrapper.vm.$nextTick()
    expect(secondSelector.textContent).toContain('限制值')
    secondSelector.click()
    await wrapper.vm.$nextTick()
    const secondSuggested = Array.from((document.body.querySelector('[aria-label="二次触发提示方式选项"]') as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="option"]')).find(option => option.textContent?.includes('建议值'))!
    secondSuggested.click()
    await wrapper.vm.$nextTick()
    expect(secondSelector.textContent).toContain('建议值')
    expect(document.body.querySelector('[aria-label="二次触发提示方式选项"]')).toBeNull()
    await setNumber(drawer.querySelector('input[aria-label="二次触发提示人数"]') as HTMLInputElement, '8')
    expect(drawer.textContent).toContain('需大于最多邀请人数')
    ;(drawer.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.invite-summary').text()).toContain('5 人')
    await setNumber(drawer.querySelector('input[aria-label="二次触发提示人数"]') as HTMLInputElement, '9')
    expect(drawer.textContent).not.toContain('需大于最多邀请人数')
    ;(drawer.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('[aria-label="360°评估人设置"]')).toBeNull()
    const updated = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { node_settings: Record<string, { invite: Record<string, unknown> }> }
    expect(updated.node_settings['evaluation-1'].invite).toMatchObject({
      maximum_invited_count: 8, maximum_invite_mode: 'SUGGESTED', second_prompt_enabled: true,
      second_prompt_count: 9, second_prompt_mode: 'SUGGESTED',
    })
    wrapper.unmount()
  })

  it('saves invite counts through the project API and reopens with returned settings', async () => {
    const initial = { node_settings: { 'evaluation-1': { invite: {
      default_invite: 'DIRECT_SUBORDINATES' as const, minimum_invited_count: 5,
      exclude_default_invite_from_limit: true, recommended_invite: [], allow_voluntary_evaluation: false,
    } } }, node_times: {} }
    const projectPayload = { name: '项目一', description: null, administrators: [], flow_settings: initial }
    const update = vi.spyOn(performanceProjectApi, 'update').mockImplementation(async (_id, payload) => ({
      ...payload, flow_settings: payload.flow_settings,
    } as Awaited<ReturnType<typeof performanceProjectApi.update>>))
    const wrapper = mount(PerformanceProjectFlowSettings, {
      props: { nodes: [reviewer360Node(1)], modelValue: initial, projectId: 12, projectPayload },
    })
    await wrapper.get('.outline-button').trigger('click')
    const drawer = document.body.querySelector('[aria-label="360°评估人设置"]') as HTMLElement
    const setNumber = async (label: string, value: string) => {
      const input = drawer.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement
      input.value = value
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await wrapper.vm.$nextTick()
    }
    await setNumber('最多邀请人数', '8')
    ;(drawer.querySelector('input[aria-label="邀请到指定人数后二次触发提示"]') as HTMLInputElement).click()
    await wrapper.vm.$nextTick()
    await setNumber('二次触发提示人数', '9')
    ;(drawer.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce())
    expect(update.mock.calls[0][0]).toBe(12)
    expect(update.mock.calls[0][1].flow_settings?.node_settings['evaluation-1'].invite).toMatchObject({
      maximum_invited_count: 8, maximum_invite_mode: 'SUGGESTED',
      second_prompt_enabled: true, second_prompt_count: 9, second_prompt_mode: 'SUGGESTED',
    })
    await vi.waitFor(() => expect(document.body.querySelector('[aria-label="360°评估人设置"]')).toBeNull())
    await wrapper.get('.outline-button').trigger('click')
    expect((document.body.querySelector('input[aria-label="最多邀请人数"]') as HTMLInputElement).value).toBe('8')
    expect((document.body.querySelector('input[aria-label="二次触发提示人数"]') as HTMLInputElement).value).toBe('9')
    wrapper.unmount()
    update.mockRestore()
  })

  it('keeps the invite drawer open when project save fails', async () => {
    const initial = { node_settings: { 'evaluation-1': { invite: {
      default_invite: 'DIRECT_SUBORDINATES' as const, minimum_invited_count: 5,
      exclude_default_invite_from_limit: true, recommended_invite: [], allow_voluntary_evaluation: false,
    } } }, node_times: {} }
    const update = vi.spyOn(performanceProjectApi, 'update').mockRejectedValue(new Error('network'))
    const wrapper = mount(PerformanceProjectFlowSettings, {
      props: { nodes: [reviewer360Node(1)], modelValue: initial, projectId: 12,
        projectPayload: { name: '项目一', description: null, administrators: [], flow_settings: initial } },
    })
    await wrapper.get('.outline-button').trigger('click')
    ;(document.body.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(document.body.querySelector('.invite-settings-save-error')?.textContent).toBe('360°评估人设置保存失败'))
    expect(document.body.querySelector('[aria-label="360°评估人设置"]')).not.toBeNull()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
    update.mockRestore()
  })

  it('disables manual opening for new projects when the organization setting is off', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, {
      props: { nodes: [node('result_view', 1)], manualResultOpeningEnabled: false, manualOpeningSettingLoaded: true },
    })

    const manualInput = wrapper.findAll('.result-view-choices input[type="checkbox"]')[1]
    expect((manualInput.element as HTMLInputElement).disabled).toBe(true)
    expect(wrapper.find('[data-disabled-reason]').exists()).toBe(true)
    expect(wrapper.find('[data-disabled-reason]').text()).toContain('手动开通')
    await manualInput.setValue(true)
    expect((wrapper.findAll('.result-view-choices input[type="checkbox"]')[1].element as HTMLInputElement).disabled).toBe(true)
  })

  it('keeps an existing manual opening selection available when the organization setting is off', () => {
    const wrapper = mount(PerformanceProjectFlowSettings, {
      props: {
        projectId: 12,
        nodes: [node('result_view', 1)],
        manualResultOpeningEnabled: false,
        manualOpeningSettingLoaded: true,
        modelValue: { node_settings: { 'result_view-1': { result_view: { automatic_enabled: false, manual_enabled: true, automatic_rule: 'PREVIOUS_AND_START' } } }, node_times: {} },
      },
    })

    expect((wrapper.findAll('.result-view-choices input[type="checkbox"]')[1].element as HTMLInputElement).disabled).toBe(false)
  })

  it('keeps manual opening unavailable until the organization setting loads', () => {
    const wrapper = mount(PerformanceProjectFlowSettings, {
      props: { nodes: [node('result_view', 1)], manualOpeningSettingLoaded: false },
    })

    expect((wrapper.findAll('.result-view-choices input[type="checkbox"]')[1].element as HTMLInputElement).disabled).toBe(true)
    expect(wrapper.find('[data-disabled-reason]').exists()).toBe(true)
  })

  it('allows both opening modes and labels automatic choices with adjacent node names', async () => {
    const previous = node('evaluation', 1)
    previous.name = '直属经理评价'
    const result = node('result_view', 2)
    result.name = '我的绩效结果'
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [previous, result], showOpeningError: true } })
    expect(wrapper.get('.result-view-error').text()).toBe('请至少选择一种方式')
    expect(wrapper.find('.result-view-choices--error').exists()).toBe(true)
    const choices = wrapper.findAll('.result-view-choices input[type="checkbox"]')
    expect(choices).toHaveLength(2)
    await choices[0].setValue(true)
    expect(wrapper.findAll('.result-view-choices input[type="radio"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('完成直属经理评价，且到我的绩效结果开始时间时开通')
    expect(wrapper.text()).toContain('完成直属经理评价，立即开通')
    await choices[1].setValue(true)
    await wrapper.findAll('.result-view-choices input[type="radio"]')[1].setValue(true)
    const latest = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as any
    expect(latest.node_settings['result_view-2'].result_view).toMatchObject({ automatic_enabled: true, manual_enabled: true, automatic_rule: 'PREVIOUS_IMMEDIATE' })
  })

  it('persists editable flow settings through v-model without changing template nodes', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, {
      props: { nodes: [reviewer360Node(1), node('result_view', 2)] },
    })

    await wrapper.get('.outline-button').trigger('click')
    const drawer = document.body.querySelector('[aria-label="360°评估人设置"]')
    expect(drawer).not.toBeNull()
    expect(drawer?.querySelector('.invite-settings-number-with-prefix .performance-select-shell__selector.invite-settings-prefix-select')).not.toBeNull()
    const minimumInput = drawer?.querySelector('input[aria-label="最少邀请人数"]') as HTMLInputElement
    minimumInput.value = '7'
    minimumInput.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    ;(drawer?.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    await wrapper.get('.result-view-settings input').setValue(true)

    const updates = wrapper.emitted('update:modelValue') || []
    const latest = updates.at(-1)?.[0] as { node_settings: Record<string, Record<string, unknown>> }
    expect(latest.node_settings['evaluation-1'].invite).toMatchObject({ minimum_invited_count: 7, maximum_invited_count: null, second_prompt_enabled: false, second_prompt_count: null })
    expect(latest.node_settings['result_view-2'].result_view).toMatchObject({ automatic_enabled: true, manual_enabled: false, automatic_rule: 'PREVIOUS_AND_START' })
    expect(wrapper.findAll('.flow-node-card h2').map(item => item.text())).toEqual(['评估型环节', '绩效结果查看环节'])
  })
})

describe('calibration assignment counts', () => {
  afterEach(() => { vi.restoreAllMocks() })
  it('uses the backend resolved coverage instead of assuming every rule covers the project', async () => {
    vi.spyOn(performanceProjectApi, 'calibrationPreview').mockResolvedValue({ 'calibration-1': { role_code: 'assessment.calibrator', evaluated_count: 3, assigned_count: 1, unassigned_count: 2, phases: [] } })
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)], evaluatedCount: 3, projectId: 1, projectPayload: { name: '项目一', description: null, administrators: [] } } })
    expect(wrapper.get('.calibration-summary').text()).not.toContain('3 人已分配')
    await vi.waitFor(() => expect(wrapper.get('.calibration-summary').text()).toContain('1 人已分配校准'))
    expect(wrapper.get('.calibration-summary').text()).toContain('2 人未分配校准人')
    wrapper.unmount()
  })
  it('never displays fabricated counts when assignment resolution fails', async () => {
    vi.spyOn(performanceProjectApi, 'calibrationPreview').mockRejectedValue(new Error('network'))
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)], evaluatedCount: 3, projectId: 1, projectPayload: { name: '项目一', description: null, administrators: [] } } })
    await vi.waitFor(() => expect(wrapper.get('.calibration-summary').text()).toContain('校准分配计算失败'))
    expect(wrapper.get('.calibration-summary').text()).not.toContain('人已分配校准')
    wrapper.unmount()
  })
})
