import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceProfileSeparator from './PerformanceProfileSeparator.vue'
import PerformanceReviewPersonHeader from './PerformanceReviewPersonHeader.vue'
import PerformanceSelfSummaryHeader from './PerformanceSelfSummaryHeader.vue'
import source from './PerformanceProfileSeparator.vue?raw'

const person = { employee_no: 'E1', display_name: '员工', profile_fields: [
  { key: 'department', label: '部门', value: '研发中心' },
  { key: 'position_level', label: '职级', value: 'J3' },
  { key: 'job_sequence', label: '序列', value: '专业族' },
  { key: 'direct_supervisor', label: '上级', value: '经理一' },
  { key: 'hire_date', label: '入职日期', value: '2019-04-03' },
] }

describe('PerformanceProfileSeparator', () => {
  it('uses the captured border, spacing and baseline without a background-width approximation', () => {
    const wrapper = mount(PerformanceProfileSeparator)
    expect(wrapper.attributes('aria-hidden')).toBe('true')
    expect(source).toContain('border-left:1px solid var(--color-border)')
    expect(source).toContain('height:12px')
    expect(source).toContain('margin:2px 8px')
    expect(source).toContain('background:transparent;vertical-align:text-bottom')
    wrapper.unmount()
  })

  it.each([PerformanceReviewPersonHeader, PerformanceSelfSummaryHeader])('reuses one component for every profile boundary in %s', Header => {
    const wrapper = mount(Header, { props: { person } })
    const lines = wrapper.findAllComponents(PerformanceProfileSeparator)
    expect(lines).toHaveLength(4)
    expect(lines.every(line => line.classes().includes('performance-profile-separator'))).toBe(true)
    expect(lines[3].element.previousElementSibling?.textContent).toBe('直属上级：经理一')
    expect(lines[3].element.nextElementSibling?.textContent).toBe('2019-04-03 入职')
    wrapper.unmount()
  })

  it.each([PerformanceReviewPersonHeader, PerformanceSelfSummaryHeader])('does not add separators for hidden fields in %s', Header => {
    const wrapper = mount(Header, { props: { person: { ...person, profile_fields: [] } } })
    expect(wrapper.findAllComponents(PerformanceProfileSeparator)).toHaveLength(0)
    wrapper.unmount()
  })
})
