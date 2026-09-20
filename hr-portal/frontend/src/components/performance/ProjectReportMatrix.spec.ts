import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProjectReportMatrix from './ProjectReportMatrix.vue'
import { mockProjectReportProvider } from './projectStatisticsReport'

describe('ProjectReportMatrix', () => {
  it('keeps the summary first when sorting departments and retains tree children', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const wrapper = mount(ProjectReportMatrix, { props: { report } })
    await flushPromises()
    const table = wrapper.findComponent({ name: 'ElTable' })
    let rows = table.props('data') as any[]
    expect(rows.map(row => row.name)).toEqual(['汇总', '示例产品部', '示例研发部', '示例运营部'])
    expect(rows[1].children).toHaveLength(2)
    table.vm.$emit('sort-change', { prop: 'total', order: 'ascending' })
    await flushPromises()
    rows = table.props('data') as any[]
    expect(rows.map(row => row.total)).toEqual([120, 30, 40, 50])
    table.vm.$emit('sort-change', { prop: 'rating-3', order: 'descending' })
    await flushPromises()
    expect((table.props('data') as any[])[0].id).toBe('report-summary')
    expect(wrapper.text()).toContain('--')
    expect(wrapper.text()).toContain('39.2%')
    wrapper.unmount()
  })

  it('renders shared configured rating tags, captured sorting icons and explicit heat levels', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.ratings[0].label = '优秀'
    report.ratings[0].color = 'rgb(183, 237, 177)'
    report.heatLevels!['rating-3'] = 3
    const wrapper = mount(ProjectReportMatrix, { props: { report } })
    await flushPromises()
    expect(wrapper.findAllComponents({ name: 'PerformanceRatingTag' })).toHaveLength(7)
    const tags = wrapper.findAllComponents({ name: 'PerformanceRatingTag' })
    expect(tags[0].props()).toMatchObject({ label: '优秀', color: 'rgb(183, 237, 177)' })
    expect(wrapper.findAllComponents({ name: 'PerformanceSortHeader' })).toHaveLength(8)
    expect(wrapper.findAll('.caret-wrapper').length).toBeGreaterThan(0)
    expect(wrapper.find('.matrix-hint').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('更多')
    expect(wrapper.find('.matrix-heat-3').exists()).toBe(true)
    expect(wrapper.find('.matrix-heat-1').exists()).toBe(true)
    expect(wrapper.get('.matrix-value').attributes('style')).toBeUndefined()
    expect(wrapper.findComponent({ name: 'ElTable' }).props('maxHeight')).toBe(496)
    const toggle = wrapper.get('.matrix-tree-toggle')
    expect(toggle.find('svg').attributes('data-icon')).toBe('ExpandRightFilled')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    await flushPromises()
    expect(wrapper.get('.matrix-tree-toggle').attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  })

  it('keeps values neutral when the API provides no heat-level metadata', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.source = 'api'
    delete report.heatLevels
    report.departments = report.departments.map(({ id, name, counts }) => ({ id, name, counts }))
    const wrapper = mount(ProjectReportMatrix, { props: { report } })
    await flushPromises()
    expect(wrapper.findAll('.matrix-heat-1, .matrix-heat-2, .matrix-heat-3')).toHaveLength(0)
    expect(wrapper.text()).toContain('39.2%')
    wrapper.unmount()
  })

  it('lets the keyboard-accessible shared sort control drive the existing sort state', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const wrapper = mount(ProjectReportMatrix, { props: { report } })
    await flushPromises()
    const controls = wrapper.findAllComponents({ name: 'PerformanceSortHeader' })
    const total = controls.find(control => control.props('label') === '总人数')!
    expect(total.props('order')).toBe('descending')
    await total.trigger('click')
    await flushPromises()
    expect(total.props('order')).toBeNull()
    await total.trigger('click')
    await flushPromises()
    expect(total.props('order')).toBe('ascending')
    expect((wrapper.findComponent({ name: 'ElTable' }).props('data') as any[]).map(row => row.total)).toEqual([120, 30, 40, 50])
    wrapper.unmount()
  })

  it('uses an empty table rather than a synthetic summary for absent departments', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.departments = []
    const wrapper = mount(ProjectReportMatrix, { props: { report } })
    expect(wrapper.findComponent({ name: 'ElTable' }).props('data')).toEqual([])
    wrapper.unmount()
  })
})
