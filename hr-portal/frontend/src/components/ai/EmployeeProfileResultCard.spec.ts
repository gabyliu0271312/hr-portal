import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EmployeeProfileResultCard from './EmployeeProfileResultCard.vue'

describe('EmployeeProfileResultCard', () => {
  it('renders header and fields in the requested vertical order', () => {
    const wrapper = mount(EmployeeProfileResultCard, {
      props: {
        result: {
          type: 'employee_profile_result', artifacts: [], actions: [],
          data: { fields: [
            { code: 'full_name', label: '\u59d3\u540d', value: '\u5f20\u4e09' },
            { code: 'business_unit', label: 'BU', value: '\u6280\u672f\u4e2d\u53f0' },
            { code: 'position_level', label: '\u5c97\u4f4d\u5c42\u7ea7', value: 'P6' },
            { code: 'organization_name', label: '\u6240\u5c5e\u7ec4\u7ec7', value: '\u6280\u672f\u4e2d\u53f0' },
            { code: 'employee_no', label: '\u5de5\u53f7', value: '107505' },
            { code: 'employee_type', label: '\u5458\u5de5\u7c7b\u578b', value: '\u6b63\u5f0f\u5458\u5de5' },
            { code: 'hire_date', label: '\u5165\u804c\u65e5\u671f', value: '2021-01-01' },
            { code: 'standard_position', label: '\u6807\u51c6\u804c\u4f4d', value: '\u540e\u7aef\u5de5\u7a0b\u5e08' },
          ] },
        },
      },
    })

    expect(wrapper.find('.employee-profile-title').text()).toBe('107505 -- \u5f20\u4e09')
    expect(wrapper.find('.employee-profile-kicker').text()).toBe('\u5458\u5de5\u6863\u6848')
    expect(wrapper.find('.employee-profile-section-title').text()).toBe('\u57fa\u7840\u8d44\u6599')
    expect(wrapper.findAll('.employee-profile-field dt').map((item) => item.text())).toEqual([
      'BU\uff1a', '\u6240\u5c5e\u7ec4\u7ec7\uff1a', '\u5165\u804c\u65e5\u671f\uff1a', '\u5458\u5de5\u7c7b\u578b\uff1a', '\u6807\u51c6\u804c\u4f4d\uff1a', '\u5c97\u4f4d\u5c42\u7ea7\uff1a',
    ])
  })

  it('emits selection handle without rendering it', async () => {
    const handle = 'a'.repeat(32)
    const wrapper = mount(EmployeeProfileResultCard, {
      props: { result: { type: 'employee_profile_candidates', artifacts: [], actions: [], data: { candidates: [{
        selection_handle: handle,
        display_fields: [{ code: 'full_name', label: '\u59d3\u540d', value: '\u5f20\u4e09' }],
      }] } } },
    })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([handle])
    expect(wrapper.text()).not.toContain(handle)
  })
})
