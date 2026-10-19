import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { performanceProjectApi } from '@/api/performance'
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

  it('opens the captured calibration rule drawer without inserting until confirmation', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('calibration', 1)] } })

    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    await wrapper.get('.add-rule').trigger('click')
    expect(wrapper.findAll('.rule-row')).toHaveLength(1)
    expect(document.body.querySelector('[aria-label="校准规则编辑"]')).not.toBeNull()
    expect(document.body.querySelector('.performance-drawer__header h2')?.textContent).toBe('添加校准规则')
    expect(document.body.querySelector('.performance-drawer-footer--captured')).not.toBeNull()

    const confirm = document.body.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.rule-row')).toHaveLength(2)
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
  })

  it('discards 360° invitation draft when cancelled or closed', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('reviewer_360_invite', 1)] } })
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
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('reviewer_360_invite', 1)] } })
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
    const wrapper = mount(PerformanceProjectFlowSettings, { props: { nodes: [node('reviewer_360_invite', 1)] } })
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
    expect(updated.node_settings['reviewer_360_invite-1'].invite).toMatchObject({
      maximum_invited_count: 8, maximum_invite_mode: 'SUGGESTED', second_prompt_enabled: true,
      second_prompt_count: 9, second_prompt_mode: 'SUGGESTED',
    })
    wrapper.unmount()
  })

  it('saves invite counts through the project API and reopens with returned settings', async () => {
    const initial = { node_settings: { 'reviewer_360_invite-1': { invite: {
      default_invite: 'DIRECT_SUBORDINATES' as const, minimum_invited_count: 5,
      exclude_default_invite_from_limit: true, recommended_invite: [], allow_voluntary_evaluation: false,
    } } }, node_times: {} }
    const projectPayload = { name: '项目一', description: null, administrators: [], flow_settings: initial }
    const update = vi.spyOn(performanceProjectApi, 'update').mockImplementation(async (_id, payload) => ({
      ...payload, flow_settings: payload.flow_settings,
    } as Awaited<ReturnType<typeof performanceProjectApi.update>>))
    const wrapper = mount(PerformanceProjectFlowSettings, {
      props: { nodes: [node('reviewer_360_invite', 1)], modelValue: initial, projectId: 12, projectPayload },
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
    expect(update.mock.calls[0][1].flow_settings?.node_settings['reviewer_360_invite-1'].invite).toMatchObject({
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
    const initial = { node_settings: { 'reviewer_360_invite-1': { invite: {
      default_invite: 'DIRECT_SUBORDINATES' as const, minimum_invited_count: 5,
      exclude_default_invite_from_limit: true, recommended_invite: [], allow_voluntary_evaluation: false,
    } } }, node_times: {} }
    const update = vi.spyOn(performanceProjectApi, 'update').mockRejectedValue(new Error('network'))
    const wrapper = mount(PerformanceProjectFlowSettings, {
      props: { nodes: [node('reviewer_360_invite', 1)], modelValue: initial, projectId: 12,
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

  it('persists editable flow settings through v-model without changing template nodes', async () => {
    const wrapper = mount(PerformanceProjectFlowSettings, {
      props: { nodes: [node('reviewer_360_invite', 1), node('result_view', 2)] },
    })

    await wrapper.get('.outline-button').trigger('click')
    const drawer = document.body.querySelector('[aria-label="360°评估人设置"]') as HTMLElement
    const minimumInput = drawer.querySelector('input[aria-label="最少邀请人数"]') as HTMLInputElement
    minimumInput.value = '7'
    minimumInput.dispatchEvent(new Event('input', { bubbles: true }))
    await wrapper.vm.$nextTick()
    ;(drawer.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    await wrapper.get('.result-view-settings input').setValue(true)

    const updates = wrapper.emitted('update:modelValue') || []
    const latest = updates.at(-1)?.[0] as { node_settings: Record<string, Record<string, unknown>> }
    expect(latest.node_settings['reviewer_360_invite-1'].invite).toMatchObject({ minimum_invited_count: 7 })
    expect(latest.node_settings['result_view-2'].result_view).toMatchObject({ opening_mode: 'AUTOMATIC' })
    expect(wrapper.findAll('.flow-node-card h2').map(item => item.text())).toEqual(['360°邀请环节', '绩效结果查看环节'])
  })
})
