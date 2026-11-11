import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FocusGroupPeopleDialog from './FocusGroupPeopleDialog.vue'
import type { PerformanceFocusGroupChangePerson } from '@/api/performance'

import UiSurface from '../../ui/UiSurface.vue'
import UiFullScreenModal from '../../ui/UiFullScreenModal.vue'
import UiPageHeader from '../../ui/UiPageHeader.vue'
import UiTable from '../../ui/UiTable.vue'
import PerformanceManagementTable from '../PerformanceManagementTable.vue'
import PerformanceListToolbar from '../PerformanceListToolbar.vue'

vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return { ...actual, ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }
})

const fullScreenModalStub = {
  props: ['title', 'showFooter', 'contentScroll'],
  emits: ['back'],
  template: `<div class="full-screen-modal-stub" :data-title="title"><slot name="subtitle" /><slot /></div>`,
}
const managementTableStub = {
  props: ['rows', 'columns', 'loading', 'emptyText', 'page', 'pageSize', 'total', 'showPagination', 'scrollMode'],
  emits: ['page-change', 'page-size-change'],
  template: `
    <div class="management-table-stub">
      <template v-for="row in rows" :key="row.employee_no">
        <template v-for="column in columns" :key="column.key">
          <slot name="cell" :row="row" :column="column" :value="row[column.key]" />
        </template>
      </template>
      <span v-if="!loading && !rows.length">{{ emptyText }}</span>
      <slot name="pagination-prefix" />
      <button class="stub-page" type="button" @click="$emit('page-change', 2)">next</button>
      <span class="stub-total">{{ total }}</span>
    </div>`,
}
const searchInputStub = {
  props: ['modelValue', 'placeholder'],
  emits: ['update:modelValue', 'search', 'clear'],
  template: '<input class="search-input" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'search\')" />',
}
const filterButtonStub = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button class="filter-button-stub" :disabled="disabled" @click="$emit(\'click\')">筛选</button>',
}

function person(overrides: Partial<PerformanceFocusGroupChangePerson> = {}): PerformanceFocusGroupChangePerson {
  return {
    employee_no: 'E001',
    display_name: '甲',
    direct_supervisor_name: '管理员',
    organization_ref: '一级/二级/末级',
    department: '一级',
    department_2: '二级',
    job_family: '序列',
    job_category: '研发',
    job_sequence: '序列-研发',
    ...overrides,
  }
}

function stubs() {
  return {
    UiFullScreenModal: fullScreenModalStub,
    PerformanceManagementTable: managementTableStub,
    PerformanceSearchInput: searchInputStub,
    PerformanceFilterButton: filterButtonStub,
  }
}

