import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ElTable, ElTableColumn } from 'element-plus'
import { performanceTemplateApi } from '@/api/performance'

const persistedTemplates = [
  { template_id: 1, name: '半年度绩效评估', description: '真实半年度模板', status: 'active' as const, created_at: '2026-08-31T10:00:00Z' },
  { template_id: 2, name: '全年度绩效评估', description: '真实年度模板', status: 'inactive' as const, created_at: '2026-08-31T10:00:00Z' },
  { template_id: 3, name: '未完成模板', description: '中途退出的模板', status: 'DRAFT' as const, created_at: '2026-08-31T10:00:00Z' },
]

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/stores/user', () => ({ useUserStore: () => ({ hasOp: () => true }) }))
import PerformanceTemplateManagement from './PerformanceTemplateManagement.vue'

function mountView() {
  return mount(PerformanceTemplateManagement, {
    global: {
      stubs: {
        'el-button': { props: ['disabled'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
        'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<ul><slot /></ul>' },
        'el-dropdown-item': { props: ['command'], template: '<li @click="$emit(\'click\')"><slot /></li>' },
        'el-input': { props: ['modelValue'], emits: ['update:modelValue'], template: '<label><input :value="modelValue" aria-label="通过名称、备注搜索" @input="$emit(\'update:modelValue\', $event.target.value)" /><slot name="prefix" /></label>' },
        'el-empty': { props: ['description'], template: '<div>{{ description }}</div>' },
        'el-table': ElTable,
        'el-table-column': ElTableColumn,
        'el-tag': { template: '<span><slot /></span>' },
        'el-alert': { template: '<div>{{ title }}</div>', props: ['title'] },
        'el-icon': { template: '<span><slot /></span>' },
      },
    },
  })
}

beforeEach(() => {
  push.mockReset()
  vi.restoreAllMocks()
  vi.spyOn(performanceTemplateApi, 'list').mockResolvedValue(persistedTemplates)
  vi.spyOn(performanceTemplateApi, 'remove').mockResolvedValue()
})

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
})

