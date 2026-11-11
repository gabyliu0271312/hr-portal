import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import CostCenter from './CostCenter.vue'

const api = vi.hoisted(() => ({ costCenterDirectory: vi.fn() }))
vi.mock('@/api/data', () => ({ treesApi: api, TreeNode: undefined }))

const store = reactive({ user: { id: 1 }, menus: [{ code: 'people.cost_center' }] })
vi.mock('@/stores/user', () => ({ useUserStore: () => store }))

const stubs = {
  PageTitle: defineComponent({ props: ['title', 'description'], template: '<div class="page-title">{{ title }}<p>{{ description }}</p></div>' }),
  UiSurface: defineComponent({ template: '<div><slot/></div>' }),
  SearchInput: defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' }),
  OrganizationTree: defineComponent({ props: ['nodes', 'searching', 'mode'], template: '<div class="org-tree" :data-mode="mode">{{ nodes.length }}</div>' }),
  ElAlert: defineComponent({ props: ['title', 'type'], template: '<p class="alert">{{ title }}</p>' }),
  ElCheckbox: defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />' }),
  ElEmpty: defineComponent({ props: ['description'], template: '<p class="empty">{{ description }}</p>' }),
}
const options = { global: { stubs, directives: { loading: () => {} } } }
const tree = [
  { id: 1, code: 'C1', name: '一级成本中心', parent_id: null, level: 1, is_leaf: false, is_active: true, synced_at: '2026-11-11T08:00:00+00:00', children: [] },
]

beforeEach(() => {
  vi.resetAllMocks()
  store.menus = [{ code: 'people.cost_center' }]
  api.costCenterDirectory.mockResolvedValue(tree)
})

describe('cost center directory shell', () => {
  it('loads tree and renders with cc mode when authorized', async () => {
    const wrapper = mount(CostCenter, options); await flushPromises()
    expect(api.costCenterDirectory).toHaveBeenCalledTimes(1)
    expect(api.costCenterDirectory).toHaveBeenCalledWith(false)
    expect(wrapper.text()).toContain('成本中心')
    expect(wrapper.text()).toContain('展示所有成本中心相关的信息')
    const treeStub = wrapper.find('.org-tree')
    expect(treeStub.attributes('data-mode')).toBe('cc')
    wrapper.unmount()
  })

  it('surfaces permission errors without crashing', async () => {
    api.costCenterDirectory.mockRejectedValueOnce({ response: { data: { detail: { message: '成本中心树未通过健康校验' } } } })
    const wrapper = mount(CostCenter, options); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.error).toBe('成本中心树未通过健康校验')
    expect(vm.trees).toHaveLength(0)
    wrapper.unmount()
  })
})
