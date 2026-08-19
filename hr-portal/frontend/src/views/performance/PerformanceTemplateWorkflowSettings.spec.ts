import { config, flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { performanceTemplateApi, type PerformanceWorkflowNode } from '@/api/performance'
import PerformanceTemplateWorkflowSettings from './PerformanceTemplateWorkflowSettings.vue'
import PerformanceWorkflowStageIcon from './PerformanceWorkflowStageIcon.vue'
import workflowSource from './PerformanceTemplateWorkflowSettings.vue?raw'
import infoPopoverSource from '@/components/performance/PerformanceInfoPopover.vue?raw'
import executorFieldSource from '@/components/performance/WorkflowExecutorField.vue?raw'
import checkboxSource from '@/components/performance/PerformanceCheckbox.vue?raw'
import countedTextareaSource from '@/components/performance/PerformanceCountedTextarea.vue?raw'

config.global.stubs = { Teleport: true }

describe('PerformanceTemplateWorkflowSettings', () => {
  it('keeps the right-panel title at the standard node label after a custom name edit', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const evaluationNode = wrapper.findAll('.stage-node').find(node => node.text().includes('评估型环节'))

    await evaluationNode?.trigger('click')
    expect(wrapper.get('.panel-title').text()).toBe('评估型环节')
    await wrapper.get('.panel-scroll input').setValue('自定义评估名称')

    expect(wrapper.get('.panel-title').text()).toBe('评估型环节')
    expect((wrapper.get('.panel-scroll input').element as HTMLInputElement).value).toBe('自定义评估名称')
  })

  it('preserves the panel content width by removing native scrollbar occupation', () => {
    expect(workflowSource).toContain('.panel-scroll{flex:1 1 auto;min-height:0;overflow:auto;scrollbar-width:none}')
    expect(workflowSource).toContain('.panel-scroll::-webkit-scrollbar{width:0;height:0}')
    expect(workflowSource).toContain('.config-panel{display:flex;flex-direction:column;overflow:hidden}')
  })

  it('renders the icon and title in one row with an independent executor row', () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const resultNode = wrapper.findAll('.stage-node').find(node => node.text().includes('绩效结果查看环节'))

    expect(resultNode?.find('.node-title-row').find('.node-title').text()).toBe('绩效结果查看环节')
    expect(resultNode?.find('.node-title-row').find('.node-icon').exists()).toBe(true)
    expect(resultNode?.find('.node-executor').text()).toBe('执行人：被评估人')
    expect(resultNode?.element.children[0].classList.contains('node-title-row')).toBe(true)
    expect(resultNode?.element.children[1].classList.contains('node-executor')).toBe(true)
    expect(workflowSource).toContain('width:max-content')
    expect(workflowSource).toContain('text-overflow:ellipsis')
  })

  it('reuses the subject executor field and renders a default-off confirmation switch for result view', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const resultNode = wrapper.findAll('.stage-node').find(node => node.text().includes('绩效结果查看环节'))

    await resultNode?.trigger('click')

    expect(wrapper.findAll('.workflow-fixed-executor-field')).toHaveLength(1)
    expect(wrapper.get('.performance-executor-tag').text()).toBe('被评估人')
    const confirmationSwitch = wrapper.get('.subject-confirm-setting .performance-switch')
    expect(confirmationSwitch.attributes('aria-checked')).toBe('false')

    await confirmationSwitch.trigger('click')
    expect(confirmationSwitch.attributes('aria-checked')).toBe('true')
  })

  it('normalizes and persists result-view subject confirmation through the workflow API', async () => {
    const nodes: PerformanceWorkflowNode[] = [
      {
        node_id: 'evaluation-1', node_type: 'evaluation', name: '评估型环节', description: '', order: 1,
        executor_types: ['DIRECT_MANAGER'], executor_label: '实线上级', evaluation_type: 'SINGLE',
        include_final_result: false, system: false, allow_invite_other_executors: false,
        invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false,
        subject_confirm_required: true,
      },
      {
        node_id: 'result-view-1', node_type: 'result_view', name: '绩效结果查看环节', description: '', order: 2,
        executor_types: ['DIRECT_MANAGER'], executor_label: '实线上级', evaluation_type: null,
        include_final_result: false, system: true, allow_invite_other_executors: false,
        invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false,
        subject_confirm_required: true,
      },
    ]
    vi.spyOn(performanceTemplateApi, 'getWorkflow').mockResolvedValue({
      template_id: 97, usage_summary: { cycle_count: 0, project_count: 0 }, nodes,
    })
    const updateSpy = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => ({
      template_id: 97, usage_summary: { cycle_count: 0, project_count: 0 }, nodes: payload.nodes,
    }))
    const wrapper = mount(PerformanceTemplateWorkflowSettings, { props: { templateId: 97 } })
    await flushPromises()
    await wrapper.findAll('.stage-node')[1].trigger('click')

    expect(wrapper.get('.subject-confirm-setting .performance-switch').attributes('aria-checked')).toBe('true')
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()

    expect(updateSpy.mock.calls[0][1].nodes[0].subject_confirm_required).toBe(false)
    expect(updateSpy.mock.calls[0][1].nodes[1]).toMatchObject({
      executor_label: '被评估人', executor_types: ['SUBJECT'], subject_confirm_required: true,
    })
  })

  it('applies fixed evaluation defaults and the executor-specific final-result behavior', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const evaluationNode = wrapper.findAll('.stage-node').find(node => node.text().includes('评估型环节'))

    await evaluationNode?.trigger('click')
    const finalResultSwitch = wrapper.get('.final-result-row .performance-switch')
    await finalResultSwitch.trigger('click')
    expect(finalResultSwitch.attributes('aria-checked')).toBe('true')

    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    await wrapper.findAll('.executor-option').find(option => option.text() === '被评估人')?.trigger('click')

    const evaluationRadios = wrapper.findAll('.ud__radio__input')
    expect((evaluationRadios[0].element as HTMLInputElement).checked).toBe(true)
    expect((evaluationRadios[1].element as HTMLInputElement).checked).toBe(false)
    expect(evaluationRadios.every(radio => (radio.element as HTMLInputElement).disabled)).toBe(true)
    expect(workflowSource).toContain('.panel-scroll .ud__radio__wrapper{position:relative;display:flex;align-items:center')
    expect(workflowSource).toContain('.ud__radio__wallpaper{position:absolute;top:50%')
    expect(workflowSource).toContain('.ud__radio__label-content{display:block;height:22px')
    expect(finalResultSwitch.attributes('disabled')).toBeDefined()
    expect(finalResultSwitch.attributes('aria-checked')).toBe('false')

    await wrapper.get('.final-result-switch-anchor').trigger('mouseenter')
    vi.advanceTimersByTime(137)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.final-result-tooltip-popover').exists()).toBe(false)
    vi.advanceTimersByTime(1)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.final-result-tooltip-popover').text()).toBe('执行人为被评估人时无法开启此功能。')
    expect(wrapper.get('.final-result-tooltip-arrow svg').attributes('width')).toBe('16')
    expect(wrapper.get('.final-result-tooltip-arrow path').attributes('d')).toContain('M8-.5H0v1')

    await wrapper.get('.final-result-switch-anchor').trigger('mouseleave')
    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    await wrapper.findAll('.executor-option').find(option => option.text() === '360°评估人')?.trigger('click')

    expect(wrapper.findAll('.ud__radio__input').every(radio => (radio.element as HTMLInputElement).disabled)).toBe(true)
    expect((wrapper.get('.ud__radio__input[value="SINGLE"]').element as HTMLInputElement).checked).toBe(false)
    expect((wrapper.get('.ud__radio__input[value="MULTI"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('.final-result-row .performance-switch').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.final-result-row .performance-switch').attributes('aria-checked')).toBe('false')

    await wrapper.get('.final-result-switch-anchor').trigger('mouseenter')
    vi.advanceTimersByTime(138)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.final-result-tooltip-popover').text()).toBe('执行人为360°评估人时无法开启此功能。')

    await wrapper.get('.final-result-switch-anchor').trigger('mouseleave')
    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    await wrapper.findAll('.executor-option').find(option => option.text() === '实线上级')?.trigger('click')

    expect(wrapper.findAll('.ud__radio__input').every(radio => (radio.element as HTMLInputElement).disabled)).toBe(true)
    expect((wrapper.get('.ud__radio__input[value="SINGLE"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('.final-result-row .performance-switch').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.final-result-row .performance-switch').attributes('aria-checked')).toBe('false')
    await wrapper.get('.final-result-row .performance-switch').trigger('click')
    expect(wrapper.get('.final-result-row .performance-switch').attributes('aria-checked')).toBe('true')
    expect(wrapper.get('.final-result-help').text()).toBe('设置了最终绩效结果的环节必须在评估内容中添加评估型问题')
    expect(workflowSource).toContain('.final-result-help{width:263.333px')
    expect(workflowSource).toContain('margin-top:4px')

    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    await wrapper.findAll('.executor-option').find(option => option.text() === '虚线上级')?.trigger('click')

    expect(wrapper.findAll('.ud__radio__input').every(radio => !(radio.element as HTMLInputElement).disabled)).toBe(true)
    expect((wrapper.get('.ud__radio__input[value="SINGLE"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('.final-result-row .performance-switch').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.final-result-row .performance-switch').attributes('aria-checked')).toBe('false')
    expect(wrapper.find('.final-result-help').exists()).toBe(false)
    await wrapper.get('.ud__radio__input[value="MULTI"]').setValue(true)
    expect((wrapper.get('.ud__radio__input[value="MULTI"]').element as HTMLInputElement).checked).toBe(true)

    await wrapper.get('.final-result-switch-anchor').trigger('mouseenter')
    vi.advanceTimersByTime(138)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.final-result-tooltip-popover').text()).toBe('执行人为虚线上级时无法开启此功能。')

    wrapper.unmount()
    vi.useRealTimers()
  })

  it('renders the real-line manager options with the captured checkbox geometry and selected state', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const evaluationNode = wrapper.findAll('.stage-node').find(node => node.text().includes('评估型环节'))

    await evaluationNode?.trigger('click')

    const optionPanel = wrapper.get('.sub-options')
    const rows = optionPanel.findAll('.check-row')
    const inputs = optionPanel.findAll('.ud__checkbox__input')
    expect(rows).toHaveLength(4)
    expect(rows.map(row => row.text())).toEqual(['直属上级', '隔 1 级上级', '隔 2 级上级', '隔 3 级上级及以上'])
    expect((inputs[0].element as HTMLInputElement).checked).toBe(true)
    expect((inputs[1].element as HTMLInputElement).checked).toBe(false)
    expect(rows[0].get('.ud__checkbox__wallpaper').classes()).toContain('ud__checkbox__wallpaper--checked')
    expect(rows[0].get('.ud__checkbox__checked-svg').attributes('width')).toBe('12')
    expect(rows[0].get('.ud__checkbox__checked-svg path').attributes('d')).toBe('M9.589 2.903l.808.809a.35.35 0 010 .495L5.18 9.425a.35.35 0 01-.495 0l-2.981-2.98a.35.35 0 010-.496l.808-.808a.35.35 0 01.495 0l1.925 1.925 4.163-4.163a.35.35 0 01.495 0z')
    expect(rows[1].find('.ud__checkbox__checked-svg').exists()).toBe(false)

    await inputs[1].setValue(true)
    expect((inputs[1].element as HTMLInputElement).checked).toBe(true)
    expect(rows[1].get('.ud__checkbox__wallpaper').classes()).toContain('ud__checkbox__wallpaper--checked')
    expect(executorFieldSource).toContain('.sub-options{display:flex;flex-direction:column;gap:8px;width:263.333px;margin:0 0 20px;padding:12px')
    expect(executorFieldSource).toContain('border-radius:6px;background:#f8f9fa')
    expect(executorFieldSource).toContain('.check-row{width:100%}')
    expect(checkboxSource).toContain('border:.666667px solid #8f959e;border-radius:4px;background:#fff')
    expect(checkboxSource).toContain('.ud__checkbox__wallpaper--checked{border-color:transparent;background:#0442d2}')
    expect(checkboxSource).toContain('.performance-checkbox__label{display:block;flex:0 0 auto;height:22px;margin-left:8px')
  })

  it.each([
    ['evaluation', 3],
    ['work_summary', 3],
    ['reviewer_360_invite', 5],
    ['reviewer_360_confirm', 4],
    ['calibration', 3],
    ['result_communication', 4],
    ['result_view', 4],
    ['result_reconsideration', 3],
  ])('renders the captured SVG paths for %s', (type, pathCount) => {
    const icon = mount(PerformanceWorkflowStageIcon, { props: { type } })

    expect(icon.get('svg').classes()).toContain('stage-icon')
    expect(icon.findAll('path')).toHaveLength(pathCount)
    expect(icon.text()).toBe('')
  })

  it('opens the add-stage popover on hover and closes it after leaving', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const connector = wrapper.get('.flow-connector')

    await connector.trigger('mouseenter')
    expect(wrapper.find('.stage-popover').exists()).toBe(true)

    await connector.trigger('mouseleave')
    vi.advanceTimersByTime(120)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.stage-popover').exists()).toBe(false)
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('shows the captured trash icon for deletable nodes without selecting them', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.get('.flow-connector').trigger('mouseenter')
    await wrapper.findAll('.popover-stage').find(option => option.text().includes('工作总结环节'))?.trigger('click')
    const workSummaryNode = wrapper.findAll('.stage-node').find(node => node.text().includes('工作总结环节'))
    const resultNode = wrapper.findAll('.stage-node').find(node => node.text().includes('绩效结果查看环节'))
    const deleteButton = workSummaryNode?.get('.delete-node')

    expect(deleteButton?.attributes('aria-label')).toBe('删除工作总结环节')
    expect(deleteButton?.get('svg').attributes('width')).toBe('16')
    expect(deleteButton?.get('path').attributes('d')).toContain('M8 4a2 2 0 0 1 2-2h4')
    expect(resultNode?.find('.delete-node').exists()).toBe(false)
    expect(workflowSource).toContain('.stage-node:hover .delete-node')
  })

  it('applies the captured node and trash-button hover states without a dead pointer gap', () => {
    expect(workflowSource).toContain('.stage-node:hover,.stage-node:focus-visible{border-color:#3370ff;background:rgba(51,112,255,.08);color:#3370ff}')
    expect(workflowSource).toContain('height:25px')
    expect(workflowSource).toContain('.delete-node::before{position:absolute;top:0;bottom:0;left:-4px;width:4px;content:""}')
    expect(workflowSource).toContain('.delete-node:hover,.delete-node:focus-visible{background-color:rgba(31,35,41,.2)}')
  })

  it('shows the delete button only while the pointer hovers the node', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.get('.flow-connector').trigger('mouseenter')
    await wrapper.findAll('.popover-stage').find(option => option.text().includes('工作总结环节'))?.trigger('click')

    const workSummaryNode = wrapper.findAll('.stage-node').find(node => node.text().includes('工作总结环节'))

    expect(workSummaryNode?.classes()).toContain('selected')
    expect(workSummaryNode?.find('.delete-node').exists()).toBe(true)
    expect(workflowSource).toContain('.stage-node:hover .delete-node{visibility:visible;opacity:1;pointer-events:auto}')
    expect(workflowSource).not.toContain('.stage-node.selected .delete-node')
    expect(workflowSource).not.toContain('.stage-node:focus-within .delete-node')
  })

  it('protects the last evaluation node and allows deletion only when more than one exists', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const evaluationNodes = () => wrapper.findAll('.stage-node').filter(node => node.text().includes('评估型环节'))

    expect(evaluationNodes()).toHaveLength(1)
    expect(evaluationNodes()[0].find('.delete-node').exists()).toBe(false)

    await wrapper.get('.flow-connector').trigger('mouseenter')
    await wrapper.findAll('.popover-stage').find(option => option.text().includes('评估型环节'))?.trigger('click')
    expect(evaluationNodes()).toHaveLength(2)
    expect(evaluationNodes().every(node => node.find('.delete-node').exists())).toBe(true)

    await evaluationNodes()[0].get('.delete-node').trigger('click')
    expect(evaluationNodes()).toHaveLength(1)
    expect(evaluationNodes()[0].find('.delete-node').exists()).toBe(false)
  })

  it('does not expose the built-in result-view node in the add-stage popover', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.get('.flow-connector').trigger('mouseenter')

    expect(wrapper.get('.stage-popover').text()).not.toContain('绩效结果查看环节')
  })

  it.each([
    '工作总结环节',
    '360°邀请环节',
    '360°确认环节',
    '校准环节',
    '结果沟通环节',
  ])('removes %s from the add-stage popover after it has been added', async (label) => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.get('.flow-connector').trigger('mouseenter')
    await wrapper.findAll('.popover-stage').find(option => option.text().includes(label))?.trigger('click')
    await wrapper.get('.flow-connector').trigger('mouseenter')

    expect(wrapper.get('.stage-popover').text()).not.toContain(label)
    expect(wrapper.get('.stage-popover').text()).toContain('评估型环节')
  })

  it('reuses the executor field for result communication with only real and virtual managers', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.get('.flow-connector').trigger('mouseenter')
    await wrapper.findAll('.popover-stage').find(option => option.text().includes('结果沟通环节'))?.trigger('click')

    expect(wrapper.get('.panel-title').text()).toBe('结果沟通环节')
    expect(wrapper.get('.executor-row .form-label').text()).toContain('环节执行人')
    expect(wrapper.get('.executor-row .required-mark').text()).toBe('*')
    expect(wrapper.get('.ud__select__selector__selectItem').text()).toBe('实线上级')
    expect(wrapper.findAll('.sub-options .check-row')).toHaveLength(4)
    expect(wrapper.find('.evaluation-type-row').exists()).toBe(false)
    expect(wrapper.find('.final-result-setting').exists()).toBe(false)

    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    expect(wrapper.findAll('.executor-option').map(option => option.text())).toEqual(['实线上级', '虚线上级'])
    await wrapper.findAll('.executor-option').find(option => option.text() === '虚线上级')?.trigger('click')

    expect(wrapper.find('.sub-options').exists()).toBe(false)
    expect(wrapper.findAll('.stage-node').find(node => node.text().includes('结果沟通环节'))?.text()).toContain('执行人：虚线上级')
  })

  it('reuses the result-communication executor field for 360 confirmation with only three manager levels', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.get('.flow-connector').trigger('mouseenter')
    await wrapper.findAll('.popover-stage').find(option => option.text().includes('360°确认环节'))?.trigger('click')

    expect(wrapper.get('.panel-title').text()).toBe('360°确认环节')
    expect(wrapper.findAll('.workflow-executor-field')).toHaveLength(1)
    expect(wrapper.get('.ud__select__selector__selectItem').text()).toBe('实线上级')
    expect(wrapper.findAll('.sub-options .check-row').map(row => row.text())).toEqual(['直属上级', '隔 1 级上级', '隔 2 级上级'])
    expect(wrapper.find('.evaluation-type-row').exists()).toBe(false)
    expect(wrapper.find('.final-result-setting').exists()).toBe(false)

    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    expect(wrapper.findAll('.executor-option').map(option => option.text())).toEqual(['实线上级', '虚线上级'])
    await wrapper.findAll('.executor-option').find(option => option.text() === '虚线上级')?.trigger('click')

    expect(wrapper.find('.sub-options').exists()).toBe(false)
    expect(wrapper.findAll('.stage-node').find(node => node.text().includes('360°确认环节'))?.text()).toContain('执行人：虚线上级')
  })

  it('normalizes and persists the supported 360-confirmation executor values after reopen', async () => {
    const nodes: PerformanceWorkflowNode[] = [
      {
        node_id: 'evaluation-1', node_type: 'evaluation', name: '评估型环节', description: '', order: 1,
        executor_types: ['DIRECT_MANAGER'], executor_label: '实线上级', evaluation_type: 'SINGLE',
        include_final_result: false, system: false, allow_invite_other_executors: false,
        invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false,
      },
      {
        node_id: 'confirm-1', node_type: 'reviewer_360_confirm', name: '360°确认环节', description: '', order: 2,
        executor_types: ['DIRECT_MANAGER', 'LEVEL_2_MANAGER', 'LEVEL_3_MANAGER_PLUS', 'LEVEL_2_MANAGER'],
        executor_label: '不支持的执行人', evaluation_type: null, include_final_result: false, system: false,
        allow_invite_other_executors: false, invite_executor_scope: 'ALL', invite_executor_types: [],
        require_previous_node_completion: false,
      },
    ]
    const getSpy = vi.spyOn(performanceTemplateApi, 'getWorkflow').mockResolvedValue({
      template_id: 93, usage_summary: { cycle_count: 0, project_count: 0 }, nodes,
    })
    const updateSpy = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => ({
      template_id: 93, usage_summary: { cycle_count: 0, project_count: 0 }, nodes: payload.nodes,
    }))
    const wrapper = mount(PerformanceTemplateWorkflowSettings, { props: { templateId: 93 } })
    await flushPromises()
    await wrapper.findAll('.stage-node')[1].trigger('click')

    expect(wrapper.get('.ud__select__selector__selectItem').text()).toBe('实线上级')
    expect(wrapper.findAll('.sub-options .check-row')).toHaveLength(3)

    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()
    expect(updateSpy.mock.calls[0][1].nodes[1]).toMatchObject({
      executor_label: '实线上级',
      executor_types: ['DIRECT_MANAGER', 'LEVEL_2_MANAGER'],
    })
    wrapper.unmount()
    getSpy.mockRestore()
    updateSpy.mockRestore()
  })

  it('uses the shared fixed executor field for work summary with the canonical subject code', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.get('.flow-connector').trigger('mouseenter')
    await wrapper.findAll('.popover-stage').find(option => option.text().includes('工作总结环节'))?.trigger('click')

    const field = wrapper.get('.workflow-fixed-executor-field')
    expect(field.get('h4').text()).toBe('环节执行人')
    expect(field.get('.workflow-fixed-executor-field__required').text()).toBe('*')
    expect(field.get('.performance-executor-tag').text()).toBe('被评估人')
    expect(field.get('.performance-executor-tag').attributes('data-executor-type')).toBe('SUBJECT')
    expect(wrapper.find('.executor-row').exists()).toBe(false)
    expect(wrapper.findAll('.stage-node').find(node => node.text().includes('工作总结环节'))?.text()).toContain('执行人：被评估人')
  })

  it('uses the shared fixed executor field for calibration with a project-configured API placeholder', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.get('.flow-connector').trigger('mouseenter')
    await wrapper.findAll('.popover-stage').find(option => option.text().includes('校准环节'))?.trigger('click')

    expect(wrapper.get('.panel-title').text()).toBe('校准环节')
    expect(wrapper.get('.workflow-fixed-executor-field').text()).toContain('在项目配置时指定')
    expect(wrapper.get('.performance-executor-tag').attributes('data-executor-type')).toBe('PROJECT_CONFIGURED')
    expect(wrapper.find('.ud__select__selector').exists()).toBe(false)
    expect(wrapper.get('.calibration-reason-setting__title').text()).toBe('填写调整原因')
    expect(wrapper.get('.calibration-reason-setting .performance-switch').attributes('aria-checked')).toBe('true')
    expect(wrapper.get('.calibration-reason-setting__help').text()).toBe('在校准时调整评分或评级结果，需填写原因')
    expect((wrapper.get('.calibration-reason-setting__required input').element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.get('.calibration-reason-setting__required').element.children[1].textContent).toBe('必填')

    await wrapper.get('.calibration-reason-setting__required input').setValue(true)
    expect((wrapper.get('.calibration-reason-setting__required input').element as HTMLInputElement).checked).toBe(true)
    await wrapper.get('.calibration-reason-setting .performance-switch').trigger('click')
    expect(wrapper.find('.calibration-reason-setting__required').exists()).toBe(false)
    await wrapper.get('.calibration-reason-setting .performance-switch').trigger('click')
    expect((wrapper.get('.calibration-reason-setting__required input').element as HTMLInputElement).checked).toBe(false)
  })

  it('normalizes a persisted calibration executor to the project-configured placeholder', async () => {
    const nodes: PerformanceWorkflowNode[] = [
      {
        node_id: 'evaluation-1', node_type: 'evaluation', name: '评估型环节', description: '', order: 1,
        executor_types: ['DIRECT_MANAGER'], executor_label: '实线上级', evaluation_type: 'SINGLE',
        include_final_result: false, system: false, allow_invite_other_executors: false,
        invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false,
      },
      {
        node_id: 'calibration-1', node_type: 'calibration', name: '校准环节', description: '', order: 2,
        executor_types: ['DIRECT_MANAGER'], executor_label: '旧执行人', evaluation_type: null,
        include_final_result: false, system: false, allow_invite_other_executors: false,
        invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false,
        calibration_reason_enabled: true, calibration_reason_required: true,
      },
    ]
    const getSpy = vi.spyOn(performanceTemplateApi, 'getWorkflow').mockResolvedValue({
      template_id: 94, usage_summary: { cycle_count: 0, project_count: 0 }, nodes,
    })
    const updateSpy = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => ({
      template_id: 94, usage_summary: { cycle_count: 0, project_count: 0 }, nodes: payload.nodes,
    }))
    const wrapper = mount(PerformanceTemplateWorkflowSettings, { props: { templateId: 94 } })
    await flushPromises()
    await wrapper.findAll('.stage-node')[1].trigger('click')

    expect(wrapper.get('.performance-executor-tag').attributes('data-executor-type')).toBe('PROJECT_CONFIGURED')
    expect((wrapper.get('.calibration-reason-setting__required input').element as HTMLInputElement).checked).toBe(true)
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()
    expect(updateSpy.mock.calls[0][1].nodes[1]).toMatchObject({
      executor_label: '在项目配置时指定', executor_types: ['PROJECT_CONFIGURED'],
      calibration_reason_enabled: true, calibration_reason_required: true,
    })
    wrapper.unmount()
    getSpy.mockRestore()
    updateSpy.mockRestore()
  })

  it('keeps evaluation available after adding another evaluation node', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.get('.flow-connector').trigger('mouseenter')
    await wrapper.findAll('.popover-stage').find(option => option.text().includes('评估型环节'))?.trigger('click')
    await wrapper.get('.flow-connector').trigger('mouseenter')

    expect(wrapper.get('.stage-popover').text()).toContain('评估型环节')
  })

  it('makes a single-instance stage available again after deleting it', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.get('.flow-connector').trigger('mouseenter')
    await wrapper.findAll('.popover-stage').find(option => option.text().includes('工作总结环节'))?.trigger('click')
    const workSummaryNode = wrapper.findAll('.stage-node').find(node => node.text().includes('工作总结环节'))
    await workSummaryNode?.get('.delete-node').trigger('click')
    await wrapper.get('.flow-connector').trigger('mouseenter')

    expect(wrapper.get('.stage-popover').text()).toContain('工作总结环节')
    expect(workflowSource).toContain("type !== 'evaluation' && hasNodeType(type)")
  })

  it('offers result reconsideration only from the connector after result view', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const connectors = wrapper.findAll('button.flow-connector')

    await connectors[0].trigger('mouseenter')
    expect(wrapper.get('.stage-popover').text()).not.toContain('结果复议处理')

    await connectors[connectors.length - 1].trigger('mouseenter')
    const options = wrapper.findAll('.popover-stage')
    expect(options).toHaveLength(1)
    expect(options[0].text()).toBe('结果复议处理')
    expect(options[0].findAll('path')).toHaveLength(3)
    expect(workflowSource).toContain('.popover-icon :deep(.stage-icon){width:16px;height:16px}')
  })

  it('sizes both regular and result-reconsideration popovers from their current options', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const connectors = wrapper.findAll('button.flow-connector')

    await connectors[0].trigger('mouseenter')
    expect(wrapper.findAll('.popover-stage').length).toBeGreaterThan(1)

    await connectors[connectors.length - 1].trigger('mouseenter')
    expect(wrapper.findAll('.popover-stage')).toHaveLength(1)
    expect(wrapper.get('.popover-stage').text()).toBe('结果复议处理')
    expect(workflowSource).not.toContain('height:327px')
    expect(workflowSource).toContain('.stage-popover{position:absolute;top:0;left:0;overflow:visible;width:313px;box-sizing:border-box')
    expect(workflowSource).toContain('.stage-popover-content{overflow:auto;max-height:inherit')
    expect(workflowSource).toContain('.popover-stage:last-child{margin-bottom:0}')
  })

  it('anchors the popover and original arrow to the active add circle with viewport avoidance', async () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 })
    let addTop = 58
    const makeRect = (left: number, top: number, width: number, height: number) => ({
      x: left,
      y: top,
      top,
      right: left + width,
      bottom: top + height,
      left,
      width,
      height,
      toJSON: () => ({}),
    }) as DOMRect
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains('workflow-canvas')) return makeRect(0, 50, 960, 250)
      if (this.classList.contains('add-circle')) return makeRect(464, addTop, 16, 16)
      if (this.classList.contains('stage-popover')) return makeRect(490, 50, 313, 143)
      return makeRect(0, 0, 0, 0)
    })
    const wrapper = mount(PerformanceTemplateWorkflowSettings, { attachTo: document.body })
    const connector = wrapper.get('.flow-connector')

    await connector.trigger('mouseenter')
    const popover = wrapper.get('.stage-popover')

    window.dispatchEvent(new Event('resize'))
    await wrapper.vm.$nextTick()
    expect(popover.attributes('style')).toContain('translate3d(490px, 50px, 0)')
    expect(popover.get('.popover-arrow').attributes('style')).toContain('top: 16px')

    wrapper.unmount()
    addTop = 276
    const bottomWrapper = mount(PerformanceTemplateWorkflowSettings, { attachTo: document.body })
    await bottomWrapper.get('.flow-connector').trigger('mouseenter')
    const bottomPopover = bottomWrapper.get('.stage-popover')
    expect(bottomPopover.attributes('style')).toContain('translate3d(490px, 157px, 0)')
    expect(bottomPopover.get('.popover-arrow').attributes('style')).toContain('top: 127px')
    expect(bottomPopover.get('.popover-arrow').attributes('width')).toBe('8')
    expect(bottomPopover.get('.popover-arrow').attributes('height')).toBe('16')
    expect(bottomPopover.get('.popover-arrow path').attributes('d')).toBe('M-.5 8v8h1c0-1.553.664-3.033 1.825-4.065l3.166-2.814a1.5 1.5 0 000-2.242L2.325 4.065A5.438 5.438 0 01.5 0h-1v8z')
    expect(workflowSource).not.toContain('top:112px;left:calc(50% + 24px)')
    expect(workflowSource).not.toContain('Math.min(Math.max(addCenterY - top, 16)')
    expect(workflowSource).toContain('useTopArrow ? 16 : Math.max(16, popoverHeight - 16)')
    expect(workflowSource).toContain('addRect.right + 10 + window.scrollX')
    expect(workflowSource).toContain('@scroll.passive="updatePopoverPosition"')
    expect(workflowSource).toContain("window.addEventListener('resize', updatePopoverPosition)")
    expect(workflowSource).toContain("window.addEventListener('scroll', updatePopoverPosition, true)")
    rectSpy.mockRestore()
    bottomWrapper.unmount()
  })

  it('adds result reconsideration directly after result view and removes both following add actions', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const connectors = wrapper.findAll('button.flow-connector')
    await connectors[connectors.length - 1].trigger('mouseenter')
    await wrapper.get('.popover-stage').trigger('click')

    const nodes = wrapper.findAll('.stage-node')
    const resultViewIndex = nodes.findIndex(node => node.text().includes('绩效结果查看环节'))
    const reconsiderationNode = nodes[resultViewIndex + 1]

    expect(reconsiderationNode.text()).toContain('结果复议处理')
    expect(reconsiderationNode.findAll('.node-icon path')).toHaveLength(3)
    expect(nodes[resultViewIndex].element.nextElementSibling?.classList).toContain('flow-connector--passive')
    expect(reconsiderationNode.element.nextElementSibling?.classList).toContain('flow-connector--passive')
    expect(wrapper.findAll('button.flow-connector')).toHaveLength(2)
  })

  it('edits the result-reconsideration appeal prompt with captured modal behavior', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const connectors = wrapper.findAll('button.flow-connector')
    await connectors[connectors.length - 1].trigger('mouseenter')
    await wrapper.get('.popover-stage').trigger('click')

    expect(wrapper.get('.appeal-prompt-label').text()).toBe('发起复议提示')
    expect(wrapper.get('.appeal-prompt-help').text()).toBe('此提示内容将在被评估人填写复议理由时展示')
    expect(wrapper.get('.appeal-prompt-edit').text()).toBe('编辑')
    await wrapper.get('.appeal-prompt-edit').trigger('click')

    expect(wrapper.get('.appeal-modal').attributes('role')).toBe('dialog')
    expect(wrapper.get('#appeal-modal-title').text()).toBe('发起复议提示')
    const inputs = wrapper.findAll('.performance-counted-textarea__input')
    const counts = wrapper.findAll('.performance-counted-textarea__count')
    expect(inputs).toHaveLength(2)
    expect(wrapper.findAll('.performance-counted-textarea__label').map(label => label.text())).toEqual(['提示文案*', '填写说明*'])
    expect((inputs[0].element as HTMLTextAreaElement).value).toBe('如果你不认可本次绩效结果，请详细说明复议原因并提供事实依据')
    expect((inputs[1].element as HTMLTextAreaElement).value).toBe('请输入复议理由')
    expect(counts.map(count => count.text())).toEqual(['29/1500', '7/1000'])
    await inputs[0].setValue('自定义复议提示')
    await inputs[1].setValue('自定义填写说明')
    await wrapper.findAll('.appeal-button').find(button => button.text() === '取消')?.trigger('click')
    await wrapper.get('.appeal-prompt-edit').trigger('click')
    expect((wrapper.findAll('.performance-counted-textarea__input')[0].element as HTMLTextAreaElement).value).not.toBe('自定义复议提示')
    expect((wrapper.findAll('.performance-counted-textarea__input')[1].element as HTMLTextAreaElement).value).not.toBe('自定义填写说明')

    await wrapper.findAll('.performance-counted-textarea__input')[0].setValue('自定义复议提示')
    await wrapper.findAll('.performance-counted-textarea__input')[1].setValue('自定义填写说明')
    await wrapper.get('.appeal-button--primary').trigger('click')
    await wrapper.get('.appeal-prompt-edit').trigger('click')
    expect((wrapper.findAll('.performance-counted-textarea__input')[0].element as HTMLTextAreaElement).value).toBe('自定义复议提示')
    expect((wrapper.findAll('.performance-counted-textarea__input')[1].element as HTMLTextAreaElement).value).toBe('自定义填写说明')
    expect(workflowSource).toContain('appeal_prompt_content')
    expect(workflowSource).toContain('appeal_reason_instruction')
    expect(countedTextareaSource).toContain('resize:vertical')
    expect(countedTextareaSource).toContain('right:9px;bottom:9px')
    expect(countedTextareaSource).toContain('height:49.3333px')
  })

  it('renders the measured appeal preview button and delayed popover', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    const connectors = wrapper.findAll('button.flow-connector')
    await connectors[connectors.length - 1].trigger('mouseenter')
    await wrapper.get('.popover-stage').trigger('click')

    const preview = wrapper.get('.appeal-preview-button')
    expect(preview.text()).toBe('预览')
    expect(wrapper.get('.appeal-prompt-setting').classes()).toContain('appeal-prompt-setting')
    await preview.trigger('mouseenter')
    expect(wrapper.find('.appeal-preview-popover').exists()).toBe(false)
    vi.advanceTimersByTime(117)
    await flushPromises()
    expect(wrapper.find('.appeal-preview-popover').exists()).toBe(false)
    vi.advanceTimersByTime(1)
    await flushPromises()
    expect(wrapper.get('.appeal-preview-popover').text()).toContain('发起复议')
    expect(wrapper.find('.appeal-preview-overlay').exists()).toBe(true)
    expect(wrapper.get('.appeal-preview-popover').text()).toContain('HRBP会收到通知并负责跟进')
    expect(wrapper.get('.appeal-preview-popover').text()).toContain('如果你不认可本次绩效结果，请详细说明复议原因并提供事实依据')
    const previewTextarea = wrapper.get('.appeal-preview-textarea textarea')
    expect(previewTextarea.attributes('placeholder')).toBe('请输入复议理由')
    expect(previewTextarea.attributes('readonly')).toBeDefined()
    expect(wrapper.find('.appeal-preview-textarea-suffix').exists()).toBe(true)
    expect(wrapper.get('.appeal-preview-popover').attributes('style')).toContain('left: 16px')
    expect(workflowSource).toContain('zoom:.7')
    expect(workflowSource).toContain('appeal-preview-overlay')
    expect(workflowSource).toContain('appeal-preview-textarea')
    expect(workflowSource).toContain('resize:vertical')
    await preview.trigger('mouseleave')
    expect(wrapper.find('.appeal-preview-popover').exists()).toBe(false)
    vi.useRealTimers()
  })

  it('restores the result-view add action after deleting result reconsideration', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    let connectors = wrapper.findAll('button.flow-connector')
    await connectors[connectors.length - 1].trigger('mouseenter')
    await wrapper.get('.popover-stage').trigger('click')
    const reconsiderationNode = wrapper.findAll('.stage-node').find(node => node.text().includes('结果复议处理'))
    await reconsiderationNode?.get('.delete-node').trigger('click')

    connectors = wrapper.findAll('button.flow-connector')
    expect(connectors).toHaveLength(3)
    await connectors[connectors.length - 1].trigger('mouseenter')
    expect(wrapper.get('.stage-popover').text()).toContain('结果复议处理')
  })

  it('shows the measured invitation setting only for the 360 executor and preserves it on the same node', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.findAll('.stage-node')[0].trigger('click')
    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    await wrapper.findAll('.executor-option').find(option => option.text() === '360°评估人')?.trigger('click')

    expect(wrapper.get('.invite-executor-title').text()).toBe('允许邀请其他评估环节执行人')
    await wrapper.get('.invite-executor-title-row .performance-switch').trigger('click')
    expect(wrapper.get('.invite-scope-panel').text()).toContain('全部执行人')
    await wrapper.get('.invite-scope-panel input[value="PARTIAL"]').setValue(true)

    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    await wrapper.findAll('.executor-option').find(option => option.text() === '实线上级')?.trigger('click')
    expect(wrapper.find('.invite-executor-setting').exists()).toBe(false)
    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    await wrapper.findAll('.executor-option').find(option => option.text() === '360°评估人')?.trigger('click')

    expect(wrapper.get('.invite-executor-title-row .performance-switch').attributes('aria-checked')).toBe('true')
    expect((wrapper.get('.invite-scope-panel input[value="PARTIAL"]').element as HTMLInputElement).checked).toBe(true)
  })

  it('does not render a role popup when partial invitation has no candidate roles', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings, { attachTo: document.body })
    await wrapper.findAll('.stage-node')[0].trigger('click')
    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    await wrapper.findAll('.executor-option').find(option => option.text() === '360°评估人')?.trigger('click')
    await wrapper.get('.invite-executor-title-row .performance-switch').trigger('click')
    await wrapper.get('.invite-scope-panel input[value="PARTIAL"]').setValue(true)

    const roleSelector = wrapper.get('.performance-role-multi-select')
    expect(roleSelector.classes()).not.toContain('has-options')
    await roleSelector.get('.role-select-trigger').trigger('click')

    expect(roleSelector.classes()).toContain('open')
    expect(document.body.querySelector('.role-select-dropdown')).toBeNull()
    expect(document.body.querySelectorAll('.role-select-option')).toHaveLength(0)
    wrapper.unmount()
  })

  it('renders the captured information tooltip after the measured delay', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.findAll('.stage-node')[0].trigger('click')
    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    await wrapper.findAll('.executor-option').find(option => option.text() === '360°评估人')?.trigger('click')
    await wrapper.get('.invite-info-icon').trigger('mouseenter')
    vi.advanceTimersByTime(138)
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.invite-info-tooltip').text()).toContain('此设置默认关闭')
    expect(wrapper.get('.invite-info-tooltip').text()).toContain('可邀请其他环节的执行人角色作为 360° 评估人')
    expect(wrapper.findAll('.invite-info-line')).toHaveLength(3)
    expect(infoPopoverSource).toContain('.performance-info-popover{position:fixed;z-index:1030')
    expect(infoPopoverSource).toContain('width:420px')
    wrapper.unmount()
    vi.useRealTimers()
  })

  it('blocks next and renders the exact local error when every 360 partial scope is empty', async () => {
    const wrapper = mount(PerformanceTemplateWorkflowSettings)
    await wrapper.findAll('.stage-node')[0].trigger('click')
    await wrapper.get('.ud__select__selector').trigger('mouseenter')
    await wrapper.findAll('.executor-option').find(option => option.text() === '360°评估人')?.trigger('click')
    await wrapper.get('.invite-executor-title-row .performance-switch').trigger('click')
    await wrapper.get('.invite-scope-panel input[value="PARTIAL"]').setValue(true)

    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()

    expect(wrapper.emitted('next')).toBeUndefined()
    expect(wrapper.get('.invite-role-error').text()).toBe('请选择允许邀请的执行人角色')
    expect(workflowSource).toContain('.invite-role-error{display:inline;margin:0;padding:0;color:#f54a45;font:400 14px/22.001px')
    expect(workflowSource).toContain('.invite-scope-panel--error:has(.invite-role-control){height:156px}')
  })

  it('persists node invitation fields and allows an empty partial node when another 360 node is valid', async () => {
    const node = (id: string, scope: 'ALL' | 'PARTIAL'): PerformanceWorkflowNode => ({
      node_id: id, node_type: 'evaluation', name: id, description: '', order: 1,
      executor_types: [], executor_label: '360°评估人', evaluation_type: 'MULTI',
      include_final_result: false, system: false, allow_invite_other_executors: true,
      invite_executor_scope: scope, invite_executor_types: [], require_previous_node_completion: false,
    })
    const nodes = [node('360-1', 'PARTIAL'), node('360-2', 'ALL')]
    const getSpy = vi.spyOn(performanceTemplateApi, 'getWorkflow').mockResolvedValue({
      template_id: 88, usage_summary: { cycle_count: 0, project_count: 0 }, nodes,
    })
    const updateSpy = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockResolvedValue({
      template_id: 88, usage_summary: { cycle_count: 0, project_count: 0 }, nodes,
    })
    const wrapper = mount(PerformanceTemplateWorkflowSettings, { props: { templateId: 88 } })
    await flushPromises()

    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()

    expect(updateSpy).toHaveBeenCalledOnce()
    expect(updateSpy.mock.calls[0][1].nodes[0]).toMatchObject({
      allow_invite_other_executors: true,
      invite_executor_scope: 'PARTIAL',
      invite_executor_types: [],
    })
    expect(wrapper.emitted('next')).toHaveLength(1)
    getSpy.mockRestore()
    updateSpy.mockRestore()
  })

  it('reuses the fixed subject executor and round-trips the previous-node setting for a non-first 360 invitation node', async () => {
    vi.useFakeTimers()
    const nodes: PerformanceWorkflowNode[] = [
      {
        node_id: 'evaluation-1', node_type: 'evaluation', name: '评估型环节', description: '', order: 1,
        executor_types: ['DIRECT_MANAGER'], executor_label: '实线上级', evaluation_type: 'SINGLE',
        include_final_result: false, system: false, allow_invite_other_executors: false,
        invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false,
      },
      {
        node_id: 'invite-1', node_type: 'reviewer_360_invite', name: '360°邀请环节', description: '', order: 2,
        executor_types: ['DIRECT_MANAGER'], executor_label: '错误执行人', evaluation_type: null,
        include_final_result: false, system: false, allow_invite_other_executors: false,
        invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: true,
      },
    ]
    const getSpy = vi.spyOn(performanceTemplateApi, 'getWorkflow').mockResolvedValue({
      template_id: 91, usage_summary: { cycle_count: 0, project_count: 0 }, nodes,
    })
    const updateSpy = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => ({
      template_id: 91, usage_summary: { cycle_count: 0, project_count: 0 }, nodes: payload.nodes,
    }))
    const wrapper = mount(PerformanceTemplateWorkflowSettings, { props: { templateId: 91 } })
    await flushPromises()
    await wrapper.findAll('.stage-node').find(node => node.text().includes('360°邀请环节'))?.trigger('click')

    expect(wrapper.get('.workflow-fixed-executor-field .performance-executor-tag').text()).toBe('被评估人')
    expect(wrapper.get('.previous-node-setting .performance-switch-setting-row__label').text()).toBe('设置执行人需完成上一环节任务')
    expect(wrapper.get('.previous-node-setting .performance-switch').attributes('aria-checked')).toBe('true')
    await wrapper.get('.previous-node-setting .performance-info-popover__anchor').trigger('mouseenter')
    vi.advanceTimersByTime(124)
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.previous-node-setting .performance-info-popover').text()).toBe('上一环节的执行人完成环节任务后，当前环节的执行人才可以完成此任务')

    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()
    expect(updateSpy.mock.calls[0][1].nodes[1]).toMatchObject({
      executor_label: '被评估人', executor_types: ['SUBJECT'], require_previous_node_completion: true,
    })
    wrapper.unmount()
    getSpy.mockRestore()
    updateSpy.mockRestore()
    vi.useRealTimers()
  })

  it('hides and clears the previous-node setting for a first 360 invitation node', async () => {
    const nodes: PerformanceWorkflowNode[] = [
      {
        node_id: 'invite-1', node_type: 'reviewer_360_invite', name: '360°邀请环节', description: '', order: 1,
        executor_types: ['SUBJECT'], executor_label: '被评估人', evaluation_type: null,
        include_final_result: false, system: false, allow_invite_other_executors: false,
        invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: true,
      },
      {
        node_id: 'evaluation-1', node_type: 'evaluation', name: '评估型环节', description: '', order: 2,
        executor_types: ['DIRECT_MANAGER'], executor_label: '实线上级', evaluation_type: 'SINGLE',
        include_final_result: false, system: false, allow_invite_other_executors: false,
        invite_executor_scope: 'ALL', invite_executor_types: [], require_previous_node_completion: false,
      },
    ]
    const getSpy = vi.spyOn(performanceTemplateApi, 'getWorkflow').mockResolvedValue({
      template_id: 92, usage_summary: { cycle_count: 0, project_count: 0 }, nodes,
    })
    const updateSpy = vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockImplementation(async (_id, payload) => ({
      template_id: 92, usage_summary: { cycle_count: 0, project_count: 0 }, nodes: payload.nodes,
    }))
    const wrapper = mount(PerformanceTemplateWorkflowSettings, { props: { templateId: 92 } })
    await flushPromises()
    await wrapper.findAll('.stage-node')[0].trigger('click')

    expect(wrapper.find('.previous-node-setting').exists()).toBe(false)
    await (wrapper.vm as unknown as { save: () => Promise<void> }).save()
    expect(updateSpy.mock.calls[0][1].nodes[0].require_previous_node_completion).toBe(false)
    getSpy.mockRestore()
    updateSpy.mockRestore()
  })
})
