import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import ProjectReportDistribution from './ProjectReportDistribution.vue'
import ProjectReportComparisonMenu from './ProjectReportComparisonMenu.vue'
import PerformanceSegmentedControl from './PerformanceSegmentedControl.vue'
import { mockProjectReportProvider } from './projectStatisticsReport'

afterEach(() => { document.body.innerHTML = '' })

async function openDimension(wrapper: ReturnType<typeof mount>, dimension = 'team') {
  await wrapper.get('.comparison-button').trigger('click')
  await flushPromises()
  const button = document.body.querySelector<HTMLButtonElement>(`[data-dimension="${dimension}"]`)!
  button.click()
  await flushPromises()
}
async function clickNode(name: string) {
  const label = Array.from(document.body.querySelectorAll<HTMLElement>('.comparison-tree-label')).find(item => item.textContent?.startsWith(name))!
  label.click()
  await flushPromises()
}

describe('ProjectReportDistribution', () => {
  it('opens only real nonzero bars with their exact group and rating keys', async () => {
    const report = { ...await mockProjectReportProvider({ cycleId: 1 }), source: 'api' as const }
    const wrapper = mount(ProjectReportDistribution, { props: { report } })
    try {
      await wrapper.findAll('.chart-bar')[0].trigger('click')
      expect(wrapper.emitted('people')).toBeUndefined()
      const index = report.ratings.findIndex(rating => report.distribution[rating.key] > 0)
      await wrapper.findAll('.chart-bar')[index].trigger('keydown', { key: 'Enter' })
      expect(wrapper.emitted('people')?.[0]?.[0]).toMatchObject({ dimension: 'department', rowLabel: '汇总', ratingKey: report.ratings[index].key })
      await wrapper.setProps({ report: { ...report, source: 'mock' } })
      await wrapper.findAll('.chart-bar')[index].trigger('click')
      expect(wrapper.emitted('people')).toHaveLength(1)
    } finally { wrapper.unmount() }
  })
  it('shows captured blue bars, full-category shadow, percent ticks and a body tooltip following the pointer', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.indicatorLabel = '价值贡献'
    const wrapper = mount(ProjectReportDistribution, { props: { report }, attachTo: document.body })
    expect(wrapper.text()).toContain('总人数：124')
    expect(wrapper.text()).toContain('已评估人数：120')
    expect(wrapper.findAll('.chart-column')).toHaveLength(7)
    expect(wrapper.text()).not.toContain('查看数据表')
    expect(wrapper.find('.distribution-table').exists()).toBe(false)
    expect(wrapper.findAll('.chart-column')[3].attributes('aria-label')).toBe('3星：47人，占比39.2%')
    expect(wrapper.findAll('.chart-bar')[0].attributes('style')).toContain('height: 0%')
    expect(wrapper.get('.chart-bar').attributes('style')).toContain('rgb(78, 131, 253)')
    expect(wrapper.findAll('.chart-axis-line')).toHaveLength(7)
    expect(wrapper.findAll('.chart-gridline span').every(tick => tick.text().endsWith('%'))).toBe(true)
    expect(wrapper.findAll('.chart-gridline span').some(tick => tick.text() === '0%')).toBe(false)
    await wrapper.findAll('.chart-column')[3].trigger('mouseenter', { clientX: 100, clientY: 100 })
    const tooltip = document.body.querySelector<HTMLElement>('.chart-tooltip')!
    expect(tooltip.textContent).toContain('价值贡献（终评）')
    expect(tooltip.textContent).toContain('3星')
    expect(tooltip.textContent!.match(/39.2%/g)).toHaveLength(1)
    expect(tooltip.parentElement).toBe(document.body)
    const left = tooltip.style.left
    await wrapper.findAll('.chart-column')[3].trigger('mousemove', { clientX: 200, clientY: 100 })
    expect(tooltip.style.left).not.toBe(left)
    expect(wrapper.findAll('.chart-column')[3].classes()).toContain('column-active')
    await wrapper.findAll('.chart-column')[3].trigger('mouseleave')
    expect(document.body.querySelector('.chart-tooltip')).toBeNull()
    await wrapper.findAll('.chart-column')[0].trigger('mouseenter')
    expect(wrapper.findAll('.chart-column')[0].classes()).toContain('column-active')
    wrapper.unmount()
  })

  it('anchors the full-width dashed line to the hovered bar top at every pointer height and clears it on blank categories', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const wrapper = mount(ProjectReportDistribution, { props: { report }, attachTo: document.body })
    const column = wrapper.findAll('.chart-column')[3]
    const bar = column.get('.chart-bar')
    await bar.trigger('mouseenter', { clientX: 100, clientY: 150 })
    const style = wrapper.get('.chart-hover-line').attributes('style')
    expect(parseFloat((wrapper.get('.chart-hover-line').element as HTMLElement).style.top)).toBeCloseTo(2)
    expect(style).toContain('border-color: rgb(78, 131, 253)')
    await bar.trigger('mousemove', { clientX: 100, clientY: 350 })
    expect(wrapper.get('.chart-hover-line').attributes('style')).toBe(style)
    await column.trigger('mousemove', { clientX: 120, clientY: 50 })
    expect(wrapper.find('.chart-hover-line').exists()).toBe(false)
    expect(column.classes()).toContain('column-active')
    expect(document.body.querySelector('.chart-tooltip')).not.toBeNull()
    await bar.trigger('focus')
    expect(wrapper.get('.chart-hover-line').attributes('style')).toBe(style)
    await bar.trigger('blur')
    expect(wrapper.find('.chart-hover-line').exists()).toBe(false)
    await wrapper.findAll('.chart-column')[0].trigger('mouseenter')
    expect(wrapper.find('.chart-hover-line').exists()).toBe(false)
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
    await wrapper.get('.chart-column').trigger('mouseenter')
    expect(wrapper.find('.chart-hover-line').exists()).toBe(false)
    expect(wrapper.html()).not.toMatch(/NaN|Infinity/)
    wrapper.unmount()
  })

  it('opens a hierarchical comparison menu, expands, searches with ancestor paths, and toggles independent series immediately', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const comparison = { ...report, departments: [{ id: 'parent', name: '产品中心', counts: { 'rating-0': 2 }, children: [{ id: 'a', name: '研发团队', counts: { 'rating-0': 2, 'rating-1': 2 } }] }, { id: 'b', name: '设计团队', counts: { 'rating-0': 3 } }] }
    const wrapper = mount(ProjectReportDistribution, { props: { report, comparisonReports: { team: comparison } }, attachTo: document.body })
    expect(wrapper.find('.performance-search-select').exists()).toBe(false)
    await openDimension(wrapper)
    expect(wrapper.emitted('compare')).toEqual([['team']])
    expect(document.body.textContent).toContain('我的团队数据')
    expect(document.body.textContent).not.toContain('研发团队 (4)')
    const parent = Array.from(document.body.querySelectorAll<HTMLElement>('.el-tree-node')).find(node => node.getAttribute('data-key') === 'parent')!
    expect(parent.getAttribute('aria-expanded')).toBe('false')
    parent.querySelector<HTMLElement>('.el-tree-node__expand-icon')!.click()
    await flushPromises()
    expect(parent.getAttribute('aria-expanded')).toBe('true')
    parent.querySelector<HTMLElement>('.el-tree-node__expand-icon')!.click()
    await flushPromises()
    expect(parent.getAttribute('aria-expanded')).toBe('false')
    const input = document.body.querySelector<HTMLInputElement>('[aria-label="搜索团队"]')!
    input.value = '研发'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(parent.getAttribute('aria-expanded')).toBe('true')
    expect(parent.style.display).not.toBe('none')
    const other = document.body.querySelector<HTMLElement>('.el-tree-node[data-key="b"]')!
    expect(other.style.display).toBe('none')
    await clickNode('研发团队')
    expect(wrapper.findAll('.chart-bar')).toHaveLength(14)
    expect(wrapper.find('[aria-label="移除研发团队"]').exists()).toBe(true)
    expect(wrapper.findAll('.series-legend')[1].text()).toContain('研发团队：4')
    expect(wrapper.findAll('.chart-column')[0].findAll('.chart-bar')[1].attributes('aria-label')).toContain('50.0%')
    expect(document.body.querySelector('.el-tree-node[data-key="a"] .comparison-check')).not.toBeNull()
    await clickNode('研发团队')
    expect(wrapper.findAll('.chart-bar')).toHaveLength(7)
    expect(document.body.querySelector('.el-tree-node[data-key="a"] .comparison-check')).toBeNull()
    const child = document.body.querySelector<HTMLElement>('.el-tree-node[data-key="a"]')!
    child.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flushPromises()
    expect(wrapper.findAll('.chart-bar')).toHaveLength(14)
    child.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    await flushPromises()
    expect(wrapper.findAll('.chart-bar')).toHaveLength(7)
    wrapper.unmount()
  })

  it('preserves add order and entity colors after removal/re-add and permits removing and restoring summary', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const comparison = { ...report, departments: [{ id: 'a', name: '研发团队', counts: { 'rating-0': 2 } }, { id: 'b', name: '设计团队', counts: { 'rating-0': 3 } }] }
    const wrapper = mount(ProjectReportDistribution, { props: { report, comparisonReports: { team: comparison } } })
    const menu = wrapper.findComponent(ProjectReportComparisonMenu)
    menu.vm.$emit('toggle', 'team:b')
    menu.vm.$emit('toggle', 'team:a')
    await flushPromises()
    expect(wrapper.findAll('.series-legend').map(item => item.text())).toEqual(['汇总：120×', '设计团队：3×', '研发团队：2×'])
    const color = wrapper.findAll('.series-legend')[1].attributes('style')
    await wrapper.get('[aria-label="移除设计团队"]').trigger('click')
    menu.vm.$emit('toggle', 'team:b')
    await flushPromises()
    expect(wrapper.findAll('.series-legend')[2].attributes('style')).toBe(color)
    expect(wrapper.findAll('.series-legend').map(item => item.text())).toEqual(['汇总：120×', '研发团队：2×', '设计团队：3×'])
    await wrapper.get('[aria-label="移除汇总"]').trigger('click')
    expect(wrapper.findAll('.chart-bar')).toHaveLength(14)
    menu.vm.$emit('toggle', 'summary')
    await flushPromises()
    expect(wrapper.findAll('.chart-bar')).toHaveLength(21)
    expect(wrapper.find('.chart-legend').exists()).toBe(false)
    expect(wrapper.find('.distribution-table').exists()).toBe(false)
    wrapper.unmount()
  })

  it('caps comparisons at ten and uses the ten captured solid colors without textures', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const comparison = { ...report, departments: Array.from({ length: 12 }, (_, i) => ({ id: `group-${i}`, name: `分组${i}`, counts: { 'rating-0': i + 1 } })) }
    const wrapper = mount(ProjectReportDistribution, { props: { report, comparisonReports: { team: comparison } }, attachTo: document.body })
    comparison.departments.forEach(row => wrapper.findComponent(ProjectReportComparisonMenu).vm.$emit('toggle', `team:${row.id}`))
    await flushPromises()
    const bars = wrapper.findAll('.chart-column')[0].findAll('.chart-bar')
    expect(bars).toHaveLength(10)
    expect(bars.map(bar => (bar.element as HTMLElement).style.backgroundColor)).toEqual(['rgb(78, 131, 253)', 'rgb(80, 206, 251)', 'rgb(147, 90, 246)', 'rgb(250, 211, 85)', 'rgb(247, 105, 100)', 'rgb(255, 165, 61)', 'rgb(241, 75, 169)', 'rgb(20, 225, 198)', 'rgb(219, 102, 219)', 'rgb(195, 221, 64)'])
    expect(bars.every(bar => !(bar.element as HTMLElement).style.backgroundImage)).toBe(true)
    expect(wrapper.get('.comparison-button').text()).toContain('10/10')
    await wrapper.get('.comparison-button').trigger('mouseenter')
    await flushPromises()
    expect(document.body.textContent).toContain('最多添加 10 组对比')
    expect(document.body.textContent).toContain('请先清除已有对比再添加新对比')
    await wrapper.get('.comparison-button').trigger('click')
    await wrapper.get('.comparison-button').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.get('.comparison-button').attributes('aria-expanded')).toBe('false')
    await wrapper.get('[aria-label="移除分组0"]').trigger('click')
    expect(wrapper.get('.comparison-button').text()).toContain('9/10')
    wrapper.findComponent(ProjectReportComparisonMenu).vm.$emit('toggle', 'team:group-10')
    await flushPromises()
    expect(wrapper.findAll('.series-legend')).toHaveLength(10)
    expect(wrapper.get('.series-legend:last-child').attributes('style')).not.toContain('undefined')
    expect(wrapper.find('.distribution-table').exists()).toBe(false)
    wrapper.unmount()
  })

  it('restores summary after removing the last remaining non-summary group', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const comparison = { ...report, departments: [{ id: 'a', name: '研发团队', counts: { 'rating-0': 2 } }] }
    const wrapper = mount(ProjectReportDistribution, { props: { report, comparisonReports: { team: comparison } } })
    const menu = wrapper.findComponent(ProjectReportComparisonMenu)
    menu.vm.$emit('toggle', 'team:a')
    await flushPromises()
    expect(wrapper.get('.comparison-button').text()).toContain('2/10')
    await wrapper.get('[aria-label="移除汇总"]').trigger('click')
    expect(wrapper.findAll('.series-legend')).toHaveLength(1)
    await wrapper.get('[aria-label="移除研发团队"]').trigger('click')
    expect(wrapper.findAll('.series-legend').map(item => item.text())).toEqual(['汇总：120'])
    expect(wrapper.find('[aria-label="移除汇总"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('uses segmented indicator buttons and retains selected groups while waiting for matching-indicator comparison data', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    report.indicators = [{ key: 'value', label: '价值贡献' }, { key: 'effort', label: '投入度' }]
    report.indicatorKey = 'value'
    const comparison = { ...report, departments: [{ id: 'a', name: '研发团队', counts: { 'rating-0': 2 } }] }
    const wrapper = mount(ProjectReportDistribution, { props: { report, comparisonReports: { team: comparison } } })
    wrapper.findComponent(ProjectReportComparisonMenu).vm.$emit('toggle', 'team:a')
    await flushPromises()
    const color = wrapper.findAll('.series-legend')[1].attributes('style')
    expect(wrapper.findComponent(PerformanceSegmentedControl).props('modelValue')).toBe('value')
    await wrapper.findAll('[role="radio"]')[1].trigger('click')
    expect(wrapper.emitted('indicator-change')).toEqual([['effort']])
    await wrapper.setProps({ report: { ...report, indicatorKey: 'effort' } })
    expect(wrapper.findAll('.series-legend')[1].text()).toBe('研发团队：0×')
    expect(wrapper.findAll('.series-legend')[1].attributes('style')).toBe(color)
    expect(wrapper.findComponent(ProjectReportComparisonMenu).props('selected')).toEqual(['summary', 'team:a'])
    await wrapper.setProps({ comparisonReports: { team: { ...comparison, indicatorKey: 'effort', departments: [{ ...comparison.departments[0], counts: { 'rating-0': 5, 'rating-1': 5 } }] } } })
    expect(wrapper.findAll('.series-legend')[1].text()).toBe('研发团队：10×')
    expect(wrapper.findAll('.chart-column')[0].findAll('.chart-bar')[1].attributes('aria-label')).toContain('50.0%')
    expect(wrapper.find('.chart-legend').exists()).toBe(false)
    wrapper.unmount()
  })

  it('supports menu keyboard focus, Escape, outside click, and an unselected empty state', async () => {
    const report = await mockProjectReportProvider({ cycleId: 1 })
    const wrapper = mount(ProjectReportDistribution, { props: { report }, attachTo: document.body })
    await wrapper.get('.comparison-button').trigger('keydown', { key: 'ArrowDown' })
    await flushPromises()
    expect(document.activeElement?.getAttribute('role')).toBe('menuitemcheckbox')
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await flushPromises()
    expect(document.activeElement?.getAttribute('data-dimension')).toBe('team')
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await flushPromises()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('搜索团队')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    expect(wrapper.get('.comparison-button').attributes('aria-expanded')).toBe('false')
    await wrapper.get('.comparison-button').trigger('click')
    await flushPromises()
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    await flushPromises()
    expect(wrapper.get('.comparison-button').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('[aria-label="移除汇总"]').exists()).toBe(false)
    wrapper.findComponent(ProjectReportComparisonMenu).vm.$emit('toggle', 'summary')
    await flushPromises()
    expect(wrapper.findAll('.chart-bar')).toHaveLength(7)
    expect(wrapper.get('.comparison-button').text()).not.toContain('/10')
    expect(wrapper.html()).not.toMatch(/NaN|Infinity/)
    wrapper.unmount()
  })
})
