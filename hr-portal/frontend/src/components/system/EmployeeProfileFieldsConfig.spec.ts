import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EmployeeProfileFieldsConfig from './EmployeeProfileFieldsConfig.vue'

const fields = Array.from({ length: 5 }, (_, index) => ({
  column_name: `field_${index + 1}`,
  field_code: `field_${index + 1}`,
  display_name: `Field ${index + 1}`,
  is_default_card: true,
  default_display_order: index + 1,
  append_display_order: 10,
  version: 1,
  sensitive_category_names: index === 0 ? ['薪酬'] : [],
}))

const mocks = vi.hoisted(() => ({ list: vi.fn(), governanceCheck: vi.fn(), update: vi.fn(), success: vi.fn(), warning: vi.fn() }))

vi.mock('@/api/employee_profile_fields', () => ({ employeeProfileFieldsApi: { list: mocks.list, governanceCheck: mocks.governanceCheck, update: mocks.update } }))
vi.mock('element-plus', () => ({ ElMessage: { success: mocks.success, warning: mocks.warning, error: vi.fn() } }))

function mountComponent() {
  return mount(EmployeeProfileFieldsConfig, {
    global: {
      stubs: {
        'el-card': { template: '<section><slot name="header" /><slot /></section>' },
        'el-table': { template: '<div><slot /></div>' },
        'el-table-column': { props: ['label'], template: `<div>{{ label }}<slot :row="{ column_name: 'field_1', field_code: 'field_1', display_name: 'Field 1', is_default_card: true, default_display_order: 1, append_display_order: 10, sensitive_category_names: ['薪酬'] }" /></div>` },
        'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
        'el-tag': { template: '<span><slot /></span>' },
        'el-text': { template: '<span><slot /></span>' },
        'el-input': { template: '<input />' },
        'el-checkbox': { template: '<input type="checkbox" />' },
        'el-input-number': { template: '<input type="number" />' },
        'el-skeleton': { template: '<div />' },
        'el-alert': { template: '<div><slot /></div>' },
        'el-empty': { template: '<div />' },
      },
    },
  })
}

describe('EmployeeProfileFieldsConfig', () => {
  beforeEach(() => { mocks.list.mockReset(); mocks.governanceCheck.mockReset(); mocks.update.mockReset(); mocks.success.mockReset(); mocks.warning.mockReset(); mocks.list.mockResolvedValue(fields); mocks.governanceCheck.mockResolvedValue({ issues: [], warning_count: 0 }); mocks.update.mockResolvedValue(fields) })

  it('loads five defaults and saves the complete configuration', async () => {
    mocks.list.mockResolvedValueOnce(fields)
    mocks.update.mockResolvedValueOnce(fields)
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.text()).toContain('默认项 5/5')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith(fields)
    expect(mocks.success).toHaveBeenCalled()
  })

  it('shows sensitive category summaries as read-only values', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.text()).toContain('敏感分类（只读）')
    expect(wrapper.text()).toContain('薪酬')
  })

  it('shows governance warnings without blocking field configuration', async () => {
    mocks.governanceCheck.mockResolvedValueOnce({
      warning_count: 1,
      issues: [{ code: 'unclassified_high_risk_field', level: 'warning', message: '疑似高风险业务字段尚未归入敏感分类', column_name: 'field_1', category_name: null }],
    })
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.text()).toContain('疑似高风险业务字段尚未归入敏感分类')
  })

  it('blocks saving when defaults are not exactly five', async () => {
    mocks.list.mockResolvedValueOnce(fields.slice(0, 4))
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.get('button').trigger('click')
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.warning).toHaveBeenCalledWith('默认卡片必须恰好选择五项')
  })

  it('warns when saving receives a version conflict', async () => {
    mocks.list.mockResolvedValueOnce(fields)
    mocks.update.mockRejectedValueOnce({ response: { status: 409 } })
    const wrapper = mountComponent()
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(mocks.warning).toHaveBeenCalledWith('配置已被其他管理员更新，请刷新后重试')
  })
})
