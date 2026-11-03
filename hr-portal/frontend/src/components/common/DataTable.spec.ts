import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import { ElTable, ElTableColumn, ElPagination, ElLoading } from 'element-plus'
import DataTable from './DataTable.vue'
import dataTableSource from './DataTable.vue?raw'

const columns = [
  { prop: 'name', label: '姓名', minWidth: 160, fixed: 'left' as const },
  { prop: 'dept', label: '部门', minWidth: 120 },
  { prop: 'count', label: '人数', minWidth: 100 },
  { prop: 'action', label: '操作', width: 120, fixed: 'right' as const, slot: 'action' },
]

async function render(props: Record<string, any> = {}, slots: Record<string, any> = {}) {
  const wrapper = mount(DataTable, {
    props: { columns, data: [], ...props },
    slots,
    global: { components: { ElTable, ElTableColumn, ElPagination }, directives: { loading: ElLoading.directive } },
  })
  await nextTick()
  await nextTick()
  return wrapper
}

describe('DataTable', () => {
  it('renders supplied rows, zero values and missing value fallbacks with real Element Plus', async () => {
    const wrapper = await render({ data: [{ name: '甲', dept: '研发', count: 0 }, { name: '乙' }] })
    const rows = wrapper.findAll('.el-table__body tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('甲研发0--')
    expect(rows[1].text()).toContain('乙------')
    expect(wrapper.text()).not.toContain('暂无数据')
    wrapper.unmount()
  })

  it('passes the actual row to named column slots', async () => {
    const wrapper = await render(
      { data: [{ name: '甲', id: 7 }, { name: '乙', id: 9 }] },
      { action: '<button class="edit">编辑 {{ row.id }}</button>' },
    )
    expect(wrapper.findAll('.edit').map(button => button.text())).toEqual(expect.arrayContaining(['编辑 7', '编辑 9']))
    wrapper.unmount()
  })

  it('renders empty content only without data and reacts to data changes', async () => {
    const wrapper = await render({ emptyText: '没有匹配项' })
    expect(wrapper.find('.data-table__empty').text()).toBe('没有匹配项')
    await wrapper.setProps({ data: [{ name: '新增' }] })
    expect(wrapper.find('.data-table__empty').exists()).toBe(false)
    expect(wrapper.find('.el-table__body').text()).toContain('新增')
    wrapper.unmount()
  })

  it('renders optional toolbar and empty slots', async () => {
    const wrapper = await render({}, { toolbar: '<input class="search" />', empty: '<span class="custom-empty">无结果</span>' })
    expect(wrapper.find('.data-table__toolbar .search').exists()).toBe(true)
    expect(wrapper.find('.custom-empty').text()).toBe('无结果')
    expect(wrapper.findComponent(ElPagination).exists()).toBe(false)
    wrapper.unmount()
  })

  it('forwards pagination values and page/size changes', async () => {
    const wrapper = await render({ total: 35, page: 2, pageSize: 20, pageSizes: [10, 20] })
    const pager = wrapper.findComponent(ElPagination)
    expect(pager.props()).toMatchObject({ total: 35, currentPage: 2, pageSize: 20, pageSizes: [10, 20] })
    pager.vm.$emit('current-change', 1)
    pager.vm.$emit('size-change', 10)
    expect(wrapper.emitted('update:page')).toEqual([[1]])
    expect(wrapper.emitted('update:pageSize')).toEqual([[10]])
    wrapper.unmount()
  })

  it('forwards table sizing and fixed column configuration', async () => {
    const wrapper = await render({ maxHeight: 420 })
    const table = wrapper.findComponent(ElTable) as any
    const tableColumns = wrapper.findAllComponents(ElTableColumn) as any[]
    expect(table.props('maxHeight')).toBe(420)
    expect(tableColumns.map(col => col.props('fixed'))).toEqual(['left', undefined, undefined, 'right'])
    await wrapper.setProps({ fillViewport: true })
    expect(table.props('height')).toBe('100%')
    expect(table.props('maxHeight')).toBeUndefined()
    wrapper.unmount()
  })

  it('uses separate spacing tokens for toolbar items, table and pagination', () => {
    expect(dataTableSource).toContain('var(--page-gap-toolbar-items)')
    expect(dataTableSource).toContain('var(--page-gap-toolbar-table)')
    expect(dataTableSource).toContain('var(--page-gap-table-pagination)')
  })
})
