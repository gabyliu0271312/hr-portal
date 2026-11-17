import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import PayrollResult from './PayrollResult.vue'

const payrollApi = vi.hoisted(() => ({
  fields: vi.fn(),
  rows: vi.fn(),
}))
vi.mock('@/api/payrollResult', () => ({ payrollResultApi: payrollApi }))

const menus = reactive<{ code: string }[]>([{ code: 'people.salary.payroll_result' }])
const store = reactive<{ user: { id: number; display_name: string }; menus: { code: string }[] }>({
  user: { id: 1, display_name: '测试管理员' },
  menus,
})
vi.mock('@/stores/user', () => ({ useUserStore: () => store }))

const stubs = {
  PageTitle: defineComponent({ props: ['title', 'description'], template: '<div class="page-title">{{ title }}<p>{{ description }}</p></div>' }),
  UiSurface: defineComponent({ template: '<div><slot/></div>' }),
  SearchInput: defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' }),
  PerformanceColumnVisibilityDrawer: defineComponent({ props: ['modelValue', 'columns', 'selectedKeys'], emits: ['update:modelValue', 'confirm'], template: '<div class="column-drawer-stub" />' }),
  PerformanceTableSummary: defineComponent({ props: ['total', 'hiddenColumnCount'], emits: ['columns'], template: '<div class="table-summary">{{ total }}<button @click="$emit(\'columns\')">列设置</button></div>' }),
  UiTable: defineComponent({ props: ['columns', 'rows', 'loading', 'emptyText'], template: '<div class="ui-table-stub"><span class="ui-table-columns">{{ columns.length }}</span><span class="ui-table-rows">{{ rows.length }}</span><slot name="empty" :loading="loading" :text="emptyText" /></div>' }),
  UiPagination: defineComponent({ template: '<div class="pagination-stub" />' }),
  MetricTemplateEmptyIllustration: defineComponent({ template: '<svg class="empty-illustration" />' }),
  ElAlert: defineComponent({ props: ['title', 'type'], template: '<p class="alert">{{ title }}</p>' }),
}
const options = { global: { stubs, directives: { loading: () => {} } } }

const sampleFields = [
  { id: 1, field_code: 'pay_month', field_name: '月份', data_type: 'string', is_active: true },
  { id: 2, field_code: 'employee_no', field_name: '工号', data_type: 'string', is_active: true },
  { id: 3, field_code: 'full_name', field_name: '姓名', data_type: 'string', is_active: true },
  { id: 4, field_code: 'disabled_field', field_name: '停用字段', data_type: 'string', is_active: false },
]

beforeEach(() => {
  vi.resetAllMocks()
  menus.length = 0; menus.push({ code: 'people.salary.payroll_result' })
  payrollApi.fields.mockResolvedValue({ items: sampleFields, total: sampleFields.length })
  payrollApi.rows.mockResolvedValue({
    items: [{ id: 101, pay_month: '202610', employee_no: 'EMP001', full_name: '张三' }],
    total: 1,
    page: 1,
    page_size: 20,
  })
  window.localStorage.clear()
})

describe('payroll result page', () => {
  it('renders field table and loads payroll rows when authorized', async () => {
    const wrapper = mount(PayrollResult, options); await flushPromises()
    expect(payrollApi.fields).toHaveBeenCalledTimes(1)
    expect(payrollApi.rows).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }))
    expect(wrapper.text()).toContain('薪资结果')
    const vm = wrapper.vm as any
    expect(vm.tableColumns.length).toBe(3)
    wrapper.unmount()
  })

  it('filters out inactive fields from columns', async () => {
    const wrapper = mount(PayrollResult, options); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.fields.length).toBe(3) // disabled_field 被过滤
    wrapper.unmount()
  })

  it('keeps column preference in localStorage per user', async () => {
    const wrapper = mount(PayrollResult, options); await flushPromises()
    const vm = wrapper.vm as any
    vm.applyColumns(['1', '2'])
    const raw = JSON.parse(window.localStorage.getItem('people.payroll-result.columns') || '{}')
    expect(raw['1']).toEqual(['1', '2'])
    wrapper.unmount()
  })

  it('treats all-empty rows as empty state', async () => {
    payrollApi.rows.mockResolvedValue({
      items: [{ id: 101, pay_month: null, employee_no: null, full_name: '' }],
      total: 0,
      page: 1,
      page_size: 20,
    })
    const wrapper = mount(PayrollResult, options); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.displayedRows).toHaveLength(0)
    expect(vm.hasVisibleData).toBe(false)
    expect(wrapper.find('.empty-illustration').exists()).toBe(true)
    expect(wrapper.find('.pagination-stub').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows permission notice without payroll menu', async () => {
    menus.length = 0
    const wrapper = mount(PayrollResult, options); await flushPromises()
    expect(payrollApi.fields).not.toHaveBeenCalled()
    expect(payrollApi.rows).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('surfaces load errors without crashing', async () => {
    payrollApi.fields.mockRejectedValueOnce({ response: { data: { detail: '读取失败' } } })
    const wrapper = mount(PayrollResult, options); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.error).toBeTruthy()
    wrapper.unmount()
  })
})
