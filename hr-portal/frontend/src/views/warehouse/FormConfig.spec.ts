import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import FormConfig from './FormConfig.vue'

const api = vi.hoisted(() => ({
  formFields: vi.fn(),
  list: vi.fn(),
  addFormField: vi.fn(),
  removeFormField: vi.fn(),
  reorderFormFields: vi.fn(),
}))
vi.mock('@/api/standardFields', () => ({ standardFieldsApi: api }))

const menus = reactive<{ code: string }[]>([{ code: 'people.admin.form_config' }])
const store = reactive<{ user: { id: number; display_name: string }; menus: { code: string }[]; hasOp: (m: string, o: string) => boolean }>({
  user: { id: 1, display_name: '测试管理员' },
  menus,
  hasOp: (m: string, o: string) => true,
})
vi.mock('@/stores/user', () => ({ useUserStore: () => store }))

const stubs = {
  PageTitle: defineComponent({ props: ['title', 'description'], template: '<div class="page-title">{{ title }}<p>{{ description }}</p></div>' }),
  UiSurface: defineComponent({ template: '<div><slot/></div>' }),
  UiSortableTable: defineComponent({
    props: ['columns', 'rows', 'loading', 'emptyText'],
    template: '<div class="table-stub"><span class="cols">{{ columns.length }}</span><span class="rows-num">{{ rows.length }}</span><template v-if="rows.length"><slot name="cell" :row="rows[0]" :column="columns[0]" /></template><slot name="empty" /></div>',
  }),
  PerformanceLineTabs: defineComponent({ props: ['modelValue', 'tabs'], emits: ['update:modelValue'], template: '<div class="tabs-stub"><button v-for="t in tabs" :key="t.key" @click="$emit(\'update:modelValue\', t.key)">{{ t.label }}</button></div>' }),
  UiDialogShell: defineComponent({ props: ['modelValue', 'title'], template: '<div class="dialog-stub">{{ modelValue }}<slot/><slot name="footer"/></div>' }),
  SearchInput: defineComponent({ template: '<input/>' }),
  ElAlert: defineComponent({ props: ['title', 'type'], template: '<p class="alert">{{ title }}</p>' }),
}

const options = { global: { stubs, directives: { loading: () => {} } } }

const boundFields = [
  { id: 1, field_code: 'employee_no', field_name: '工号', entity_name: '人员', group_name: '工作信息', data_type: 'string', is_active: true },
  { id: 2, field_code: 'full_name', field_name: '姓名', entity_name: '人员', group_name: '个人信息', data_type: 'string', is_active: true },
]

const catalogFields = [
  ...boundFields,
  { id: 3, field_code: 'mobile_phone', field_name: '手机号', entity_name: '人员', group_name: '个人信息', data_type: 'string', is_active: true },
]

beforeEach(() => {
  vi.resetAllMocks()
  menus.length = 0; menus.push({ code: 'people.admin.form_config' })
  api.formFields.mockResolvedValue({ items: boundFields, total: boundFields.length })
  api.list.mockResolvedValue({ items: catalogFields, total: catalogFields.length })
  api.addFormField.mockResolvedValue({ ok: true })
  api.removeFormField.mockResolvedValue({})
  api.reorderFormFields.mockResolvedValue({ ok: true })
})

describe('FormConfig', () => {
  it('加载表单绑定字段并渲染', async () => {
    const wrapper = mount(FormConfig, options)
    await flushPromises()
    expect(api.formFields).toHaveBeenCalledWith('people_roster')
    expect(wrapper.find('.rows-num').text()).toBe('2')
    wrapper.unmount()
  })

  it('无权限时不发请求', async () => {
    menus.length = 0
    const wrapper = mount(FormConfig, options)
    await flushPromises()
    expect(api.formFields).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('切换表单重新加载', async () => {
    api.formFields.mockResolvedValue({ items: [{ id: 9, field_code: 'cost_period', field_name: '月份', entity_name: null, group_name: '分摊结果', data_type: 'string', is_active: true }], total: 1 })
    const wrapper = mount(FormConfig, options)
    await flushPromises()
    const tab = wrapper.findAll('button').find(b => b.text() === '分摊结果')
    await tab!.trigger('click')
    await flushPromises()
    expect(api.formFields).toHaveBeenCalledWith('allocation_result')
    wrapper.unmount()
  })

  it('添加字段：打开弹窗，多选后确认批量添加', async () => {
    const wrapper = mount(FormConfig, options)
    await flushPromises()
    const addBtn = wrapper.findAll('button').find(b => b.text() === '添加字段')
    await addBtn!.trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenCalled()
    // 多选两个字段后确认
    ;(wrapper.vm as any).toggleSelect(3)
    await (wrapper.vm as any).confirmAdd()
    await flushPromises()
    expect(api.addFormField).toHaveBeenCalledWith('people_roster', 3)
    expect(api.addFormField).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('移除字段调用 remove', async () => {
    const wrapper = mount(FormConfig, options)
    await flushPromises()
    await (wrapper.vm as any).removeField(2)
    await flushPromises()
    expect(api.removeFormField).toHaveBeenCalledWith('people_roster', 2)
    wrapper.unmount()
  })

  it('排序调用 reorder', async () => {
    const wrapper = mount(FormConfig, options)
    await flushPromises()
    await (wrapper.vm as any).reorderFields(0, 1)
    await flushPromises()
    expect(api.reorderFormFields).toHaveBeenCalledWith('people_roster', [2, 1])
    wrapper.unmount()
  })
})
