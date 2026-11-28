import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import pageSource from './PerformanceRoleConfiguration.vue?raw'
import PerformanceRoleConfiguration from './PerformanceRoleConfiguration.vue'

const performanceRoleApi = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), updateStatus: vi.fn(), remove: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceRoleApi }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const stubs = {
  PerformanceListToolbar: {
    props: ['keyword', 'searchPlaceholder', 'searchAriaLabel', 'filterActive', 'filterCount'],
    emits: ['update:keyword', 'filter'],
    template: '<div class="role-toolbar" :data-filter-count="filterCount"><slot name="left" /><input :value="keyword" :placeholder="searchPlaceholder" :aria-label="searchAriaLabel" @input="$emit(\'update:keyword\', $event.target.value)" /><button class="toolbar-filter" type="button" @click="$emit(\'filter\', $event.target)">筛选</button><slot name="actions" /></div>',
  },
  PerformanceCreateButton: {
    template: '<button class="create-button"><slot /><span>{{ label }}</span></button>',
    props: ['label'],
  },
  PerformanceRoleFormDialog: {
    props: ['modelValue', 'title', 'initial', 'loading'],
    emits: ['update:modelValue', 'submit'],
    template: '<div v-if="modelValue" class="role-form-dialog" :data-title="title" :data-initial="initial.name.zh"><button class="role-form-confirm" type="button" @click="$emit(\'submit\', { name: { zh: initial.name.zh, en: initial.name.en }, description: { zh: initial.description.zh, en: initial.description.en } })">确定</button><button class="role-form-cancel" type="button" @click="$emit(\'update:modelValue\', false)">取消</button></div>',
  },
  PerformanceExportIcon: { template: '<svg class="export-icon" />' },
  UiButton: {
    props: ['disabled'],
    template: '<button class="performance-button" :disabled="disabled"><slot /></button>',
  },
  PerformanceManagementTable: {
    props: ['rows', 'columns', 'emptyText', 'total'],
    template: '<div class="role-table" :data-total="total"><div v-for="col in columns" :key="col.key" class="table-column">{{ col.label }}</div><div v-for="row in rows" :key="row.id" class="role-row"><template v-for="col in columns" :key="col.key"><slot name="cell" :row="row" :column="col" :value="row[col.key]"></slot></template></div><div v-if="!rows.length" class="empty">{{ emptyText }}</div></div>',
  },
  PerformancePermissionButton: {
    props: ['disabled'],
    emits: ['click'],
    template: '<button class="permission-button" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  ElDropdown: {
    emits: ['command'],
    template: '<div class="el-dropdown"><slot /><slot name="dropdown" /></div>',
  },
  ElDropdownMenu: { template: '<div class="dropdown-menu"><slot /></div>' },
  ElDropdownItem: {
    props: ['disabled'],
    emits: ['click'],
    template: '<button class="dropdown-item" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  },
  ElTooltip: { template: '<div><slot /></div>' },
  PerformanceFilterPopover: {
    props: ['visible', 'anchor', 'width', 'bodyPadding'],
    emits: ['close'],
    template: '<div v-if="visible" class="filter-popover" :data-width="width" :data-body-padding="bodyPadding"><slot /><slot name="footer" /></div>',
  },
  PerformanceFilterField: {
    props: ['field', 'modelValue'],
    emits: ['update:modelValue'],
    template: '<div class="filter-field"><span>{{ field.label }}</span><button v-for="o in field.options" :key="o.value" class="field-option" :class="{ selected: modelValue.includes(o.value) }" :data-value="o.value" @click="$emit(\'update:modelValue\', [$event.currentTarget.dataset.value])">{{ o.label }}</button></div>',
  },
  PerformanceFilterActions: {
    props: ['size', 'showClear'],
    emits: ['confirm', 'cancel', 'clear'],
    template: '<div class="filter-actions" :data-size="size"><button class="fa-confirm" @click="$emit(\'confirm\')">确定</button><button class="fa-cancel" @click="$emit(\'cancel\')">取消</button><button v-if="showClear" class="fa-clear" @click="$emit(\'clear\')">清除</button></div>',
  },
}

describe('PerformanceRoleConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    performanceRoleApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    performanceRoleApi.create.mockResolvedValue({})
    performanceRoleApi.update.mockResolvedValue({})
    performanceRoleApi.updateStatus.mockResolvedValue({})
    performanceRoleApi.remove.mockResolvedValue(undefined)
  })

  it('renders the role configuration framework without fixture rows', () => {
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })

    expect(wrapper.get('h1').text()).toBe('角色配置')
    expect(wrapper.find('[role="tablist"]').text()).toContain('管理角色')
    expect(wrapper.find('[role="tablist"]').text()).toContain('评估角色')
    expect(wrapper.find('input[placeholder="通过角色名称搜索"]').exists()).toBe(true)
    expect(wrapper.find('.create-button').text()).toContain('新建角色')
    expect(wrapper.find('.export-icon').exists()).toBe(true)
    expect(wrapper.find('.role-table').attributes('data-total')).toBe('0')
    expect(wrapper.find('.empty').text()).toBe('暂无管理角色')
    const columnLabels = wrapper.findAll('.table-column').map(column => column.text().replace(/编辑停用···?$/, ''))
    expect(columnLabels).toEqual(expect.arrayContaining(['角色', '描述', '状态', '更新人', '最近更新时间']))
    expect(wrapper.findAll('.table-column').some(column => column.text().startsWith('操作'))).toBe(true)
    expect(pageSource).toContain('PerformanceListToolbar')
    expect(pageSource).toContain('PerformanceCreateButton')
    expect(pageSource).toContain('PerformanceExportButton')
  })

  it('exports all 101 searched roles across pages and rejects a failed page', async () => {
    const all = Array.from({ length: 101 }, (_, index) => ({ id: index + 1, name: `角色${index}`, description: '', is_active: true, updated_at: '2026-11-04T00:00:00Z' }))
    performanceRoleApi.list.mockImplementation(async (_keyword, page, size) => ({ items: all.slice((page - 1) * size, page * size), total: all.length }))
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await flushPromises()
    await wrapper.get('input').setValue('角色')
    await flushPromises()
    const loadRows = wrapper.getComponent({ name: 'PerformanceExportButton' }).props('loadRows') as () => Promise<string[][]>
    const rows = await loadRows()
    expect(rows).toHaveLength(102)
    expect(rows.at(-1)?.[0]).toBe('角色100')
    expect(performanceRoleApi.list).toHaveBeenLastCalledWith('角色', 2, 100, 'MANAGEMENT', undefined)
    performanceRoleApi.list.mockResolvedValueOnce({ items: all.slice(0, 100), total: 101 }).mockRejectedValueOnce(new Error('network'))
    await expect(loadRows()).rejects.toThrow('network')
    wrapper.unmount()
  })

  it('renders the assessment role table contract with hint, add button and preset rows', async () => {
    performanceRoleApi.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 10 }).mockResolvedValueOnce({
      items: [{ id: 1, code: 'assessment.reviewee', name: '被评估人', description: '系统预置角色', role_type: 'ASSESSMENT', member_source: '员工本人', is_system: true, is_active: true, updated_at: '2026-09-23T00:00:00Z', function_permission_keys: [] }],
      total: 1,
      page: 1,
      page_size: 10,
    })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()

    const assessmentLabels = wrapper.findAll('.table-column').map(column => column.text().replace(/被评估人|员工本人|已启用|--|^操作编辑停用$/g, '').trim())
    expect(assessmentLabels).toEqual(
      expect.arrayContaining(['角色', '描述', '如何指定角色成员', '状态', '更新人', '最近更新时间']),
    )
    expect(wrapper.text()).toContain('评估角色可以在绩效模板中被设为环节执行人')
    expect(wrapper.get('.create-button').text()).toContain('添加评估角色')
    expect(wrapper.text()).toContain('被评估人')
    expect(wrapper.text()).toContain('员工本人')
    expect(performanceRoleApi.list).toHaveBeenCalledWith('', 1, 10, 'ASSESSMENT', undefined)
    expect(wrapper.findAll('.performance-button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.findAll('.permission-button')).toHaveLength(0)
    expect(wrapper.findAll('.table-column')).toHaveLength(7)
  })

  it('blocks deletion while active and refreshes after deactivation and confirmed deletion', async () => {
    const active = { id: 8, code: 'custom.test', name: '自定义角色', description: '', role_type: 'MANAGEMENT', member_source: null, is_system: false, is_active: true, updated_at: '2026-10-20T00:00:00Z', function_permission_keys: [] }
    performanceRoleApi.list
      .mockResolvedValueOnce({ items: [active], total: 1, page: 1, page_size: 10 })
      .mockResolvedValueOnce({ items: [{ ...active, is_active: false }], total: 1, page: 1, page_size: 10 })
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('.dropdown-item[disabled]').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'PerformanceDisabledReason' }).props('reason')).toBe('需要先停用角色，再进行删除')
    expect(wrapper.text()).toContain('停用')
    await wrapper.get('.permission-button[aria-label="停用角色"]').trigger('click')
    await flushPromises()
    expect(performanceRoleApi.updateStatus).toHaveBeenCalledWith(8, false)
    expect(wrapper.get('.dropdown-item').attributes('disabled')).toBeUndefined()
    await wrapper.get('.dropdown-item').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('确定删除吗？')
    expect(document.body.textContent).toContain('删除后，该角色将从角色管理页面移除')
    expect(performanceRoleApi.remove).not.toHaveBeenCalled()
    ;(document.querySelector('.performance-confirm-dialog__button--cancel') as HTMLButtonElement).click()
    await flushPromises()
    expect(performanceRoleApi.remove).not.toHaveBeenCalled()
    await wrapper.get('.dropdown-item').trigger('click')
    ;(document.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(performanceRoleApi.remove).toHaveBeenCalledOnce()
    expect(performanceRoleApi.remove).toHaveBeenCalledWith(8)
    expect(wrapper.text()).toContain('暂无管理角色')
    wrapper.unmount()
  })

  it('applies a status filter on the management tab and marks the filter active', async () => {
    performanceRoleApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await flushPromises()
    await wrapper.get('.toolbar-filter').trigger('click')

    expect(wrapper.find('.filter-popover').exists()).toBe(true)
    expect(wrapper.find('.filter-field').text()).toContain('状态')
    expect(wrapper.get('.filter-actions').attributes('data-size')).toBe('small')
    expect(wrapper.find('.fa-clear').exists()).toBe(true)

    await wrapper.get('.field-option[data-value="active"]').trigger('click')
    await wrapper.get('.fa-confirm').trigger('click')
    await flushPromises()

    expect(performanceRoleApi.list).toHaveBeenLastCalledWith('', 1, 10, 'MANAGEMENT', true)
    expect(wrapper.find('.filter-popover').exists()).toBe(false)
    expect(wrapper.get('.role-toolbar').attributes('data-filter-count')).toBe('1')
    wrapper.unmount()
  })

  it('cancels the filter draft without reloading and keeps the applied list untouched', async () => {
    performanceRoleApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await flushPromises()
    await wrapper.get('.toolbar-filter').trigger('click')
    await wrapper.get('.field-option[data-value="inactive"]').trigger('click')
    await wrapper.get('.fa-cancel').trigger('click')
    await flushPromises()

    expect(wrapper.find('.filter-popover').exists()).toBe(false)
    expect(performanceRoleApi.list).toHaveBeenLastCalledWith('', 1, 10, 'MANAGEMENT', undefined)
    expect(wrapper.get('.role-toolbar').attributes('data-filter-count')).toBe('0')
    wrapper.unmount()
  })

  it('clears the draft and keeps the popover open', async () => {
    performanceRoleApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await flushPromises()
    await wrapper.get('.toolbar-filter').trigger('click')
    await wrapper.get('.field-option[data-value="active"]').trigger('click')
    expect(wrapper.findAll('.field-option.selected')).toHaveLength(1)
    await wrapper.get('.fa-clear').trigger('click')

    expect(wrapper.find('.filter-popover').exists()).toBe(true)
    expect(wrapper.findAll('.field-option.selected')).toHaveLength(0)
    wrapper.unmount()
  })

  it('renders the assessment tab filter popover with wide actions and no clear button', async () => {
    performanceRoleApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await flushPromises()
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()
    await wrapper.get('.toolbar-filter').trigger('click')

    expect(wrapper.get('.filter-popover').attributes('data-width')).toBe('var(--performance-filter-popover-max-width)')
    expect(wrapper.get('.filter-popover').attributes('data-body-padding')).toBe('var(--performance-filter-body-padding-compact)')
    expect(wrapper.get('.filter-actions').attributes('data-size')).toBe('default')
    expect(wrapper.find('.fa-clear').exists()).toBe(false)
    wrapper.unmount()
  })

  it('resets the applied status filter when switching tabs', async () => {
    performanceRoleApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await flushPromises()
    await wrapper.get('.toolbar-filter').trigger('click')
    await wrapper.get('.field-option[data-value="active"]').trigger('click')
    await wrapper.get('.fa-confirm').trigger('click')
    await flushPromises()
    expect(wrapper.get('.role-toolbar').attributes('data-filter-count')).toBe('1')

    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('.role-toolbar').attributes('data-filter-count')).toBe('0')
    expect(performanceRoleApi.list).toHaveBeenLastCalledWith('', 1, 10, 'ASSESSMENT', undefined)
    wrapper.unmount()
  })

  it('opens the add assessment dialog and creates a role with ASSESSMENT type', async () => {
    performanceRoleApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await flushPromises()
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.role-form-dialog').exists()).toBe(false)
    await wrapper.get('.create-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.role-form-dialog').exists()).toBe(true)
    expect(wrapper.get('.role-form-dialog').attributes('data-title')).toBe('添加评估角色')
    await wrapper.get('.role-form-confirm').trigger('click')
    await flushPromises()
    expect(performanceRoleApi.create).toHaveBeenCalledWith(expect.objectContaining({ role_type: 'ASSESSMENT' }))
    wrapper.unmount()
  })

  it('edits an assessment role with prefilled values', async () => {
    const custom = { id: 9, code: 'custom.x', name: '自定义评估角色', name_en: 'Custom', description: '描述', description_en: 'Desc', role_type: 'ASSESSMENT', member_source: '在周期中导入', is_system: false, is_active: true, updated_at: '2026-10-20T00:00:00Z', function_permission_keys: [] }
    performanceRoleApi.list
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 10 })
      .mockResolvedValueOnce({ items: [custom], total: 1, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await flushPromises()
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()
    await wrapper.get('.performance-button[aria-label="编辑角色"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('.role-form-dialog').attributes('data-title')).toBe('编辑评估角色')
    expect(wrapper.get('.role-form-dialog').attributes('data-initial')).toBe('自定义评估角色')
    await wrapper.get('.role-form-confirm').trigger('click')
    await flushPromises()
    expect(performanceRoleApi.update).toHaveBeenCalledWith(9, expect.objectContaining({ name: '自定义评估角色', name_en: 'Custom' }))
    wrapper.unmount()
  })

  it('copies an assessment role with a suffixed name', async () => {
    const custom = { id: 10, code: 'custom.y', name: '校准辅助', name_en: '', description: '描述', role_type: 'ASSESSMENT', member_source: '在周期中导入', is_system: false, is_active: true, updated_at: '2026-10-20T00:00:00Z', function_permission_keys: [] }
    performanceRoleApi.list
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 10 })
      .mockResolvedValueOnce({ items: [custom], total: 1, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await flushPromises()
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()
    await wrapper.get('.role-more-button').trigger('click')
    await wrapper.findAll('.dropdown-item').find(item => item.attributes('disabled') === undefined)!.trigger('click')
    await flushPromises()
    expect(wrapper.get('.role-form-dialog').attributes('data-initial')).toBe('校准辅助 副本')
    await wrapper.get('.role-form-confirm').trigger('click')
    await flushPromises()
    expect(performanceRoleApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: '校准辅助 副本', role_type: 'ASSESSMENT' }))
    wrapper.unmount()
  })

  it('deactivates an assessment role through the confirm dialog', async () => {
    const custom = { id: 11, code: 'custom.z', name: '停用测试', description: '', role_type: 'ASSESSMENT', member_source: '在周期中导入', is_system: false, is_active: true, updated_at: '2026-10-20T00:00:00Z', function_permission_keys: [] }
    performanceRoleApi.list
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 10 })
      .mockResolvedValueOnce({ items: [custom], total: 1, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs }, attachTo: document.body })
    await flushPromises()
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()
    await wrapper.get('.performance-button[aria-label="停用角色"]').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('确定停用「停用测试」吗？')
    ;(document.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(performanceRoleApi.updateStatus).toHaveBeenCalledWith(11, false)
    wrapper.unmount()
  })

  it('deletes an inactive assessment role through the confirm dialog', async () => {
    const custom = { id: 12, code: 'custom.w', name: '删除测试', description: '', role_type: 'ASSESSMENT', member_source: '在周期中导入', is_system: false, is_active: false, updated_at: '2026-10-20T00:00:00Z', function_permission_keys: [] }
    performanceRoleApi.list
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 10 })
      .mockResolvedValueOnce({ items: [custom], total: 1, page: 1, page_size: 10 })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs }, attachTo: document.body })
    await flushPromises()
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')
    await flushPromises()
    await wrapper.get('.role-more-button').trigger('click')
    await wrapper.findAll('.dropdown-item').find(item => item.text().includes('删除'))!.trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('确定删除「删除测试」吗？')
    ;(document.querySelector('.performance-confirm-dialog__button--danger') as HTMLButtonElement).click()
    await flushPromises()
    expect(performanceRoleApi.remove).toHaveBeenCalledWith(12)
    wrapper.unmount()
  })
})
