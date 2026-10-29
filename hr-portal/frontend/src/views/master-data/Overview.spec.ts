import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import Overview from './Overview.vue'

const api = vi.hoisted(() => ({ overview: vi.fn(), records: vi.fn() }))
vi.mock('@/api/masterData', () => ({ masterDataApi: api }))

const store = reactive({ user: { id: 1 }, menus: [{ code: 'master_data.overview' }] })
vi.mock('@/stores/user', () => ({ useUserStore: () => store }))

const Box = defineComponent({ template: '<div><slot name="header"/><slot/><slot name="footer"/></div>' })
const stubs = {
  PermissionButton: defineComponent({ props: ['disabled'], template: '<button :disabled="disabled"><slot/></button>' }),
  ElAlert: defineComponent({ props: ['title'], template: '<p class="alert">{{ title }}</p>' }),
  ElTable: defineComponent({ props: ['data'], template: '<div class="table">{{ JSON.stringify(data) }}</div>' }),
  ElTableColumn: true, ElTag: true, ElDrawer: Box,
}
const options = { global: { stubs, directives: { loading: () => {} } } }
const published = { id: 1, entity_code: 'person', name: '人员', published: true, published_at: '2026-10-29T00:00:00Z', field_count: 1, source_count: 1, record_count: 2, last_record_at: '2026-10-29T10:00:00Z' }
const draft = { id: 2, entity_code: 'org', name: '组织', published: false, published_at: null, field_count: 0, source_count: 0, record_count: 0, last_record_at: null }

beforeEach(() => {
  vi.resetAllMocks()
  store.menus = [{ code: 'master_data.overview' }]
  api.overview.mockResolvedValue({ total: 2, items: [published, draft] })
  api.records.mockResolvedValue({ total: 2, fields: [{ id: 30, name: '工作地', code: 'work_location' }], items: [{ id: 1, revision: 0, created_at: '', values: { '30': 'site-a' } }] })
})

describe('master data overview shell', () => {
  it('shows entity intake counts and does not call records on load', async () => {
    const wrapper = mount(Overview, options); await flushPromises()
    expect(api.overview).toHaveBeenCalledTimes(1)
    expect(api.records).not.toHaveBeenCalled()
    const vm = wrapper.vm as any
    expect(vm.items).toHaveLength(2)
    expect(vm.items[0]).toMatchObject({ name: '人员', published: true, record_count: 2 })
    expect(wrapper.html()).toContain('人员')
    wrapper.unmount()
  })
  it('opens records for an entity and surfaces permission errors', async () => {
    const wrapper = mount(Overview, options); await flushPromises()
    const vm = wrapper.vm as any
    await vm.showRecords(published); await flushPromises()
    expect(api.records).toHaveBeenCalledWith(1, { offset: 0, limit: 20 })
    expect(vm.detail.page.total).toBe(2)
    api.records.mockRejectedValueOnce({ response: { data: { detail: { message: '记录不存在或无权访问' } } } })
    await vm.showRecords(published); await flushPromises()
    expect(vm.detail.error).toBe('记录不存在或无权访问')
    expect(vm.detail.page).toBeNull()
    wrapper.unmount()
  })
  it('does not request data without the module permission', async () => {
    store.menus = []
    const wrapper = mount(Overview, options); await flushPromises()
    expect(api.overview).not.toHaveBeenCalled()
    expect((wrapper.vm as any).canView).toBe(false)
    wrapper.unmount()
  })
})
