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

function page(realDialog = false) {
  return mount(PerformanceProjectSettingsPage, {
    global: { stubs: {
      teleport: true,
      PageHeader: { template: '<header><slot name="actions" /></header>' },
      PerformanceAudienceRuleEditor: { template: '<div data-testid="audience-editor" />' },
      PerformanceProjectDialog: !realDialog,
      PerformancePermissionButton: { props: ['allowed', 'disabled'], template: '<button v-if="allowed" :disabled="disabled"><slot /></button>' },
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

describe('project data manager display and editor', () => {
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
    expect((wrapper.get('input[aria-label="项目管理员"]').element as HTMLInputElement).checked).toBe(true)
    expect((wrapper.get('input[aria-label="HRBP"]').element as HTMLInputElement).checked).toBe(false)
    await wrapper.get('input[aria-label="HRBP"]').setValue(true)
    await wrapper.get('input[aria-label="项目管理员"]').setValue(false)
    expect(wrapper.get('.administrator-tags').text()).toBe('项目管理员')
    await button(wrapper, '确定').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(2, expect.objectContaining({
      administrators: ['张三'], data_managers: ['HRBP'], scope_limited: true, scope_rules: project.scope_rules,
    }))
    expect(wrapper.get('.administrator-tags').text()).toBe('HRBP')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await wrapper.get('[aria-label="编辑基本信息"]').trigger('click')
    expect((wrapper.get('input[aria-label="项目管理员"]').element as HTMLInputElement).checked).toBe(false)
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
    await wrapper.get('input[aria-label="项目管理员"]').setValue(true)
    await button(wrapper, '确定').trigger('click')
    await flushPromises()
    expect(wrapper.get('.administrator-tags').text()).toBe('HRBP')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.get('.page-notice').text()).toBe('基本信息保存失败')
    wrapper.unmount()
  })
})
