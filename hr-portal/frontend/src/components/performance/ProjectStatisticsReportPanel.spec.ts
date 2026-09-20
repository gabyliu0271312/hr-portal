import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ProjectStatisticsReportPanel from './ProjectStatisticsReportPanel.vue'
import ProjectReportNavigation from './ProjectReportNavigation.vue'
import { mockProjectReportProvider, type ProjectStatisticsReport } from './projectStatisticsReport'

const global = { stubs: { ProjectReportMatrix: true } }

describe('ProjectStatisticsReportPanel', () => {
  it('renders the captured chapters with mock disclosure and no invented detail charts', async () => {
    const wrapper = mount(ProjectStatisticsReportPanel, { props: { cycleId: 1, cycleName: '示例周期' }, global })
    await flushPromises()
    expect(wrapper.findAll('.report-primary-heading').map(el => el.text())).toEqual(['结果总览', '统计详情', '差异分析'])
    expect(wrapper.findAll('[data-report-section]')).toHaveLength(9)
    expect(wrapper.findAll('.report-placeholder')).toHaveLength(7)
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
