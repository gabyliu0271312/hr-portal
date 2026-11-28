import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.vue'
import { createFieldSettingsPreview, detailFieldOptions } from '@/components/performance/performanceFieldSettings'

const message = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('element-plus', () => ({ ElMessage: message }))
const managerApi = vi.hoisted(() => ({ get: vi.fn(), types: vi.fn(), save: vi.fn() }))
const filterApi = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }))
const detailApi = vi.hoisted(() => ({ options: vi.fn(), get: vi.fn(), save: vi.fn() }))
vi.mock('@/api/performanceFieldSettings', () => ({
  getPerformanceManagerStandard: managerApi.get,
  getPerformanceEmployeeTypes: managerApi.types,
  savePerformanceManagerStandard: managerApi.save,
  getPerformanceFilterConditions: filterApi.get,
  savePerformanceFilterConditions: filterApi.save,
  getPerformanceDetailFieldOptions: detailApi.options,
  getPerformanceDetailVisibleFields: detailApi.get,
  savePerformanceDetailVisibleFields: detailApi.save,
}))

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

beforeEach(() => {
  vi.clearAllMocks()
  managerApi.get.mockResolvedValue({ manager_standard: 'inservice_direct_underling', specific_employee_types: [] })
  managerApi.types.mockResolvedValue([{ value: '正式', label: '正式' }, { value: '实习', label: '实习' }])
  managerApi.save.mockResolvedValue({ manager_standard: 'specific_employee_type_underling', specific_employee_types: ['正式'] })
  filterApi.get.mockResolvedValue(createFieldSettingsPreview().default_filter_condition.filter_conditions)
  filterApi.save.mockImplementation(async (items: unknown) => items)
  detailApi.options.mockResolvedValue(detailFieldOptions.map(option => ({
    id: option.id, name: option.label, preview_name: option.previewLabel || option.label, disabled: !!option.disabled,
  })))
  detailApi.get.mockResolvedValue(createFieldSettingsPreview().review_detail_visible_fields.field)
  detailApi.save.mockImplementation(async (field: string[]) => field)
})

