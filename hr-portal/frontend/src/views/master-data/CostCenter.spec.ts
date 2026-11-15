import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import CostCenter from './CostCenter.vue'
import CostCenterCreateDialog from '@/components/master-data/CostCenterCreateDialog.vue'

const api = vi.hoisted(() => ({ costCenterDirectory: vi.fn(), createCostCenter: vi.fn() }))
vi.mock('@/api/data', () => ({ treesApi: api, TreeNode: undefined }))

const store = reactive({ user: { id: 1 }, menus: [{ code: 'people.cost_center', can_create: true }], hasOp: (_menu: string, _op: string) => store.menus.some(m => m.code === _menu && m.can_create) })
vi.mock('@/stores/user', () => ({ useUserStore: () => store }))

const stubs = {
  PageTitle: defineComponent({ props: ['title', 'description'], template: '<div class="page-title">{{ title }}<p>{{ description }}</p></div>' }),
  UiSurface: defineComponent({ template: '<div><slot/></div>' }),
  SearchInput: defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' }),
  OrganizationTree: defineComponent({ props: ['nodes', 'searching', 'mode'], template: '<div class="org-tree" :data-mode="mode">{{ nodes.length }}</div>' }),
  ElAlert: defineComponent({ props: ['title', 'type'], template: '<p class="alert">{{ title }}</p>' }),
  ElCheckbox: defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />' }),
  ElEmpty: defineComponent({ props: ['description'], template: '<p class="empty">{{ description }}</p>' }),
  ElTreeSelect: defineComponent({ props: ['modelValue', 'data'], emits: ['update:modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', Number($event.target.value))"><option v-for="item in data" :key="item.value" :value="item.value" :disabled="item.disabled">{{ item.label }}</option></select>' }),
}
const options = { global: { stubs, directives: { loading: () => {} } } }
const tree = [
  { id: 1, code: 'C1', name: '一级成本中心', parent_id: null, level: 1, is_leaf: false, is_active: true, synced_at: '2026-11-11T08:00:00+00:00', children: [] },
]

beforeEach(() => {
  vi.resetAllMocks()
  store.menus = [{ code: 'people.cost_center', can_create: true }]
  api.costCenterDirectory.mockResolvedValue({ tree, warnings: [] })
})

describe('cost center directory shell', () => {
  it('opens the form, saves a trimmed code and stable parent id, then refreshes the directory', async () => {
    api.createCostCenter.mockResolvedValueOnce({ ...tree[0], id: 2, code: 'C2' })
    const wrapper = mount(CostCenter, { ...options, attachTo: document.body }); await flushPromises()
    await wrapper.get('.cost-center__create').trigger('click'); await flushPromises()
    const dialog = wrapper.getComponent(CostCenterCreateDialog)
    const vm = dialog.vm as any
    vm.name = ' 新中心 '; vm.code = ' C2 '; vm.parentId = 1
    await flushPromises()
    const confirm = document.querySelector<HTMLButtonElement>('.cost-center-form__actions button:last-child')!
    expect(confirm.disabled).toBe(false)
    confirm.click(); await flushPromises()
    expect(api.createCostCenter).toHaveBeenCalledWith({ name: '新中心', code: 'C2', parent_id: 1 })
    expect(api.costCenterDirectory).toHaveBeenCalledWith(true)
    expect(api.costCenterDirectory.mock.calls.filter(([inactive]) => inactive === false)).toHaveLength(2)
    expect((wrapper.vm as any).creating).toBe(false)
    wrapper.unmount()
  })

  it('keeps duplicate-code errors in the open form without refreshing the tree', async () => {
    api.createCostCenter.mockRejectedValueOnce({ response: { status: 409, data: { detail: '成本中心编码已存在' } } })
    const wrapper = mount(CostCenter, options); await flushPromises()
    await wrapper.get('.cost-center__create').trigger('click'); await flushPromises()
    const vm = wrapper.getComponent(CostCenterCreateDialog).vm as any
    vm.name = '新中心'; vm.code = 'C1'
    await vm.save(); await flushPromises()
    expect(vm.codeError).toContain('编码已存在')
    expect((wrapper.vm as any).creating).toBe(true)
    expect(api.costCenterDirectory.mock.calls.filter(([inactive]) => inactive === false)).toHaveLength(1)
    wrapper.unmount()
  })

  it('does not send a create request without create permission or required fields', async () => {
    const wrapper = mount(CostCenter, options); await flushPromises()
    await wrapper.get('.cost-center__create').trigger('click'); await flushPromises()
    const vm = wrapper.getComponent(CostCenterCreateDialog).vm as any
    await vm.save()
    expect(vm.nameError).toBeTruthy(); expect(vm.codeError).toBeTruthy()
    store.menus = [{ code: 'people.cost_center', can_create: false }]
    vm.name = '新中心'; vm.code = 'C2'
    await vm.save()
    expect(api.createCostCenter).not.toHaveBeenCalled()
    wrapper.unmount()
  })
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

  it('keeps toolbar and table headers visible while showing health issues', async () => {
    api.costCenterDirectory.mockRejectedValueOnce({ response: { data: { detail: {
      message: '成本中心树未通过健康校验，已拒绝返回目录',
      issues: [
        { code: 'duplicate_path', message: '名称路径重复，后代展开可能扩大授权', node_id: 2, node_code: 'A1-1' },
        { code: 'active_under_inactive', message: '启用节点不能挂在停用父节点下', node_id: 3, node_code: 'B1-1' },
      ],
    } } } })
    const wrapper = mount(CostCenter, options); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.error).toContain('未通过健康校验')
    expect(vm.issues).toHaveLength(2)
    // 表头壳（OrganizationTree）与工具栏在错误时仍然渲染
    expect(wrapper.find('.org-tree').exists()).toBe(true)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(true)
    // issues 明细渲染
    expect(wrapper.text()).toContain('duplicate_path')
    expect(wrapper.text()).toContain('active_under_inactive')
    wrapper.unmount()
  })

  it('renders tree with warnings banner when health issues are non-blocking', async () => {
    api.costCenterDirectory.mockResolvedValueOnce({
      tree,
      warnings: [
        { code: 'duplicate_path', message: '名称路径重复，后代展开可能扩大授权', node_id: 2, node_code: 'A1-1' },
      ],
    })
    const wrapper = mount(CostCenter, options); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.error).toBe('')
    expect(vm.warnings).toHaveLength(1)
    // 树照常渲染 + 黄条（slot 内）展示规范提示
    expect(wrapper.find('.org-tree').exists()).toBe(true)
    expect(wrapper.text()).toContain('duplicate_path')
    wrapper.unmount()
  })
})
