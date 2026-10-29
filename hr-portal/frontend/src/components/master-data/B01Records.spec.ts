import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import RecordEntityRecords from './RecordEntityRecords.vue'
import RecordAccessEditor from './RecordAccessEditor.vue'
import PersonReferencePicker from './PersonReferencePicker.vue'
import EntityDefinitionList from './EntityDefinitionList.vue'
import MasterDataEntities from '@/views/system/MasterDataEntities.vue'
import Scopes from '@/views/system/Scopes.vue'

const api = vi.hoisted(() => ({ recordEntities: vi.fn(), records: vi.fn(), record: vi.fn(), list: vi.fn(), publish: vi.fn(), recordAccess: vi.fn(), setUserRecordAccess: vi.fn(), scopes: vi.fn(), createScope: vi.fn(), updateScope: vi.fn(), persons: vi.fn() }))
vi.mock('@/api/masterData', () => ({ masterDataApi: api }))
vi.mock('@/api/scopes', () => ({ scopesApi: { list: api.scopes, create: api.createScope, update: api.updateScope } }))
vi.mock('@/api/data', () => ({ treesApi: { costCenter: vi.fn().mockResolvedValue([]), org: vi.fn().mockResolvedValue([]) }, distinctApi: { persons: api.persons, employmentTypes: vi.fn().mockResolvedValue([]), employmentEntities: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/client', () => ({ api: { get: vi.fn().mockResolvedValue({ data: { items: [], total: 0 } }) } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() }, ElMessageBox: { confirm: vi.fn() } }))
const store = reactive({ user: { id: 7 }, menus: [{ code: 'system.master_entities' }, { code: 'system.scopes' }], writable: true, hasOp: () => store.writable })
vi.mock('@/stores/user', () => ({ useUserStore: () => store }))
const Box = defineComponent({ template: '<div><slot name="header"/><slot/><slot name="footer"/></div>' })
const Button = defineComponent({ props: ['disabled', 'op', 'menu'], template: '<button :disabled="disabled"><slot/></button>' })
const stubs = { PermissionButton: Button, ElCard: Box, ElForm: Box, ElFormItem: Box, ElDrawer: Box, ElTable: defineComponent({ props: ['data'], template: '<div>{{ JSON.stringify(data) }}<slot/></div>' }), ElTableColumn: true, ElPagination: true, ElInput: true, ElInputNumber: true, ElSelect: true, ElOption: true, ElEmpty: true, ElDescriptions: Box, ElDescriptionsItem: Box, ElAlert: defineComponent({ props: ['title'], template: '<p>{{ title }}</p>' }), ElCheckbox: true, ElSwitch: true, ElIcon: true, ElButton: Button, HierarchyTreePicker: true }
const options = { global: { stubs, directives: { loading: () => {} } } }
const entity = { id: 12, name: '人员', entity_code: 'person', revision: 4, is_active: true, description: '定义' }
const records = { total: 42, fields: [{ id: 5, name: '工作地', code: 'work_location' }], items: [{ id: 9, revision: 0, created_at: '2026-10-29T00:00:00Z', values: { '5': 'SYNTHETIC' } }] }
const oldTag = { id: 3, name: '旧标签', description: '', dimension: 'org', org_scope_enabled: false, org_scope_unlimited: false, selections: [], person_scope_enabled: true, filters: [{ field_code: 'person', operator: 'eq', values: ['旧姓名'] }], person_references: [], used_by_users: 0, created_at: '', updated_at: '' }
const click = async (wrapper: ReturnType<typeof mount>, label: string) => { await wrapper.findAll('button').find(b => b.text() === label)!.trigger('click'); await flushPromises() }
beforeEach(() => {
  vi.clearAllMocks(); store.user = { id: 7 }; store.writable = true; store.menus = [{ code: 'system.master_entities' }, { code: 'system.scopes' }]
  api.recordEntities.mockResolvedValue({ items: [entity], total: 1 }); api.records.mockResolvedValue(records); api.record.mockResolvedValue(records)
  api.list.mockResolvedValue({ items: [entity], total: 1 }); api.recordAccess.mockResolvedValue({ user_ids: [21], role_ids: [4] }); api.setUserRecordAccess.mockResolvedValue({ ok: true })
  api.scopes.mockResolvedValue([]); api.createScope.mockResolvedValue({}); api.updateScope.mockResolvedValue({})
})

describe('B01.b read-only records and access', () => {
  it('reads ACL entities independently of definition owner and paginates with the field-ID contract', async () => {
    const wrapper = mount(RecordEntityRecords, options); await flushPromises()
    expect(api.list).not.toHaveBeenCalled(); expect(api.records).toHaveBeenCalledWith(12, { offset: 0, limit: 20 })
    expect(wrapper.text()).toContain('SYNTHETIC'); expect(wrapper.text()).not.toContain('新增记录')
    wrapper.findComponent({ name: 'ElPagination' }).exists()
    ;(wrapper.vm as any).page = 2; await flushPromises()
    expect(api.records).toHaveBeenLastCalledWith(12, { offset: 20, limit: 20 }); wrapper.unmount()
  })
  it('clears records and fields on errors, rejecting late data after identity changes', async () => {
    const wrapper = mount(RecordEntityRecords, options); await flushPromises()
    let resolve!: (value: unknown) => void
    api.records.mockReturnValueOnce(new Promise(r => { resolve = r }))
    void (wrapper.vm as any).loadRecords(); await flushPromises()
    api.recordEntities.mockResolvedValue({ items: [], total: 0 }); store.user = { id: 8 }; await flushPromises()
    resolve(records); await flushPromises()
    expect(wrapper.text()).not.toContain('SYNTHETIC'); wrapper.unmount()
  })
  it('uses detail API and clears stale results when detail becomes forbidden', async () => {
    const wrapper = mount(RecordEntityRecords, options); await flushPromises()
    await (wrapper.vm as any).showDetail(9); await flushPromises()
    expect(api.record).toHaveBeenCalledWith(12, 9); expect(wrapper.text()).toContain('记录详情 · 9')
    api.record.mockRejectedValue({ response: { status: 404, data: { detail: '记录不存在或无权访问' } } })
    await (wrapper.vm as any).showDetail(9); await flushPromises()
    expect(wrapper.text()).not.toContain('SYNTHETIC'); expect(api.record).toHaveBeenLastCalledWith(12, 9); wrapper.unmount()
  })
  it('does not request business data without menu access', async () => {
    store.menus = []
    api.recordEntities.mockClear(); api.records.mockClear()
    const wrapper = mount(RecordEntityRecords, options); await flushPromises()
    expect(api.recordEntities).not.toHaveBeenCalled(); expect(api.records).not.toHaveBeenCalled(); wrapper.unmount()
  })
  it('uses the narrow user grant API without replacing role or other-user ACLs', async () => {
    const wrapper = mount(RecordAccessEditor, { ...options, props: { userId: 21, enabled: true } }); await flushPromises()
    await click(wrapper, '撤销直接授权')
    expect(api.setUserRecordAccess).toHaveBeenCalledWith(12, 21, false)
    expect(wrapper.text()).toContain('未直接授权'); wrapper.unmount()
  })
  it('keeps failed ACL writes unusable until reload and ignores late ACL responses', async () => {
    const wrapper = mount(RecordAccessEditor, { ...options, props: { userId: 21, enabled: true } }); await flushPromises()
    api.setUserRecordAccess.mockRejectedValue({ response: { data: { detail: '拒绝授权' } } })
    await click(wrapper, '撤销直接授权'); expect(api.setUserRecordAccess).toHaveBeenCalledWith(12, 21, false); expect(wrapper.text()).not.toContain('撤销直接授权')
    let resolve!: (value: unknown) => void
    api.recordAccess.mockReturnValueOnce(new Promise(r => { resolve = r }))
    void (wrapper.vm as any).loadAccess(); await flushPromises(); await wrapper.setProps({ enabled: false })
    resolve({ user_ids: [21], role_ids: [] }); await flushPromises(); expect(wrapper.text()).toBe(''); wrapper.unmount()
  })
  it('publishes with revision and displays published status', async () => {
    api.publish.mockResolvedValue({ ...entity, revision: 5, published_at: '2026-10-29T00:00:00Z' })
    const wrapper = mount(MasterDataEntities, options); await flushPromises()
    wrapper.findComponent(EntityDefinitionList).vm.$emit('publish', entity); await flushPromises()
    expect(api.publish).toHaveBeenCalledWith(12, 4)
    expect(wrapper.findComponent(EntityDefinitionList).props('items')[0].published_at).toBeTruthy(); wrapper.unmount()
  })
})

describe('B01.b stable Person scopes', () => {
  it('creates a standalone stable-ID scope and never searches names', async () => {
    const wrapper = mount(Scopes, options); await flushPromises(); await click(wrapper, '新建稳定人员标签')
    ;(wrapper.vm as any).form.name = '合成人员范围'
    wrapper.findComponent(PersonReferencePicker).vm.$emit('update:modelValue', [{ entity_id: 12, record_id: 9 }]); await flushPromises(); await click(wrapper, '保存')
    expect(api.createScope).toHaveBeenCalledWith(expect.objectContaining({ dimension: 'org', org_scope_enabled: false, person_scope_enabled: true, filters: [], person_references: [{ entity_id: 12, record_id: 9 }] }))
    expect(api.persons).not.toHaveBeenCalled(); wrapper.unmount()
  })
  it('round-trips new references when editing and preserves legacy text filters', async () => {
    const wrapper = mount(Scopes, options); await flushPromises()
    const vm = wrapper.vm as any
    vm.openEdit({ ...oldTag, filters: [], person_references: [{ entity_id: 12, record_id: 9 }] }); await flushPromises(); await click(wrapper, '保存')
    expect(api.updateScope).toHaveBeenLastCalledWith(3, expect.objectContaining({ person_references: [{ entity_id: 12, record_id: 9 }], filters: [] }))
    vm.openEdit(oldTag); await flushPromises(); await click(wrapper, '保存')
    expect(api.updateScope).toHaveBeenLastCalledWith(3, expect.objectContaining({ person_references: [], filters: [{ field_code: 'person', operator: 'eq', values: ['旧姓名'], order_index: 0 }] })); wrapper.unmount()
  })
  it('validates positive unique references without mapping names or requesting candidates', async () => {
    const wrapper = mount(PersonReferencePicker, { ...options, props: { modelValue: [], op: 'C' } }); const vm = wrapper.vm as any
    vm.entityId = -1; vm.recordId = 9; await click(wrapper, '添加记录引用'); expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    vm.entityId = 12; await click(wrapper, '添加记录引用'); expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([[{ entity_id: 12, record_id: 9 }]])
    wrapper.unmount()
  })
})
