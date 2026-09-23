import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import IngestionModeSelect from './IngestionModeSelect.vue'

const stubs = {
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': true,
  'el-tooltip': { template: '<div><slot /></div>' },
  'el-icon': { template: '<i><slot /></i>' },
}

describe('IngestionModeSelect', () => {
  it('shows the selected mode explanation and period metadata', () => {
    const wrapper = mount(IngestionModeSelect, {
      props: { modelValue: 'period_full_snapshot', isPeriod: true, periodLabel: '发薪月份', keyLabels: ['员工编号', '发薪月份'] },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('期间字段：发薪月份')
    expect(wrapper.text()).toContain('员工编号 + 发薪月份')
  })
  it('explains how to discover fields before selecting a keyed mode', () => {
    const wrapper = mount(IngestionModeSelect, {
      props: { modelValue: 'current_snapshot', isPeriod: false, keyLabels: [] },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('请先选择“流水追加”完成字段发现，再在字段管理中标记业务主键。')
  })
})
