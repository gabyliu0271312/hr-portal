import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceOkrPanel from './PerformanceOkrPanel.vue'
import PerformanceReferenceContent from './PerformanceReferenceContent.vue'
import type { PerformanceOkrView, PerformanceReferenceTab } from '@/api/performance'

const okr: PerformanceOkrView = {
  source: 'feishu',
  okr_id: '7072',
  period_id: '6990',
  period_label: '2026 年度 OKR',
  objectives: [
    {
      id: 'o1',
      content: '提升交付效率',
      weight: 100,
      percent: 66.7,
      status: 'normal',
      key_results: [
        { id: 'k1', content: '自动化覆盖率 60%', weight: 50, percent: 100, status: 'normal' },
        { id: 'k2', content: '平均交付周期 -20%', weight: 50, percent: 33.3, status: 'risk' },
      ],
    },
  ],
}

describe('PerformanceOkrPanel', () => {
  it('renders real objectives, key results, progress and status', () => {
    const wrapper = mount(PerformanceOkrPanel, { props: { okr } })

    expect(wrapper.text()).toContain('2026 年度 OKR')
    expect(wrapper.text()).toContain('提升交付效率')
    expect(wrapper.findAll('.okr-objective__tag, .okr-kr__tag').map(tag => tag.text())).toEqual(['O1', 'KR1', 'KR2'])
    expect(wrapper.text()).toContain('自动化覆盖率 60%')
    // 百分比保留一位小数；权重整数不带小数、非整数保留一位
    expect(wrapper.findAll('.okr-kr__percent').map(node => node.text())).toEqual(['100%', '33.3%'])
    expect(wrapper.findAll('.okr-kr__weight').map(node => node.text())).toEqual(['50.0%', '50.0%'])
    // 状态徽标：正常 / 有风险
    expect(wrapper.findAll('.okr-kr__badge').map(node => node.text())).toEqual(['正常', '有风险'])
    expect(wrapper.find('.okr-kr__badge--risk').exists()).toBe(true)
  })

  it('sizes the progress bar from percent', () => {
    const wrapper = mount(PerformanceOkrPanel, { props: { okr } })
    const bars = wrapper.findAll('.okr-progress__bar')
    expect(bars[0].attributes('style')).toContain('width: 100%')
    expect(bars[1].attributes('style')).toContain('width: 33.3%')
  })

  it('shows the placeholder skeleton in template preview when no data', () => {
    const wrapper = mount(PerformanceOkrPanel, { props: { placeholder: true } })
    expect(wrapper.text()).toContain(`${new Date().getFullYear()} 年度 OKR`)
    expect(wrapper.findAll('.okr-objective__tag, .okr-kr__tag').map(tag => tag.text())).toEqual(['O1', 'KR1', 'KR2'])
    expect(wrapper.text()).toContain('展示内容以实际数据为准')
  })

  it('shows an empty state when the employee has no OKR', () => {
    const wrapper = mount(PerformanceOkrPanel, { props: { okr: null } })
    expect(wrapper.find('.okr-empty').text()).toContain('暂无 OKR 内容')
    expect(wrapper.findAll('.okr-objective__tag, .okr-kr__tag')).toHaveLength(0)
  })
})

/* TODO(OKR 引用接入)：PerformanceReferenceContent 尚未实现 kind='okr' 分支（当前只有模板只读/空态两条路径），
   该组用例随之待实现后再启用，避免把未接入的能力算作回归。 */
describe.skip('PerformanceReferenceContent · OKR tab', () => {
  const baseTab: PerformanceReferenceTab = {
    key: 'reference-okr',
    kind: 'okr',
    node_id: '',
    node_name: 'OKR',
    task_id: null,
    employee_no: 'E001',
    status: 'completed',
    submitted_at: null,
    form_schema: [],
    answers: {},
    can_remind: false,
    okr,
  }

  it('renders okr reference instead of the template form renderer', () => {
    const wrapper = mount(PerformanceReferenceContent, { props: { reference: baseTab } })
    expect(wrapper.find('.okr-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('提升交付效率')
    expect(wrapper.find('.performance-reference-empty').exists()).toBe(false)
  })

  it('falls back to empty state when okr payload is missing', () => {
    const wrapper = mount(PerformanceReferenceContent, { props: { reference: { ...baseTab, okr: null } } })
    expect(wrapper.find('.okr-empty').text()).toContain('暂无 OKR 内容')
  })
})