describe('PerformanceTemplateManagement', () => {
  it('renders real persisted templates in the page structure', async () => {
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.list-page-title').text()).toBe('绩效模板')
    expect(wrapper.find('.list-page-content .list-page-title').exists()).toBe(false)
    expect(wrapper.find('.create-button').text()).toContain('新建')
    expect(wrapper.find('.search-input').exists()).toBe(true)
    expect(wrapper.find('.filter-button').exists()).toBe(true)
    expect(wrapper.text()).toContain('真实半年度模板')
    expect(wrapper.text()).toContain('已启用')
    expect(wrapper.text()).toContain('待启用')
    expect(wrapper.text()).toContain('待完成配置')
  })

  it('disables draft activation and allows completed templates to enable and disable', async () => {
    const update = vi.spyOn(performanceTemplateApi, 'updateStatus').mockImplementation(async (id, status) => ({ ...persistedTemplates.find(item => item.template_id === id)!, status }))
    const wrapper = mountView()
    await flushPromises()
    const rows = wrapper.findAll('.el-table__body tr')
    expect(rows.map(row => row.get('.status-badge').text())).toEqual(['已启用', '待启用', '待完成配置'])
    const draftAction = rows[2].findAll('.template-row-button')[1]
    expect((draftAction.element as HTMLButtonElement).disabled).toBe(true)
    await draftAction.trigger('click')
    const state = (wrapper.vm.$ as any).setupState
    await state.handleTemplateAction('启用', state.templates[2])
    expect(update).not.toHaveBeenCalled()
    expect(rows[1].get('.status-badge').classes()).toContain('status-inactive')
    await rows[1].findAll('.template-row-button')[1].trigger('click')
    await flushPromises()
    expect(update).toHaveBeenLastCalledWith(2, 'active')
    expect(rows[1].get('.status-badge').text()).toBe('已启用')
    await rows[1].findAll('.template-row-button')[1].trigger('click')
    await flushPromises()
    expect(update).toHaveBeenLastCalledWith(2, 'inactive')
    expect(rows[1].get('.status-badge').text()).toBe('待启用')
    wrapper.unmount()
  })

  it('uses the captured blue token for the ready status dot', () => {
    const viewSource = readFileSync('src/views/performance/PerformanceTemplateManagement.vue', 'utf8')
    const tokenSource = readFileSync('src/styles/tokens.css', 'utf8')
    expect(viewSource).toContain('.status-inactive i { background: var(--performance-line-tabs-ink); }')
    expect(tokenSource).toContain('--performance-line-tabs-ink: #1456f0')
  })

  it('filters templates by keyword', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('input[aria-label="通过名称、备注搜索"]').setValue('项目制')
    expect(wrapper.text()).toContain('没有找到匹配的绩效模板')

    await wrapper.get('input[aria-label="通过名称、备注搜索"]').setValue('半年度')
    expect(wrapper.text()).toContain('半年度绩效评估')
    expect(wrapper.text()).not.toContain('全年度绩效评估')
  })

  it('shows loading without any demo templates while the API is pending', () => {
    vi.mocked(performanceTemplateApi.list).mockImplementationOnce(() => new Promise(() => {}))
    const wrapper = mountView()
    expect(wrapper.text()).toContain('正在加载绩效模板...')
    expect(wrapper.text()).not.toContain('暂无绩效模板')
    expect(wrapper.text()).not.toContain('全年度绩效评估')
    expect(wrapper.text()).not.toContain('半年度绩效评估')
    wrapper.unmount()
  })

  it('shows empty only after the API returns no templates', async () => {
    vi.mocked(performanceTemplateApi.list).mockResolvedValueOnce([])
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('暂无绩效模板')
    expect(wrapper.text()).not.toContain('全年度绩效评估')
    expect(wrapper.text()).not.toContain('正在加载')
    wrapper.unmount()
  })

  it.each(['string', 'object', 'network'])('shows a distinct error and can retry: %s', async format => {
    const message = '无绩效模板查看权限'
    vi.mocked(performanceTemplateApi.list).mockRejectedValueOnce(format === 'network' ? new Error('Network Error') : {
      response: { data: { detail: format === 'string' ? message : { message } } },
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain(format === 'network' ? '绩效模板加载失败，请稍后重试' : message)
    expect(wrapper.text()).not.toContain('暂无绩效模板')
    expect(wrapper.text()).not.toContain('全年度绩效评估')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(performanceTemplateApi.list).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('真实半年度模板')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens the template creation page', async () => {
    const wrapper = mountView()
    await wrapper.get('.create-button').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'PerformanceTemplateCreate' })
  })

  it('opens a persisted template in edit mode with its real id', async () => {
    vi.mocked(performanceTemplateApi.list).mockResolvedValueOnce([{
      template_id: 42,
      name: '真实模板',
      description: '真实描述',
      status: 'DRAFT',
      created_at: '2026-08-31T10:00:00Z',
    }])
    const wrapper = mountView()
    await flushPromises()

    const setupState = (wrapper.vm.$ as any).setupState
    const row = setupState.templates[0]
    setupState.openEditPage(row)

    expect(push).toHaveBeenCalledWith({
      name: 'PerformanceTemplateCreate',
      query: { template_id: '42' },
    })
  })

  it('opens the captured confirmation and keeps the template when cancelled', async () => {
    vi.mocked(performanceTemplateApi.list).mockResolvedValueOnce([{
      template_id: 42,
      name: '待删除模板',
      description: '',
      status: 'DRAFT',
      created_at: '2026-08-31T10:00:00Z',
    }])
    const wrapper = mountView()
    await flushPromises()
    const setupState = (wrapper.vm.$ as any).setupState

    setupState.handleTemplateAction('删除', setupState.templates[0])
    await flushPromises()

    expect(document.querySelector('.performance-confirm-dialog__title-content')?.textContent).toBe('后续配置项目将无法使用该模板，确定删除吗？')
    ;(document.querySelector('.performance-confirm-dialog__button--cancel') as HTMLButtonElement).click()
    await flushPromises()

    expect(performanceTemplateApi.remove).not.toHaveBeenCalled()
    expect(document.querySelector('.performance-confirm-dialog')).toBeNull()
  })

  it('deletes the real template and refreshes the persisted list after confirmation', async () => {
    vi.mocked(performanceTemplateApi.list)
      .mockResolvedValueOnce([{
        template_id: 42,
        name: '待删除模板',
        description: '',
        status: 'DRAFT',
        created_at: '2026-08-31T10:00:00Z',
      }])
      .mockResolvedValueOnce([])
    const wrapper = mountView()
    await flushPromises()
    const setupState = (wrapper.vm.$ as any).setupState

    setupState.handleTemplateAction('删除', setupState.templates[0])
    await flushPromises()
    ;(document.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()

    expect(performanceTemplateApi.remove).toHaveBeenCalledWith(42)
    expect(performanceTemplateApi.list).toHaveBeenCalledTimes(2)
    expect(setupState.templates).toEqual([])
    expect(document.querySelector('.performance-confirm-dialog')).toBeNull()
    expect(wrapper.text()).toContain('模板已删除')
  })

  it('keeps the confirmation open when the delete API fails', async () => {
    vi.mocked(performanceTemplateApi.list).mockResolvedValueOnce([{
      template_id: 42,
      name: '待删除模板',
      description: '',
      status: 'DRAFT',
      created_at: '2026-08-31T10:00:00Z',
    }])
    vi.mocked(performanceTemplateApi.remove).mockRejectedValueOnce({ response: { data: { detail: '模板删除失败' } } })
    const wrapper = mountView()
    await flushPromises()
    const setupState = (wrapper.vm.$ as any).setupState

    setupState.handleTemplateAction('删除', setupState.templates[0])
    await flushPromises()
    ;(document.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()

    expect(document.querySelector('.performance-confirm-dialog')).not.toBeNull()
    expect(wrapper.text()).toContain('模板删除失败')
  })
})




