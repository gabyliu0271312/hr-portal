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
})
