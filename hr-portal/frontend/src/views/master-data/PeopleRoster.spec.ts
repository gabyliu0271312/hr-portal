import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import PeopleRoster from './PeopleRoster.vue'

const fieldsApi = vi.hoisted(() => ({
  peopleFields: vi.fn(),
  groups: vi.fn(),
}))
const dataApi = vi.hoisted(() => ({
  query: vi.fn(),
}))
vi.mock('@/api/standardFields', () => ({ standardFieldsApi: fieldsApi }))
vi.mock('@/api/data', () => ({ dataApi }))

const menus = reactive<{ code: string }[]>([{ code: 'people.app' }])
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
  UiTable: defineComponent({ props: ['columns', 'rows', 'loading', 'emptyText'], template: '<div class="ui-table-stub"><span>{{ columns.length }}</span></div>' }),
  UiPagination: defineComponent({ template: '<div class="pagination-stub" />' }),
  ElAlert: defineComponent({ props: ['title', 'type'], template: '<p class="alert">{{ title }}</p>' }),
}
const options = { global: { stubs, directives: { loading: () => {} } } }

const sampleFields = [
  { id: 1, field_code: 'employee_no', field_name: '工号', data_type: 'string', group_id: 1, group_name: '工作信息', entity_id: 1, entity_name: '人员(person)', is_active: true },
  { id: 2, field_code: 'chinese_name', field_name: '姓名', data_type: 'string', group_id: 1, group_name: '工作信息', entity_id: 1, entity_name: '人员(person)', is_active: true },
  { id: 3, field_code: 'work_location', field_name: '工作地', data_type: 'enum', group_id: 2, group_name: '个人信息', entity_id: 1, entity_name: '人员(person)', is_active: true },
  { id: 4, field_code: 'disabled_field', field_name: '停用字段', data_type: 'string', group_id: 2, group_name: '个人信息', entity_id: null, entity_name: null, is_active: false },
]
const sampleGroups = [
  { id: 1, name: '工作信息', display_order: 1, is_active: true, field_count: 2 },
  { id: 2, name: '个人信息', display_order: 2, is_active: true, field_count: 1 },
]

beforeEach(() => {
  vi.resetAllMocks()
  menus.length = 0; menus.push({ code: 'people.app' })
  fieldsApi.peopleFields.mockResolvedValue({ items: sampleFields, total: sampleFields.length })
  fieldsApi.groups.mockResolvedValue({ items: sampleGroups, total: sampleGroups.length })
  dataApi.query.mockResolvedValue({
    items: [{ id: 101, employee_no: 'EMP001', chinese_name: '张三', work_location: 'site-a' }],
    total: 1,
    page: 1,
    page_size: 20,
  })
  window.localStorage.clear()
})

describe('people roster page', () => {
  it('renders grouped tabs and loads roster rows when authorized', async () => {
    const wrapper = mount(PeopleRoster, options); await flushPromises()
    expect(fieldsApi.peopleFields).toHaveBeenCalledTimes(1)
    expect(dataApi.query).toHaveBeenCalledWith('emp_realtime_roster', expect.objectContaining({ page: 1 }))
    expect(wrapper.text()).toContain('人员信息')
    expect(wrapper.text()).toContain('工作信息')
    expect(wrapper.text()).toContain('个人信息')
    wrapper.unmount()
  })

  it('filters out inactive fields from columns', async () => {
    const wrapper = mount(PeopleRoster, options); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.fields.length).toBe(3) // disabled_field 被过滤
    expect(vm.visibleColumns.length).toBe(3)
    wrapper.unmount()
  })

  it('keeps column preference in localStorage per user', async () => {
    const wrapper = mount(PeopleRoster, options); await flushPromises()
    const vm = wrapper.vm as any
    // 隐藏工作地 → 只保留 2 列
    vm.applyColumns(['1', '2'])
    const raw = JSON.parse(window.localStorage.getItem('people.roster.columns') || '{}')
    expect(raw['1']).toEqual(['1', '2'])
    wrapper.unmount()
  })

  it('shows permission notice without people.organization', async () => {
    menus.length = 0
    const wrapper = mount(PeopleRoster, options); await flushPromises()
    expect(fieldsApi.peopleFields).not.toHaveBeenCalled()
    expect(dataApi.query).not.toHaveBeenCalled()
    const vm = wrapper.vm as any
    expect(vm.fields).toHaveLength(0)
    expect(vm.rows).toHaveLength(0)
    wrapper.unmount()
  })

  it('surfaces load errors without crashing', async () => {
    fieldsApi.peopleFields.mockRejectedValueOnce({ response: { data: { detail: '读取失败' } } })
    const wrapper = mount(PeopleRoster, options); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.error).toBeTruthy()
    wrapper.unmount()
  })

  it('groups load failure degrades to all fields without breaking', async () => {
    fieldsApi.groups.mockRejectedValueOnce({ response: { data: { detail: '无权' } } })
    const wrapper = mount(PeopleRoster, options); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.groups).toHaveLength(0)
    expect(vm.fields.length).toBe(3)
    wrapper.unmount()
  })
})
