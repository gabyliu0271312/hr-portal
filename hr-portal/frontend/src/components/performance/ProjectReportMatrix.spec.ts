import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ProjectReportComparison from './ProjectReportComparison.vue'
import PerformanceComparisonMatrix from './PerformanceComparisonMatrix.vue'
import PerformanceComparisonDimensionSelector from './PerformanceComparisonDimensionSelector.vue'
import PerformanceReportCycleSelector from './PerformanceReportCycleSelector.vue'
import { mockProjectReportComparison } from './projectStatisticsReport'
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
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

  it('renders team and sequence rows with summary configuration', async () => {
    const team = await mockProjectReportProvider({ cycleId: 1, dimension: 'team' })
    const teamWrapper = mount(ProjectReportMatrix, { props: { report: team } })
    await flushPromises()
    expect(teamWrapper.get('.el-table__header').text()).toContain('上级')
    expect((teamWrapper.findComponent({ name: 'ElTable' }).props('data') as any[])[0].id).toBe('report-summary')
    expect((teamWrapper.findComponent({ name: 'ElTable' }).props('data') as any[]).some(row => row.name === '示例上级A')).toBe(true)
    teamWrapper.unmount()

    const sequence = await mockProjectReportProvider({ cycleId: 1, dimension: 'sequence' })
    const sequenceWrapper = mount(ProjectReportMatrix, { props: { report: sequence } })
    await flushPromises()
    expect(sequenceWrapper.get('.el-table__header').text()).toContain('序列（筛选结果含子序列）')
    expect((sequenceWrapper.findComponent({ name: 'ElTable' }).props('data') as any[])[0].id).toBe('report-summary')
    sequenceWrapper.unmount()
  })

  it('renders flat tenure buckets with a summary and no expansion control', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.source = 'api'
    report.dimension = 'tenure'
    report.rowLabel = '司龄'
    report.departments = [
      { id: 'tenure:under-3', name: '入职未满3个月', counts: {} },
      { id: 'tenure:missing', name: '入职日期缺失', counts: {} },
    ]
    const wrapper = mount(ProjectReportMatrix, { props: { report } })
    await flushPromises()
    expect(wrapper.get('.el-table__header').text()).toContain('司龄')
    expect((wrapper.findComponent({ name: 'ElTable' }).props('data') as any[])[0].name).toBe('汇总')
    expect(wrapper.findAll('.matrix-tree-toggle')).toHaveLength(0)
    expect(wrapper.text()).toContain('入职未满3个月')
    expect(wrapper.text()).toContain('入职日期缺失')
    wrapper.unmount()
  })

  it('renders level summary and zero rows without any expandable children', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.dimension = 'level'
    report.rowLabel = '岗位职级'
    report.source = 'api'
    report.departments[1].counts = {}
    delete report.heatLevels
    report.departments.forEach(row => { delete row.heatLevels })
    const wrapper = mount(ProjectReportMatrix, { props: { report } })
    await flushPromises()
    const table = wrapper.findComponent({ name: 'ElTable' })
    const rows = table.props('data') as any[]
    expect(rows[0].name).toBe('汇总')
    expect(rows.every(row => !row.children)).toBe(true)
    expect(wrapper.findAll('.matrix-tree-toggle')).toHaveLength(0)
    expect(wrapper.get('.el-table__header').text()).toContain('岗位职级')
    expect(wrapper.text()).toContain('--')
    expect(wrapper.findAll('.matrix-heat-1, .matrix-heat-2, .matrix-heat-3')).toHaveLength(0)
    table.vm.$emit('sort-change', { prop: 'total', order: 'ascending' })
    await flushPromises()
    expect((table.props('data') as any[])[0].name).toBe('汇总')
    wrapper.unmount()
  })

  it('renders real level headers as rule grades with configured colors, not grade names', async () => {
    const labels = ['1星', '2星', '3星-', '3星', '3星+', '4星', '5星']
    const colors = ['rgb(251, 191, 188)', 'rgb(254, 212, 164)', 'rgb(248, 230, 171)', 'rgb(183, 237, 177)', 'rgb(169, 239, 230)', 'rgb(177, 232, 252)', 'rgb(186, 206, 253)']
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.source = 'api'
    report.dimension = 'level'
    report.rowLabel = '岗位职级'
    report.ratings = labels.map((label, index) => ({ key: `rule-level-${index}`, label, color: colors[index] }))
    const wrapper = mount(ProjectReportMatrix, { props: { report } })
    await flushPromises()
    const tags = wrapper.findAllComponents({ name: 'PerformanceRatingTag' })
    expect(tags.map(tag => tag.props('label'))).toEqual(labels)
    expect(tags.map(tag => tag.props('color'))).toEqual(colors)
    for (const name of ['不合格', '待改进', '符合预期', '超出预期', '卓越']) {
      expect(wrapper.get('.el-table__header').text()).not.toContain(name)
    }
    expect(wrapper.findAll('.matrix-tree-toggle')).toHaveLength(0)
    wrapper.unmount()
  })

  it('uses an empty table rather than a synthetic summary for absent departments', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.departments = []
    const wrapper = mount(ProjectReportMatrix, { props: { report } })
    expect(wrapper.findComponent({ name: 'ElTable' }).props('data')).toEqual([])
    expect(wrapper.find('.el-table__header').exists()).toBe(true)
    expect(wrapper.find('.metric-template-empty-illustration').exists()).toBe(true)
    wrapper.unmount()
  })

  it('shares extra width equally between every rating column and retains the 140px minimum', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    let resize!: ResizeObserverCallback
    vi.stubGlobal('ResizeObserver', class { constructor(callback: ResizeObserverCallback) { resize = callback } observe() {} unobserve() {} disconnect() {} })
    const wrapper = mount(ProjectReportMatrix, { props: { report }, global: { stubs: { ElTable: { template: '<div><slot /></div>' }, ElTableColumn: true } } })
    resize([{ contentRect: { width: 1750 } }] as ResizeObserverEntry[], {} as ResizeObserver)
    await flushPromises()
    let columns = wrapper.findAllComponents({ name: 'ElTableColumn' }).filter(column => column.props('className') === 'matrix-rating-column')
    expect(columns).toHaveLength(7)
    expect(columns.map(column => column.props('minWidth'))).toEqual(Array(7).fill(200))
    resize([{ contentRect: { width: 700 } }] as ResizeObserverEntry[], {} as ResizeObserver)
    await flushPromises()
    columns = wrapper.findAllComponents({ name: 'ElTableColumn' }).filter(column => column.props('className') === 'matrix-rating-column')
    expect(columns.map(column => column.props('minWidth'))).toEqual(Array(7).fill(140))
    wrapper.unmount()
  })
})

