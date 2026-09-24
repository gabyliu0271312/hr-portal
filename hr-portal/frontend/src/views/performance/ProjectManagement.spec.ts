import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { projectManagementApi, type ProjectManagementOverview } from '@/api/performance'

const push = vi.fn()
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push, replace }),
}))

vi.mock('@/api/performance', async () => {
  const actual = await vi.importActual<typeof import('@/api/performance')>('@/api/performance')
  return { ...actual, projectManagementApi: { overview: vi.fn(), members: vi.fn(), matrix: vi.fn() } }
})

import ProjectManagement from './ProjectManagement.vue'
import sidebarSource from '@/components/performance/PerformanceReviewCategorySidebar.vue?raw'
import lineTabsSource from '@/components/performance/PerformanceLineTabs.vue?raw'
import layoutSource from '@/layouts/PerformanceLayout.vue?raw'
import { projectManagementApi as mockedApi } from '@/api/performance'

const overviewOf = (overrides: Partial<ProjectManagementOverview> = {}): ProjectManagementOverview => ({
  cycles: [
    { cycle_id: 1, cycle_name: '2026上半年', cycle_start_at: '2026-01-01', cycle_end_at: '2026-06-30' },
    { cycle_id: 2, cycle_name: '2026下半年', cycle_start_at: '2026-07-01', cycle_end_at: '2026-12-31' },
  ],
  active_cycle: { cycle_id: 1, cycle_name: '2026上半年', cycle_start_at: '2026-01-01', cycle_end_at: '2026-06-30' },
  projects: [
    { project_id: 3, project_name: '产品中心项目', project_ref: 'project:a', status: 'STARTED' },
    { project_id: 4, project_name: '研发中心项目', project_ref: 'project:b', status: 'STARTED' },
  ],
  hrbp_scope: [],
  category: { key: 'admin', label: '项目管理员' },
  ...overrides,
})

function mountView() {
  return mount(ProjectManagement, {
    global: {
      stubs: {
        'el-icon': { template: '<span><slot /></span>' },
        'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<div><slot /></div>', props: ['command'] },
      },
    },
  })
}

