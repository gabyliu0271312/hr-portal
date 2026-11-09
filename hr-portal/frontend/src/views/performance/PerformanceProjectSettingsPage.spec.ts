import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), listTemplates: vi.fn(), getTemplateWorkflow: vi.fn(),
  listEvaluatorOptions: vi.fn(), previewEvaluators: vi.fn(), previewEvaluatorPeople: vi.fn(), update: vi.fn(), otherSettings: vi.fn(),
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { cycleId: '1', id: '2' } }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/api/performance', async () => {
  const actual = await vi.importActual<typeof import('@/api/performance')>('@/api/performance')
  return { ...actual, performanceProjectApi: mocks, performanceOtherSettingsApi: { get: mocks.otherSettings } }
})

import PerformanceProjectSettingsPage from './PerformanceProjectSettingsPage.vue'
import PerformanceAudienceRuleEditor from '@/components/performance/PerformanceAudienceRuleEditor.vue'
import PerformanceProjectFlowSettings from '@/components/performance/PerformanceProjectFlowSettings.vue'
import PerformanceProjectTimeSettings from '@/components/performance/PerformanceProjectTimeSettings.vue'
import PerformanceDateTimeField from '@/components/performance/PerformanceDateTimeField.vue'
import PerformanceProjectDialog from '@/components/performance/PerformanceProjectDialog.vue'
import UiSwitch from '@/components/ui/UiSwitch.vue'

function page(realDialog = false, realFlow = false) {
  return mount(PerformanceProjectSettingsPage, {
    global: { stubs: {
      teleport: { template: '<div><slot /></div>' },
      // element-plus 2.7 的 ElSelect 在被 stub 的 Teleport 下会无限递归更新（仅 jsdom + stub 环境），
      // 这里只关心受众预览的人员列表与统计，下拉本身不做像素断言，故用桩替换。
      ElSelect: true,
      ElOption: true,
      UiPageHeader: { props: ['title'], template: '<header><span>{{ title }}</span><slot name="subtitle" /><slot name="actions" /></header>' },
      PerformanceAudienceRuleEditor: { props: ['modelValue', 'allowedFields', 'snapshotOptions', 'disabled'], template: '<div data-testid="audience-editor"><slot name="group-heading-extra" :index="0" /></div>' },
      PerformanceProjectDialog: !realDialog,
      PerformancePermissionButton: { props: ['allowed', 'disabled'], template: '<button v-if="allowed" :disabled="disabled"><slot /></button>' },
      PerformanceProjectFlowSettings: !realFlow,
      PerformanceProjectTimeSettings: !realFlow,
    } },
  })
}
function button(wrapper: ReturnType<typeof page>, label: string) {
  return wrapper.findAll('button').find(item => item.text() === label)!
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  mocks.get.mockResolvedValue({
    id: 2, name: '新疆项目', description: '', administrators: [], data_managers: ['HRBP'], template_id: null,
    start_at: null, end_at: null, evaluated_count: 0, status: 'DRAFT',
    flow_settings: { node_settings: {}, node_times: {} },
    evaluator_rules: { groups: [{ conditions: [{ field: 'employee', operator: 'include', values: ['E1'] }] }] },
  })
  mocks.listTemplates.mockResolvedValue([
    { template_id: 11, name: '半年度绩效评估', description: '模板说明', status: 'active' },
    { template_id: 12, name: '全年度绩效评估', description: '另一模板', status: 'active' },
  ])
  mocks.getTemplateWorkflow.mockResolvedValue({ nodes: [] })
  mocks.previewEvaluators.mockResolvedValue({ matched_count: 5, task_generation_count: 4, report_count: 5, report_only_count: 1, group_counts: [5] })
  mocks.previewEvaluatorPeople.mockResolvedValue({ items: [{ employee_no: 'E1', display_name: '员工一', direct_supervisor: '经理', company_org: '集团', department: '研发', department_2: '平台', department_3: '后端', job_family: '技术', job_category: '研发', standard_position: '软件工程师', status: 'task', report_only: false }], total: 1, page: 1, page_size: 50 })
  mocks.otherSettings.mockResolvedValue({ manual_result_opening_enabled: true })
  mocks.listEvaluatorOptions.mockResolvedValue({
    organization_tree: [],
    people: [{ value: 'E001', label: '张三（E001）' }, { value: 'E002', label: '李四（E002）' }],
    employee_types: [],
  })
})