describe('report comparison matrices', () => {
  it('uses Y rows and X columns, dynamic geometry and forwards selected dimension keys', async () => {
    const comparison = { ...mockProjectReportComparison(), source: 'api' as const }
    comparison.xRatings = comparison.ratings.slice(0, 3)
    comparison.yRatings = comparison.ratings.slice(0, 2)
    comparison.xOptions = [{ key: 'value', label: '价值贡献' }, { key: 'effort', label: '投入度' }]
    comparison.yOptions = comparison.xOptions
    comparison.xKey = 'value'
    comparison.yKey = 'effort'
    comparison.counts = [[1, 2, 3], [4, 5, 6]]
    comparison.heatLevels = [[1, 2, 3], [1, 2, 3]]
    comparison.total = 21
    const wrapper = mount(ProjectReportComparison, { props: { comparison, kind: 'dimension' } })
    expect(wrapper.findAll('.performance-comparison-cell')).toHaveLength(6)
    expect(wrapper.findAll('.performance-comparison-cell')[4].text()).toBe('23.8%5')
    expect(wrapper.get('.matrix-grid').attributes('style')).toContain('repeat(3, minmax(132px, 1fr))')
    expect(wrapper.findAll('.row-label')).toHaveLength(2)
    expect(wrapper.findAll('.column-label')).toHaveLength(3)
    expect(wrapper.findAll('.performance-comparison-cell.clickable')).toHaveLength(6)
    const selectors = wrapper.findAllComponents(PerformanceComparisonDimensionSelector)
    expect(selectors[0].props('modelValue')).toBe('effort')
    expect(selectors[1].props('modelValue')).toBe('value')
    selectors[1].vm.$emit('update:modelValue', 'effort')
    expect(wrapper.emitted('change')).toEqual([[{ xKey: 'effort' }]])
    await wrapper.findAll('.performance-comparison-cell')[4].trigger('click')
    expect(wrapper.emitted('cell')).toEqual([[{ rowKey: comparison.yRatings[1].key, columnKey: comparison.xRatings[1].key, count: 5 }]])
    wrapper.unmount()
  })

  it('updates selected keys from parent and preserves axes with the shared illustration for zero counts', async () => {
    const comparison = mockProjectReportComparison()
    comparison.counts = []
    comparison.total = 0
    const wrapper = mount(ProjectReportComparison, { props: { comparison } })
    expect(wrapper.findAll('.column-label')).toHaveLength(7)
    expect(wrapper.findAll('.row-label')).toHaveLength(7)
    expect(wrapper.find('.metric-template-empty-illustration').exists()).toBe(true)
    expect(wrapper.findAll('.focus-area')).toHaveLength(0)
    await wrapper.setProps({ comparison: { ...comparison, xKey: 'new', xOptions: [{ key: 'new', label: '新维度' }] } })
    expect(wrapper.findComponent(PerformanceComparisonMatrix).props('columnDimension')).toBe('new')
    expect(wrapper.text()).toContain('自评：新维度')
    expect(wrapper.html()).not.toMatch(/NaN|Infinity/)
    wrapper.unmount()
  })

  it.each([['INSUFFICIENT_DIMENSIONS', '维度不足两个'], ['NO_HISTORY', '暂无可对比的历史绩效周期']])('explains %s while preserving the real axis and only displays examples after an explicit click', async (emptyReason, text) => {
    const rating = { key: 'real-rating', label: '真实档位', color: '#3370ff' }
    const history = emptyReason === 'NO_HISTORY'
    const comparison = {
      ...mockProjectReportComparison(), source: 'api' as const, ratings: [rating], counts: [], total: 0, emptyReason,
      xRatings: history ? [] : [rating], yRatings: history ? [rating] : [],
      xOptions: history ? [] : [{ key: 'actual', label: '实际评估项' }],
      yOptions: history ? [{ key: 'actual', label: '本期评估项' }] : [],
    }
    const wrapper = mount(ProjectReportComparison, { props: { comparison, kind: history ? 'history' : 'dimension' } })
    expect(wrapper.text()).toContain(text)
    expect(wrapper.findComponent(PerformanceComparisonMatrix).exists()).toBe(true)
    expect(wrapper.findAll('.performance-comparison-cell')).toHaveLength(0)
    expect(wrapper.findAllComponents({ name: 'PerformanceRatingTag' }).map(tag => tag.props('label'))).toEqual(['真实档位'])
    expect(wrapper.text()).toContain(history ? '暂无历史评级' : '暂无第二评估项')
    expect(wrapper.text()).not.toContain('1星')
    expect(wrapper.find('.metric-template-empty-illustration').exists()).toBe(true)
    expect(wrapper.findAll('.axis-selector.is-unavailable')).toHaveLength(1)
    await wrapper.get('.example-button').trigger('click')
    expect(wrapper.text()).toContain('示例数据，仅用于展示图表效果，不代表真实绩效结果')
    expect(wrapper.findAll('.performance-comparison-cell')).toHaveLength(49)
    wrapper.findComponent(PerformanceComparisonMatrix).vm.$emit('dimension-change', 'x', 'rating')
    expect(wrapper.emitted('change')).toBeUndefined()
    await wrapper.get('.comparison-example-notice button').trigger('click')
    expect(wrapper.text()).toContain('真实档位')
    expect(wrapper.findAll('.performance-comparison-cell')).toHaveLength(0)
    wrapper.unmount()
  })

  it.each(['self-final', 'dimension', 'history'] as const)('keeps %s titles and placeholders with neither axis configured', kind => {
    const comparison = { ...mockProjectReportComparison(), source: 'api' as const, ratings: [], xRatings: [], yRatings: [], xOptions: [], yOptions: [], counts: [], total: 0 }
    const wrapper = mount(ProjectReportComparison, { props: { comparison, kind } })
    expect(wrapper.findAllComponents(PerformanceComparisonDimensionSelector)).toHaveLength(2)
    expect(wrapper.findAll('.axis-selector.is-unavailable')).toHaveLength(2)
    expect(wrapper.findAll('.comparison-axis-missing')).toHaveLength(2)
    expect(wrapper.find('.metric-template-empty-illustration').exists()).toBe(true)
    expect(wrapper.findAllComponents({ name: 'PerformanceRatingTag' })).toHaveLength(0)
    expect(wrapper.findAll('.performance-comparison-cell')).toHaveLength(0)
    expect(wrapper.text()).toContain(kind === 'self-final' ? '未配置自评评级' : kind === 'dimension' ? '暂无第二评估项' : '暂无历史评级')
    expect(wrapper.text()).toContain(kind === 'history' ? '本期终评：未配置评估项' : '终评：未配置评估项')
    wrapper.unmount()
  })

  it('preserves configured final ratings when self ratings are absent without reusing final ratings', () => {
    const rating = { key: 'final-rating', label: '终评真实档位' }
    const comparison = { ...mockProjectReportComparison(), source: 'api' as const, ratings: [], xRatings: [], yRatings: [rating], xOptions: [], yOptions: [{ key: 'actual', label: '实际评估项' }], counts: [ [] ], total: 0 }
    const wrapper = mount(ProjectReportComparison, { props: { comparison } })
    expect(wrapper.get('.row-labels').text()).toBe('终评真实档位')
    expect(wrapper.get('.column-labels').text()).toBe('未配置自评评级')
    expect(wrapper.findAll('.performance-comparison-cell')).toHaveLength(0)
    wrapper.unmount()
  })

  it('ignores stale positive cells and focus areas when either axis is missing', () => {
    const wrapper = mount(PerformanceComparisonMatrix, { props: { rows: [{ value: 'real', label: '真实评级' }], columns: [], cells: [[{ count: 99, heatLevel: 3 }]], denominator: 99, rowDimensionOptions: [], columnDimensionOptions: [], focusAreas: [{ side: 'left', rowStart: 1, rowSpan: 1, columnSpan: 1 }] } })
    expect(wrapper.findAll('.performance-comparison-cell, .focus-area')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('99')
    expect(wrapper.text()).toContain('暂无统计数据')
    expect(wrapper.emitted('cell')).toBeUndefined()
    wrapper.unmount()
  })

  it('exposes historical cycle choices and sends numeric historyCycleId', async () => {
    const comparison = { ...mockProjectReportComparison(), historyCycles: [{ id: 3, name: '2025年' }], historyCycleId: 3 }
    const wrapper = mount(ProjectReportComparison, { props: { comparison, kind: 'history' } })
    const selector = wrapper.findAllComponents(PerformanceReportCycleSelector).find(item => item.props('axis') === 'x')!
    expect(selector.props('cycles')).toEqual([{ id: 3, name: '2025年' }])
    selector.vm.$emit('select', 3, 'rating')
    expect(wrapper.emitted('change')).toEqual([[{ historyCycleId: 3, xKey: 'rating' }]])
    expect(wrapper.text()).toContain('2025年：')
    wrapper.unmount()
  })
})