describe('字段设置主页面', () => {
  it('renders the four captured sections and configuration summaries', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('.page-title-text').text()).toBe('字段设置')
    expect(wrapper.findAll('h2').map(node => node.text())).toEqual([
      '详情页顶部字段设置', '筛选设置', '部门字段搜索设置', '管理者的判定标准设置',
    ])
    expect(wrapper.findAll('.field-settings-summary')[0].findAll('.ui-tag').map(node => node.text())).toEqual([
      '部门', '职级', '序列', '直属上级', '入职日期',
    ])
    expect(wrapper.get('.field-settings-summary__filters').text()).toContain('直属上级（默认筛选）')
    expect(wrapper.get('.field-settings-summary__filters').text()).toContain('绩效结果最近变更时间')
    expect(wrapper.text()).toContain('有在职直属下级时，可被认定为管理者。')
    expect(wrapper.find('a').attributes('href')).toBe('/performance/settings/permissions/subject-visibility')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens the detail field dialog with the saved selection and applies the readback', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置详情页顶部字段"]').trigger('click')
    expect(wrapper.emitted('request-edit')).toEqual([['review_detail_visible_fields']])
    expect(message.info).not.toHaveBeenCalled()
    const dialog = wrapper.findComponent({ name: 'PerformanceDetailFieldDialog' })
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('value')).toEqual(['department', 'level', 'category', 'directLeader', 'joinDate'])
    expect(dialog.props('options')).toHaveLength(detailFieldOptions.length)
    const saved = ['department', 'level', 'category', 'directLeader', 'joinDate', 'jobTitle']
    detailApi.get.mockResolvedValueOnce(saved)
    dialog.vm.$emit('save', saved)
    await flushPromises()
    expect(detailApi.save).toHaveBeenCalledWith(saved)
    expect(detailApi.get).toHaveBeenCalledTimes(2)
    expect(wrapper.findAll('.field-settings-summary')[0].findAll('.ui-tag').map(node => node.text())).toEqual([
      '部门', '职级', '序列', '直属上级', '入职日期', '职务',
    ])
    expect(dialog.props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('keeps the detail dialog open and the old tags when saving fails', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置详情页顶部字段"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'PerformanceDetailFieldDialog' })
    detailApi.save.mockRejectedValueOnce(new Error('failed'))
    dialog.vm.$emit('save', ['department', 'level', 'jobTitle'])
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('error')).toContain('已保留')
    expect(dialog.props('value')).toEqual(['department', 'level', 'category', 'directLeader', 'joinDate'])
    wrapper.unmount()
  })

  it('blocks the detail dialog when the initial load is denied', async () => {
    detailApi.get.mockRejectedValueOnce(new Error('403'))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('展示字段加载失败')
    await wrapper.get('button[aria-label="设置详情页顶部字段"]').trigger('click')
    expect(wrapper.findComponent({ name: 'PerformanceDetailFieldDialog' }).exists()).toBe(false)
    wrapper.unmount()
  })

  it('opens the filter condition dialog without showing the preview notice', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置筛选条件"]').trigger('click')
    expect(wrapper.emitted('request-edit')).toEqual([['default_filter_condition']])
    expect(message.info).not.toHaveBeenCalled()
    const dialog = wrapper.findComponent({ name: 'PerformanceFilterConditionSettingsDialog' })
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('value')).toHaveLength(32)
    wrapper.unmount()
  })

  it('loads manager settings and applies only the successful readback to the summary', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置管理者判定标准"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'PerformanceManagerStandardDialog' })
    expect(dialog.props('modelValue')).toBe(true)
    expect(message.info).not.toHaveBeenCalled()
    const saved = { manager_standard: 'specific_employee_type_underling', specific_employee_types: ['正式', '实习'] }
    managerApi.get.mockResolvedValue(saved)
    dialog.vm.$emit('save', saved)
    await flushPromises()
    expect(managerApi.save).toHaveBeenCalledWith(saved)
    expect(managerApi.get).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('拥有“人员类型为正式、实习”的在职直属下级时，才能被认定为管理者。')
    expect(dialog.props('modelValue')).toBe(false)
    await wrapper.get('button[aria-label="设置管理者判定标准"]').trigger('click')
    expect(dialog.props('value')).toEqual(saved)
    wrapper.unmount()
  })

  it('keeps the old summary and editing state when saving fails', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置管理者判定标准"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'PerformanceManagerStandardDialog' })
    managerApi.save.mockRejectedValueOnce(new Error('failed'))
    dialog.vm.$emit('save', { manager_standard: 'specific_employee_type_underling', specific_employee_types: ['实习'] })
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('error')).toContain('已保留')
    expect(wrapper.text()).not.toContain('拥有“人员类型为实习”')
    expect(managerApi.get).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('blocks duplicate saves while the request is pending', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置管理者判定标准"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'PerformanceManagerStandardDialog' })
    let complete!: (value: unknown) => void
    managerApi.save.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const value = { manager_standard: 'inservice_direct_underling', specific_employee_types: [] }
    dialog.vm.$emit('save', value)
    dialog.vm.$emit('save', value)
    await flushPromises()
    expect(managerApi.save).toHaveBeenCalledTimes(1)
    expect(dialog.props('saving')).toBe(true)
    complete(value)
    await flushPromises()
    expect(dialog.props('saving')).toBe(false)
    expect(dialog.props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('does not replace the summary if saving succeeds but readback fails', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置管理者判定标准"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'PerformanceManagerStandardDialog' })
    managerApi.get.mockRejectedValueOnce(new Error('readback failed'))
    dialog.vm.$emit('save', { manager_standard: 'specific_employee_type_underling', specific_employee_types: ['实习'] })
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('error')).toContain('回读失败')
    expect(wrapper.text()).not.toContain('拥有“人员类型为实习”')
    wrapper.unmount()
  })

  it('does not open or fabricate a saved summary if initial loading is denied', async () => {
    managerApi.get.mockRejectedValueOnce(new Error('403'))
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置管理者判定标准"]').trigger('click')
    expect(wrapper.text()).toContain('加载失败')
    expect(wrapper.findComponent({ name: 'PerformanceManagerStandardDialog' }).exists()).toBe(false)
    expect(wrapper.text()).not.toContain('有在职直属下级时，可被认定为管理者。')
    wrapper.unmount()
  })

  it('saves filter conditions and applies the successful readback to the summary', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置筛选条件"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'PerformanceFilterConditionSettingsDialog' })
    const saved = createFieldSettingsPreview().default_filter_condition.filter_conditions.map(condition => (
      condition.filter_key === 'dottedLeaders' ? { ...condition, default: true } : condition
    ))
    const payload = saved.map(({ filter_key, default: isDefault }) => ({ filter_key, default: isDefault }))
    filterApi.get.mockResolvedValueOnce(saved)
    dialog.vm.$emit('save', payload)
    await flushPromises()
    expect(filterApi.save).toHaveBeenCalledWith(payload)
    expect(filterApi.get).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.field-settings-summary__filters').text()).toContain('虚线上级（默认筛选）')
    expect(dialog.props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it('keeps the filter dialog open and the old summary when saving fails', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.get('button[aria-label="设置筛选条件"]').trigger('click')
    const dialog = wrapper.findComponent({ name: 'PerformanceFilterConditionSettingsDialog' })
    filterApi.save.mockRejectedValueOnce(new Error('failed'))
    dialog.vm.$emit('save', createFieldSettingsPreview().default_filter_condition.filter_conditions.map(({ filter_key, default: isDefault }) => ({ filter_key, default: isDefault })))
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('error')).toContain('已保留')
    expect(wrapper.get('.field-settings-summary__filters').text()).not.toContain('虚线上级（默认筛选）')
    wrapper.unmount()
  })

  it('does not open the filter dialog when initial loading is denied', async () => {
    filterApi.get.mockRejectedValueOnce(new Error('403'))
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('筛选条件加载失败')
    await wrapper.get('button[aria-label="设置筛选条件"]').trigger('click')
    expect(wrapper.findComponent({ name: 'PerformanceFilterConditionSettingsDialog' }).exists()).toBe(false)
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

  it('accepts replacement data and handles empty summaries without changing the source', async () => {
    const settings = createFieldSettingsPreview()
    settings.review_detail_visible_fields.field = []
    settings.default_filter_condition.filter_conditions = []
    settings.department_tree_view_all.enabled = false
    filterApi.get.mockResolvedValueOnce([])
    detailApi.get.mockResolvedValueOnce([])
    const wrapper = mountPage(settings)
    await flushPromises()
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
