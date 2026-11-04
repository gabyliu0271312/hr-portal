import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import UiTable from './UiTable.vue'

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

  it('never sticks the header or scrolls internally (REA model)', () => {
    const wrapper = mount(UiTable, { props: { columns, rows: [] } })
    expect(wrapper.find('.ui-table').classes()).toEqual(['ui-table'])
    expect(wrapper.find('thead').exists()).toBe(true)
    // 表头吸顶/内滚曾被误加过，这里锁死：组件只保留外层滚动一种模型
    expect(wrapper.html()).not.toContain('is-sticky-header')
    expect(wrapper.html()).not.toContain('is-container-scroll')
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