describe('FocusGroupPeopleDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders full-screen header, 5 columns, result count, total and pagination', async () => {
    const rows = [person(), person({ employee_no: 'E002', display_name: '乙' })]
    const wrapper = mount(FocusGroupPeopleDialog, {
      props: { modelValue: true, title: '人员列表', subtitle: '核心研发团队', rows, total: 2, loading: false, error: '' },
      global: { stubs: stubs() },
    })
    await flushPromises()

    const modal = wrapper.find('.full-screen-modal-stub')
    expect(modal.exists()).toBe(true)
    expect(modal.attributes('data-title')).toBe('人员列表')
    expect(wrapper.text()).toContain('核心研发团队')
    expect(wrapper.text()).toContain('2个结果')

    const table = wrapper.findComponent(managementTableStub)
    const columnKeys = (table.props('columns') as Array<{ key: string; label: string; fixed?: string }>).map(column => column.key)
    expect(columnKeys).toEqual(['display_name', 'direct_supervisor_name', 'department', 'leaf_department', 'job_sequence'])
    const nameColumn = (table.props('columns') as Array<{ key: string; fixed?: string }>).find(column => column.key === 'display_name')
    expect(nameColumn?.fixed).toBe('left')

    expect(wrapper.text()).toContain('共 2 条')
    expect(wrapper.text()).toContain('甲')
    expect(wrapper.text()).toContain('末级') // 末级部门从 organization_ref 末段计算
    expect(wrapper.text()).toContain('序列-研发') // 序列复用上级评估 format_job_sequence
  })

  it('filters and paginates locally when no loadFn provided', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => person({ employee_no: `E${index}`, display_name: index % 2 === 0 ? '甲' : '乙' }))
    const wrapper = mount(FocusGroupPeopleDialog, {
      props: { modelValue: true, title: '人员列表', rows, total: 12, loading: false, error: '' },
      global: { stubs: stubs() },
    })
    await flushPromises()
    // 默认第 1 页 10 条
    expect((wrapper.findComponent(managementTableStub).props('rows') as unknown[]).length).toBe(10)
    expect(wrapper.text()).toContain('共 12 条')

    // 搜索过滤
    await wrapper.find('.search-input').setValue('甲')
    await wrapper.find('.search-input').trigger('keyup.enter')
    expect(wrapper.text()).toContain('6个结果')
    expect((wrapper.findComponent(managementTableStub).props('rows') as unknown[]).length).toBe(6)
  })

  it('reuses the real page shell, white surface and fill toolbar without inner body scrolling', async () => {
    const rows = Array.from({ length: 12 }, (_, index) => person({ employee_no: `E${index}`, display_name: `成员${index}` }))
    const wrapper = mount(FocusGroupPeopleDialog, {
      props: { modelValue: true, title: '人员列表', subtitle: '核心研发团队', rows, loading: false, error: '' },
    })
    await flushPromises()
    expect(wrapper.getComponent(UiFullScreenModal).props('contentScroll')).toBe('page')
    expect(wrapper.getComponent(UiPageHeader).props('title')).toBe('人员列表')
    expect(wrapper.get('.full-screen-modal-header-subtitle').text()).toBe('核心研发团队')
    const surface = wrapper.getComponent(UiSurface)
    expect(surface.props('radius')).toBe('all')
    expect(surface.props('minWidth')).toBe('0')
    expect(surface.props('padding')).toBe('var(--ui-surface-padding-spacious)')
    expect(surface.findComponent(PerformanceListToolbar).props('searchFill')).toBe(true)
    const table = wrapper.getComponent(PerformanceManagementTable)
    const uiTable = wrapper.getComponent(UiTable)
    expect(table.props('scrollMode')).toBe('page')
    expect(uiTable.props('maxHeight')).toBeUndefined()
    expect(uiTable.props('stickyHeaderTop')).toBeUndefined()
    expect(uiTable.find('thead th.is-fixed-left').attributes('style')).toContain('left: 0px')
    expect(uiTable.findAll('tbody tr')).toHaveLength(10)
    await wrapper.get('[aria-label="下一页"]').trigger('click')
    expect(uiTable.findAll('tbody tr')).toHaveLength(2)
    await wrapper.get('.search-input input').setValue('成员11')
    await wrapper.get('.search-input input').trigger('keyup.enter')
    expect(table.props('page')).toBe(1)
    expect(uiTable.findAll('tbody tr')).toHaveLength(1)
    await wrapper.get('[aria-label="清除搜索"]').trigger('click')
    expect(table.props('total')).toBe(12)
    await wrapper.setProps({ rows: [] })
    expect(wrapper.text()).toContain('暂无人员')
    expect(wrapper.text()).toContain('共 0 条')
    await wrapper.setProps({ loading: true })
    expect(wrapper.get('.filter-button').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ loading: false, error: '读取失败' })
    expect(wrapper.get('[role="alert"]').text()).toBe('读取失败')
    await wrapper.get('.full-screen-modal-header-back').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('calls loadFn on search and page change when provided', async () => {
    const loadFn = vi.fn().mockResolvedValue({ total: 2, items: [person()] })
    const wrapper = mount(FocusGroupPeopleDialog, {
      props: { modelValue: true, title: '人员列表', rows: [], total: 2, loading: false, error: '', loadFn },
      global: { stubs: stubs() },
    })
    await flushPromises()

    await wrapper.find('.search-input').setValue('甲')
    await wrapper.find('.filter-button-stub').trigger('click')
    await flushPromises()
    expect(loadFn).toHaveBeenCalledWith('甲', 1, 10)

    await wrapper.find('.stub-page').trigger('click')
    await flushPromises()
    expect(loadFn).toHaveBeenCalledWith('甲', 2, 10)
  })
})
