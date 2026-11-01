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

    expect(wrapper.get('.person-info span').text()).toBe('研发中心直属上级：经理一')
    expect(wrapper.findAll('.person-meta__separator')).toHaveLength(1)
  })
  it('labels only allowed supervisor and hire-date values without changing other profile fields', () => {
    const wrapper = mount(PerformanceSelfSummaryHeader, { props: { person: {
      employee_no: 'E1', display_name: '员工', department: '不应回退', direct_supervisor_name: '不应回退',
      profile_fields: [
        { key: 'department', label: '部门', value: '研发中心' },
        { key: 'direct_supervisor', label: '直属上级', value: '经理一' },
        { key: 'hire_date', label: '入职日期', value: '2017-11-01' },
        { key: 'position_level', label: '职级', value: 'P6' },
        { key: 'direct_supervisor', label: '直属上级', value: '' },
        { key: 'hire_date', label: '入职日期', value: '' },
      ],
    } } })
    expect(wrapper.findAll('.person-meta__value').map(part => part.text())).toEqual(['研发中心', '直属上级：经理一', '2017-11-01 入职', 'P6'])
    expect(wrapper.text()).not.toContain('不应回退')
    wrapper.unmount()
  })

  it('does not add labels or fallback data for empty server profile fields', () => {
    const wrapper = mount(PerformanceSelfSummaryHeader, { props: { person: { employee_no: 'E1', display_name: '员工', department: '不可见部门', direct_supervisor_name: '不可见上级', profile_fields: [] } } })
    expect(wrapper.findAll('.person-meta__value')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('直属上级：')
    expect(wrapper.text()).not.toContain('入职')
    expect(wrapper.text()).not.toContain('不可见')
    wrapper.unmount()
  })

})
