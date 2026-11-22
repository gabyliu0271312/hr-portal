import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import CalibrationTaskHome from './CalibrationTaskHome.vue'
import CalibrationScopeLink from './CalibrationScopeLink.vue'
import PerformanceCalibrationRuleSummary from '../PerformanceCalibrationRuleSummary.vue'
import PerformancePopover from '../PerformancePopover.vue'
import PerformanceSurfaceCard from '../PerformanceSurfaceCard.vue'
import summarySource from '../PerformanceCalibrationRuleSummary.vue?raw'
import scopeLinkSource from './CalibrationScopeLink.vue?raw'
import type { PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
const task = (id: number, status: PerformanceCalibrationTaskScope['status'], project = 1): PerformanceCalibrationTaskScope => ({ scope_key: `scope-${id}`, project_id: project, project_name: `项目${project}`, node_id: 'calibration', node_name: '校准', phase_id: 'phase-1', source_rule_id: `rule-${id}`, task_number: id, scope_label: '项目全员', rule: { scope: 'PROJECT_ALL' } as any, status, start_at: null, end_at: null, member_count: 2, can_complete: true, read_only: false })
afterEach(() => { document.body.innerHTML = '' })
describe('calibration task home', () => {
  it('places state radios and table in the shared white card and preserves controlled filter clicks', async () => {
    const wrapper = mount(CalibrationTaskHome, { props: { tasks: [task(1, 'pending'), task(2, 'completed')], pendingMemberCount: 1, filter: 'all', loading: false, error: '' } })
    const card = wrapper.getComponent(PerformanceSurfaceCard)
    expect(card.find('h1').exists()).toBe(false)
    expect(card.find('[role="radiogroup"]').attributes('aria-label')).toBe('校准任务状态')
    expect(card.find('table').exists()).toBe(true)
    expect(wrapper.find('[role="tab"]').exists()).toBe(false)
    const radios = card.findAll('[role="radio"]')
    expect(radios.map(radio => radio.text())).toEqual(['全部 (2)', '待校准 (1)', '已校准 (1)', '已逾期 (0)'])
    await radios[0].trigger('click')
    expect(wrapper.emitted('update:filter')).toBeUndefined()
    await radios[2].trigger('click')
    expect(wrapper.emitted('update:filter')).toEqual([['completed']])
    expect(wrapper.findAll('[data-scope]')).toHaveLength(2)
    await wrapper.setProps({ filter: 'completed' })
    expect(card.findAll('[role="radio"]')[2].attributes('aria-checked')).toBe('true')
    expect(wrapper.findAll('[data-scope]')).toHaveLength(1)
    wrapper.unmount()
  })
  it('hides unmatched project groups and preserves original task numbers and separate member count', async () => {
    const wrapper = mount(CalibrationTaskHome, { props: { tasks: [task(1, 'pending'), task(3, 'overdue'), task(4, 'pending', 2)], pendingMemberCount: 7, filter: 'overdue', loading: false, error: '' } })
    expect(wrapper.text()).toContain('待校准：7 人')
    expect(wrapper.text()).toContain('全部 (3)')
    expect(wrapper.text()).not.toContain('项目2')
    expect(wrapper.findAll('[data-scope]')).toHaveLength(1)
    expect(wrapper.find('[data-scope="scope-3"]').text()).toContain('3')
    await wrapper.setProps({ filter: 'completed' })
    expect(wrapper.findAll('th').map(node => node.text())).toEqual(['校准范围', '评估状态', '开始时间', '截止时间'])
    expect(wrapper.find('img').attributes('src')).toBe('/performance-no-submit.svg')
    expect(wrapper.text()).toContain('暂无数据')
    wrapper.unmount()
  })
  it('routes real range trigger click and keyboard selection through the fragment component', async () => {
    const wrapper = mount(CalibrationTaskHome, { props: { tasks: [task(3, 'overdue')], pendingMemberCount: 1, filter: 'all', loading: false, error: '' } })
    const trigger = wrapper.find('.rule-summary')
    expect(trigger.classes()).toContain('calibration-range')
    await trigger.trigger('click')
    expect(wrapper.emitted('select')?.[0]?.[0]).toMatchObject({ scope_key: 'scope-3' })
    await trigger.trigger('keydown', { key: 'Enter' })
    await trigger.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('select')).toHaveLength(3)
    wrapper.unmount()
  })
  it('does not expose stale rows on error, or empty image while loading', async () => {
    const wrapper = mount(CalibrationTaskHome, { props: { tasks: [task(2, 'pending')], pendingMemberCount: null, filter: 'all', loading: true, error: '' } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.text()).toContain('正在加载校准任务')
    await wrapper.setProps({ loading: false, error: '没有访问权限' })
    expect(wrapper.find('[role="alert"]').text()).toContain('没有访问权限')
    expect(wrapper.find('[data-scope]').exists()).toBe(false)
    await wrapper.find('[role="alert"] button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    wrapper.unmount()
  })
  it('isolates scope sizing and condition variants from existing rule configuration summaries', async () => {
    const rule = { scope: 'RULE', scope_groups: [{ conditions: [{ field: 'employee', operator: 'INCLUDE', values: ['E1'] }] }] } as any
    const legacy = mount(PerformanceCalibrationRuleSummary, { attachTo: document.body, props: { rule, peopleOptions: [{ value: 'E1', label: '员工一' }] } })
    expect(legacy.get('.rule-summary').classes()).not.toContain('rule-summary--scope')
    await legacy.get('.rule-summary').trigger('focusin')
    await flushPromises()
    expect(document.querySelector('.rule-summary__popover--scope')).toBeNull()
    expect(document.querySelector('.rule-summary__details--scope')).toBeNull()
    expect(legacy.getComponent(PerformancePopover).props('width')).toBe('auto')
    legacy.unmount()

    const scope = { ...task(1, 'pending'), scope_label: '人员 包含 员工一', rule, people_options: [{ employee_no: 'E1', display_name: '员工一' }] }
    const wrapper = mount(CalibrationScopeLink, { attachTo: document.body, props: { scope } })
    expect(wrapper.get('.rule-summary').classes()).toContain('rule-summary--scope')
    await wrapper.get('.rule-summary').trigger('focusin')
    await flushPromises()
    const details = document.querySelector('.rule-summary__details--scope')!
    expect(details.querySelector('.rule-summary__field')?.textContent).toBe('人员')
    expect(details.querySelector('.rule-summary__person')?.textContent).toContain('员工一')
    expect(details.querySelector('.performance-select-shell__tag-avatar--fallback')?.textContent).toBe('一')
    expect(wrapper.getComponent(PerformancePopover).props('width')).toBe('auto')
    await wrapper.setProps({ snapshot: true })
    expect(wrapper.getComponent(PerformancePopover).props('width')).toBe('var(--performance-calibration-scope-max-width)')
    expect(scopeLinkSource).toMatch(/\.calibration-range\s*\{[^}]*width:\s*auto;[^}]*flex:\s*0 1 auto;/)
    expect(summarySource).toMatch(/\.rule-summary__details--scope \.rule-summary__field\s*\{[^}]*height:\s*var\(--performance-calibration-scope-field-height\)/)
    expect(summarySource).toMatch(/\.rule-summary__details--scope \.rule-summary__person\s*\{[^}]*padding:\s*0 var\(--performance-calibration-scope-person-padding-right\) 0 var\(--performance-calibration-scope-person-padding-left\)/)
    wrapper.unmount()
  })
  it('opens project-all hover for focus, omits home note, includes snapshot note in fullscreen, handles Escape', async () => {
    const wrapper = mount(CalibrationScopeLink, { attachTo: document.body, props: { scope: task(1, 'pending') } })
    await wrapper.find('.rule-summary').trigger('focusin')
    await flushPromises()
    expect(document.body.textContent).toContain('具体校准范围')
    expect(document.body.textContent).not.toContain('备注：')
    await wrapper.setProps({ snapshot: true })
    expect(document.body.textContent).toContain('以校准任务开始时刻圈定')
    await wrapper.find('.rule-summary').trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(document.querySelector('.calibration-rule-summary-popover')).toBeNull()
    wrapper.unmount()
  })
})
