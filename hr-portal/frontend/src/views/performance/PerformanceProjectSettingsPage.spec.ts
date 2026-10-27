import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), listTemplates: vi.fn(), getTemplateWorkflow: vi.fn(),
  listEvaluatorOptions: vi.fn(), update: vi.fn(), otherSettings: vi.fn(),
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

function page() {
  return mount(PerformanceProjectSettingsPage, {
    global: { stubs: {
      teleport: true,
      PageHeader: { template: '<header><slot name="actions" /></header>' },
      PerformanceAudienceRuleEditor: { template: '<div data-testid="audience-editor" />' },
      PerformanceProjectDialog: true,
      PerformanceProjectFlowSettings: true,
      PerformanceProjectTimeSettings: true,
    } },
  })
}
function button(wrapper: ReturnType<typeof page>, label: string) {
  return wrapper.findAll('button').find(item => item.text() === label)!
}

beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  mocks.get.mockResolvedValue({
    id: 2, name: '新疆项目', description: '', administrators: [], template_id: null,
    start_at: null, end_at: null, evaluated_count: 0, status: 'DRAFT',
    flow_settings: { node_settings: {}, node_times: {} },
    evaluator_rules: { groups: [{ conditions: [{ field: 'employee', operator: 'include', values: ['E1'] }] }] },
  })
  mocks.listTemplates.mockResolvedValue([
    { template_id: 11, name: '半年度绩效评估', description: '模板说明', status: 'active' },
    { template_id: 12, name: '全年度绩效评估', description: '另一模板', status: 'active' },
  ])
  mocks.getTemplateWorkflow.mockResolvedValue({ nodes: [] })
  mocks.otherSettings.mockResolvedValue({ manual_result_opening_enabled: true })
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
