import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import pageSource from './PerformanceRoleConfiguration.vue?raw'
import PerformanceRoleConfiguration from './PerformanceRoleConfiguration.vue'

const performanceRoleApi = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), updateStatus: vi.fn(), remove: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceRoleApi }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

const stubs = {
  PerformanceListToolbar: {
    props: ['keyword', 'searchPlaceholder', 'searchAriaLabel'],
    emits: ['update:keyword', 'filter'],
    template: '<div class="role-toolbar"><slot name="left" /><input :value="keyword" :placeholder="searchPlaceholder" :aria-label="searchAriaLabel" @input="$emit(\'update:keyword\', $event.target.value)" /><button type="button" @click="$emit(\'filter\')">筛选</button><slot name="actions" /></div>',
  },
  PerformanceCreateButton: {
    template: '<button class="create-button"><slot /><span>{{ label }}</span></button>',
    props: ['label'],
  },
  PerformanceExportIcon: { template: '<svg class="export-icon" />' },
  PerformanceButton: {
    props: ['disabled'],
    template: '<button class="performance-button" :disabled="disabled"><slot /></button>',
  },
  PerformanceManagementTable: {
    props: ['rows', 'emptyText', 'total'],
    template: '<div class="role-table" :data-total="total"><div v-for="row in rows" :key="row.id" class="role-row">{{ row.name }} {{ row.memberSource }}</div><div v-if="!rows.length" class="empty">{{ emptyText }}</div><slot :rows="rows" /></div>',
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
  ElTableColumn: {
    props: ['label'],
    template: '<div class="table-column">{{ label }}<slot v-for="row in $parent.$props.rows" :row="row" /></div>',
  },
}

describe('PerformanceRoleConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    performanceRoleApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
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
    expect(pageSource).toContain('PerformanceExportIcon')
  })

  it('renders the assessment role six-column contract', async () => {
    performanceRoleApi.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 10 }).mockResolvedValueOnce({
      items: [{ id: 1, code: 'assessment.reviewee', name: '被评估人', description: '系统预置角色', role_type: 'ASSESSMENT', member_source: '员工本人', is_system: true, is_active: true, updated_at: '2026-09-23T00:00:00Z', function_permission_keys: [] }],
      total: 1,
      page: 1,
      page_size: 10,
    })
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })
    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')

    const assessmentLabels = wrapper.findAll('.table-column').map(column => column.text().replace(/被评估人|员工本人|已启用|--|^操作编辑停用$/g, '').trim())
    expect(assessmentLabels).toEqual(
      expect.arrayContaining(['角色类型', '描述', '如何指定角色成员', '状态', '更新人']),
    )
    expect(wrapper.text()).toContain('被评估人')
    expect(wrapper.text()).toContain('员工本人')
    expect(performanceRoleApi.list).toHaveBeenCalledWith('', 1, 10, 'ASSESSMENT')
    expect(wrapper.find('.create-button').exists()).toBe(false)
    expect(wrapper.findAll('.performance-button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.findAll('.permission-button')).toHaveLength(0)
    expect(wrapper.findAll('.table-column')).toHaveLength(6)
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
})
