import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { ElDropdown } from 'element-plus'
import ProjectReportDistribution from './ProjectReportDistribution.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import { mockProjectReportProvider } from './projectStatisticsReport'

afterEach(() => { document.body.innerHTML = '' })

describe('ProjectReportDistribution', () => {
  it('shows captured blue bars, full-category shadow, percent ticks and a body tooltip following the pointer', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.indicatorLabel = '价值贡献'
    const wrapper = mount(ProjectReportDistribution, { props: { report }, attachTo: document.body })
    expect(wrapper.text()).toContain('总人数：124')
    expect(wrapper.text()).toContain('已评估人数：120')
    expect(wrapper.findAll('.chart-column')).toHaveLength(7)
    expect(wrapper.findAll('.chart-column')[3].attributes('aria-label')).toBe('3星：47人，占比39.2%')
    expect(wrapper.findAll('.chart-bar')[0].attributes('style')).toContain('height: 0%')
    expect(wrapper.get('.chart-bar').attributes('style')).toContain('rgb(78, 131, 253)')
    expect(wrapper.findAll('.chart-axis-line')).toHaveLength(7)
    expect(wrapper.findAll('.chart-gridline span').every(tick => tick.text().endsWith('%'))).toBe(true)
    expect(wrapper.findAll('.chart-gridline span').some(tick => tick.text() === '0%')).toBe(false)
    await wrapper.findAll('.chart-column')[3].trigger('mouseenter', { clientX: 100, clientY: 100 })
    await flushPromises()
    const tooltip = document.body.querySelector('.chart-tooltip')!
    expect(tooltip.textContent).toContain('价值贡献（终评）')
    expect(tooltip.textContent).toContain('3星')
    expect(tooltip.textContent!.match(/39.2%/g)).toHaveLength(1)
    expect(tooltip.parentElement).toBe(document.body)
    const left = (tooltip as HTMLElement).style.left
    await wrapper.findAll('.chart-column')[3].trigger('mousemove', { clientX: 200, clientY: 100 })
    await flushPromises()
    expect((tooltip as HTMLElement).style.left).not.toBe(left)
    expect(wrapper.findAll('.chart-column')[3].classes()).toContain('column-active')
    await wrapper.findAll('.chart-column')[3].trigger('mouseleave')
    expect(document.body.querySelector('.chart-tooltip')).toBeNull()
    await wrapper.findAll('.chart-column')[0].trigger('mouseenter')
    expect(wrapper.findAll('.chart-column')[0].classes()).toContain('column-active')
    wrapper.unmount()
  })

  it('keeps axes, rating labels and the shared illustration for empty data', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.distribution = {}
    const wrapper = mount(ProjectReportDistribution, { props: { report } })
    expect(wrapper.text()).toContain('暂无已评估数据')
    expect(wrapper.find('.chart').exists()).toBe(true)
    expect(wrapper.findAll('.chart-label')).toHaveLength(7)
    expect(wrapper.find('.metric-template-empty-illustration').exists()).toBe(true)
    expect(wrapper.html()).not.toMatch(/NaN|Infinity/)
    wrapper.unmount()
  })

  it('requests comparisons by dimension and adds removable independent series using each group denominator', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const comparison = await mockProjectReportProvider({ cycleId: 1, dimension: 'team' })
    comparison.departments = [{ id: 'a', name: '研发团队', counts: { 'rating-0': 2, 'rating-1': 2 } }, { id: 'b', name: '设计团队', counts: { 'rating-0': 3 } }]
    const wrapper = mount(ProjectReportDistribution, { props: { report, comparisonReports: { team: comparison } } })
    wrapper.findComponent(ElDropdown).vm.$emit('command', 'team')
    await flushPromises()
    expect(wrapper.emitted('compare')).toEqual([['team']])
    const selector = wrapper.findComponent(PerformanceSearchSelect)
    expect(selector.props('options')!.map((item: any) => item.label)).toEqual(['研发团队', '设计团队'])
    selector.vm.$emit('update:modelValue', ['a', 'b'])
    await flushPromises()
    const survivingColor = wrapper.findAll('.chart-column')[0].findAll('.chart-bar')[2].attributes('style')
    expect(wrapper.findAll('.chart-bar')).toHaveLength(21)
    expect(wrapper.findAll('.chart-column')[0].findAll('.chart-bar')[1].attributes('aria-label')).toContain('50.0%')
    expect(wrapper.findAll('.chart-column')[0].findAll('.chart-bar')[2].attributes('aria-label')).toContain('100.0%')
    expect(wrapper.findAll('.chart-legend span')).toHaveLength(3)
    await wrapper.get('[aria-label="移除研发团队"]').trigger('click')
    expect(wrapper.findAll('.chart-bar')).toHaveLength(14)
    expect(wrapper.findAll('.chart-column')[0].findAll('.chart-bar')[1].attributes('style')).toBe(survivingColor)
    wrapper.unmount()
  })

  it('permits more than seven comparison groups without cycling colors and exposes textured overflow with a visible table', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const comparison = { ...report, departments: Array.from({ length: 9 }, (_, i) => ({ id: `group-${i}`, name: `分组${i}`, counts: { 'rating-0': i + 1 } })) }
    const wrapper = mount(ProjectReportDistribution, { props: { report, comparisonReports: { team: comparison } } })
    wrapper.findComponent(ElDropdown).vm.$emit('command', 'team')
    await flushPromises()
    const selector = wrapper.findComponent(PerformanceSearchSelect)
    expect(selector.props('options')!.every(option => !option.disabled)).toBe(true)
    selector.vm.$emit('update:modelValue', comparison.departments.map(row => row.id))
    await flushPromises()
    const bars = wrapper.findAll('.chart-column')[0].findAll('.chart-bar')
    expect(bars).toHaveLength(10)
    expect(bars[8].attributes('style')).toContain('rgb(100, 106, 115)')
    expect(bars[8].attributes('style')).toContain('repeating-linear-gradient')
    expect(bars[8].attributes('style')).not.toBe(bars[9].attributes('style'))
    expect(wrapper.get('.distribution-table').attributes()).toHaveProperty('open')
    expect(wrapper.findAll('tbody tr')).toHaveLength(10)
    wrapper.unmount()
  })

  it('emits indicator keys and reflects the selected indicator label', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.indicators = [{ key: 'value', label: '价值贡献' }, { key: 'effort', label: '投入度' }]
    report.indicatorKey = 'value'
    const wrapper = mount(ProjectReportDistribution, { props: { report } })
    expect(wrapper.get('.rating-tab').text()).toBe('价值贡献')
    wrapper.findAllComponents(ElDropdown)[0].vm.$emit('command', 'effort')
    expect(wrapper.emitted('indicator-change')).toEqual([['effort']])
    await wrapper.setProps({ report: { ...report, indicatorKey: 'effort' } })
    expect(wrapper.get('.rating-tab').text()).toBe('投入度')
    wrapper.unmount()
  })
})
