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
    teleport: true,
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

  it('keeps the calibration eight-column contract and displays explicit snapshot leaf and optional fields', async () => {
    const rows = [person({ leaf_department: '冻结末级', dotted_supervisor_name: null, job_sub_sequence: '冻结子序列', position_name: '冻结职务' }), person({ employee_no: 'E002', display_name: '乙', direct_supervisor_name: '', leaf_department: '', organization_ref: '', job_sequence: '', job_sub_sequence: '', position_name: '' })]
    const wrapper = mount(FocusGroupPeopleDialog, {
      props: { modelValue: true, title: '人员列表', rows, loading: false, error: '', variant: 'calibration' },
      global: { stubs: stubs() },
    })
    await flushPromises()
    const table = wrapper.findComponent(managementTableStub)
    expect(table.props('columns').map((column: { key: string; label: string }) => [column.key, column.label])).toEqual([
      ['display_name', '姓名'], ['direct_supervisor_name', '直属上级'], ['dotted_supervisor_name', '虚线上级'], ['department', '一级部门'], ['leaf_department', '末级部门'], ['job_sequence', '序列'], ['job_sub_sequence', '子序列'], ['position_name', '职务'],
    ])
    expect(wrapper.get('.full-screen-modal-stub').classes()).toContain('focus-group-people-dialog--calibration')
    expect(wrapper.text()).toContain('冻结末级')
    expect(wrapper.text()).toContain('冻结子序列')
    expect(wrapper.text()).toContain('冻结职务')
    expect(wrapper.findAll('.management-table-stub span').filter(cell => cell.text() === '--').length).toBeGreaterThanOrEqual(6)
    await wrapper.get('.search-input').setValue('冻结职务')
    expect(table.props('rows')).toHaveLength(1)
    wrapper.unmount()
  })

  it('accepts caller columns while preserving default rows and missing-value rendering', async () => {
    const columns = [{ key: 'position_name', label: '职务', width: 312 }]
    const wrapper = mount(FocusGroupPeopleDialog, {
      props: { modelValue: true, title: '人员列表', rows: [person({ position_name: '工程师' })], loading: false, error: '', columns },
      global: { stubs: stubs() },
    })
    expect(wrapper.findComponent(managementTableStub).props('columns')).toEqual(columns)
    expect(wrapper.text()).toContain('工程师')
    wrapper.unmount()
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
      global: { stubs: { teleport: true, ElSelect: { props: ['modelValue'], template: '<select :value="modelValue"><slot /></select>' }, ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' } } },
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

  it('shares supervisor grouping, preserves same-name identities, filters and restores flat pagination', async () => {
    const rows = [person({ employee_no: 'E1', display_name: '甲' }), person({ employee_no: 'E2', display_name: '乙' }), person({ employee_no: 'E3', display_name: '丙' })]
    const groups = [{ id: 'M1', parent_id: null, label: '同名上级', employee_nos: ['E1'] }, { id: 'M2', parent_id: 'M1', label: '同名上级', employee_nos: ['E2'] }, { id: '', parent_id: null, label: '未分配上级', employee_nos: ['E3'] }]
    const wrapper = mount(FocusGroupPeopleDialog, { attachTo: document.body, props: { modelValue: true, title: '未授权人员', rows, groups, loading: false, error: '' }, global: { stubs: { teleport: true, ElSelect: { props: ['modelValue'], template: '<select :value="modelValue"><slot /></select>' }, ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' } } } })
    const { default: Grouping } = await import('../PerformancePeopleGrouping.vue')
    const grouping = wrapper.getComponent(Grouping)
    await grouping.trigger('mouseenter'); await flushPromises()
    expect(wrapper.findAll('.people-group-row')).toHaveLength(0)
    expect(wrapper.find('.people-grouping-menu').text()).toBe('按上级分组')
    await wrapper.get('.people-grouping-menu button').trigger('click')
    expect(wrapper.findAll('.people-group-row')).toHaveLength(3)
    expect(wrapper.getComponent(PerformanceManagementTable).props('showPagination')).toBe(false)
    expect(wrapper.findAll('tbody tr')).toHaveLength(6)
    await wrapper.findAll('[aria-label="收起同名上级的分组"]')[0].trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    expect(wrapper.text()).toContain('3个结果')
    await wrapper.get('.search-input input').setValue('乙')
    expect(wrapper.text()).toContain('1个结果')
    expect(wrapper.findAll('.people-group-row')).toHaveLength(2)
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    await grouping.vm.$emit('update:modelValue', false); await flushPromises()
    expect(wrapper.findAll('.people-group-row')).toHaveLength(0)
    expect(wrapper.getComponent(PerformanceManagementTable).props('showPagination')).toBe(true)
    await wrapper.setProps({ modelValue: false }); await wrapper.setProps({ modelValue: true })
    expect(wrapper.text()).toContain('3个结果')
    expect(wrapper.getComponent(Grouping).props('modelValue')).toBe(false)
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