describe('project audience visibility', () => {
  it('does not mount or load the audience before confirming a template', async () => {
    const wrapper = page()
    await flushPromises()
    expect(wrapper.find('#people-title').exists()).toBe(false)
    expect(wrapper.find('[data-testid="audience-editor"]').exists()).toBe(false)
    expect(mocks.listEvaluatorOptions).not.toHaveBeenCalled()
    await button(wrapper, '选择绩效模板').trigger('click')
    await wrapper.findAll('input[type="radio"]')[0].setValue()
    expect(wrapper.find('#people-title').exists()).toBe(false)
    await button(wrapper, '取消').trigger('click')
    expect(wrapper.find('#people-title').exists()).toBe(false)
    await button(wrapper, '选择绩效模板').trigger('click')
    await wrapper.findAll('input[type="radio"]')[0].setValue()
    await button(wrapper, '确定').trigger('click')
    await flushPromises()
    expect(wrapper.get('#people-title').text()).toContain('被评估人')
    expect(wrapper.find('[data-testid="audience-editor"]').exists()).toBe(true)
    expect(mocks.getTemplateWorkflow).toHaveBeenCalledWith(1, 11)
    expect(mocks.listEvaluatorOptions).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps missing-template validation visible while the audience is hidden', async () => {
    const wrapper = page()
    await flushPromises()
    await button(wrapper, '下一步').trigger('click')
    expect(wrapper.find('#people-title').exists()).toBe(false)
    expect(wrapper.findAll('[role="alert"]').some(item => item.text() === '请选择绩效模板')).toBe(true)
    expect(mocks.update).not.toHaveBeenCalled()
    await button(wrapper, '选择绩效模板').trigger('click')
    await wrapper.findAll('input[type="radio"]')[0].setValue()
    await button(wrapper, '确定').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('[role="alert"]').some(item => item.text() === '请选择绩效模板')).toBe(false)
    wrapper.unmount()
  })

  it('reopens saved templates with the audience already visible', async () => {
    const original = await mocks.get()
    mocks.get.mockResolvedValue({ ...original, template_id: 11 })
    const wrapper = page()
    await flushPromises()
    expect(wrapper.find('#people-title').exists()).toBe(true)
    expect(wrapper.get('[aria-label="切换模板"]').text()).toBe('切换模板')
    expect(wrapper.get('.template-preview button').text()).toBe('预览')
    expect(mocks.listEvaluatorOptions).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="切换模板"]').trigger('click')
    await wrapper.findAll('input[type="radio"]')[1].setValue()
    await button(wrapper, '确定').trigger('click')
    await flushPromises()
    expect(wrapper.find('#people-title').exists()).toBe(true)
    expect(wrapper.get('.selected-template').text()).toContain('全年度绩效评估')
    wrapper.unmount()
  })
})