describe('ProjectManagement', () => {
  beforeEach(() => {
    vi.mocked(mockedApi.overview).mockReset()
    vi.mocked(mockedApi.members).mockReset()
    vi.mocked(mockedApi.matrix).mockReset()
    vi.mocked(mockedApi.members).mockResolvedValue({ items: [], total: 406, page: 1, page_size: 50 })
    vi.mocked(mockedApi.matrix).mockResolvedValue({
      source: 'template_final_result', dimension: 'rating', display_modes: ['name', 'count'], total: 406, completed_count: 403, pending_count: 3,
      ratings: [{ key: 'one', label: '1星', color: '#f54a45' }], pending_rows: [], completed_rows: [],
    })
    push.mockReset()
    replace.mockReset()
  })

  it('keeps the collapsed submenu above sticky tabs but below the app header', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.sidebar-collapse').trigger('click')
    await wrapper.get('.category-toggle').trigger('mouseenter')

    expect(wrapper.get('.sidebar-flyout').findAll('.flyout-node').map(node => node.text())).toEqual(['周期概览', '产品中心项目', '研发中心项目'])
    expect(wrapper.get('.review-sidebar').classes()).toContain('is-collapsed')
    const sidebarZ = Number(sidebarSource.match(/\.review-sidebar\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
    const tabsZ = Number(lineTabsSource.match(/\.line-tabs\.sticky \.line-tabs-holder\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
    const headerZ = Number(layoutSource.match(/\.performance-header\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
    expect(sidebarZ).toBeGreaterThan(tabsZ)
    expect(sidebarZ).toBeLessThan(headerZ)
    wrapper.unmount()
  })

  it('renders the admin category with cycle overview first and involved projects', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()

    expect(mockedApi.overview).toHaveBeenCalledWith(undefined)
    const labels = wrapper.findAll('.review-node').map(item => item.text())
    expect(labels).toEqual(['周期概览', '产品中心项目', '研发中心项目'])
    const categoryToggle = wrapper.find('.category-toggle')
    expect(categoryToggle.text()).toContain('项目管理员')
    expect(wrapper.find('.review-node em').exists()).toBe(false)
  })

  it('shows empty state when no involved cycle exists', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({ cycles: [], active_cycle: null, projects: [] }))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无可管理的周期')
    expect(wrapper.text()).toContain('当前没有你作为项目管理员参与的已启动项目')
  })

  it('shows error state with retry and keeps selection on failure', async () => {
    vi.mocked(mockedApi.overview).mockRejectedValueOnce(new Error('network'))
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('项目管理加载失败')
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    await wrapper.find('.error-state button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('周期概览')
  })

  it('switches cycle via the top filter and reloads projects', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValueOnce(overviewOf())
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({
      active_cycle: { cycle_id: 2, cycle_name: '2026下半年', cycle_start_at: '2026-07-01', cycle_end_at: '2026-12-31' },
      projects: [{ project_id: 5, project_name: '运营中心项目', project_ref: 'project:c', status: 'STARTED' }],
    }))
    const wrapper = mountView()
    await flushPromises()

    const sidebar = wrapper.findComponent({ name: 'PerformanceReviewCategorySidebar' })
    expect(sidebar.props('filterOptions')).toEqual([
      { value: 1, label: '2026上半年' },
      { value: 2, label: '2026下半年' },
    ])
    expect(sidebar.props('activeFilterValue')).toBe(1)
    expect(sidebar.props('showNodeStatus')).toBe(false)
    sidebar.vm.$emit('select-filter', 2)
    await flushPromises()

    expect(mockedApi.overview).toHaveBeenLastCalledWith(2)
    expect(replace).toHaveBeenCalled()
    const labels = wrapper.findAll('.review-node').map(item => item.text())
    expect(labels).toEqual(['周期概览', '运营中心项目'])
  })

  it('renders the cycle overview title above the line tabs with 总览 active', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.page-title-text').text()).toBe('周期概览')
    expect(wrapper.find('.page-title-text').element.previousElementSibling).toBeNull()

    const tabs = wrapper.findAll('.line-tab')
    expect(tabs.map(item => item.text())).toEqual(['总览', '成员列表', '矩阵分析', '统计报表'])
    expect(tabs[0].classes()).toContain('active')
    expect(wrapper.find('.line-tabs').classes()).toContain('sticky')

    const lineTabs = wrapper.findAllComponents({ name: 'PerformanceLineTabs' })
    expect(lineTabs).toHaveLength(1)

    // 总览 tab 渲染完成率面板（8 张环节卡 + 完成率标题）与授权管理面板
    expect(wrapper.findComponent({ name: 'CompletionRatePanel' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'AuthorizationManagementPanel' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('完成率')
    expect(wrapper.text()).toContain('授权管理')
    expect(wrapper.findAll('.grid-card')).toHaveLength(10)

    await tabs[1].trigger('click')
    expect(wrapper.findComponent({ name: 'ProjectMemberListPanel' }).exists()).toBe(true)
    expect(wrapper.text()).toContain('406个结果')
    expect(wrapper.findComponent({ name: 'CompletionRatePanel' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'AuthorizationManagementPanel' }).exists()).toBe(false)
    expect(lineTabs[0].emitted('update:modelValue')).toEqual([['members']])
  })

  it('renders real completion data and hides reminder actions for a not-started node', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf({
      completion_nodes: [
        { key: 'work-summary', title: '填写工作总结', status: 'not_started', completed_count: 0, total_count: 406, completion_rate: null, deadline_at: '2099-07-10T15:59:00Z' },
        { key: 'self-review', title: '自评', status: 'active', completed_count: 101, total_count: 406, completion_rate: 24.88, deadline_at: '2099-07-20T15:59:00Z' },
      ],
    }))
    const wrapper = mountView()
    await flushPromises()

    const cards = wrapper.findAll('.completion-node-card')
    expect(cards[0].find('.card-progress').text()).toBe('未开始')
    expect(cards[0].text()).toContain('完成情况：0/406')
    expect(cards[0].find('.text-button').exists()).toBe(false)
    expect(cards[1].find('.card-progress').text()).toBe('24.88%')
    expect(cards[1].text()).toContain('完成情况：101/406')
    expect(cards[1].text()).toContain('截止时间：2099-07-20 23:59（GMT+8）')
    expect(cards[1].find('.text-button').text()).toBe('去催办')
  })

  it('keeps member headers when the member list is empty', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    vi.mocked(mockedApi.members).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()

    expect(wrapper.findAll('.member-table thead .sort-header').map(item => item.text())).toEqual(['姓名', '绩效评级', '360° 评估率', '序列', '职级', '入职日期', '所属部门'])
    expect(wrapper.get('.member-table tbody .member-state').text()).toBe('暂无成员')
    expect(wrapper.get('.member-state-cell').attributes('colspan')).toBe('8')
    expect(wrapper.findAll('.member-table tbody .member-name')).toHaveLength(0)
  })

  it('opens the statistics preview with the current cycle and no new report request', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.line-tab')[3].trigger('click')
    await flushPromises()
    const report = wrapper.findComponent({ name: 'ProjectStatisticsReportPanel' })
    expect(report.props('cycleId')).toBe(1)
    expect(report.props('cycleName')).toBe('2026上半年')
    expect(wrapper.text()).toContain('模拟数据')
    expect(wrapper.findAll('[data-report-section]')).toHaveLength(9)
    expect(mockedApi.members).not.toHaveBeenCalled()
    expect(mockedApi.overview).toHaveBeenCalledTimes(1)
    await wrapper.findAll('.line-tab')[2].trigger('click')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ProjectPerformanceMatrix' }).exists()).toBe(true)
    expect(mockedApi.matrix).toHaveBeenCalledWith(3)
    expect(wrapper.text()).toContain('待完成评估')
    wrapper.unmount()
  })

  it('selects a project menu item and marks it active', async () => {
    vi.mocked(mockedApi.overview).mockResolvedValue(overviewOf())
    const wrapper = mountView()
    await flushPromises()

    const projectNode = wrapper.findAll('.review-node')[1]
    await projectNode.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.review-node')[1].classes()).toContain('active')
    expect(wrapper.text()).toContain('产品中心项目')
    expect(wrapper.text()).toContain('后续迭代中开发')
  })
})
