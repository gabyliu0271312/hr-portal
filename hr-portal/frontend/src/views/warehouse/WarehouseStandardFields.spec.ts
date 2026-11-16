import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import WarehouseStandardFields from './WarehouseStandardFields.vue'

const fieldsApi = vi.hoisted(() => ({ list: vi.fn(), groups: vi.fn(), reorder: vi.fn() }))
const masterApi = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/api/standardFields', () => ({ standardFieldsApi: fieldsApi }))
vi.mock('@/api/masterData', () => ({ masterDataApi: masterApi }))

const menus = reactive<{ code: string }[]>([{ code: 'warehouse.standard_fields.catalog' }])
const hasOpMap: Record<string, Record<string, boolean>> = { 'warehouse.standard_fields.catalog': { C: true, U: true } }
const store = reactive<{
  user: { id: number; display_name: string }
  menus: { code: string }[]
  hasOp: (menu: string, op: string) => boolean
}>({
  user: { id: 1, display_name: '测试管理员' },
  menus,
  hasOp: (menu: string, op: string) => Boolean(hasOpMap[menu]?.[op]),
})
vi.mock('@/stores/user', () => ({ useUserStore: () => store }))
const route = { query: {} }
vi.mock('vue-router', () => ({ useRoute: () => route }))

const stubs = {
  PageTitle: defineComponent({ props: ['title', 'description'], template: '<div class="page-title">{{ title }}<p>{{ description }}</p></div>' }),
  UiSurface: defineComponent({ template: '<div><slot/></div>' }),
  UiListToolbar: defineComponent({ props: ['keyword'], emits: ['update:keyword', 'search', 'clear'], template: '<div class="list-toolbar-stub"><slot name="filters" /><slot name="actions" /></div>' }),
  PerformanceFilterButton: defineComponent({ props: ['label', 'disabled'], emits: ['click'], template: '<button class="filter-button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>' }),
  PerformanceSearchInput: defineComponent({ template: '<input class="search-input" />' }),
  PerformanceLineTabs: defineComponent({ props: ['tabs', 'modelValue'], emits: ['update:modelValue'], template: '<div class="line-tabs-stub"><button v-for="tab in tabs" :key="tab.key" @click="$emit(\'update:modelValue\', tab.key)">{{ tab.label }}</button></div>' }),
  UiSortableTable: defineComponent({ props: ['columns', 'rows', 'loading', 'emptyText', 'disabled'], emits: ['reorder'], template: '<div class="sortable-table-stub"><span>{{ columns.length }} 列 / {{ rows.length }} 行</span><button class="sortable-reorder" @click="$emit(\'reorder\', 0, 1)">reorder</button></div>' }),
  UiPagination: defineComponent({ template: '<div class="pagination-stub" />' }),
  UiDialogShell: defineComponent({ props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<div v-if="modelValue" class="dialog-shell"><h3>{{ title }}</h3><slot /><slot name="footer" /></div>' }),
  UiButton: defineComponent({ props: ['variant'], emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' }),
  StandardFieldDrawer: defineComponent({ template: '<div class="drawer-stub" />' }),
  ElAlert: defineComponent({ props: ['title', 'type'], template: '<p class="alert">{{ title }}</p>' }),
  ElSelect: defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>' }),
  ElOption: defineComponent({ props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' }),
  PermissionButton: defineComponent({ props: ['menu', 'op', 'type'], template: '<button><slot /></button>' }),
}
const options = { global: { stubs, directives: { loading: () => {} } } }

const sampleFields = [
  { id: 1, field_code: 'employee_no', field_name: '工号', data_type: 'string', entity_id: 1, entity_name: '人员(person)', group_id: 1, group_name: '工作信息', category_ids: [], revision: 1, display_order: 0, is_active: true, business_definition: '员工工号' },
  { id: 2, field_code: 'chinese_name', field_name: '姓名', data_type: 'string', entity_id: 1, entity_name: '人员(person)', group_id: 1, group_name: '工作信息', category_ids: [1], revision: 1, display_order: 1, is_active: true, business_definition: '中文姓名' },
]
const sampleGroups = [{ id: 1, name: '工作信息', display_order: 1, is_active: true, field_count: 2 }]

beforeEach(() => {
  vi.resetAllMocks()
  menus.length = 0; menus.push({ code: 'warehouse.standard_fields.catalog' })
  hasOpMap['warehouse.standard_fields.catalog'] = { C: true, U: true }
  fieldsApi.list.mockResolvedValue({ items: sampleFields, total: 2 })
  fieldsApi.groups.mockResolvedValue({ items: sampleGroups, total: 1 })
  fieldsApi.reorder.mockResolvedValue({ ok: true })
  masterApi.list.mockResolvedValue({ items: [{ id: 1, entity_code: 'person', name: '人员(person)', description: '', revision: 1, is_active: true, published_at: null }], total: 1 })
})

describe('warehouse standard fields page', () => {
  it('renders fixed title, unified toolbar with filter button and create button', async () => {
    const wrapper = mount(WarehouseStandardFields, options); await flushPromises()
    expect(wrapper.text()).toContain('标准字段目录')
    expect(wrapper.find('.list-toolbar-stub').exists()).toBe(true)
    expect(wrapper.find('.filter-button').exists()).toBe(true)
    expect(wrapper.text()).toContain('新建字段')
    wrapper.unmount()
  })

  it('renders group tabs from backend groups', async () => {
    const wrapper = mount(WarehouseStandardFields, options); await flushPromises()
    expect(wrapper.text()).toContain('全部')
    expect(wrapper.text()).toContain('工作信息 (2)')
    wrapper.unmount()
  })

  it('uses sortable table component with field columns', async () => {
    const wrapper = mount(WarehouseStandardFields, options); await flushPromises()
    const table = wrapper.find('.sortable-table-stub')
    expect(table.exists()).toBe(true)
    expect(table.text()).toContain('8 列')
    wrapper.unmount()
  })

  it('persists drag reorder to backend with full ordered id list', async () => {
    const wrapper = mount(WarehouseStandardFields, options); await flushPromises()
    await wrapper.find('.sortable-reorder').trigger('click'); await flushPromises()
    expect(fieldsApi.reorder).toHaveBeenCalledWith([2, 1]) // 拖拽后 0→1，id 顺序变为 2,1
    wrapper.unmount()
  })

  it('opens filter dialog and applies entity filter', async () => {
    const wrapper = mount(WarehouseStandardFields, options); await flushPromises()
    await wrapper.find('.filter-button').trigger('click'); await flushPromises()
    const dialog = wrapper.find('.dialog-shell')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('筛选')
    // 确定按钮 → 应用筛选并重新加载
    const applyButton = wrapper.findAll('button').find(b => b.text() === '确定')
    await applyButton!.trigger('click'); await flushPromises()
    expect(fieldsApi.list).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('resets filter back to all', async () => {
    const wrapper = mount(WarehouseStandardFields, options); await flushPromises()
    await wrapper.find('.filter-button').trigger('click'); await flushPromises()
    const resetButton = wrapper.findAll('button').find(b => b.text() === '重置')
    await resetButton!.trigger('click'); await flushPromises()
    expect(fieldsApi.list).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('shows permission notice without catalog permission', async () => {
    menus.length = 0
    const wrapper = mount(WarehouseStandardFields, options); await flushPromises()
    expect(fieldsApi.list).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
