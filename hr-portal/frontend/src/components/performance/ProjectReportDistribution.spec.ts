import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProjectReportDistribution from './ProjectReportDistribution.vue'
import { mockProjectReportProvider } from './projectStatisticsReport'

describe('ProjectReportDistribution', () => {
  it('shows a single-series chart with accessible values and heat-colored bars', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const wrapper = mount(ProjectReportDistribution, { props: { report } })
    expect(wrapper.text()).toContain('总人数：124')
    expect(wrapper.text()).toContain('已评估人数：120')
    expect(wrapper.findAll('.chart-column')).toHaveLength(7)
    expect(wrapper.findAll('.chart-column')[3].attributes('aria-label')).toBe('3星：47人，占比39.2%')
    expect(wrapper.findAll('.chart-bar')[0].attributes('style')).toContain('height: 0%')
    expect(wrapper.findAll('.chart-bar')[0].classes()).not.toContain('heat-1')
    expect(wrapper.find('.chart-tooltip').exists()).toBe(true)
    expect(wrapper.find('tbody').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('更多')
    await wrapper.get('.comparison-button').trigger('click')
    expect(wrapper.emitted('compare')).toHaveLength(1)
    wrapper.unmount()
  })

  it('does not draw misleading bars or NaN for empty data', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.distribution = {}
    const wrapper = mount(ProjectReportDistribution, { props: { report } })
    expect(wrapper.text()).toContain('暂无已评估数据')
    expect(wrapper.find('.chart').exists()).toBe(false)
    expect(wrapper.html()).not.toMatch(/NaN|Infinity/)
    wrapper.unmount()
  })
})
