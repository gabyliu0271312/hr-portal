import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceSelfSummaryHeader from './PerformanceSelfSummaryHeader.vue'

describe('PerformanceSelfSummaryHeader visibility data', () => {
  it('renders server-provided profile fields in the existing metadata line', () => {
    const wrapper = mount(PerformanceSelfSummaryHeader, {
      props: {
        person: {
          employee_no: 'E001',
          display_name: '员工一',
          department: '不应回退展示',
          direct_supervisor_name: '不应回退展示',
          profile_fields: [
            { key: 'department', label: '部门', value: '研发中心' },
            { key: 'position_level', label: '职级', value: 'P6' },
          ],
        },
      },
    })

    expect(wrapper.get('.person-info span').text()).toBe('研发中心P6')
    expect(wrapper.findAll('.person-meta__separator')).toHaveLength(1)
  })

  it('keeps legacy metadata compatible when profile fields are absent', () => {
    const wrapper = mount(PerformanceSelfSummaryHeader, {
      props: { person: { employee_no: 'E001', display_name: '员工一', department: '研发中心', direct_supervisor_name: '经理一' } },
    })

    expect(wrapper.get('.person-info span').text()).toBe('研发中心经理一')
    expect(wrapper.findAll('.person-meta__separator')).toHaveLength(1)
  })
})
