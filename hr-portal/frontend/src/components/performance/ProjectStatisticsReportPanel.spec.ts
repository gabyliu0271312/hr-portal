import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '@/api/client'
import ProjectReportComparison from './ProjectReportComparison.vue'
import ProjectReportMatrix from './ProjectReportMatrix.vue'
import ProjectStatisticsReportPanel from './ProjectStatisticsReportPanel.vue'
import ProjectReportDistribution from './ProjectReportDistribution.vue'
import MatrixPeopleDialog from './MatrixPeopleDialog.vue'
import { projectManagementApi, type ProjectMemberPage } from '@/api/performance'
import ProjectReportNavigation from './ProjectReportNavigation.vue'
import PerformanceReportCommentButton from './PerformanceReportCommentButton.vue'
import PerformanceReportCycleSelector from './PerformanceReportCycleSelector.vue'
import { reportNotesApi } from '@/api/performanceReportNotes'
import { mockProjectReportComparison, mockProjectReportProvider, type ProjectReportDimension, type ProjectReportProvider, type ProjectStatisticsReport } from './projectStatisticsReport'

const global = { stubs: { ProjectReportMatrix: true } }
const apiReport = <R extends ProjectStatisticsReport>(report: R): R => ({ ...report, source: 'api' as const })
const levelReport = (): ProjectStatisticsReport => ({
  source: 'api', dimension: 'level', rowLabel: '岗位职级', showSummary: true,
  totalParticipants: 3, ratings: [{ key: 'good', label: '优秀', color: '#3370ff' }],
  distribution: { good: 2 }, departments: [
    { id: 'level:P5', name: 'P5', counts: { good: 2 } },
    { id: 'level:--', name: '--', counts: { good: 0 } },
  ],
})
beforeEach(() => { setActivePinia(createPinia()); vi.spyOn(reportNotesApi, 'read').mockResolvedValue({ content: '', version: 0 }) })
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('ProjectStatisticsReportPanel', () => {
  it('does not mount comments or call note APIs when comments are disabled', async () => {
    const provider = vi.fn(async query => apiReport(await mockProjectReportProvider(query)))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider, allowComments: false }, global })
    try {
      await flushPromises()
      expect(wrapper.findComponent(PerformanceReportCommentButton).exists()).toBe(false)
      expect(reportNotesApi.read).not.toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })
  it('shares the matrix people list, preserves scope and opens only permitted people', async () => {
    const provider = vi.fn(async query => ({ ...apiReport(await mockProjectReportProvider(query)), indicatorKey: 'chosen', indicatorLabel: '价值贡献' }))
    const member = { id: 1, employee_no: 'E1', display_name: '钻取人员', project_id: 9, root_review_id: 91, can_view_detail: true }
    const people = vi.spyOn(projectManagementApi, 'reportPeople').mockResolvedValue({ items: [member], total: 1, page: 1, page_size: 50 } as ProjectMemberPage)
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider, noteScope: { management_role: 'hrbp', project_id: 9 } }, global })
    try {
      await flushPromises()
      wrapper.getComponent(ProjectReportDistribution).vm.$emit('people', { dimension: 'department', rowLabel: '汇总', ratingKey: 'good', ratingLabel: '优秀' })
      await flushPromises()
      expect(people).toHaveBeenCalledWith(7, { type: 'statistics', dimension: 'department', indicatorKey: 'chosen', rowKey: undefined, ratingKey: 'good' }, { keyword: undefined, page: 1, pageSize: 50, sortBy: 'name', sortOrder: 'asc' }, { management_role: 'hrbp', project_id: 9 })
      const dialog = wrapper.getComponent(MatrixPeopleDialog)
      expect(dialog.text()).toContain('钻取人员')
      dialog.vm.$emit('select-member', { ...member, can_view_detail: false })
      expect(wrapper.emitted('open-member')).toBeUndefined()
      dialog.vm.$emit('select-member', member)
      expect(wrapper.emitted('open-member')).toEqual([[member]])
      expect(dialog.props('modelValue')).toBe(true)
      await wrapper.setProps({ noteScope: { management_role: 'hrbp', project_id: 9 } })
      await flushPromises()
      expect(wrapper.getComponent(MatrixPeopleDialog).props('modelValue')).toBe(true)
      expect(people).toHaveBeenCalledTimes(1)
      await wrapper.setProps({ cycleId: 8 })
      await flushPromises()
      expect(wrapper.findComponent(MatrixPeopleDialog).exists()).toBe(false)
    } finally { wrapper.unmount() }
  })

  it('drills comparison cells using the response axes and history context', async () => {
    const comparison = { ...mockProjectReportComparison(), source: 'api' as const, xKey: 'historic', yKey: 'current', historyCycleId: 3 }
    const peopleProvider = vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider: vi.fn(async query => apiReport(await mockProjectReportProvider(query))), comparisonProvider: vi.fn().mockResolvedValue(comparison), peopleProvider }, global })
    try {
      await flushPromises(); await wrapper.get('[data-key="history"]').trigger('click'); await flushPromises()
      const component = wrapper.findComponent(ProjectReportComparison)
      component.vm.$emit('cell', { rowKey: 'B', columnKey: 'A', count: 0 })
      await flushPromises()
      expect(peopleProvider).not.toHaveBeenCalled()
      component.vm.$emit('cell', { rowKey: 'B', columnKey: 'A', count: 2 })
      await flushPromises()
      expect(peopleProvider).toHaveBeenCalledWith({ type: 'comparison', kind: 'history', xKey: 'historic', yKey: 'current', historyCycleId: 3, xRatingKey: 'A', yRatingKey: 'B' }, expect.objectContaining({ page: 1, pageSize: 50 }))
    } finally { wrapper.unmount() }
  })
  it('saves private notes, cancels drafts, clears content and reloads persisted content', async () => {
    const save = vi.spyOn(reportNotesApi, 'save').mockResolvedValueOnce({ content: '个人备注', version: 1 }).mockResolvedValueOnce({ content: '', version: 2 })
    const wrapper = mount(PerformanceReportCommentButton, { props: { cycleId: 7, section: 'history', scope: { management_role: 'hrbp', project_id: 9 } } })
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await wrapper.get('textarea').setValue('未保存')
    await wrapper.findAll('button').find(button => button.text() === '取消')!.trigger('click')
    expect(save).not.toHaveBeenCalled()
    await wrapper.get('button').trigger('click')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('')
    await wrapper.get('textarea').setValue('个人备注')
    await wrapper.findAll('button').find(button => button.text() === '确定')!.trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledWith(7, 'history', { management_role: 'hrbp', project_id: 9 }, { content: '个人备注', version: 0 })
    expect(wrapper.get('.report-note-content').text()).toBe('个人备注')
    await wrapper.get('button').trigger('click')
    await wrapper.get('textarea').setValue('   ')
    await wrapper.findAll('button').find(button => button.text() === '确定')!.trigger('click')
    await flushPromises()
    expect(save).toHaveBeenLastCalledWith(7, 'history', expect.anything(), { content: '', version: 1 })
    expect(wrapper.find('.report-note-content').exists()).toBe(false)
    vi.mocked(reportNotesApi.read).mockResolvedValue({ content: '回读备注', version: 3 })
    await wrapper.setProps({ identityKey: 'new-session' })
    await flushPromises()
    expect(wrapper.get('.report-note-content').text()).toBe('回读备注')
    wrapper.unmount()
  })

  it('preserves note drafts on failure and blocks stale-version overwrite', async () => {
    const save = vi.spyOn(reportNotesApi, 'save').mockRejectedValue({ response: { status: 409 } })
    const wrapper = mount(PerformanceReportCommentButton, { props: { cycleId: 1, section: 'overview' } })
    await flushPromises(); await wrapper.get('button').trigger('click'); await wrapper.get('textarea').setValue('保留草稿')
    const confirm = () => wrapper.findAll('button').find(button => button.text() === '确定')!
    await confirm().trigger('click'); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('其他窗口更新')
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('保留草稿')
    await confirm().trigger('click'); expect(save).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('renders one note per chapter with the explicit entry scope', async () => {
    const provider = vi.fn(async query => apiReport(await mockProjectReportProvider(query)))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider, noteScope: { result_kind: 'focus' } }, global })
    await flushPromises()
    expect(wrapper.findAllComponents(PerformanceReportCommentButton)).toHaveLength(9)
    expect(reportNotesApi.read).toHaveBeenCalledWith(7, 'overview', { result_kind: 'focus' })
    wrapper.unmount()
  })

  it('loads historical candidates without changing the matrix and submits a complete leaf selection', async () => {
    const comparisonProvider = vi.fn(async query => ({ ...mockProjectReportComparison(), source: 'api' as const, xKey: 'old', yKey: 'current', xOptions: [{ key: 'old', label: '年度评级' }], yOptions: [{ key: 'current', label: '本期评级' }], historyCycles: [{ id: 3, name: '历史周期' }], historyCycleId: 3 }))
    const provider = vi.fn(async query => apiReport(await mockProjectReportProvider(query)))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider, comparisonProvider }, global })
    await flushPromises(); await wrapper.get('[data-key="history"]').trigger('click'); await flushPromises()
    const comparison = wrapper.findComponent(ProjectReportComparison)
    const selector = comparison.findAllComponents(PerformanceReportCycleSelector).find(item => item.props('axis') === 'x')!
    await selector.props('loadOptions')(3)
    expect(comparisonProvider).toHaveBeenLastCalledWith({ kind: 'history', historyCycleId: 3 })
    selector.vm.$emit('select', 3, 'chosen')
    await flushPromises()
    expect(comparisonProvider).toHaveBeenLastCalledWith({ kind: 'history', historyCycleId: 3, xKey: 'chosen', yKey: 'current' })
    expect(wrapper.find('.history-cycle-control').exists()).toBe(false)
    wrapper.unmount()
  })
  it('does not expose example data for scoped comparisons with missing source data', async () => {
    const wrapper = mount(ProjectReportComparison, {
      props: { kind: 'self-final', allowExamples: false, comparison: { source: 'api', total: 0, ratings: [], counts: [], heatLevels: [], emptyReason: '当前范围未提供自评数据' } },
      global: { stubs: { PerformanceComparisonMatrix: true, PerformanceReportCommentButton: true } },
    })
    expect(wrapper.text()).toContain('当前范围未提供自评数据')
    expect(wrapper.find('.example-button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders captured chapters with the api overview and self-final comparison', async () => {
    const department = apiReport(await mockProjectReportProvider({ cycleId: 1 }))
    const get = vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ data: department })
      .mockResolvedValueOnce({ data: { ...mockProjectReportComparison(), source: 'api' } })
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 1, cycleName: '示例周期' }, global })
    await flushPromises()
    expect(get).toHaveBeenCalledWith('/performance/project-management/statistics', { params: { cycle_id: 1, dimension: 'department' } })
    expect(wrapper.findAll('.report-primary-heading').map(el => el.text())).toEqual(['结果总览', '统计详情', '差异分析'])
    expect(wrapper.findAll('[data-report-section]')).toHaveLength(9)
    expect(wrapper.get('[data-report-section="overview"]').text()).toContain('总人数：124')
    const selfFinalHeading = wrapper.get('[data-report-section="self-final"] .report-secondary-heading')
    const selfFinalIcon = selfFinalHeading.get('[data-icon="InfoOutlined"]')
    expect(selfFinalHeading.text()).toBe('自评 / 终评对比')
    expect(selfFinalIcon.attributes('viewBox')).toBe('0 0 24 24')
    expect(selfFinalIcon.attributes('width')).toBe('16')
    expect(selfFinalIcon.attributes('height')).toBe('16')
    expect(selfFinalIcon.find('path').attributes('d')).toBe('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z')
    await wrapper.get('[data-key="self-final"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-report-section="self-final"]').text()).toContain('终评：绩效评级')
    expect(wrapper.get('[data-report-section="self-final"]').text()).toContain('自评：绩效评级')
    expect(wrapper.findAll('.performance-comparison-cell')).toHaveLength(49)
    expect(wrapper.findAll('.performance-comparison-cell.heat-1')).toHaveLength(18)
    expect(wrapper.findAll('.performance-comparison-cell.heat-2')).toHaveLength(1)
    expect(wrapper.get('.performance-report-comment-button').text()).toContain('添加备注（仅自己可见）')
    expect(wrapper.findAll('.report-placeholder')).toHaveLength(6)
    expect(get).toHaveBeenCalledWith('/performance/project-management/comparison', { params: { cycle_id: 1, kind: 'self-final' } })
    expect(wrapper.find('.surface-card > .section-card-header').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('更多')
    expect(wrapper.findAll('canvas')).toHaveLength(0)
    await wrapper.get('.report-filter-button').trigger('click')
    expect(wrapper.get('[role="status"]').text()).toContain('筛选条件尚未接入')
    expect(wrapper.emitted('filter')).toHaveLength(1)
    expect(wrapper.find('input').exists()).toBe(false)
    await wrapper.get('[aria-label="收起报表目录"]').trigger('click')
    expect(wrapper.get('.report-wrapper').classes()).toContain('directory-collapsed')
    expect(wrapper.find('.report-menu').exists()).toBe(false)
    await wrapper.get('[aria-label="展开报表目录"]').trigger('click')
    expect(wrapper.findAll('.report-menu-item')).toHaveLength(9)
    wrapper.unmount()
  })

  it('accepts a future provider, propagates cycle context and never falls back to mock on errors', async () => {
    const real = apiReport(await mockProjectReportProvider({ cycleId: 1 }))
    const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockProjectReportComparison() })
    const provider = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(real)
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider }, global })
    await flushPromises()
    expect(provider).toHaveBeenCalledWith({ cycleId: 7, dimension: 'department' })
    expect(wrapper.get('[role="alert"]').text()).toContain('加载失败')
    expect(wrapper.text()).not.toContain('模拟数据')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('总人数：124')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.setProps({ cycleId: 8 })
    await flushPromises()
    expect(provider).toHaveBeenLastCalledWith({ cycleId: 8, dimension: 'department' })
    wrapper.unmount()
  })

  it('loads team and sequence reports with their explicit dimensions', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockProjectReportComparison() })
    const provider = vi.fn(async ({ cycleId, dimension }: { cycleId: number; dimension?: ProjectReportDimension }) => apiReport(await mockProjectReportProvider({ cycleId, dimension })))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider }, global })
    await flushPromises()
    expect(provider).toHaveBeenCalledWith({ cycleId: 7, dimension: 'department' })

    await wrapper.get('[data-key="team"]').trigger('click')
    await flushPromises()
    expect(provider).toHaveBeenCalledWith({ cycleId: 7, dimension: 'team' })

    await wrapper.get('[data-key="sequence"]').trigger('click')
    await flushPromises()
    expect(provider).toHaveBeenCalledWith({ cycleId: 7, dimension: 'sequence' })
    await wrapper.get('[data-key="tenure"]').trigger('click')
    await flushPromises()
    expect(provider).toHaveBeenCalledWith({ cycleId: 7, dimension: 'tenure' })
    wrapper.unmount()
  })

  it('requests the real level API without displaying a source notice', async () => {
    const get = vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ data: apiReport(await mockProjectReportProvider({ cycleId: 7 })) })
      .mockResolvedValueOnce({ data: levelReport() })
      .mockResolvedValue({ data: apiReport(await mockProjectReportProvider({ cycleId: 7, dimension: 'team' })) })
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7 }, global })
    await flushPromises()
    expect(get).toHaveBeenCalledWith('/performance/project-management/statistics', { params: { cycle_id: 7, dimension: 'department' } })
    await wrapper.get('[data-key="level"]').trigger('click')
    await flushPromises()
    expect(get).toHaveBeenCalledWith('/performance/project-management/statistics', { params: { cycle_id: 7, dimension: 'level' } })
    const section = wrapper.get('[data-report-section="level"]')
    expect(section.text()).not.toContain('数据来源')
    expect(section.find('.report-source-notice').exists()).toBe(false)
    expect(section.findComponent(ProjectReportMatrix).props('report')).toMatchObject(levelReport())
    expect(section.find('.report-placeholder').exists()).toBe(false)
    expect(wrapper.get('[data-report-section="overview"]').text()).toContain('总人数：124')
    expect(wrapper.get('[data-report-section="department"]').find('.report-placeholder').exists()).toBe(false)
    await wrapper.get('[data-key="team"]').trigger('click')
    await wrapper.get('[data-key="level"]').trigger('click')
    await flushPromises()
    expect(get).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })

  it.each([
    [403, 'FORBIDDEN', '无权查看'],
    [409, 'RATING_SCALE_CONFLICT', '评级体系不一致'],
    [409, 'CYCLE_MEMBER_OVERLAP_UNRESOLVED', '重复成员'],
    [500, 'ERROR', '加载失败'],
  ])('keeps level errors visible without mock fallback (%s)', async (status, detail, message) => {
    const get = vi.spyOn(api, 'get')
      .mockResolvedValueOnce({ data: apiReport(await mockProjectReportProvider({ cycleId: 7 })) })
      .mockRejectedValueOnce({ response: { status, data: { detail } } })
      .mockResolvedValue({ data: levelReport() })
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7 }, global })
    await flushPromises()
    await wrapper.get('[data-key="level"]').trigger('click')
    await flushPromises()
    const section = wrapper.get('[data-report-section="level"]')
    expect(section.get('[role="alert"]').text()).toContain(message)
    expect(section.findComponent(ProjectReportMatrix).exists()).toBe(false)
    await section.get('button').trigger('click')
    await flushPromises()
    expect(section.findComponent(ProjectReportMatrix).exists()).toBe(true)
    wrapper.unmount()
  })

  it.each(['cycle', 'provider'])('invalidates a pending level request when %s changes before revisiting', async change => {
    let resolveOld!: (report: ProjectStatisticsReport) => void
    const old = new Promise<ProjectStatisticsReport>(resolve => { resolveOld = resolve })
    const provider: ProjectReportProvider = query => query.dimension === 'level' ? old : Promise.resolve(apiReport(mockProjectReportProvider(query) as unknown as ProjectStatisticsReport))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 1, provider }, global })
    await flushPromises()
    await wrapper.get('[data-key="level"]').trigger('click')
    expect(wrapper.get('[data-report-section="level"]').text()).toContain('正在加载')
    if (change === 'cycle') await wrapper.setProps({ cycleId: 2 })
    else await wrapper.setProps({ provider: vi.fn(mockProjectReportProvider) })
    await flushPromises()
    resolveOld(levelReport())
    await flushPromises()
    expect(wrapper.get('[data-report-section="level"]').findComponent(ProjectReportMatrix).exists()).toBe(false)
    expect(wrapper.get('[data-report-section="level"]').text()).not.toContain('数据来源')
    wrapper.unmount()
  })

  it('refuses a mock or hierarchical report returned for level', async () => {
    const provider = vi.fn(async query => query.dimension === 'level' ? { ...levelReport(), source: 'mock' as const } : apiReport(await mockProjectReportProvider(query)))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 1, provider }, global })
    await flushPromises()
    await wrapper.get('[data-key="level"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-report-section="level"]').findComponent(ProjectReportMatrix).exists()).toBe(false)
    expect(wrapper.get('[data-report-section="level"]').text()).toContain('加载失败')
    wrapper.unmount()
  })

  it('loads dimension and history comparisons through the scoped provider and propagates axis changes', async () => {
    const provider = vi.fn(async query => apiReport(await mockProjectReportProvider(query)))
    const comparisonProvider = vi.fn(async query => ({ ...mockProjectReportComparison(), source: 'api' as const, xKey: query.xKey || 'rating:a', yKey: 'rating:b', xOptions: [{ key: 'rating:a', label: '贡献' }, { key: 'rating:c', label: '投入度' }], yOptions: [{ key: 'rating:b', label: '价值观' }], historyCycles: [{ id: 3, name: '历史周期' }], historyCycleId: 3 }))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider, comparisonProvider }, global })
    await flushPromises()
    await wrapper.get('[data-key="dimension"]').trigger('click')
    await flushPromises()
    expect(comparisonProvider).toHaveBeenLastCalledWith({ kind: 'dimension' })
    expect(wrapper.get('[data-report-section="dimension"]').findComponent({ name: 'ProjectReportComparison' }).exists()).toBe(true)
    wrapper.get('[data-report-section="dimension"]').findComponent({ name: 'ProjectReportComparison' }).vm.$emit('change', { xKey: 'rating:c' })
    await flushPromises()
    expect(comparisonProvider).toHaveBeenLastCalledWith({ kind: 'dimension', xKey: 'rating:c', yKey: 'rating:b', historyCycleId: 3 })
    await wrapper.get('[data-key="history"]').trigger('click')
    await flushPromises()
    expect(comparisonProvider).toHaveBeenLastCalledWith({ kind: 'history' })
    expect(wrapper.get('[data-report-section="history"]').text()).not.toContain('报表内容预留')
    wrapper.unmount()
  })

  it('passes the overview indicator into comparison group queries', async () => {
    const provider = vi.fn(async query => ({ ...apiReport(await mockProjectReportProvider(query)), indicatorKey: query.indicatorKey || 'rating:contribution' }))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider }, global })
    await flushPromises()
    wrapper.findComponent({ name: 'ProjectReportDistribution' }).vm.$emit('compare', 'team')
    await flushPromises()
    expect(provider).toHaveBeenLastCalledWith({ cycleId: 7, dimension: 'team', indicatorKey: 'rating:contribution' })
    wrapper.unmount()
  })

  it('retains the overview component while reloading selected comparison dimensions for another indicator', async () => {
    const provider = vi.fn(async query => ({ ...apiReport(await mockProjectReportProvider(query)), indicatorKey: query.indicatorKey || 'rating:a', indicatorLabel: query.indicatorKey === 'rating:b' ? '价值观' : '绩效评级' }))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider }, global })
    await flushPromises()
    const distribution = wrapper.findComponent({ name: 'ProjectReportDistribution' })
    distribution.vm.$emit('compare', 'team')
    await flushPromises()
    distribution.vm.$emit('indicator-change', 'rating:b')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ProjectReportDistribution' }).vm.$el).toBe(distribution.vm.$el)
    expect(provider).toHaveBeenCalledWith({ cycleId: 7, dimension: 'team', indicatorKey: 'rating:b' })
    expect(wrapper.findComponent({ name: 'ProjectReportDistribution' }).props('comparisonReports').team.indicatorKey).toBe('rating:b')
    wrapper.unmount()
  })

  it('loads every comparison visible after page scrolling without directory clicks', async () => {
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { frame = callback; return 1 })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const provider = vi.fn(async query => apiReport(await mockProjectReportProvider(query)))
    const comparisonProvider = vi.fn(async (_query: { kind: string }) => ({ ...mockProjectReportComparison(), source: 'api' as const }))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider, comparisonProvider }, global })
    await flushPromises()
    wrapper.findAll('[data-report-section]').forEach(section => {
      const visible = ['self-final', 'dimension', 'history'].includes(section.attributes('data-report-section') || '')
      const top = visible ? 200 : -1000
      section.element.getBoundingClientRect = () => ({ x: 0, y: top, top, bottom: top + 100, left: 0, right: 600, width: 600, height: 100, toJSON() {} })
    })
    window.dispatchEvent(new Event('scroll'))
    frame?.(0)
    await flushPromises()
    expect(comparisonProvider.mock.calls.map(call => call[0])).toEqual([{ kind: 'self-final' }, { kind: 'dimension' }, { kind: 'history' }])
    expect(wrapper.findAll('.report-comparison')).toHaveLength(3)
    wrapper.unmount()
  })

  it('discards a late response from a previous cycle', async () => {
    let resolveOld!: (report: ProjectStatisticsReport) => void
    const old = new Promise<ProjectStatisticsReport>(resolve => { resolveOld = resolve })
    const current = apiReport(await mockProjectReportProvider({ cycleId: 2 }))
    current.totalParticipants = 999
    const provider = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(current)
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 1, provider }, global })
    expect(wrapper.attributes('aria-busy')).toBe('true')
    await wrapper.setProps({ cycleId: 2 })
    await flushPromises()
    resolveOld(apiReport(await mockProjectReportProvider({ cycleId: 1 })))
    await flushPromises()
    expect(wrapper.text()).toContain('总人数：999')
    expect(wrapper.text()).not.toContain('总人数：124')
    expect(wrapper.findComponent(ProjectReportNavigation).props('activeKey')).toBe('overview')
    wrapper.unmount()
  })
})
