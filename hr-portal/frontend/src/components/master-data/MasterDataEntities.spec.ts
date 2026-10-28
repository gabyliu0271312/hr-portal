import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import MasterDataEntities from '@/views/system/MasterDataEntities.vue'
import EntityFieldReferences from './EntityFieldReferences.vue'
import StandardFieldDrawer from '@/components/warehouse/StandardFieldDrawer.vue'
import StandardFieldDefinitionForm from '@/components/warehouse/StandardFieldDefinitionForm.vue'

const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), push: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('@/api/masterData', () => ({ masterDataApi: { list: mocks.list, create: mocks.create, update: mocks.update } }))
vi.mock('@/api/client', () => ({ api: { get: mocks.get, post: mocks.post, put: mocks.put } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }))
const store = reactive({ user: { id: 7 }, menus: [{ code: 'system.master_entities' }, { code: 'warehouse.standard_fields.catalog' }], writable: true,
  hasOp: () => store.writable })
vi.mock('@/stores/user', () => ({ useUserStore: () => store }))
const Box = defineComponent({ template: '<div><slot name="header"/><slot/><slot name="footer"/></div>' })
const Button = defineComponent({ props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' })
const Input = defineComponent({ props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)"/>' })
const stubs = { ElCard: Box, ElForm: Box, ElFormItem: Box, ElInput: Input, ElButton: Button, 'el-alert': defineComponent({ props: ['title'], template: '<p>{{ title }}</p>' }), ElTable: Box, ElTableColumn: true, ElPagination: true,
  PermissionButton: defineComponent({ props: ['menu', 'op', 'disabled'], setup: () => ({ store }), template: '<button v-if="store.writable" :disabled="disabled"><slot/></button>' }),
  ElDrawer: Box, ElSelect: true, ElOption: true, ElSwitch: true, ElInputNumber: true }
const entity = { id: 1, entity_code: 'person', name: '人员', description: 'Definition', revision: 0, is_active: true }
const options = { global: { stubs, directives: { loading: () => {} } } }
const button = (wrapper: ReturnType<typeof mount>, text: string) => wrapper.findAll('button').find(b => b.text() === text)!
beforeEach(() => {
  vi.clearAllMocks(); store.user = { id: 7 }; store.writable = true
  store.menus = [{ code: 'system.master_entities' }, { code: 'warehouse.standard_fields.catalog' }]
  mocks.list.mockResolvedValue({ total: 0, items: [] }); mocks.create.mockResolvedValue(entity)
  mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url === '/field-categories' ? [] : { total: 0, items: [] } }))
})

describe('B01 entity definitions and catalog ownership', () => {
  it('creates only a definition and exposes no enum editor in the entity page', async () => {
    const wrapper = mount(MasterDataEntities, options); await flushPromises()
    await button(wrapper, '新建实体定义').trigger('click'); await flushPromises()
    await button(wrapper, '保存定义').trigger('click'); await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith({ entity_code: 'person', name: '人员', description: '人员基本信息定义，不包含真实人员记录。' })
    expect(wrapper.findComponent(EntityFieldReferences).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('添加枚举值'); wrapper.unmount()
  })
  it('reads references and navigates to the unique standard field catalog', async () => {
    const wrapper = mount(EntityFieldReferences, { ...options, props: { entity } }); await flushPromises()
    expect(mocks.get).toHaveBeenCalledWith('/warehouse/standard-fields', { params: { entity_id: 1, offset: 0, limit: 20 } })
    await button(wrapper, '前往标准字段目录').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith({ path: '/warehouse/standard-fields', query: { entity_id: 1 } })
    expect(mocks.post).not.toHaveBeenCalled(); wrapper.unmount()
  })
  it('does not request metadata when view permissions are absent', async () => {
    store.menus = []
    const page = mount(MasterDataEntities, options)
    const refs = mount(EntityFieldReferences, { ...options, props: { entity } }); await flushPromises()
    expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.get).not.toHaveBeenCalled()
    page.unmount(); refs.unmount()
  })
  it('discards late definition responses after view permission is revoked', async () => {
    let resolve!: (value: unknown) => void
    mocks.list.mockReturnValueOnce(new Promise(r => { resolve = r }))
    const wrapper = mount(MasterDataEntities, options)
    store.menus = []; await flushPromises()
    resolve({ total: 1, items: [entity] }); await flushPromises()
    expect(wrapper.text()).toContain('无权限查看主数据定义')
    expect(wrapper.findComponent(EntityFieldReferences).exists()).toBe(false); wrapper.unmount()
  })
  it('keeps entity input and displays a 409 response', async () => {
    mocks.create.mockRejectedValue({ response: { status: 409, data: { detail: JSON.stringify({ message: '编码已存在' }) } } })
    const wrapper = mount(MasterDataEntities, options); await flushPromises()
    await button(wrapper, '新建实体定义').trigger('click'); await flushPromises()
    await button(wrapper, '保存定义').trigger('click'); await flushPromises()
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('编码已存在'); expect(button(wrapper, '保存定义')).toBeTruthy(); wrapper.unmount()
  })
  it('submits ownership through the existing catalog API, never client writer', async () => {
    mocks.list.mockResolvedValue({ total: 1, items: [entity] })
    const wrapper = mount(StandardFieldDrawer, { ...options, props: { modelValue: true, fieldId: null, entityId: 1 } }); await flushPromises()
    wrapper.findComponent(StandardFieldDefinitionForm).vm.$emit('update:modelValue', { field_code: 'work_location', field_name: '工作地', business_definition: 'Person工作地', entity_id: 1, data_type: 'enum', category_ids: [], value_domain: { items: [] } })
    await flushPromises(); await button(wrapper, '保存字段').trigger('click'); await flushPromises()
    expect(mocks.post).toHaveBeenCalledWith('/warehouse/standard-fields', expect.objectContaining({ entity_id: 1, field_code: 'work_location', data_type: 'enum' }))
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('writer'); wrapper.unmount()
  })
})
