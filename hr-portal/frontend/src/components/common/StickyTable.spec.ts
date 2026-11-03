import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import StickyTable from './StickyTable.vue'

const columns = [
  { key: 'name', label: '名称', width: 220, fixed: 'left' as const, slot: 'name' },
  { key: 'manager', label: '部门负责人', minWidth: 150 },
  { key: 'count', label: '人数', minWidth: 100 },
  { key: 'action', label: '操作', width: 194, fixed: 'right' as const, slot: 'action' },
]

describe('StickyTable', () => {
  it('renders supplied values, zero and missing fields without requiring slots', () => {
    const wrapper = mount(StickyTable, { props: { columns, rows: [{ name: '示例组织', manager: '负责人甲', count: 0 }] } })
    expect(wrapper.findAll('tbody td').map(cell => cell.text())).toEqual(['示例组织', '负责人甲', '0', '--'])
    expect(wrapper.find('table').attributes('style')).toContain('min-width: 664px')
    wrapper.unmount()
  })

  it('marks fixed columns and keeps the middle columns unfixed', () => {
    const wrapper = mount(StickyTable, { props: { columns, rows: [] } })
    const headers = wrapper.findAll('thead th')
    expect(headers[0].classes()).toContain('sticky-table__cell--fix-left')
    expect(headers[3].classes()).toContain('sticky-table__cell--fix-right')
    expect(headers[1].classes()).not.toContain('sticky-table__cell--fix-left')
    expect(headers[1].classes()).not.toContain('sticky-table__cell--fix-right')
    expect(headers.every(header => header.attributes('scope') === 'col')).toBe(true)
    wrapper.unmount()
  })

  it('passes the current row to named slots', () => {
    const wrapper = mount(StickyTable, {
      props: { columns, rows: [{ name: '组织甲' }, { name: '组织乙' }] },
      slots: { name: '<span class="name-cell">{{ row.name }}</span>' },
    })
    expect(wrapper.findAll('.name-cell').map(cell => cell.text())).toEqual(['组织甲', '组织乙'])
    wrapper.unmount()
  })

  it('supports default and custom empty states', async () => {
    const wrapper = mount(StickyTable, { props: { columns, rows: [], emptyText: '没有匹配项' } })
    expect(wrapper.find('.sticky-table__empty').text()).toBe('没有匹配项')
    await wrapper.setProps({ rows: [{ name: '组织甲' }] })
    expect(wrapper.find('.sticky-table__empty').exists()).toBe(false)
    wrapper.unmount()
    const custom = mount(StickyTable, { props: { columns, rows: [] }, slots: { empty: '<button>重新加载</button>' } })
    expect(custom.find('.sticky-table__empty button').text()).toBe('重新加载')
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
    const wrapper = mount(StickyTable, { props: { columns: fixedColumns, rows: [{}] } })
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
})
