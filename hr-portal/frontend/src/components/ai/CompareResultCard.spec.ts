import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CompareResultCard from './CompareResultCard.vue'
import type { CompareResult } from '@/api/data-compare'

const base: CompareResult = {
  compare_type: 'roster',
  table_a: '月度花名册',
  table_b: '工资表',
  period_a: '202606',
  period_b: '202606',
  status: 'consistent',
  summary: { total_compared: 2, matched_count: 2, diff_count: 0, only_in_a_count: 0, only_in_b_count: 0, total_amount_a: null, total_amount_b: null, amount_diff: null },
  details: [],
  conclusion: '两侧数据一致。',
  duration_ms: 12,
  display: {
    template: 'auto', columns: [], highlight_columns: [], hidden_columns: [],
    show_context: true, show_explanation: true, sort_order: 'desc',
  },
}

describe('CompareResultCard', () => {
  it('展示空结果/一致状态', () => {
    const wrapper = mount(CompareResultCard, { props: { result: base } })
    expect(wrapper.text()).toContain('对比一致')
    expect(wrapper.text()).toContain('未发现差异')
  })

  it('展示差异和后端已脱敏字段', () => {
    const wrapper = mount(CompareResultCard, {
      props: {
        result: {
          ...base,
          status: 'partial_diff',
          summary: { ...base.summary, diff_count: 1, only_in_a_count: 1 },
          details: [{ employee_name: '***', diff_type: 'only_in_a' }],
          display: {
            template: 'auto', columns: ['employee_name', 'diff_type'], highlight_columns: ['employee_name'],
            hidden_columns: [], show_context: true, show_explanation: true, sort_order: 'desc',
          },
        },
      },
    })
    expect(wrapper.text()).toContain('发现差异')
    expect(wrapper.text()).toContain('***')
    expect(wrapper.find('th.highlighted').text()).toBe('员工姓名')
  })
})
