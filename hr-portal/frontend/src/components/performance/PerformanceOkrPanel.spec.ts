import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PerformanceOkrPanel from './PerformanceOkrPanel.vue'
import PerformanceReferenceContent from './PerformanceReferenceContent.vue'
import type { PerformanceOkrView, PerformanceReferenceTab } from '@/api/performance'

const api = vi.hoisted(() => ({ taskOkr: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceOkrApi: api }))

const okr: PerformanceOkrView = { source: 'feishu', okr_id: '7072', period_id: '6990', period_label: '2026 年度 OKR', objectives: [{ id: 'o1', content: '提升交付效率', weight: 100, percent: 66.7, status: 'normal', key_results: [{ id: 'k1', content: '自动化覆盖率 60%', weight: 50, percent: 100, status: 'normal' }, { id: 'k2', content: '平均交付周期 -20%', weight: 50, percent: 33.3, status: 'risk' }] }] }
const baseTab: PerformanceReferenceTab = { key: 'reference-okr', kind: 'okr', node_id: '', node_name: 'OKR', task_id: 17, employee_no: 'E001', status: 'not_started', submitted_at: null, form_schema: [], answers: {}, can_remind: false, okr: null }

describe('PerformanceOkrPanel', () => {
  it('renders real objectives, key results, progress and status', () => {
    const wrapper = mount(PerformanceOkrPanel, { props: { okr } })
    expect(wrapper.text()).toContain('2026 年度 OKR')
    expect(wrapper.text()).toContain('提升交付效率')
    expect(wrapper.findAll('.okr-objective__tag, .okr-kr__tag').map(tag => tag.text())).toEqual(['O1', 'KR1', 'KR2'])
    expect(wrapper.findAll('.okr-kr__percent').map(node => node.text())).toEqual(['100%', '33.3%'])
    expect(wrapper.findAll('.okr-kr__badge').map(node => node.text())).toEqual(['正常', '有风险'])
  })
  it('shows the placeholder skeleton in template preview when no data', () => {
    const wrapper = mount(PerformanceOkrPanel, { props: { placeholder: true } })
    expect(wrapper.text()).toContain(`${new Date().getFullYear()} 年度 OKR`)
    expect(wrapper.text()).toContain('展示内容以实际数据为准')
  })
  it('shows an empty state when the employee has no OKR', () => {
    const wrapper = mount(PerformanceOkrPanel, { props: { okr: null } })
    expect(wrapper.find('.okr-empty').text()).toContain('暂无 OKR 内容')
  })
})

describe('PerformanceReferenceContent · OKR tab', () => {
  it('fetches the task OKR and renders real data', async () => {
    api.taskOkr.mockResolvedValue({ enabled: true, source: 'feishu', employee_no: 'E001', okr })
    const wrapper = mount(PerformanceReferenceContent, { props: { reference: baseTab } })
    await flushPromises()
    expect(api.taskOkr).toHaveBeenCalledWith(17)
    expect(wrapper.find('.okr-card').exists()).toBe(true)
    expect(wrapper.text()).toContain('提升交付效率')
  })

  it('renders the empty panel when the task has no OKR', async () => {
    api.taskOkr.mockResolvedValue({ enabled: false, employee_no: 'E001', okr: null })
    const wrapper = mount(PerformanceReferenceContent, { props: { reference: baseTab } })
    await flushPromises()
    expect(wrapper.find('.okr-empty').text()).toContain('暂无 OKR 内容')
  })
})
