import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import pageSource from './PerformanceRoleConfiguration.vue?raw'
import PerformanceRoleConfiguration from './PerformanceRoleConfiguration.vue'

const performanceRoleApi = vi.hoisted(() => ({ list: vi.fn() }))
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
  PerformanceManagementTable: {
    props: ['rows', 'emptyText', 'total'],
    template: '<div class="role-table" :data-total="total"><div v-for="row in rows" :key="row.id" class="role-row">{{ row.name }}</div><div v-if="!rows.length" class="empty">{{ emptyText }}</div><slot /></div>',
  },
  PerformancePermissionButton: {
    emits: ['click'],
    template: '<button class="permission-button" @click="$emit(\'click\')"><slot /></button>',
  },
  ElTableColumn: {
    props: ['label'],
    template: '<div class="table-column">{{ label }}<slot :row="{}" /></div>',
  },
}

describe('PerformanceRoleConfiguration', () => {
  beforeEach(() => {
    performanceRoleApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
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
    expect(wrapper.findAll('.table-column').map(column => column.text().replace(/编辑停用···$/, ''))).toEqual(
      expect.arrayContaining(['角色', '描述', '状态', '更新人', '最近更新时间', '操作']),
    )
    expect(pageSource).toContain('PerformanceListToolbar')
    expect(pageSource).toContain('PerformanceCreateButton')
    expect(pageSource).toContain('PerformanceExportIcon')
  })

  it('keeps the table header and empty state after switching tabs', async () => {
    const wrapper = mount(PerformanceRoleConfiguration, { global: { stubs } })

    await wrapper.get('[role="tab"][aria-selected="false"]').trigger('click')

    expect(wrapper.get('h1').text()).toBe('角色配置')
    expect(wrapper.find('.role-table').attributes('data-total')).toBe('0')
    expect(wrapper.find('.empty').text()).toBe('暂无评估角色')
    expect(wrapper.findAll('.table-column').map(column => column.text())).toEqual(
      expect.arrayContaining(['角色', '描述', '状态', '更新人', '最近更新时间']),
    )
  })
})
