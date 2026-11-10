import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import UiTable from './UiTable.vue'
import PerformanceManagementTable from '../performance/PerformanceManagementTable.vue'
import UiPagination from './UiPagination.vue'
import PerformancePagination from '../performance/PerformancePagination.vue'

const columns = [
  { key: 'name', label: '名称', width: 220, fixed: 'left' as const },
  { key: 'manager', label: '部门负责人', minWidth: 150 },
  { key: 'count', label: '人数', minWidth: 100 },
  { key: 'action', label: '操作', width: 194, fixed: 'right' as const },
]

describe('UiTable', () => {
  it('renders supplied values, zero and missing fields without requiring slots', () => {
    const wrapper = mount(UiTable, { props: { columns, rows: [{ name: '示例组织', manager: '负责人甲', count: 0 }] } })
    expect(wrapper.findAll('tbody td').map(cell => cell.text())).toEqual(['示例组织', '负责人甲', '0', '--'])
    expect(wrapper.find('table').attributes('style')).toContain('min-width: 664px')
    wrapper.unmount()
  })

  it('marks fixed columns and keeps the middle columns unfixed', () => {
    const wrapper = mount(UiTable, { props: { columns, rows: [] } })
    const headers = wrapper.findAll('thead th')
    expect(headers[0].classes()).toContain('is-fixed-left')
    expect(headers[3].classes()).toContain('is-fixed-right')
    expect(headers[1].classes()).not.toContain('is-fixed-left')
    expect(headers[1].classes()).not.toContain('is-fixed-right')
    expect(headers.every(header => header.attributes('scope') === 'col')).toBe(true)
    wrapper.unmount()
  })

  it('passes the current row and column to the cell slot', () => {
    const wrapper = mount(UiTable, {
      props: { columns, rows: [{ name: '组织甲' }, { name: '组织乙' }] },
      slots: { cell: '<span class="name-cell">{{ row.name }}-{{ column.key }}</span>' },
    })
    const texts = wrapper.findAll('.name-cell').map(cell => cell.text())
    expect(texts).toHaveLength(8)
    expect(texts.slice(0, 4)).toEqual(['组织甲-name', '组织甲-manager', '组织甲-count', '组织甲-action'])
    wrapper.unmount()
  })

  it('supports default and custom empty states', async () => {
    const wrapper = mount(UiTable, { props: { columns, rows: [], emptyText: '没有匹配项' } })
    expect(wrapper.find('.ui-table__state').text()).toBe('没有匹配项')
    await wrapper.setProps({ rows: [{ name: '组织甲' }] })
    expect(wrapper.find('.ui-table__state').exists()).toBe(false)
    wrapper.unmount()
    const custom = mount(UiTable, { props: { columns, rows: [] }, slots: { empty: '<button>重新加载</button>' } })
    expect(custom.find('.ui-table__state button').text()).toBe('重新加载')
    custom.unmount()
  })

  it('accumulates measured widths for multiple fixed columns and remeasures changed columns', async () => {
    let width = 300
    const measure = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width } as DOMRect))
    const fixedColumns = [
      { key: 'a', label: 'A', width: 100, fixed: 'left' as const },
      { key: 'b', label: 'B', width: 100, fixed: 'left' as const },
      { key: 'c', label: 'C', width: 100, fixed: 'right' as const },
      { key: 'd', label: 'D', width: 100, fixed: 'right' as const },
    ]
    const wrapper = mount(UiTable, { props: { columns: fixedColumns, rows: [{}] } })
    await nextTick()
    await nextTick()
    expect(wrapper.findAll('thead th')[1].attributes('style')).toContain('left: 300px')
    expect(wrapper.findAll('tbody td')[2].attributes('style')).toContain('right: 300px')
    width = 250
    await wrapper.setProps({ columns: fixedColumns.map(column => ({ ...column, width: 120 })) })
    await nextTick()
    await nextTick()
    expect(wrapper.findAll('thead th')[1].attributes('style')).toContain('left: 250px')
    wrapper.unmount()
    measure.mockRestore()
  })

  it('does not stick the header or constrain body height unless explicitly requested', () => {
    const wrapper = mount(UiTable, { props: { columns, rows: [] } })
    expect(wrapper.find('.ui-table').classes()).toEqual(['ui-table'])
    expect(wrapper.find('thead').exists()).toBe(true)
    expect(wrapper.find('.ui-table__body').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('is-sticky-header')
    expect(wrapper.html()).not.toContain('is-container-scroll')
    wrapper.unmount()
  })

  it('splits header and body when sticky header is requested and accepts CSS offsets', () => {
    const wrapper = mount(UiTable, { props: { columns, rows: [], stickyHeaderTop: 'calc(60px - 28px)' } })
    expect(wrapper.findAll('.ui-table__viewport')).toHaveLength(2)
    expect(wrapper.find('.ui-table__header thead').exists()).toBe(true)
    expect(wrapper.find('.ui-table__body tbody').exists()).toBe(true)
    expect(wrapper.find('.ui-table').attributes('style')).toContain('--ui-table-sticky-top: calc(60px - 28px)')
    wrapper.unmount()
  })

  it('supports inner vertical scrolling only when maxHeight is supplied', () => {
    const wrapper = mount(UiTable, { props: { columns, rows: [], maxHeight: 320 } })
    expect(wrapper.find('.ui-table').classes()).toContain('is-inner-scroll')
    expect(wrapper.find('.ui-table__body').attributes('style')).toContain('max-height: 320px')
    wrapper.unmount()
  })

  it('keeps single-table mode when no sticky header or body height is requested', () => {
    const wrapper = mount(UiTable, { props: { columns, rows: [] } })
    expect(wrapper.findAll('.ui-table__viewport')).toHaveLength(1)
    expect(wrapper.find('.ui-table__header').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps a page header opt-in and uses the same kernel for inner scroll', async () => {
    const wrapper = mount(PerformanceManagementTable, {
      props: { columns, rows: [{ name: '组织甲' }], loading: false, loadingText: '加载中', emptyText: '暂无', tableAriaLabel: '表格', paginationAriaLabel: '分页', showPagination: false, scrollMode: 'page' },
    })
    const table = wrapper.getComponent(UiTable)
    expect(table.props('maxHeight')).toBeUndefined()
    expect(table.props('stickyHeaderTop')).toBeUndefined()
    await wrapper.setProps({ stickyHeaderTop: 'var(--performance-table-sticky-top)' })
    expect(table.props('stickyHeaderTop')).toBe('var(--performance-table-sticky-top)')
    await wrapper.setProps({ scrollMode: 'inner', stickyHeaderTop: undefined, maxHeight: 240 })
    expect(table.props('maxHeight')).toBe(240)
    wrapper.unmount()
  })

  it('synchronizes horizontal scroll in both directions without changing vertical position', async () => {
    const wrapper = mount(UiTable, { props: { columns, rows: [{ name: '组织甲' }], stickyHeaderTop: 0 } })
    const header = wrapper.get('.ui-table__header')
    const body = wrapper.get('.ui-table__body')
    body.element.scrollTop = 80
    body.element.scrollLeft = 140
    await body.trigger('scroll')
    expect(header.element.scrollLeft).toBe(140)
    header.element.scrollLeft = 60
    await header.trigger('scroll')
    expect(body.element.scrollLeft).toBe(60)
    expect(body.element.scrollTop).toBe(80)
    wrapper.unmount()
  })

  it('does not add the selection width to right fixed columns or shift measured indices', async () => {
    const widths = [48, 270, 175, 125, 210]
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const cell = this
      const index = Array.from(cell.parentElement?.children ?? []).indexOf(cell)
      return { width: widths[index] ?? 0 } as DOMRect
    })
    const wrapper = mount(UiTable, { props: { columns: columns.map(column => column.key === 'manager' ? { ...column, fixed: 'left' as const } : column), rows: [{}], selectable: true } })
    await nextTick()
    await nextTick()
    const headers = wrapper.findAll('thead th')
    expect(headers[1].attributes('style')).toContain('left: 48px')
    expect(headers[2].attributes('style')).toContain('left: 318px')
    expect(headers[4].attributes('style')).toContain('right: 0px')
    wrapper.unmount()
    spy.mockRestore()
  })

  it('keeps legacy pagination on the shared pagination kernel without a second size selector', async () => {
    const wrapper = mount(PerformancePagination, { props: { page: 1, pageSize: 10, total: 100 } })
    const pager = wrapper.getComponent(UiPagination)
    expect(pager.props('showSize')).toBe(false)
    expect(pager.props('showJump')).toBe(false)
    expect(wrapper.findAll('.page-number').map(page => page.text())).toEqual(['1', '2', '3', '4', '5', '10'])
    await wrapper.get('[aria-label="下一页"]').trigger('click')
    expect(wrapper.emitted('page-change')).toEqual([[2]])
    wrapper.unmount()
  })

  it('accepts a row-key function and emits row-click with the row', async () => {
    const wrapper = mount(UiTable, {
      props: { columns, rows: [{ name: '组织甲', code: 'A1' }, { name: '组织乙', code: 'B2' }], rowKey: (row: any) => row.code },
    })
    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    await rows[1].trigger('click')
    expect(wrapper.emitted('row-click')?.[0]?.[0]).toMatchObject({ name: '组织乙' })
    wrapper.unmount()
  })
})
