import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive } from 'vue'
import CostCenter from './CostCenter.vue'
import CostCenterCreateDialog from '@/components/master-data/CostCenterCreateDialog.vue'

const api = vi.hoisted(() => ({
  costCenterDirectory: vi.fn(),
  createCostCenter: vi.fn(),
  updateCostCenter: vi.fn(),
  deleteCostCenter: vi.fn(),
}))
vi.mock('@/api/data', () => ({ treesApi: api, TreeNode: undefined }))

const hasOpField: Record<string, 'can_create' | 'can_update' | 'can_delete' | 'can_export'> = { C: 'can_create', U: 'can_update', D: 'can_delete', E: 'can_export' }
interface MenuRow { code: string; can_create: boolean; can_update: boolean; can_delete: boolean }
const menus = reactive<MenuRow[]>([{ code: 'people.cost_center', can_create: true, can_update: true, can_delete: true }])
const store = reactive<{ user: { id: number }; menus: MenuRow[]; hasOp: (menu: string, op: string) => boolean }>({
  user: { id: 1 },
  menus,
  hasOp: (menu: string, op: string): boolean => menus.some(m => m.code === menu && Boolean(m[hasOpField[op.toUpperCase()] as keyof MenuRow])),
})
vi.mock('@/stores/user', () => ({ useUserStore: () => store }))

const stubs = {
  PageTitle: defineComponent({ props: ['title', 'description'], template: '<div class="page-title">{{ title }}<p>{{ description }}</p></div>' }),
  UiSurface: defineComponent({ template: '<div><slot/></div>' }),
  SearchInput: defineComponent({ props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' }),
  OrganizationTree: defineComponent({ props: ['nodes', 'searching', 'mode', 'canEdit', 'canAddChild', 'canDelete'], emits: ['edit', 'add-child', 'delete'], template: '<div class="org-tree" :data-mode="mode">{{ nodes.length }}<button class="act-edit" @click="$emit(\'edit\', nodes[0])">编辑</button><button class="act-add" @click="$emit(\'add-child\', nodes[0])">添加子</button><button class="act-del" @click="$emit(\'delete\', nodes[0])">删除</button></div>' }),
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
  menus.length = 0; menus.push({ code: 'people.cost_center', can_create: true, can_update: true, can_delete: true })
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
    menus.length = 0; menus.push({ code: 'people.cost_center', can_create: false, can_update: false, can_delete: false })
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

  it('renders tree without showing non-blocking health warnings banner', async () => {
    api.costCenterDirectory.mockResolvedValueOnce({
      tree,
      warnings: [
        { code: 'duplicate_path', message: '名称路径重复，后代展开可能扩大授权', node_id: 2, node_code: 'A1-1' },
      ],
    })
    const wrapper = mount(CostCenter, options); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.error).toBe('')
    // 树照常渲染，不再展示规范提示横幅
    expect(wrapper.find('.org-tree').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('成本中心树存在数据规范提示')
    expect(wrapper.text()).not.toContain('duplicate_path')
    wrapper.unmount()
  })

  it('edits a cost center: pre-fills name and parent, code disabled, saves', async () => {
    api.updateCostCenter.mockResolvedValueOnce({ ...tree[0], name: '改名中心' })
    const wrapper = mount(CostCenter, options); await flushPromises()
    // 直接触发 onEdit：传含父级的节点，验证上级回显
    const vm = wrapper.vm as any
    vm.onEdit({ id: 2, code: 'C2', name: '子中心', parent_id: 1, level: 2, is_leaf: true, is_active: true, synced_at: null, children: [] })
    await flushPromises()
    expect(vm.editing).toBe(true)
    expect(vm.target).toMatchObject({ id: 2, parent_id: 1 })
    const dialog = wrapper.findAllComponents(CostCenterCreateDialog).find(d => d.vm.mode === 'edit')!
    expect(dialog.exists()).toBe(true)
    const dvm = dialog.vm as any
    expect(dvm.name).toBe('子中心')
    expect(dvm.code).toBe('C2')
    expect(dvm.parentId).toBe(1)
    dvm.name = '改名中心'
    await dvm.save(); await flushPromises()
    expect(api.updateCostCenter).toHaveBeenCalledWith(2, { name: '改名中心', parent_id: 1 })
    expect(api.costCenterDirectory).toHaveBeenCalledWith(false)
    wrapper.unmount()
  })

  it('adds a child: parent auto-set, name/code empty for the new child, creates with parent_id', async () => {
    api.createCostCenter.mockResolvedValueOnce({ ...tree[0], id: 3, code: 'C3' })
    const wrapper = mount(CostCenter, options); await flushPromises()
    await wrapper.get('.act-add').trigger('click'); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.addingChild).toBe(true)
    expect(vm.target).toMatchObject({ id: 1 })
    const dialog = wrapper.findAllComponents(CostCenterCreateDialog).find(d => d.vm.mode === 'addChild')!
    expect(dialog.exists()).toBe(true)
    const dvm = dialog.vm as any
    // 上级自动带出当前节点 id；名称/编码是新建子节点的填写项，应为空
    expect(dvm.parentId).toBe(1)
    expect(dvm.name).toBe('')
    expect(dvm.code).toBe('')
    dvm.name = '子中心'; dvm.code = 'C3'
    await dvm.save(); await flushPromises()
    expect(api.createCostCenter).toHaveBeenCalledWith({ name: '子中心', code: 'C3', parent_id: 1 })
    wrapper.unmount()
  })

  it('deletes a leaf: confirms and calls delete API, removes row locally without clearing the tree', async () => {
    api.deleteCostCenter.mockResolvedValueOnce(undefined)
    const wrapper = mount(CostCenter, options); await flushPromises()
    await wrapper.get('.act-del').trigger('click'); await flushPromises()
    const vm = wrapper.vm as any
    expect(vm.deleting).toBe(true)
    await vm.confirmDelete(); await flushPromises()
    expect(api.deleteCostCenter).toHaveBeenCalledWith(1)
    // 删除成功后：本地立即移除该节点，树不清空（避免闪屏）
    expect(vm.trees).toHaveLength(0)
    expect(vm.deleting).toBe(false)
    wrapper.unmount()
  })

  it('blocks delete with a single-button failure dialog when the cost center has children', async () => {
    const wrapper = mount(CostCenter, options); await flushPromises()
    const vm = wrapper.vm as any
    const parent = { id: 5, code: 'P', name: '父中心', parent_id: null, level: 1, is_leaf: false, is_active: true, synced_at: null, children: [{ id: 6, code: 'C6', name: '子', parent_id: 5, level: 2, is_leaf: true, is_active: true, synced_at: null, children: [] }] }
    vm.onDelete(parent)
    await flushPromises()
    // 有子节点：不弹确认，直接弹失败弹窗
    expect(vm.deleting).toBe(false)
    expect(vm.removeFailed).toBe(true)
    expect(api.deleteCostCenter).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
