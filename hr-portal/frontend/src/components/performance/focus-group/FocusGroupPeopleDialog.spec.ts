import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FocusGroupPeopleDialog from './FocusGroupPeopleDialog.vue'
import type { PerformanceFocusGroupChangePerson } from '@/api/performance'

vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

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
    department_2: '一级',
    job_family: '序列',
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

  it('renders full-screen header, 4 columns, result count, total and pagination', async () => {
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
    expect(columnKeys).toEqual(['display_name', 'direct_supervisor_name', 'leaf_department', 'job_family'])
    const nameColumn = (table.props('columns') as Array<{ key: string; fixed?: string }>).find(column => column.key === 'display_name')
    expect(nameColumn?.fixed).toBe('left')

    expect(wrapper.text()).toContain('共 2 条')
    expect(wrapper.text()).toContain('甲')
    expect(wrapper.text()).toContain('末级') // 末级部门从 organization_ref 末段计算
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
