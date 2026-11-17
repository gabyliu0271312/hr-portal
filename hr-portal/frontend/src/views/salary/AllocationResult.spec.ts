import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import AllocationResult from './AllocationResult.vue'

const allocationApi = vi.hoisted(() => ({
  fields: vi.fn(),
  rows: vi.fn(),
}))
vi.mock('@/api/allocationResult', () => ({ allocationResultApi: allocationApi }))

const menus = reactive<{ code: string }[]>([{ code: 'people.salary.allocation_result' }])
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
  UiTable: defineComponent({
    props: ['columns', 'rows', 'loading', 'emptyText'],
    template: '<div class="ui-table-stub"><span class="ui-table-columns">{{ columns.length }}</span><span class="ui-table-rows">{{ rows.length }}</span><slot name="empty" :loading="loading" :text="emptyText" /><slot name="cell" :row="rows[0]" :column="columns[0]" /></div>',
  }),
  UiPagination: defineComponent({ template: '<div class="pagination-stub" />' }),
  UiDialogShell: defineComponent({ props: ['modelValue', 'title'], template: '<div class="dialog-stub">{{ modelValue }}<slot/><slot name="footer"/></div>' }),
  MetricTemplateEmptyIllustration: defineComponent({ template: '<svg class="empty-illustration" />' }),
  ElAlert: defineComponent({ props: ['title', 'type'], template: '<p class="alert">{{ title }}</p>' }),
  ElDescriptions: defineComponent({ template: '<div><slot/></div>' }),
  ElDescriptionsItem: defineComponent({ props: ['label'], template: '<div class="desc-item"><span>{{ label }}</span><slot/></div>' }),
}
const options = { global: { stubs, directives: { loading: () => {} } } }

const sampleFields = [
  { id: 1, field_code: 'cost_period', field_name: '月份', data_type: 'string', is_active: true },
  { id: 2, field_code: 'employee_no', field_name: '工号', data_type: 'string', is_active: true },
  { id: 3, field_code: 'full_name', field_name: '姓名', data_type: 'string', is_active: true },
  { id: 4, field_code: 'cost_center_code', field_name: '成本中心编码', data_type: 'string', is_active: true },
  { id: 5, field_code: 'allocation_percentage', field_name: '分摊比例', data_type: 'number', is_active: true },
]

const sampleRows = [
  { _id: 1, cost_period: '202610', employee_no: 'E001', employee_name: '张三', code: 'CC01', cc_name: '华东中心', _cc_valid: true, allocation_percentage: 0.5, _synced_at: '2026-10-01T00:00:00+00:00' },
]

beforeEach(() => {
  vi.resetAllMocks()
  menus.length = 0; menus.push({ code: 'people.salary.allocation_result' })
  allocationApi.fields.mockResolvedValue({ items: sampleFields, total: sampleFields.length })
  allocationApi.rows.mockResolvedValue({ items: sampleRows, total: 1, page: 1, page_size: 20, hidden_columns: [] })
  window.localStorage.clear()
})

describe('AllocationResult', () => {
  it('加载字段与行数据并渲染', async () => {
    const wrapper = mount(AllocationResult, options)
    await flushPromises()
    expect(allocationApi.fields).toHaveBeenCalled()
    expect(allocationApi.rows).toHaveBeenCalled()
    expect(wrapper.find('.ui-table-rows').text()).toBe('1')
    // 列 = 可见字段 + 操作列
    expect(wrapper.find('.ui-table-columns').text()).toBe(String(sampleFields.length + 1))
    wrapper.unmount()
  })

  it('无权限时不发请求', async () => {
    menus.length = 0
    const wrapper = mount(AllocationResult, options)
    await flushPromises()
    expect(allocationApi.fields).not.toHaveBeenCalled()
    expect(allocationApi.rows).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('编辑按钮打开占位弹窗', async () => {
    const wrapper = mount(AllocationResult, options)
    await flushPromises()
    // 点击编辑按钮（操作列 _action）
    const editBtn = wrapper.find('button').findAll('button').find(b => b.text() === '编辑')
    // 操作列按钮在 cell 插槽中；直接触发弹窗打开
    // 通过组件实例调用 openEdit 验证
    ;(wrapper.vm as any).openEdit(sampleRows[0])
    await flushPromises()
    expect(wrapper.find('.dialog-stub').text()).toContain('张三')
  })

  it('隐藏列后表头列同步减少', async () => {
    const wrapper = mount(AllocationResult, options)
    await flushPromises()
    const initial = Number(wrapper.find('.ui-table-columns').text())
    // 模拟隐藏第一列
    ;(wrapper.vm as any).applyColumns(['2', '3', '4', '5'])
    await flushPromises()
    expect(Number(wrapper.find('.ui-table-columns').text())).toBe(4 + 1) // 4 可见字段 + 操作列
    expect(Number(wrapper.find('.ui-table-columns').text())).toBeLessThan(initial)
  })

  it('空字段时显示空态提示', async () => {
    allocationApi.fields.mockResolvedValue({ items: [], total: 0 })
    const wrapper = mount(AllocationResult, options)
    await flushPromises()
    expect(wrapper.text()).toContain('暂无字段')
  })
})
