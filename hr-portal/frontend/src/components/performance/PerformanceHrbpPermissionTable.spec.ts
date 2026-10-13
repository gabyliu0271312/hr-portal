import { ElTableColumn } from 'element-plus'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceHrbpPermissionTable from './PerformanceHrbpPermissionTable.vue'
import PerformancePermissionButton from './PerformancePermissionButton.vue'

const rows = [{ id: 1, hrbp: 'HRBP 示例', scope: '示例部门', invisiblePeople: '示例人员' }]
const permissionButtonStub = {
  inheritAttrs: false,
  emits: ['click'],
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
}

describe('PerformanceHrbpPermissionTable', () => {
  it('renders the captured columns and emits static list actions', async () => {
    const wrapper = mount(PerformanceHrbpPermissionTable, {
      props: { rows, total: 1 },
      global: { stubs: { PerformancePermissionButton: permissionButtonStub } },
    })

    const labels = wrapper.findAllComponents(ElTableColumn).map(column => (column as any).props('label'))
    expect(labels).toEqual([undefined, 'HRBP', '本周期负责范围', '不可见人员', '操作'])
    await wrapper.get('.permission-create-button').trigger('click')

    expect(wrapper.findAllComponents(PerformancePermissionButton)).toHaveLength(2)
    expect(wrapper.findAll('.row-action')).toHaveLength(2)
    expect(wrapper.emitted('create')).toHaveLength(1)
  })
})
