import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CompensationComparisonCard from './CompensationComparisonCard.vue'

const snapshot = {
  employee_id: 1,
  employee_name: '张三',
  employee_no: 'E001',
  leave_date: '2026-06-30',
  plan: 'N',
  service_years_n: 3,
  compensation_base: 10000,
  n_amount: 30000,
  extra_amount: 0,
  total_amount: 12000,
}

const result = {
  previous: snapshot,
  current: { ...snapshot, plan: 'N+1', extra_amount: 3000, total_amount: 15000 },
}

describe('CompensationComparisonCard', () => {
  it('展示 N 与 N+1 的两次试算和差额', () => {
    const wrapper = mount(CompensationComparisonCard, { props: { result } })
    expect(wrapper.text()).toContain('前次试算')
    expect(wrapper.text()).toContain('当前试算')
    expect(wrapper.text()).toContain('方案：N')
    expect(wrapper.text()).toContain('方案：N+1')
    expect(wrapper.text()).toContain('差额 +3,000.00')
  })

  it('缺失展示值时使用防御性降级', () => {
    const wrapper = mount(CompensationComparisonCard, {
      props: {
        result: {
          previous: { ...result.previous, employee_name: null, employee_no: null },
          current: { ...result.current, employee_name: null, employee_no: null },
        },
      },
    })
    expect(wrapper.text()).toContain('--')
  })
})
