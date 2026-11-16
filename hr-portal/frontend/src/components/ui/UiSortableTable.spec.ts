import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import UiSortableTable from './UiSortableTable.vue'

const stubs = {
  UiSortableList: defineComponent({ props: ['items', 'itemKey', 'disabled', 'gap'], emits: ['reorder', 'drag-start', 'drag-end', 'drag-cancel'], template: '<div class="sortable-list-stub"><template v-for="(item, index) in items" :key="String(index)"><slot :item="item" :index="index" :dragging="index === 0 && dragging" :over="false" :position="null" :item-style="{}"><span>fallback</span></slot></template><button class="sortable-trigger" @click="$emit(\'reorder\', 0, 1)">reorder</button></div>' }),
  UiDragHandle: defineComponent({ props: ['label', 'dragging', 'disabled'], template: '<span class="drag-handle-stub" :aria-label="label">{{ label }}</span>' }),
}
const options = { global: { stubs, directives: { loading: () => {} } } }

const rows = [
  { id: 1, name: '工号', code: 'employee_no' },
  { id: 2, name: '姓名', code: 'chinese_name' },
]
const columns = [
  { key: 'name', label: '字段名称', width: 170 },
  { key: 'code', label: '字段编码', width: 160 },
]

describe('ui sortable table', () => {
  it('renders table header with token classes and drag handle per row', async () => {
    const wrapper = mount(UiSortableTable, { props: { columns, rows }, ...options }); await flushPromises()
    expect(wrapper.find('.ui-sortable-table__header').exists()).toBe(true)
    expect(wrapper.findAll('.drag-handle-stub')).toHaveLength(2)
    expect(wrapper.find('.ui-sortable-table__header').text()).toContain('字段名称')
    wrapper.unmount()
  })

  it('emits reorder on drag', async () => {
    const wrapper = mount(UiSortableTable, { props: { columns, rows }, ...options }); await flushPromises()
    await wrapper.find('.sortable-trigger').trigger('click'); await flushPromises()
    expect(wrapper.emitted('reorder')).toBeTruthy()
    const emitted = wrapper.emitted('reorder')!
    expect(emitted[0]).toEqual([0, 1])
    wrapper.unmount()
  })

  it('renders empty state without rows', async () => {
    const wrapper = mount(UiSortableTable, { props: { columns, rows: [] }, ...options }); await flushPromises()
    expect(wrapper.find('.ui-sortable-table__state').exists()).toBe(true)
    expect(wrapper.find('.sortable-list-stub').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders loading state', async () => {
    const wrapper = mount(UiSortableTable, { props: { columns, rows: [], loading: true }, ...options }); await flushPromises()
    expect(wrapper.find('.ui-sortable-table__state').text()).toContain('加载中')
    wrapper.unmount()
  })
})