describe('project audience preview', () => {
  it.each(['STARTED', 'ARCHIVED'])('locks reviewee conditions and omits evaluator_rules for %s projects', async status => {
    const project = { ...await mocks.get(), template_id: 11, status, evaluator_rules: { groups: [{ conditions: [{ field: 'employee', operator: 'include', values: ['E1'] }] }] } }
    mocks.get.mockResolvedValue(project)
    mocks.update.mockResolvedValue(project)
    const wrapper = page()
    await flushPromises()
    const editor = wrapper.getComponent(PerformanceAudienceRuleEditor)
    expect(editor.props('disabled')).toBe(true)
    editor.vm.$emit('update:modelValue', [{ conditions: [{ field: 'employee', operator: 'include', values: ['E2'] }] }])
    await flushPromises()
    expect(mocks.previewEvaluators).toHaveBeenCalledWith(1, expect.objectContaining({ project_id: 2 }))
    expect(wrapper.text()).toContain('前台「项目管理」')
    await wrapper.get('.audience-summary p button').trigger('click')
    await flushPromises()
    expect(mocks.previewEvaluatorPeople).toHaveBeenCalledWith(1, expect.objectContaining({ project_id: 2, list_kind: 'task' }), '', 1, 50)
    expect(wrapper.get('.performance-audience-rule-editor__count-link').attributes('disabled')).toBeUndefined()
    expect(editor.props('modelValue')).toEqual(project.evaluator_rules.groups)
    await button(wrapper, '下一步').trigger('click')
    await flushPromises()
    expect(mocks.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('keeps evaluator rules in draft saves', async () => {
    const project = { ...await mocks.get(), template_id: 11, status: 'DRAFT' }
    mocks.get.mockResolvedValue(project)
    mocks.update.mockResolvedValue(project)
    const wrapper = page()
    await flushPromises()
    wrapper.getComponent(PerformanceAudienceRuleEditor).vm.$emit('update:modelValue', [{ conditions: [{ field: 'employee', operator: 'include', values: ['E2'] }] }])
    await button(wrapper, '下一步').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(2, expect.objectContaining({ evaluator_rules: expect.anything() }))
    wrapper.unmount()
  })


  it.each([
    { snapshot: '在职', live: '离职', displayed: '离职' },
    { snapshot: '离职', live: '在职', displayed: '在职' },
    { snapshot: '在职', live: null, displayed: '在职' },
  ])('displays current status $displayed while filtering by snapshot $snapshot', async ({ snapshot, live, displayed }) => {
    const rules = { groups: [{ conditions: [{ field: 'employment_status', operator: 'include', values: [snapshot] }] }] }
    mocks.get.mockResolvedValue({ ...await mocks.get(), template_id: 11, evaluator_rules: rules })
    const result = await mocks.previewEvaluatorPeople()
    mocks.previewEvaluatorPeople.mockResolvedValue({ ...result, items: [{ ...result.items[0], employment_status: snapshot, live_employment_status: live }] })
    const wrapper = page()
    await flushPromises()
    await wrapper.get('.audience-summary p button').trigger('click')
    await flushPromises()
    const table = wrapper.get('.performance-management-table .ui-table__grid')
    const statusIndex = table.findAll('thead th').findIndex(cell => cell.text().trim() === '当前在职状态')
    expect(statusIndex).toBeGreaterThan(-1)
    expect(table.findAll('tbody tr')[0].findAll('td')[statusIndex].text()).toBe(displayed)
    expect(mocks.previewEvaluatorPeople).toHaveBeenLastCalledWith(1, expect.objectContaining({ evaluator_rules: rules }), '', 1, 50)
    expect(wrapper.get('.audience-summary').text()).toContain('共计 5人')
    wrapper.unmount()
  })

  it('shows task and report-only counts and opens the reused read-only people overlay', async () => {
    const original = await mocks.get()
    mocks.get.mockResolvedValue({ ...original, template_id: 11 })
    const wrapper = page()
    await flushPromises()
    expect(wrapper.get('.audience-summary').text()).toContain('符合条件的员工，共计 5人')
    expect(wrapper.find('.audience-summary h3 button').exists()).toBe(false)
    expect(wrapper.get('.audience-summary p').text()).toContain('4名人员生成评估任务，并纳入报表统计')
    expect(wrapper.get('.audience-summary p').text()).toContain('1名离职人员不生成评估任务，仅纳入报表统计')
    expect(wrapper.findAll('.audience-summary p button').map(item => item.text())).toEqual(['4', '1'])
    await wrapper.get('.audience-summary p button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('符合条件的员工')
    expect(wrapper.text()).toContain('标准职位')
    expect(wrapper.text()).toContain('软件工程师')
    expect(wrapper.find('.performance-selection-action-bar').exists()).toBe(false)
    expect(wrapper.find('.performance-reminder-panel__heading').exists()).toBe(false)
    expect(wrapper.get('.performance-task-header-description').text()).toBe('生成评估任务并纳入报表统计，共计 1 人')
    expect(wrapper.get('.performance-export-button').attributes('disabled')).toBeUndefined()
    expect(mocks.previewEvaluatorPeople).toHaveBeenCalledWith(1, expect.objectContaining({ project_id: 2, list_kind: 'task' }), '', 1, 50)
    wrapper.unmount()
  })
})

describe('project snapshot audience filters', () => {
  const rules = { groups: [{ conditions: [
    { field: 'employment_status' as const, operator: 'include' as const, values: ['在职'] },
    { field: 'departure_date' as const, operator: 'not_after' as const, values: ['2026-10-28'] },
    { field: 'job_family' as const, operator: 'include' as const, values: ['技术'] },
    { field: 'job_category' as const, operator: 'exclude' as const, values: ['运营'] },
    { field: 'position_level' as const, operator: 'include' as const, values: ['P6'] },
    { field: 'standard_position' as const, operator: 'include' as const, values: ['工程师'] },
  ] }] }

  it('exposes all fields and preserves snapshot rules through preview, save and reopen', async () => {
    mocks.get.mockResolvedValue({ ...await mocks.get(), template_id: 11, evaluator_rules: rules })
    const wrapper = page()
    await flushPromises()
    const editor = wrapper.getComponent(PerformanceAudienceRuleEditor)
    expect(editor.props('allowedFields')).toEqual(expect.arrayContaining(rules.groups[0].conditions.map(condition => condition.field)))
    expect(editor.props('modelValue')).toEqual(rules.groups)
    expect(mocks.previewEvaluators).toHaveBeenCalledWith(1, expect.objectContaining({ evaluator_rules: rules }))
    await button(wrapper, '下一步').trigger('click')
    expect(mocks.update).not.toHaveBeenCalled()
    wrapper.unmount()
    const reopened = page()
    await flushPromises()
    expect(reopened.getComponent(PerformanceAudienceRuleEditor).props('modelValue')).toEqual(rules.groups)
    reopened.unmount()
  })

  it('blocks invalid departure dates before preview and save', async () => {
    mocks.get.mockResolvedValue({ ...await mocks.get(), template_id: 11, evaluator_rules: { groups: [{ conditions: [{ field: 'departure_date', operator: 'before', values: ['2026-02-30'] }] }] } })
    const wrapper = page()
    await flushPromises()
    expect(mocks.previewEvaluators).not.toHaveBeenCalled()
    await button(wrapper, '下一步').trigger('click')
    expect(mocks.update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请完善被评估人筛选条件')
    wrapper.unmount()
  })

  it('shows a missing-snapshot API error without discarding the saved rules', async () => {
    mocks.get.mockResolvedValue({ ...await mocks.get(), template_id: 11, evaluator_rules: rules })
    mocks.listEvaluatorOptions.mockRejectedValueOnce({ response: { data: { detail: '周期人员快照尚未生成' } } })
    const wrapper = page()
    await flushPromises()
    const editor = wrapper.getComponent(PerformanceAudienceRuleEditor)
    editor.vm.$emit('open-options')
    await flushPromises()
    expect(wrapper.get('.page-notice').text()).toBe('周期人员快照尚未生成')
    expect(editor.props('modelValue')).toEqual(rules.groups)
    wrapper.unmount()
  })

  it('retries failed snapshot option loading without changing saved rules', async () => {
    const options = { organization_tree: [], people: [], employee_types: [], employment_statuses: [{ value: '在职', label: '在职' }], job_families: [{ value: '技术', label: '技术' }], departure_date_range: { min: '2026-01-01', max: '2026-10-28' } }
    mocks.get.mockResolvedValue({ ...await mocks.get(), template_id: 11, evaluator_rules: rules })
    mocks.listEvaluatorOptions.mockRejectedValueOnce(new Error('options failed')).mockResolvedValueOnce(options)
    const wrapper = page()
    await flushPromises()
    const editor = wrapper.getComponent(PerformanceAudienceRuleEditor)
    expect(mocks.listEvaluatorOptions).not.toHaveBeenCalled()
    editor.vm.$emit('open-options')
    await flushPromises()
    expect(wrapper.text()).toContain('被评估人名单加载失败')
    expect(editor.props('modelValue')).toEqual(rules.groups)
    editor.vm.$emit('open-options')
    await flushPromises()
    expect(editor.props('snapshotOptions')).toEqual(options)
    expect(editor.props('modelValue')).toEqual(rules.groups)
    expect(mocks.listEvaluatorOptions).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
})

describe('CR-013 project partial saves', () => {
  async function started() {
    const project = { ...await mocks.get(), template_id: 11, status: 'STARTED', calibration_base_digest: 'base-1', flow_settings: {
      node_settings: {
        calibration: { calibration: { force_distribution_enabled: false, phases: [{ rules: [{ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }] }] } },
        result: { result_view: { automatic_enabled: true, manual_enabled: false, automatic_rule: 'PREVIOUS_AND_START' } },
      },
      node_times: {
        calibration: { start_at: '2027-01-01T01:00:00Z', end_at: '2027-01-02T01:00:00Z' },
        result: { start_at: '2027-01-03T01:00:00Z', end_at: '', appeal_deadline: '2027-01-04T01:00:00Z' },
      },
    } }
    mocks.get.mockResolvedValue(project)
    mocks.getTemplateWorkflow.mockResolvedValue({ nodes: [{ node_id: 'calibration', node_type: 'calibration', name: '校准', order: 1 }, { node_id: 'result', node_type: 'result_view', name: '结果', order: 2 }] })
    return project
  }
  it('blocks completion with an elapsed deadline and saves after correcting it', async () => {
    const project = await started()
    project.flow_settings.node_times.result.appeal_deadline = '2000-01-04T01:00:00Z'
    project.flow_settings.node_times.result.start_at = '2000-01-03T01:00:00Z'
    mocks.get.mockResolvedValue(project)
    const wrapper = page(false, true); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(wrapper.get('#result-appeal-deadline').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#result-deadline-error').text()).toBe('发起复议截止时间不能早于当前时间')
    expect(wrapper.find('.time-card > .error').exists()).toBe(false)
    expect(wrapper.findAll('.time-card [role="alert"]')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('结果的发起复议截止时间不能早于当前时间')
    await wrapper.get('#result-appeal-deadline').setValue('2099-01-04 09:00')
    await flushPromises()
    await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.update.mock.calls[0][1].flow_settings.node_times.result.appeal_deadline).toBe('2099-01-04T01:00:00.000Z')
    wrapper.unmount()
  })

  it('shows missing times only beneath their fields after completion is attempted', async () => {
    const project = await started()
    project.flow_settings.node_times.result.start_at = ''
    project.flow_settings.node_times.result.appeal_deadline = ''
    mocks.get.mockResolvedValue(project)
    const wrapper = page(false, true); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    expect(wrapper.find('#result-start-error').exists()).toBe(false)
    await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(wrapper.get('#result-start-error').text()).toBe('开始时间不能为空')
    expect(wrapper.get('#result-deadline-error').text()).toBe('发起复议截止时间不能为空')
    expect(wrapper.get('#result-start').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#result-appeal-deadline').attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('.time-card > .error').exists()).toBe(false)
    await wrapper.get('#result-start').setValue('2099-01-03 09:00')
    await wrapper.get('#result-appeal-deadline').setValue('2099-01-04 09:00')
    await flushPromises()
    expect(wrapper.findAll('.time-card [role="alert"]')).toHaveLength(0)
    await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(mocks.update).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('does not PATCH historical started projects across every unchanged step', async () => {
    await started()
    const wrapper = page(); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('项目设置已保存')
    wrapper.unmount()
  })
  it('preserves server canonical historical IDs in both baselines and explicit rule deletion', async () => {
    const project = await started()
    const canonical = JSON.parse(JSON.stringify(project))
    canonical.flow_settings.node_settings.calibration.calibration.phases = [{ phase_id: 'phase-1', rules: [
      { ...project.flow_settings.node_settings.calibration.calibration.phases[0].rules[0], rule_id: 'rule-canonical-first' },
      { ...project.flow_settings.node_settings.calibration.calibration.phases[0].rules[0], rule_id: 'rule-canonical-second' },
    ] }]
    mocks.get.mockResolvedValue(canonical)
    const wrapper = page(); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    const flow = wrapper.getComponent(PerformanceProjectFlowSettings)
    expect(flow.props('savedFlowSettings')?.node_settings.calibration.calibration?.phases[0].rules[0].rule_id).toBe('rule-canonical-first')
    expect(flow.props('baselineFlowSettings')?.node_settings.calibration.calibration?.phases[0].rules[0].rule_id).toBe('rule-canonical-first')
    expect(mocks.update).not.toHaveBeenCalled()
    const changed = JSON.parse(JSON.stringify(flow.props('modelValue')))
    changed.node_settings.calibration.calibration.phases[0].rules.splice(0, 1)
    flow.vm.$emit('update:modelValue', changed)
    await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(2, expect.objectContaining({
      calibration_base_digest: 'base-1',
      calibration_operations: [{ operation: 'delete_rule', node_id: 'calibration', phase_id: 'phase-1', rule_id: 'rule-canonical-first' }],
    }))
    expect(mocks.update.mock.calls[0][1].flow_settings.node_settings.calibration.calibration.phases[0].rules[0].rule_id).toBe('rule-canonical-second')
    wrapper.unmount()
  })
  it('omits stale audience rules from flow payloads after people are added elsewhere', async () => {
    await started()
    const wrapper = page(); await flushPromises()
    wrapper.getComponent(PerformanceAudienceRuleEditor).vm.$emit('update:modelValue', [{ conditions: [{ field: 'employee', operator: 'include', values: ['E2'] }] }])
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    expect(mocks.update).not.toHaveBeenCalled()
    const flow = wrapper.getComponent(PerformanceProjectFlowSettings)
    expect(flow.props('projectPayload')).not.toHaveProperty('evaluator_rules')
    const changed = JSON.parse(JSON.stringify(flow.props('modelValue')))
    changed.node_settings.result.result_view.manual_enabled = true
    flow.vm.$emit('update:modelValue', changed)
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    expect(mocks.update).toHaveBeenCalledOnce()
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty('evaluator_rules')
    expect(mocks.update.mock.calls[0][1]).toHaveProperty('flow_settings')
    wrapper.unmount()
  })
  it.each(['DRAFT', 'STARTED', 'ARCHIVED'])('passes the saved project status %s to the time controls', async status => {
    const project = { ...await started(), status }
    mocks.get.mockResolvedValue(project)
    const wrapper = page(); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(PerformanceProjectTimeSettings).props('projectStatus')).toBe(status)
    expect(mocks.update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('updates the parent baseline after immediate drawer saves', async () => {
    const project = await started()
    const wrapper = page(); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    const flow = wrapper.getComponent(PerformanceProjectFlowSettings)
    flow.vm.$emit('saved', { ...project, calibration_base_digest: 'base-2' }, project.flow_settings)
    await flushPromises()
    expect(flow.props('calibrationBaseDigest')).toBe('base-2')
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(wrapper.findComponent(PerformanceProjectTimeSettings).exists()).toBe(true)
    wrapper.unmount()
  })
  it('adds in flow, edits dates only in the time step and saves the complete phase once', async () => {
    const project = await started()
    mocks.update.mockImplementation(async (_id, patch) => ({ ...project, ...patch, calibration_base_digest: 'base-2' }))
    const wrapper = page(false, true); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    await wrapper.get('.add-phase').trigger('click'); await flushPromises()
    expect(wrapper.getComponent(PerformanceProjectFlowSettings).findComponent(PerformanceDateTimeField).exists()).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(PerformanceProjectTimeSettings).exists()).toBe(true)
    expect(mocks.update).not.toHaveBeenCalled()
    await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('第 2 阶段')
    expect(mocks.update).not.toHaveBeenCalled()
    const fields = wrapper.getComponent(PerformanceProjectTimeSettings).findAllComponents(PerformanceDateTimeField)
    fields[2].vm.$emit('update:modelValue', '2027-01-05T09:00')
    fields[3].vm.$emit('update:modelValue', '2027-01-04T18:00')
    await flushPromises(); await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('截止时间必须晚于开始时间')
    expect(mocks.update).not.toHaveBeenCalled()
    fields[3].vm.$emit('update:modelValue', '2027-01-06T18:00')
    await flushPromises()
    await button(wrapper, '上一步').trigger('click'); await flushPromises()
    await button(wrapper, '上一步').trigger('click'); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(wrapper.getComponent(PerformanceProjectTimeSettings).findAllComponents(PerformanceDateTimeField)[2].props('modelValue')).toBe('2027-01-05T09:00')
    await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(mocks.update).toHaveBeenCalledOnce()
    const patch = mocks.update.mock.calls[0][1]
    expect(patch.calibration_base_digest).toBe('base-1')
    expect(patch.calibration_operations).toEqual([{ operation: 'add_phase', node_id: 'calibration', phase_id: expect.any(String) }])
    expect(patch.flow_settings.node_times.calibration.phase_times[patch.calibration_operations[0].phase_id]).toEqual({ start_at: '2027-01-05T01:00:00.000Z', end_at: '2027-01-06T10:00:00.000Z' })
    await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(mocks.update).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('retains the new phase and dates after a failed completion and retries the same operation', async () => {
    const project = await started()
    mocks.update.mockRejectedValueOnce(new Error('failed')).mockImplementation(async (_id, patch) => ({ ...project, ...patch }))
    const wrapper = page(false, true); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    await wrapper.get('.add-phase').trigger('click'); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    const time = wrapper.getComponent(PerformanceProjectTimeSettings)
    const fields = time.findAllComponents(PerformanceDateTimeField)
    fields[2].vm.$emit('update:modelValue', '2027-01-05T09:00')
    fields[3].vm.$emit('update:modelValue', '2027-01-06T18:00')
    await flushPromises(); await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(wrapper.findComponent(PerformanceProjectTimeSettings).exists()).toBe(true)
    expect(wrapper.text()).toContain('当前步骤保存失败')
    const firstPatch = JSON.parse(JSON.stringify(mocks.update.mock.calls[0][1]))
    expect(time.findAllComponents(PerformanceDateTimeField)[2].props('modelValue')).toBe('2027-01-05T09:00')
    await button(wrapper, '完成').trigger('click'); await flushPromises()
    expect(mocks.update).toHaveBeenCalledTimes(2)
    expect(mocks.update.mock.calls[1][1]).toEqual(firstPatch)
    wrapper.unmount()
  })

  it('blocks next step only while a flow editor is unconfirmed', async () => {
    await started()
    const wrapper = page(); await flushPromises()
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    wrapper.getComponent(PerformanceProjectFlowSettings).vm.$emit('pending-change', true)
    await button(wrapper, '下一步').trigger('click'); await flushPromises()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请先确认或取消当前流程配置')
    wrapper.unmount()
  })
})

describe('project administrator person picker', () => {
  it('loads cycle snapshot people and submits the chosen names', async () => {
    mocks.get.mockResolvedValue({ ...await mocks.get(), administrators: [] })
    const wrapper = page(true)
    await flushPromises()
    await wrapper.get('[aria-label="编辑基本信息"]').trigger('click')
    await flushPromises()
    expect(mocks.listEvaluatorOptions).not.toHaveBeenCalled()
    await wrapper.get('input[aria-label="项目管理员"]').trigger('click')
    await flushPromises()
    expect(mocks.listEvaluatorOptions).toHaveBeenCalledWith(1)
    const options = wrapper.findAll('[role="option"]')
    expect(options.map(option => option.text())).toEqual(['张三（E001）', '李四（E002）'])
    await options[0].trigger('click')
    await button(wrapper, '确定').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(2, expect.objectContaining({ administrators: ['张三'] }))
    wrapper.unmount()
  })

  it('keeps saved names that are absent from the snapshot selected', async () => {
    mocks.get.mockResolvedValue({ ...await mocks.get(), administrators: ['王五'] })
    const wrapper = page(true)
    await flushPromises()
    await wrapper.get('[aria-label="编辑基本信息"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.performance-select-shell__content').text()).toContain('王五')
    await button(wrapper, '确定').trigger('click')
    await flushPromises()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(wrapper.find('.administrator-tags').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('project data manager display and editor', () => {
  it.each(['STARTED', 'ARCHIVED'])('locks only audience scope in the %s basic dialog and omits stale scope on save', async status => {
    const project = { ...await mocks.get(), status, scope_limited: true, scope_rules: { groups: [{ conditions: [{ field: 'employee', operator: 'include', values: ['E1'] }] }] } }
    mocks.get.mockResolvedValue(project)
    mocks.update.mockImplementation(async (_id, patch) => { mocks.get.mockResolvedValue({ ...project, ...patch }); return { ...project, ...patch } })
    const wrapper = page(true)
    await flushPromises()
    await wrapper.get('[aria-label="编辑基本信息"]').trigger('click')
    const dialog = wrapper.getComponent(PerformanceProjectDialog)
    const scopeSwitch = dialog.getComponent(UiSwitch)
    const scopeEditor = dialog.getComponent(PerformanceAudienceRuleEditor)
    expect(scopeSwitch.props('disabled')).toBe(true)
    expect(scopeEditor.props('disabled')).toBe(true)
    scopeSwitch.vm.$emit('update:modelValue', false)
    scopeEditor.vm.$emit('update:modelValue', [{ conditions: [{ field: 'employee', operator: 'include', values: ['E2'] }] }])
    await flushPromises()
    expect(scopeSwitch.props('modelValue')).toBe(true)
    expect(scopeEditor.props('modelValue')).toEqual(project.scope_rules.groups)
    expect(dialog.get('#project-name').attributes('disabled')).toBeUndefined()
    expect(dialog.get('input[aria-label="HRBP"]').attributes('disabled')).toBeUndefined()
    await dialog.get('#project-name').setValue('修改名称')
    await button(wrapper, '确定').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(2, { name: '修改名称' })
    expect(dialog.emitted('submit')?.[0]?.[0]).not.toHaveProperty('scope_rules')
    expect(dialog.emitted('submit')?.[0]?.[0]).not.toHaveProperty('scope_limited')
    wrapper.unmount()
  })

  it.each([
    { selected: ['HRBP'], labels: ['HRBP'] },
    { selected: ['PROJECT_ADMIN'], labels: ['项目管理员'] },
    { selected: ['HRBP', 'PROJECT_ADMIN'], labels: ['HRBP', '项目管理员'] },
    { selected: [], labels: [] },
  ])('shows only saved role labels for $selected', async ({ selected, labels }) => {
    const project = await mocks.get()
    mocks.get.mockResolvedValue({ ...project, administrators: ['张三', '李四'], data_managers: selected })
    const wrapper = page()
    await flushPromises()
    const tags = wrapper.get('.administrator-tags')
    expect(tags.findAll('.performance-select-shell__tag').map(tag => tag.text())).toEqual(labels)
    expect(tags.text()).not.toContain('张三')
    expect(tags.find('input').exists()).toBe(false)
    expect(tags.find('button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('reopens checked roles, saves changes, and refreshes labels from the project response', async () => {
    const project = { ...await mocks.get(), administrators: ['张三'], data_managers: ['PROJECT_ADMIN'], scope_limited: true, scope_rules: { groups: [{ conditions: [{ field: 'employee', operator: 'include', values: ['E1'] }] }] } }
    mocks.get.mockResolvedValue(project)
    mocks.update.mockImplementationOnce(async (_id, payload) => {
      mocks.get.mockResolvedValue({ ...project, ...payload })
    })
    const wrapper = page(true)
    await flushPromises()
    await wrapper.get('[aria-label="编辑基本信息"]').trigger('click')
    expect((wrapper.get('input[type="checkbox"][aria-label="项目管理员"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('input[aria-label="HRBP"]').element as HTMLInputElement).checked).toBe(false)
    await wrapper.get('input[aria-label="HRBP"]').setValue(true)
    await wrapper.get('input[type="checkbox"][aria-label="项目管理员"]').setValue(false)
    expect(wrapper.get('.administrator-tags').text()).toBe('项目管理员')
    await button(wrapper, '确定').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(2, { data_managers: ['HRBP'] })
    expect(wrapper.get('.administrator-tags').text()).toBe('HRBP')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await wrapper.get('[aria-label="编辑基本信息"]').trigger('click')
    expect((wrapper.get('input[type="checkbox"][aria-label="项目管理员"]').element as HTMLInputElement).checked).toBe(false)
    expect((wrapper.get('input[aria-label="HRBP"]').element as HTMLInputElement).checked).toBe(true)
    wrapper.unmount()
  })

  it('keeps saved tags and checkbox values when edits are cancelled', async () => {
    const project = { ...await mocks.get(), data_managers: ['HRBP', 'PROJECT_ADMIN'] }
    mocks.get.mockResolvedValue(project)
    const wrapper = page(true)
    await flushPromises()
    await wrapper.get('[aria-label="编辑基本信息"]').trigger('click')
    await wrapper.get('input[aria-label="HRBP"]').setValue(false)
    await button(wrapper, '取消').trigger('click')
    expect(mocks.update).not.toHaveBeenCalled()
    expect(wrapper.get('.administrator-tags').text()).toBe('HRBP项目管理员')
    await wrapper.get('[aria-label="编辑基本信息"]').trigger('click')
    expect((wrapper.get('input[aria-label="HRBP"]').element as HTMLInputElement).checked).toBe(true)
    wrapper.unmount()
  })

  it('retains saved tags if updating the checked roles fails', async () => {
    mocks.update.mockRejectedValueOnce(new Error('save failed'))
    const wrapper = page(true)
    await flushPromises()
    await wrapper.get('[aria-label="编辑基本信息"]').trigger('click')
    await wrapper.get('input[type="checkbox"][aria-label="项目管理员"]').setValue(true)
    await button(wrapper, '确定').trigger('click')
    await flushPromises()
    expect(wrapper.get('.administrator-tags').text()).toBe('HRBP')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.get('.page-notice').text()).toBe('基本信息保存失败')
    wrapper.unmount()
  })
})
