import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.vue'
import { createFieldSettingsPreview } from '@/components/performance/performanceFieldSettings'

const message = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: message }))

function mountPage(settings = createFieldSettingsPreview()) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/performance/settings/permissions/subject-visibility', name: 'PerformancePermissionSubjectVisibility', component: { template: '<div />' } },
    ],
  })
  return mount(Settings, { props: { settings }, global: { plugins: [router] } })
}

beforeEach(() => vi.clearAllMocks())

describe('字段设置主页面', () => {
  it('renders the four captured sections and configuration summaries', () => {
    const wrapper = mountPage()
    expect(wrapper.get('.page-title-text').text()).toBe('字段设置')
    expect(wrapper.findAll('h2').map(node => node.text())).toEqual([
      '详情页顶部字段设置', '筛选设置', '部门字段搜索设置', '管理者的判定标准设置',
    ])
    expect(wrapper.findAll('.field-settings-summary')[0].text()).toContain('部门、职级、序列、直属上级、入职日期')
    expect(wrapper.get('.field-settings-summary__filters').text()).toContain('直属上级（默认筛选）')
    expect(wrapper.get('.field-settings-summary__filters').text()).toContain('绩效结果最近变更时间')
    expect(wrapper.text()).toContain('拥有“人员类型为正式”的在职直属下级时，才能被认定为管理者。')
    expect(wrapper.find('a').attributes('href')).toBe('/performance/settings/permissions/subject-visibility')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([
    ['设置详情页顶部字段', 'review_detail_visible_fields'],
    ['设置筛选条件', 'default_filter_condition'],
    ['设置管理者判定标准', 'definition_of_manager'],
  ])('reserves %s without claiming to save or opening a dialog', async (label, key) => {
    const wrapper = mountPage()
    await wrapper.get(`button[aria-label="${label}"]`).trigger('click')
    expect(wrapper.emitted('request-edit')).toEqual([[key]])
    expect(message.info).toHaveBeenCalledWith('当前为配置预览，设置弹窗及保存功能将在后续开放')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps department selection read-only and previews both search modes', async () => {
    const settings = createFieldSettingsPreview()
    const wrapper = mountPage(settings)
    const radios = wrapper.findAll<HTMLInputElement>('input[type="radio"]')
    expect(radios).toHaveLength(2)
    expect(radios.map(node => node.element.checked)).toEqual([true, false])
    expect(wrapper.findAll('.department-preview')).toHaveLength(2)
    expect(wrapper.findAll('.department-preview').every(node => node.attributes('inert') !== undefined)).toBe(true)
    expect(radios.every(node => node.element.disabled)).toBe(true)
    await wrapper.findAll('.performance-radio-option')[1].trigger('click')
    expect(settings.department_tree_view_all.enabled).toBe(true)
    expect(radios.map(node => node.element.checked)).toEqual([true, false])
    expect(wrapper.emitted('request-edit')).toEqual([['department_tree_view_all']])
    await wrapper.get('.department-search-options').trigger('keydown', { key: 'ArrowRight' })
    expect(settings.department_tree_view_all.enabled).toBe(true)
    expect(wrapper.emitted('request-edit')).toHaveLength(2)
    wrapper.unmount()
  })

  it('accepts replacement data and handles empty summaries without changing the source', () => {
    const settings = createFieldSettingsPreview()
    settings.review_detail_visible_fields.field = []
    settings.default_filter_condition.filter_conditions = []
    settings.department_tree_view_all.enabled = false
    const wrapper = mountPage(settings)
    expect(wrapper.text()).toContain('暂无展示字段')
    expect(wrapper.text()).toContain('暂无筛选条件')
    expect(wrapper.findAll<HTMLInputElement>('input[type="radio"]').map(node => node.element.checked)).toEqual([false, true])
    expect(createFieldSettingsPreview().review_detail_visible_fields.field).toHaveLength(5)
    wrapper.unmount()
  })

  it('marks the example entry as not yet available', async () => {
    const wrapper = mountPage()
    await wrapper.findAll('button').find(node => node.text() === '查看示例')!.trigger('click')
    expect(wrapper.emitted('request-example')).toHaveLength(1)
    expect(message.info).toHaveBeenCalledWith('筛选示例将在后续开放')
    wrapper.unmount()
  })
})
