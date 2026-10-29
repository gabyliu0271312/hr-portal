import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { performanceReviewQuestionApi, performanceTagFillQuestionApi, performanceTemplateApi } from '@/api/performance'
import PerformanceTemplateCreate from './PerformanceTemplateCreate.vue'

const push = vi.fn()
const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push, currentRoute: { get value() { return { query: routeState.query } } } }) }))

function mountView() {
  return mount(PerformanceTemplateCreate, {
    global: { stubs: { 'el-icon': { template: '<span><slot /></span>' } } },
  })
}

beforeEach(() => {
  vi.restoreAllMocks()
  push.mockReset()
  routeState.query = {}
  localStorage.clear()
  vi.spyOn(performanceReviewQuestionApi, 'list').mockResolvedValue([])
  vi.spyOn(performanceTagFillQuestionApi, 'options').mockResolvedValue([])
  vi.spyOn(performanceTemplateApi, 'create').mockResolvedValue({ template_id: 901, name: '新的模板' })
  vi.spyOn(performanceTemplateApi, 'getWorkflow').mockResolvedValue({
    template_id: 901,
    usage_summary: { cycle_count: 0, project_count: 0 },
    editable_scope: { workflow: true, data_write_settings: true, reference_and_prompt_content: true },
    nodes: [],
  })
})

