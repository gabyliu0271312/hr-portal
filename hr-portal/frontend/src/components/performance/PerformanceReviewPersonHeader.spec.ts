import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceReviewPersonHeader from './PerformanceReviewPersonHeader.vue'

describe('PerformanceReviewPersonHeader visibility data', () => {
  it('uses server-provided profile fields without changing the existing line format', () => {
    const wrapper = mount(PerformanceReviewPersonHeader, {
      props: {
        person: {
          employee_no: 'E001',
          display_name: '员工一',
          department: '不应回退展示',
          profile_fields: [
            { key: 'department', label: '部门', value: '研发中心' },
            { key: 'position_level', label: '职级', value: 'P6' },
          ],
        },
      },
    })

    expect(wrapper.get('.performance-review-person-header__info span').text()).toBe('研发中心P6')
    expect(wrapper.findAll('.performance-review-person-header__profile-separator')).toHaveLength(1)
  })
  it('labels only allowed supervisor and hire-date values without changing other profile fields', () => {
    const wrapper = mount(PerformanceReviewPersonHeader, { props: { person: {
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
    expect(wrapper.findAll('.performance-review-person-header__profile-value').map(part => part.text())).toEqual(['研发中心', '直属上级：经理一', '2017-11-01 入职', 'P6'])
    expect(wrapper.text()).not.toContain('不应回退')
    wrapper.unmount()
  })

  it('does not add labels or fallback data for empty server profile fields', () => {
    const wrapper = mount(PerformanceReviewPersonHeader, { props: { person: { employee_no: 'E1', display_name: '员工', department: '不可见部门', direct_supervisor_name: '不可见上级', profile_fields: [] } } })
    expect(wrapper.findAll('.performance-review-person-header__profile-value')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('直属上级：')
    expect(wrapper.text()).not.toContain('入职')
    expect(wrapper.text()).not.toContain('不可见')
    wrapper.unmount()
  })

})
