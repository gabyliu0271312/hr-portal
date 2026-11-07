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
    expect(wrapper.findAll('.okr-objective__tag, .okr-kr__tag').map(tag => tag.text())).toEqual(['O\u00a01', 'KR\u00a01', 'KR\u00a02'])
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
  it('selects any returned period and switches objective data with boundary-aware arrows', async () => {
    const periods = Array.from({ length: 52 }, (_, i) => ({ ...okr, okr_id: String(i), period_label: `周期 ${i + 1}`, objectives: [{ ...okr.objectives[0], content: `周期目标 ${i + 1}` }] }))
    const wrapper = mount(PerformanceOkrPanel, { props: { okr, okrs: periods } })
    expect(wrapper.findAll('option')).toHaveLength(52)
    expect(wrapper.get('[aria-label="上一个OKR周期"]').attributes('disabled')).toBeDefined()
    await wrapper.get('select').setValue('51')
    expect(wrapper.text()).toContain('周期目标 52')
    expect(wrapper.get('[aria-label="下一个OKR周期"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[aria-label="上一个OKR周期"]').trigger('click')
    expect(wrapper.text()).toContain('周期目标 51')
    await wrapper.get('[aria-label="下一个OKR周期"]').trigger('click')
    expect(wrapper.text()).toContain('周期目标 52')
    await wrapper.setProps({ okrs: [periods[0]] })
    expect(wrapper.text()).toContain('周期目标 1')
  })

  it('keeps the period switcher identical to the REA two-arrow control', () => {
    // REA DOM：左右按钮完全同构（只有 top/left/bottom 三条边 + 左上左下 6px 圆角），
    // 右按钮靠整体 rotate(180deg) 翻到右侧。若给右按钮再加镜像边框/圆角，两次镜像会互相抵消，
    // 边框会跑到错误一侧、视觉上像「方向反了」。
    const wrapper = mount(PerformanceOkrPanel, { props: { okr } })
    const period = wrapper.find('.okr-period')
    expect(period.element.children).toHaveLength(3)
    const cursors = period.findAll('.okr-period__cursor')
    expect(cursors).toHaveLength(2)
    expect(cursors[0].classes()).toContain('okr-period__cursor--prev')
    expect(cursors[1].classes()).toEqual(['okr-period__cursor', 'okr-period__cursor--next'])
    expect(cursors[1].attributes('style')).toBeUndefined()
    expect(period.find('.okr-period__label > span').text()).toBe('2026 年度 OKR')
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

  it('switches periods returned by the task API without additional identity requests', async () => {
    const older = { ...okr, okr_id: 'older', period_label: '上个周期', objectives: [{ ...okr.objectives[0], content: '历史目标' }] }
    api.taskOkr.mockResolvedValue({ enabled: true, employee_no: 'E001', okr, okrs: [okr, older] })
    const wrapper = mount(PerformanceReferenceContent, { props: { reference: baseTab } })
    await flushPromises()
    await wrapper.get('select').setValue('1')
    expect(wrapper.text()).toContain('历史目标')
    await wrapper.setProps({ reference: { ...baseTab, task_id: null, okr, okrs: [okr] } })
    await flushPromises()
    expect(wrapper.findAll('option')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('历史目标')
    wrapper.unmount()
  })

  it('renders the empty panel when the task has no OKR', async () => {
    api.taskOkr.mockResolvedValue({ enabled: false, employee_no: 'E001', okr: null })
    const wrapper = mount(PerformanceReferenceContent, { props: { reference: baseTab } })
    await flushPromises()
    expect(wrapper.find('.okr-empty').text()).toContain('暂无 OKR 内容')
  })
})
