import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import ProjectReportMatrix from './ProjectReportMatrix.vue'
import ProjectStatisticsReportPanel from './ProjectStatisticsReportPanel.vue'
import ProjectReportNavigation from './ProjectReportNavigation.vue'
import { mockProjectReportProvider, type ProjectReportDimension, type ProjectStatisticsReport } from './projectStatisticsReport'

const global = { stubs: { ProjectReportMatrix: true } }
const levelReport = (): ProjectStatisticsReport => ({
  source: 'api', dimension: 'level', rowLabel: '岗位职级', showSummary: true,
  totalParticipants: 3, ratings: [{ key: 'good', label: '优秀', color: '#3370ff' }],
  distribution: { good: 2 }, departments: [
    { id: 'level:P5', name: 'P5', counts: { good: 2 } },
    { id: 'level:--', name: '--', counts: { good: 0 } },
  ],
})
afterEach(() => vi.restoreAllMocks())

describe('ProjectStatisticsReportPanel', () => {
  it('renders captured chapters with the self-final mock matrix', async () => {
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 1, cycleName: '示例周期' }, global })
    await flushPromises()
    expect(wrapper.findAll('.report-primary-heading').map(el => el.text())).toEqual(['结果总览', '统计详情', '差异分析'])
    expect(wrapper.findAll('[data-report-section]')).toHaveLength(9)
    const selfFinalHeading = wrapper.get('[data-report-section="self-final"] .report-secondary-heading')
    const selfFinalIcon = selfFinalHeading.get('[data-icon="InfoOutlined"]')
    expect(selfFinalHeading.text()).toBe('自评 / 终评对比')
    expect(selfFinalIcon.attributes('viewBox')).toBe('0 0 24 24')
    expect(selfFinalIcon.attributes('width')).toBe('16')
    expect(selfFinalIcon.attributes('height')).toBe('16')
    expect(selfFinalIcon.find('path').attributes('d')).toBe('M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z')
    const comparison = wrapper.get('[data-report-section="self-final"] [data-comparison="self-final"]')
    expect(comparison.text()).toContain('终评：绩效评级')
    expect(comparison.text()).toContain('自评：绩效评级')
    expect(comparison.findAll('.performance-comparison-cell')).toHaveLength(49)
    expect(comparison.findAll('.performance-comparison-cell.heat-1')).toHaveLength(18)
    expect(comparison.findAll('.performance-comparison-cell.heat-2')).toHaveLength(1)
    expect(comparison.get('.performance-report-comment-button').text()).toContain('添加备注（仅自己可见）')
    expect(wrapper.findAll('.report-placeholder')).toHaveLength(6)
    expect(wrapper.get('.report-source-notice').text()).toContain('模拟数据')
    expect(wrapper.get('.report-source-notice').text()).toContain('示例周期')
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
    const real = await mockProjectReportProvider({ cycleId: 1 })
    real.source = 'api'
    const provider = vi.fn().mockRejectedValueOnce(new Error('unavailable')).mockResolvedValue(real)
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider }, global })
    await flushPromises()
    expect(provider).toHaveBeenCalledWith({ cycleId: 7 })
    expect(wrapper.get('[role="alert"]').text()).toContain('加载失败')
    expect(wrapper.text()).not.toContain('模拟数据')
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('数据来源：统计 API')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    await wrapper.setProps({ cycleId: 8 })
    await flushPromises()
    expect(provider).toHaveBeenLastCalledWith({ cycleId: 8 })
    wrapper.unmount()
  })

  it('loads team and sequence reports with their explicit dimensions', async () => {
    const provider = vi.fn(({ cycleId, dimension }: { cycleId: number; dimension?: ProjectReportDimension }) => mockProjectReportProvider({ cycleId, dimension }))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7, provider }, global })
    await flushPromises()
    expect(provider).toHaveBeenCalledWith({ cycleId: 7 })

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

  it('requests the real level API and renders its notice alongside the matrix only in that section', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: levelReport() })
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7 }, global })
    await flushPromises()
    expect(get).not.toHaveBeenCalled()
    await wrapper.get('[data-key="level"]').trigger('click')
    await flushPromises()
    expect(get).toHaveBeenCalledWith('/performance/project-management/statistics', { params: { cycle_id: 7, dimension: 'level' } })
    const section = wrapper.get('[data-report-section="level"]')
    expect(section.text()).toContain('实时岗位职级')
    expect(section.findComponent(ProjectReportMatrix).props('report')).toMatchObject(levelReport())
    expect(section.find('.report-placeholder').exists()).toBe(false)
    expect(wrapper.get('[data-report-section="overview"]').text()).toContain('模拟数据')
    expect(wrapper.get('[data-report-section="department"]').find('.report-placeholder').exists()).toBe(false)
    await wrapper.get('[data-key="team"]').trigger('click')
    await wrapper.get('[data-key="level"]').trigger('click')
    await flushPromises()
    expect(get).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it.each([
    [403, 'FORBIDDEN', '无权查看'],
    [409, 'RATING_SCALE_CONFLICT', '评级体系不一致'],
    [409, 'CYCLE_MEMBER_OVERLAP_UNRESOLVED', '重复成员'],
    [500, 'ERROR', '加载失败'],
  ])('keeps level errors visible without mock fallback (%s)', async (status, detail, message) => {
    const get = vi.spyOn(api, 'get').mockRejectedValueOnce({ response: { status, data: { detail } } }).mockResolvedValue({ data: levelReport() })
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 7 }, global })
    await flushPromises()
    await wrapper.get('[data-key="level"]').trigger('click')
    await flushPromises()
    const section = wrapper.get('[data-report-section="level"]')
    expect(section.get('[role="alert"]').text()).toContain(message)
    expect(section.findComponent(ProjectReportMatrix).exists()).toBe(false)
    await section.get('button').trigger('click')
    await flushPromises()
    expect(get).toHaveBeenCalledTimes(2)
    expect(section.findComponent(ProjectReportMatrix).exists()).toBe(true)
    wrapper.unmount()
  })

  it.each(['cycle', 'provider'])('invalidates a pending level request when %s changes before revisiting', async change => {
    let resolveOld!: (report: ProjectStatisticsReport) => void
    const old = new Promise<ProjectStatisticsReport>(resolve => { resolveOld = resolve })
    const provider = vi.fn(query => query.dimension === 'level' ? old : mockProjectReportProvider(query))
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
    const provider = vi.fn(async query => query.dimension === 'level' ? { ...levelReport(), source: 'mock' as const } : mockProjectReportProvider(query))
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 1, provider }, global })
    await flushPromises()
    await wrapper.get('[data-key="level"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-report-section="level"]').findComponent(ProjectReportMatrix).exists()).toBe(false)
    expect(wrapper.get('[data-report-section="level"]').text()).toContain('加载失败')
    wrapper.unmount()
  })

  it('discards a late response from a previous cycle', async () => {
    let resolveOld!: (report: ProjectStatisticsReport) => void
    const old = new Promise<ProjectStatisticsReport>(resolve => { resolveOld = resolve })
    const current = await mockProjectReportProvider({ cycleId: 2 })
    current.totalParticipants = 999
    const provider = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(current)
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 1, provider }, global })
    expect(wrapper.attributes('aria-busy')).toBe('true')
    await wrapper.setProps({ cycleId: 2 })
    await flushPromises()
    resolveOld(await mockProjectReportProvider({ cycleId: 1 }))
    await flushPromises()
    expect(wrapper.text()).toContain('总人数：999')
    expect(wrapper.text()).not.toContain('总人数：124')
    expect(wrapper.findComponent(ProjectReportNavigation).props('activeKey')).toBe('overview')
    wrapper.unmount()
  })
})