describe('PerformanceTemplateCreate', () => {
  it('renders the reference header and body order', () => {
    const wrapper = mountView()
    expect(wrapper.find('.full-screen-modal-header-title').text()).toBe('新建绩效模板')
    expect(wrapper.find('.full-screen-modal-header-back').text()).toContain('返回')
    expect(wrapper.find('.full-screen-modal-header-back-icon path').attributes('d')).toContain('M1.293 11.293')
    expect(wrapper.findAll('.basic-info-form > .form-item').map(item => item.find('.field-label').exists() ? item.find('.field-label').text() : item.find('.calculation-heading').text())).toEqual(['模板语言', '名称*', '描述', '配置「计算规则」'])
    expect(wrapper.find('.full-screen-modal-header .step-flow').exists()).toBe(true)
    expect(wrapper.findAll('.language-options > .checkbox-row')).toHaveLength(2)
    expect(wrapper.find('.language-options .fixed-checkbox input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.language-options .fixed-checkbox .checkbox-label').text()).toBe('中文')
    expect(wrapper.find('.calculation-options').exists()).toBe(false)
  })

  it('keeps workflow header actions right-aligned as shared 80px buttons', async () => {
    const wrapper = mountView()
    await wrapper.get('[aria-label="模板名称"]').setValue('新的模板')
    await wrapper.get('.next-button').trigger('click')

    expect(wrapper.find('.full-screen-modal-header-actions').exists()).toBe(true)
    expect(wrapper.find('.previous-button').text()).toBe('上一步')
    expect(wrapper.find('.next-button').text()).toBe('下一步')
    expect(wrapper.find('.full-screen-modal-header-actions').attributes('style')).toBeUndefined()
  })

  it('returns to the template list from the header back action and changes title after next', async () => {
    const wrapper = mountView()
    expect(wrapper.find('.full-screen-modal-header-title').text()).toBe('新建绩效模板')
    await wrapper.get('.full-screen-modal-header-back').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'PerformanceTemplates' })

    const nextWrapper = mountView()
    await nextWrapper.get('[aria-label="模板名称"]').setValue('新的模板')
    await nextWrapper.get('.next-button').trigger('click')
    expect(nextWrapper.find('.full-screen-modal-header-title').text()).toBe('编辑绩效模板')
    expect(performanceTemplateApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: '新的模板' }))
    expect(localStorage.getItem('performance-template-draft')).toContain('"templateId":901')
  })

  it('loads and updates an existing template without creating a duplicate', async () => {
    routeState.query = { template_id: '42' }
    vi.spyOn(performanceTemplateApi, 'get').mockResolvedValue({
      template_id: 42,
      name: '已有模板',
      description: '已有描述',
      language: 'zh-CN',
      english_enabled: true,
      calculation_enabled: false,
      selected_rules: [],
      status: 'DRAFT',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    })
    const update = vi.spyOn(performanceTemplateApi, 'update').mockResolvedValue({
      template_id: 42,
      name: '修改后的模板',
      description: '已有描述',
      language: 'zh-CN',
      english_enabled: true,
      calculation_enabled: false,
      selected_rules: [],
      status: 'DRAFT',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-31T00:00:00Z',
    })

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.full-screen-modal-header-title').text()).toBe('编辑绩效模板')
    expect((wrapper.get('[aria-label="模板名称"]').element as HTMLInputElement).value).toBe('已有模板')
    expect((wrapper.get('[aria-label="模板描述"]').element as HTMLTextAreaElement).value).toBe('已有描述')

    await wrapper.get('[aria-label="模板名称"]').setValue('修改后的模板')
    await wrapper.get('.next-button').trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalledWith(42, expect.objectContaining({ name: '修改后的模板' }))
    expect(update.mock.calls[0][1]).not.toHaveProperty('configuration_completed')
    expect(performanceTemplateApi.create).not.toHaveBeenCalled()
    expect(wrapper.find('.full-screen-modal-header-title').text()).toBe('编辑绩效模板')
    expect(wrapper.find('.basic-info-panel').exists()).toBe(false)
  })

  it('changes the final header action to save and persists the template through the real update API', async () => {
    routeState.query = { template_id: '42', step: 'content' }
    vi.spyOn(performanceTemplateApi, 'get').mockResolvedValue({
      template_id: 42,
      name: '已有模板',
      description: '已有描述',
      language: 'zh-CN',
      english_enabled: false,
      calculation_enabled: false,
      selected_rules: [],
      status: 'DRAFT',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    })
    const update = vi.spyOn(performanceTemplateApi, 'update').mockResolvedValue({
      template_id: 42,
      name: '已有模板',
      description: '已有描述',
      language: 'zh-CN',
      english_enabled: false,
      calculation_enabled: false,
      selected_rules: [],
      status: 'DRAFT',
      created_at: '2026-08-01T00:00:00Z',
      updated_at: '2026-09-02T00:00:00Z',
    })
    vi.spyOn(performanceTemplateApi, 'updateWorkflow').mockResolvedValue({ nodes: [] } as any)

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.next-button').text()).toBe('下一步')
    await wrapper.get('.next-button').trigger('click')
    expect(wrapper.get('.next-button').text()).toBe('保存')
    update.mockRejectedValueOnce({ response: { data: { detail: { message: '模板保存失败' } } } })
    await wrapper.get('.next-button').trigger('click')
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('模板保存失败')
    await wrapper.get('.next-button').trigger('click')
    await flushPromises()

    expect(update).toHaveBeenCalledWith(42, expect.objectContaining({ name: '已有模板', configuration_completed: true }))
    expect(push).toHaveBeenCalledWith({ name: 'PerformanceTemplates' })
  })


  it('leaves a new template unfinished when exiting after basic information', async () => {
    const update = vi.spyOn(performanceTemplateApi, 'update')
    const wrapper = mountView()
    await wrapper.get('[aria-label="模板名称"]').setValue('中途退出模板')
    await wrapper.get('.next-button').trigger('click')
    await flushPromises()
    await wrapper.get('.full-screen-modal-header-back').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'PerformanceTemplates' })
    expect(performanceTemplateApi.create).toHaveBeenCalledWith(expect.not.objectContaining({ configuration_completed: true }))
    expect(update).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('requires a name without calling the create API', async () => {
    const wrapper = mountView()
    await wrapper.get('.next-button').trigger('click')
    expect(wrapper.text()).toContain('名称为必填')
    expect(performanceTemplateApi.create).not.toHaveBeenCalled()
  })

  it.each(['11', '半年度绩效评估（2026模板）', '全年度绩效评估', '半年度绩效评估'])(
    'allows the backend to create the former demo name: %s', async name => {
      const wrapper = mountView()
      await wrapper.get('[aria-label="模板名称"]').setValue(name)
      await wrapper.get('.next-button').trigger('click')
      await flushPromises()
      expect(performanceTemplateApi.create).toHaveBeenCalledWith(expect.objectContaining({ name }))
      expect(wrapper.find('.basic-info-panel').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('该模板名称已存在，请重新输入')
      wrapper.unmount()
    },
  )

  it.each(['string', 'object'])( 'shows a real server duplicate and allows retry after renaming: %s', async format => {
    const message = '该模板名称已存在，请重新输入'
    vi.mocked(performanceTemplateApi.create).mockRejectedValueOnce({ response: { status: 409, data: {
      detail: format === 'string' ? message : { code: 'PERFORMANCE_TEMPLATE_NAME_DUPLICATE', message },
    } } })
    const wrapper = mountView()
    await wrapper.get('[aria-label="模板名称"]').setValue('全年度绩效评估')
    await wrapper.get('.next-button').trigger('click')
    await flushPromises()
    expect(performanceTemplateApi.create).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.field-error').text()).toBe(message)
    expect(wrapper.find('.basic-info-panel').exists()).toBe(true)
    expect(localStorage.getItem('performance-template-draft')).toBeNull()
    await wrapper.get('[aria-label="模板名称"]').setValue('全年度绩效评估新版')
    await wrapper.get('.next-button').trigger('click')
    await flushPromises()
    expect(performanceTemplateApi.create).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.basic-info-panel').exists()).toBe(false)
    wrapper.unmount()
  })

  it('requires a rule after enabling calculation rules', async () => {
    const wrapper = mountView()
    await wrapper.get('[aria-label="模板名称"]').setValue('新的模板')
    await wrapper.get('[aria-label="配置计算规则"]').trigger('click')
    expect(wrapper.find('.step-flow').text()).toContain('计算规则')
    await wrapper.get('.next-button').trigger('click')
    expect(wrapper.text()).toContain('如果开启计算规则配置，则至少配置一个计算规则')
    await wrapper.get('.option-row input').setValue(true)
    await wrapper.get('.next-button').trigger('click')
    expect(wrapper.find('.basic-info-panel').exists()).toBe(false)
    expect(localStorage.getItem('performance-template-draft')).toContain('新的模板')
  })
})



