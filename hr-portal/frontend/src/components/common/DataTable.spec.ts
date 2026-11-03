import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DataTable from './DataTable.vue'
import dataTableSource from './DataTable.vue?raw'

describe('DataTable', () => {
  it('hides toolbar when no toolbar slot is provided', () => {
    const wrapper = mount(DataTable, { slots: { default: '<div class="tbl">x</div>' } })
    expect(wrapper.find('.data-table__toolbar').exists()).toBe(false)
    expect(wrapper.find('.tbl').exists()).toBe(true)
  })

  it('renders toolbar slot content when provided', () => {
    const wrapper = mount(DataTable, {
      slots: { toolbar: '<input class="search" />', default: '<div class="tbl">x</div>' },
    })
    expect(wrapper.find('.data-table__toolbar .search').exists()).toBe(true)
  })

  it('uses shared page-gap tokens for toolbar/table spacing', () => {
    expect(dataTableSource).toMatch(/var\(--page-gap-toolbar-table\)/)
    expect(dataTableSource).toMatch(/var\(--page-gap-title-desc\)/)
  })
})
