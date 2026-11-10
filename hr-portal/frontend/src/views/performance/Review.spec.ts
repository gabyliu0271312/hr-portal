import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { ElTableColumn } from 'element-plus'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { performanceReview360InviteApi, performanceReview360FeedbackApi, performanceNavigationApi, performanceReviewApi, performanceWorkbenchApi, projectManagementApi, type PerformanceNavigationContext, type PerformanceReviewOverview } from '@/api/performance'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'

const push = vi.fn()
const replace = vi.fn()
const resolve = vi.fn(({ path, query }: { path: string; query: Record<string, string | undefined> }) => ({ href: `${path}?${new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString()}` }))
const routeQuery = vi.hoisted(() => ({} as Record<string, string>))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ push, replace, resolve }),
}))

import Review from './Review.vue'
import PerformanceReviewContent from '@/components/performance/PerformanceReviewContent.vue'
import ProjectMemberListPanel from '@/components/performance/ProjectMemberListPanel.vue'
import PerformanceReview360FeedbackPanel from '@/components/performance/PerformanceReview360FeedbackPanel.vue'
import PerformanceReview360InvitePanel from '@/components/performance/PerformanceReview360InvitePanel.vue'
import PerformanceMemberIdentity from '@/components/performance/PerformanceMemberIdentity.vue'
import PerformanceTaskStatus from '@/components/performance/PerformanceTaskStatus.vue'
import { normalizePerformanceTaskStatus, performanceTaskStatusLabel } from '@/components/performance/performanceTaskStatus'
import performanceLayoutSource from '@/layouts/PerformanceLayout.vue?raw'
import reviewSource from './Review.vue?raw'
import reviewContentSource from '@/components/performance/PerformanceReviewContent.vue?raw'
import sidebarSource from '@/components/performance/PerformanceReviewCategorySidebar.vue?raw'

const overview: PerformanceReviewOverview = {
  projects: [{ project_id: 1, project_name: '绩效项目', cycle_name: '2026年全年', cycle_start_at: '2026-01-01', cycle_end_at: '2026-12-31' }],
  active_project: { project_id: 1, project_name: '绩效项目', cycle_name: '2026年全年', cycle_start_at: '2026-01-01', cycle_end_at: '2026-12-31' },
  template_name: '半年度绩效评估模板',
  categories: [
    { key: 'mine', label: '我的绩效', nodes: [{ task_id: 11, node_id: 'summary', node_name: '工作总结环节', node_type: 'work_summary', task_kind: 'work_summary', entry_mode: 'template_task', executor_label: '被评估人', status: 'pending', start_at: null, end_at: null, action_url: '/performance/review?node=summary' }] },
    { key: 'others', label: '给他人的评估', nodes: [{ node_id: 'review-360', node_name: '360°评估', node_type: 'evaluation', executor_label: '360°评估人', status: 'overdue', start_at: null, end_at: null, action_url: '/performance/review?node=review-360' }] },
    { key: 'team', label: '我团队的绩效', nodes: [{ node_id: 'calibration', node_name: '校准环节', node_type: 'calibration', executor_label: '在项目配置时指定', status: 'not_started', start_at: null, end_at: null, action_url: '/performance/review?node=calibration' }] },
    { key: 'other', label: '其他事项', nodes: [{ node_id: 'appeal', node_name: '结果复议处理环节', node_type: 'result_reconsideration', executor_label: '', status: 'pending', start_at: null, end_at: null, action_url: '/performance/review?node=appeal' }] },
  ],
}

const resultOverview = (): PerformanceReviewOverview => {
  const value = structuredClone(overview)
  value.categories[0].nodes.push({ node_id: 'view-result', node_name: '查看绩效结果', node_type: 'result_view', executor_label: '被评估人', status: 'pending', start_at: null, end_at: null, action_url: '/performance/review?node=view-result' })
  return value
}

const navigationOf = (cycleId = 1, overrides: Partial<PerformanceNavigationContext> = {}): PerformanceNavigationContext => ({
  cycles: [
    { cycle_id: 1, cycle_name: '2025周期', cycle_start_at: '2025-01-01', cycle_end_at: '2025-12-31' },
    { cycle_id: 2, cycle_name: '2026周期', cycle_start_at: '2026-01-01', cycle_end_at: '2026-12-31' },
  ],
  active_cycle: cycleId ? { cycle_id: cycleId, cycle_name: cycleId === 1 ? '2025周期' : '2026周期', cycle_start_at: cycleId === 1 ? '2025-01-01' : '2026-01-01', cycle_end_at: cycleId === 1 ? '2025-12-31' : '2026-12-31' } : null,
  can_review: true,
  can_manage: true,
  review_projects: [overview.projects[0]],
  ...overrides,
})

let pinia: Pinia

const ElTableStub = defineComponent({
  props: { data: { type: Array, default: () => [] } },
  provide() {
    return { tableRows: this.data }
  },
  template: '<table><thead><tr><slot /></tr></thead><tbody><tr><td><slot name="empty" /></td></tr></tbody></table>',
})

const ElTableColumnStub = defineComponent({
  inject: ['tableRows'],
  template: '<td><slot name="header" /><template v-for="row in tableRows"><slot :row="row" /></template></td>',
})

function mountView() {
  return mount(Review, {
    global: {
      plugins: [pinia],
      stubs: {
        'el-icon': { template: '<span><slot /></span>' },
        'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<div><slot /></div>', props: ['command'] },
        ElTable: ElTableStub,
        ElTableColumn: ElTableColumnStub,
      },
    },
  })
}

describe('PerformanceReview', () => {
  it('lets completed cards grow with content instead of shrinking inside the scroll viewport', () => {
    expect(reviewContentSource).toContain("'review-body--completed': !resultUnavailable && (node.node_type === 'result_view' || node.status === 'completed'")
    expect(reviewContentSource).toMatch(/\.review-body--completed\s*\{[^}]*flex:\s*1 0 auto/)
    expect(reviewContentSource).toMatch(/\.review-panel\.completed\s*\{[^}]*flex:\s*1 0 auto;[^}]*min-height:\s*0/)
    expect(reviewContentSource).toMatch(/\.completed-content\s*\{[^}]*flex:\s*none/)
    expect(reviewContentSource).toContain('.review-panel > p, .review-state p')
  })

  it('renders reconsideration directly as a members table without manager tabs', async () => {
    const node = { ...overview.categories[3].nodes[0], task_kind: 'result_reconsideration', entry_mode: 'template_task' as const }
    const wrapper = mount(PerformanceReviewContent, {
      props: { node, projectId: 1, loading: false, error: '', templateName: '模板' },
      global: { stubs: { ProjectMemberListPanel: { template: '<div class="recon-member-table" />' } } },
    })
    await flushPromises()
    expect(wrapper.find('.recon-member-table').exists()).toBe(true)
    expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('矩阵分析')
    expect(wrapper.text()).not.toContain('统计报表')
    wrapper.unmount()
  })

  it('uses the identity epoch as the view key without remounting on query navigation', () => {
    expect(performanceLayoutSource).toContain('<router-view :key="employeeSwitchEpoch" />')
    expect(performanceLayoutSource).not.toContain('route.fullPath')
  })

  it('uses the same outer card width and scrollbar behavior for every node state', () => {
    expect(performanceLayoutSource).toMatch(/\.review-main\s*\{[^}]*scrollbar-gutter:\s*auto/s)
    expect(reviewSource).toContain(':global(html:has(.review-page)) { scrollbar-gutter: auto; }')
    expect(reviewContentSource).toMatch(/\.review-content\s*\{[^}]*padding:\s*var\(--performance-review-surface-inset\) var\(--performance-review-surface-inset\) 0;[^}]*scrollbar-width:\s*none/s)
    expect(reviewContentSource).toMatch(/\.review-content::-webkit-scrollbar\s*\{[^}]*display:\s*none/s)
    expect(reviewContentSource).not.toMatch(/\.review-content\.is-completed\s*\{/)
  })

  it('removes the old white panel decoration from the evaluation workspace', () => {
    expect(reviewContentSource).toMatch(/\.review-panel\.evaluation\s*\{[^}]*align-items:\s*stretch;[^}]*padding:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none/s)
    expect(reviewContentSource).toMatch(/\.evaluation-workspace\s*\{[^}]*width:\s*100%;[^}]*align-self:\s*stretch/s)
    expect(reviewContentSource).toContain(':tabs="evaluationTabs" flush')
    expect(reviewContentSource).not.toContain(':tabs="evaluationTabs" sticky flush')
    expect(reviewContentSource).toMatch(/\.review-panel\.completed\s*\{[^}]*padding:\s*var\(--performance-review-surface-inset\)/s)
  })

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    Object.keys(routeQuery).forEach(key => delete routeQuery[key])
    push.mockReset()
    replace.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(performanceNavigationApi, 'get').mockImplementation(async (cycleId) => navigationOf(cycleId || 1))
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigationOf(1))
    vi.spyOn(projectManagementApi, 'resultReconsideration').mockRejectedValue(new Error('RECONSIDERATION_NOT_CONFIGURED'))
    vi.spyOn(performanceReviewApi, 'overview').mockResolvedValue(overview)
    vi.spyOn(performanceWorkbenchApi, 'taskPeople').mockResolvedValue([])
  })

  it('maps the legacy results shortcut to the real result submenu and renders its readonly content', async () => {
    Object.assign(routeQuery, { entry: 'results', cycle_id: '1', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [{ task_id: 11, field_id: 'rating', option_id: 'a', label: '优秀' }], contents: [] })
    const wrapper = mountView()
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ query: { cycle_id: '1', project_id: '1', node: 'view-result' } })
    expect(projectManagementApi.myResults).toHaveBeenCalledWith(1)
    expect(wrapper.get('.review-heading h2').text()).toBe('查看绩效结果')
    expect(wrapper.find('.review-panel.completed .review-results').exists()).toBe(true)
    expect(wrapper.get('.review-results').text()).not.toContain('优秀')
    expect(wrapper.get('.review-results').text()).toContain('暂无可查看的绩效结果')
    expect(wrapper.find('.review-sidebar').exists()).toBe(true)
    wrapper.unmount()
  })

  it('renders server-ordered result and reference regions in the shared completed white card', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const content = (id: number, text: string) => ({ task_id: id, form_schema: [{ id: String(id), name: text, fields: [{ id: 'text', type: 'rich_text' as const, label: '内容' }] }], answers: { text } })
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({
      project_id: 1, employee_no: 'E001', content_page_name: '配置的结果页名称',
      results: [{ task_id: 11, field_id: 'rating', option_id: 'a', label: '不应额外展示的摘要' }],
      regions: [
        { key: 'reference:summary', kind: 'reference', title: '配置的工作总结标题', contents: [content(12, '参考内容先展示')] },
        { key: 'result', kind: 'result', title: '配置的结果页名称', contents: [content(11, '主结果后展示')] },
      ],
    })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.review-heading h2').text()).toBe('配置的结果页名称')
    expect(wrapper.findAll('[data-region-id]').map(region => region.attributes('data-region-id'))).toEqual(['reference:summary', 'result'])
    const whiteCard = wrapper.get('.review-panel.completed')
    expect(whiteCard.text()).toContain('参考内容先展示')
    expect(whiteCard.text()).toContain('主结果后展示')
    expect(wrapper.text()).not.toContain('不应额外展示的摘要')
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders explicitly configured OKR regions through the existing readonly OKR panel', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], regions: [
      { key: 'reference:okr', kind: 'reference', title: '本期目标', reference_kind: 'okr', contents: [], okrs: [{ source: 'feishu', okr_id: 'fixture', period_label: '本期', objectives: [{ id: 'objective', content: '授权本人目标', key_results: [] }] }] },
    ] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.review-panel.completed .okr-card').text()).toContain('授权本人目标')
    expect(wrapper.text()).not.toContain('暂无可查看的绩效结果')
    wrapper.unmount()
  })

  it('honors explicit empty regions over compatibility contents without inventing visible content', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], regions: [], contents: [{ task_id: 11, form_schema: [{ id: 'hidden', name: '不该回退的旧内容', fields: [] }], answers: {} }] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('暂无可查看的绩效结果')
    expect(wrapper.text()).not.toContain('不该回退的旧内容')
    wrapper.unmount()
  })

  it('keeps a deep link on the requested submenu and does not fall back to work summary', async () => {
    Object.assign(routeQuery, { cycle_id: '1', project_id: '1', node: 'manager' })
    const loaded = resultOverview()
    loaded.categories[2].nodes.push({ ...loaded.categories[0].nodes[0], node_id: 'manager', node_name: '上级评估' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(loaded)
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.review-heading h2').text()).toBe('上级评估')
    expect(replace).not.toHaveBeenCalledWith(expect.objectContaining({ query: expect.objectContaining({ node: 'summary' }) }))
    wrapper.unmount()
  })

  it('renders allowed result tags through the shared readonly renderer and honors display flags', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [{ task_id: 11, form_schema: [{ id: 'tags', name: '终评内容', fields: [
      { id: 'tag', type: 'tag_with_followup', label: '', hide_name: true, description: '', hide_description: true, options: [{ id: 'a', label: '协作' }] },
    ] }], answers: { tag: { tags: ['a'], notes: { a: '<p>终评反馈</p>' } } } }] })
    const wrapper = mountView()
    await flushPromises()
    expect(projectManagementApi.myResults).toHaveBeenCalledWith(1)
    expect(wrapper.get('.review-results').text()).toContain('协作')
    expect(wrapper.get('.review-results').text()).toContain('终评反馈')
    expect(wrapper.find('.template-field-label').exists()).toBe(false)
    expect(wrapper.find('.template-field-description').exists()).toBe(false)
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('暂无可查看的绩效结果')
    wrapper.unmount()
  })

  it('does not render legacy rating summaries outside template content and keeps denied or empty states', async () => {
    Object.assign(routeQuery, { node: 'view-result', project_id: '1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const api = vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [{ task_id: 11, field_id: 'rating', option_id: 'a', label: '优秀' }] })
    const legacy = mountView()
    await flushPromises()
    expect(legacy.get('.review-results').text()).not.toContain('优秀')
    legacy.unmount()
    api.mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    const empty = mountView()
    await flushPromises()
    expect(empty.text()).toContain('暂无可查看的绩效结果')
    empty.unmount()
    api.mockRejectedValue(new Error('RESULT_NOT_FOUND'))
    const denied = mountView()
    await flushPromises()
    expect(denied.get('[role="alert"]').text()).toContain('绩效结果加载失败，请重试')
    expect(denied.find('.performance-template-renderer').exists()).toBe(false)
    denied.unmount()
  })

  it.each(['pending', 'not_started', 'overdue', 'completed'] as const)('hides only the result-view sidebar status for %s', async status => {
    Object.assign(routeQuery, { project_id: '1', node: 'view-result' })
    const loaded = resultOverview()
    loaded.categories[0].nodes.find(node => node.node_type === 'result_view')!.status = status
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(loaded)
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    const wrapper = mountView()
    await flushPromises()
    const resultNode = wrapper.findAll('.review-node').find(node => node.text().includes('查看绩效结果'))!
    expect(resultNode.find('em').exists()).toBe(false)
    expect(wrapper.findAll('.review-node').find(node => node.text().includes('工作总结环节'))!.find('em').text()).toBe('待完成')
    wrapper.unmount()
  })

  it('uses the shared centered node illustration for unopened results and clears it on reopening', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'view-result' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const api = vi.spyOn(projectManagementApi, 'myResults').mockRejectedValue({ response: { status: 404, data: { detail: 'RESULT_NOT_FOUND' } } })
    const wrapper = mountView()
    await flushPromises()
    const panel = wrapper.get('.review-panel')
    expect(panel.text()).toBe('暂未开通结果')
    expect(panel.classes()).not.toContain('completed')
    expect(wrapper.get('.review-body').classes()).not.toContain('review-body--completed')
    expect(panel.get('.state-illustration img').attributes()).toMatchObject({ src: '/performance-not-started.svg', width: '120', height: '121' })
    expect(wrapper.find('.reconsideration-menu').exists()).toBe(false)
    expect(wrapper.find('.primary-button').exists()).toBe(false)
    api.mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    usePerformanceProjectContextStore().setActiveProjectId(2)
    await flushPromises()
    usePerformanceProjectContextStore().setActiveProjectId(1)
    await flushPromises()
    expect(wrapper.text()).not.toContain('暂未开通结果')
    expect(wrapper.find('.review-panel.completed').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps transport failures distinct from unopened results and supports retry', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'view-result' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const api = vi.spyOn(projectManagementApi, 'myResults').mockRejectedValue({ response: { status: 500 } })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('绩效结果加载失败，请重试')
    expect(wrapper.text()).not.toContain('暂未开通结果')
    api.mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('绩效结果加载失败，请重试')
    expect(wrapper.text()).toContain('暂无可查看的绩效结果')
    wrapper.unmount()
  })

  it('restores the linked project after loading a different cycle navigation', async () => {
    Object.assign(routeQuery, { cycle_id: '2', project_id: '1', node: 'view-result' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    const wrapper = mountView()
    await flushPromises()
    expect(performanceNavigationApi.get).toHaveBeenCalledWith(2)
    expect(performanceReviewApi.overview).toHaveBeenCalledWith(1, undefined, 2)
    expect(projectManagementApi.myResults).toHaveBeenCalledWith(1)
    expect(usePerformanceProjectContextStore().activeProjectId).toBe(1)
    wrapper.unmount()
  })

  it('refuses unavailable result menus instead of selecting a different project or summary', async () => {
    Object.assign(routeQuery, { entry: 'results', project_id: '1' })
    const results = vi.spyOn(projectManagementApi, 'myResults')
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('当前项目没有可查看的绩效结果入口')
    expect(results).not.toHaveBeenCalled()
    expect(wrapper.find('.review-results').exists()).toBe(false)
    wrapper.unmount()

    Object.assign(routeQuery, { project_id: '9' })
    const denied = mountView()
    await flushPromises()
    expect(denied.text()).toContain('当前项目不存在或无权查看')
    expect(results).not.toHaveBeenCalled()
    denied.unmount()
  })

  it('does not silently select summary for an unknown explicit node', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'manager?node=manager' })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('当前评估环节不存在或无权查看')
    expect(wrapper.find('.review-heading').exists()).toBe(false)
    wrapper.unmount()
  })

  it('loads results when selecting the submenu and preserves the reconsideration entry', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'summary' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    const api = vi.spyOn(projectManagementApi, 'myResults').mockResolvedValue({ project_id: 1, employee_no: 'E001', results: [], contents: [] })
    vi.mocked(projectManagementApi.resultReconsideration).mockResolvedValue({ prompt: '结果存在疑问可发起复议', can_submit: true, window_open: true, deadline_at: '2099-11-11T10:00:00Z' } as any)
    const wrapper = mountView()
    await flushPromises()
    expect(api).not.toHaveBeenCalled()
    await wrapper.findAll('.review-node').find(node => node.text().includes('查看绩效结果'))!.trigger('click')
    await flushPromises()
    expect(api).toHaveBeenCalledWith(1)
    await wrapper.get('.reconsideration-more').trigger('mouseenter')
    await wrapper.get('.reconsideration-more').trigger('click')
    expect(wrapper.get('.reconsideration-menu__panel').text()).toContain('发起复议')
    expect(wrapper.find('.review-heading .reconsideration-menu').exists()).toBe(true)
    await wrapper.get('.reconsideration-menu__panel button').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('.rich-input')?.getAttribute('data-placeholder')).toBe('请输入复议理由')
    expect(wrapper.find('.review-sidebar').exists()).toBe(true)
    expect(wrapper.find('.review-results input').exists()).toBe(false)
    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('ignores a late result response after switching to a different project', async () => {
    Object.assign(routeQuery, { project_id: '1', node: 'view-result' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(resultOverview())
    let resolveResult!: (value: any) => void
    vi.spyOn(projectManagementApi, 'myResults').mockReturnValue(new Promise(resolve => { resolveResult = resolve }))
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.text()).toContain('正在加载绩效结果')
    usePerformanceProjectContextStore().setActiveProjectId(2)
    await wrapper.vm.$nextTick()
    resolveResult({ results: [{ task_id: 11, field_id: 'rating', label: '旧项目敏感结果' }], contents: [] })
    await flushPromises()
    expect(wrapper.text()).not.toContain('旧项目敏感结果')
    expect(projectManagementApi.resultReconsideration).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('renders the template name and all four template-driven categories', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('半年度绩效评估模板')
    expect(wrapper.text()).toContain('我的绩效')
    expect(wrapper.text()).toContain('给他人的评估')
    expect(wrapper.text()).toContain('我团队的绩效')
    expect(wrapper.text()).toContain('其他事项')
    expect(wrapper.text()).toContain('工作总结环节')
    expect(wrapper.get('.review-sidebar').attributes('style')).toBeUndefined()
    expect(wrapper.findAll('.category-icon svg')).toHaveLength(4)
    expect(performanceReviewApi.overview).toHaveBeenCalledWith(1, undefined, 1)
    expect(usePerformanceProjectContextStore().activeProjectId).toBe(1)
  })

  it('restores cached overview immediately and refreshes it silently', async () => {
    const context = usePerformanceProjectContextStore()
    context.setActiveProjectId(1)
    context.setReviewOverview(overview)
    vi.mocked(performanceReviewApi.overview).mockReturnValue(new Promise(() => {}))

    const wrapper = mountView()
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('半年度绩效评估模板')
    expect(wrapper.text()).not.toContain('正在加载绩效评估')
    expect(performanceReviewApi.overview).toHaveBeenCalledWith(1, undefined, 1)
  })

  it('renders the captured sidebar edge button without clipping it', () => {
    const wrapper = mountView()
    const button = wrapper.get('.sidebar-collapse')
    const icon = button.get('svg')

    expect(button.attributes('aria-label')).toBe('收起侧边栏')
    expect(icon.attributes('data-icon')).toBe('LeftSmallCcmOutlined')
    expect(icon.attributes('width')).toBe('16')
    expect(icon.attributes('height')).toBe('16')
    expect(button.get('path').attributes('d')).toBe('M15.707 4.293a1 1 0 0 1 0 1.414L9.414 12l6.293 6.293a1 1 0 0 1-1.414 1.414l-7-7a1 1 0 0 1 0-1.414l7-7a1 1 0 0 1 1.414 0Z')
    expect(sidebarSource.match(/\.review-sidebar\s*\{([^}]*)\}/)?.[1]).not.toMatch(/overflow/)
    expect(sidebarSource).toMatch(/\.sidebar-scroll\s*\{[^}]*overflow-y:\s*auto/s)
    expect(sidebarSource).toMatch(/\.sidebar-collapse\s*\{[^}]*right:\s*-16px;[^}]*width:\s*16px;[^}]*height:\s*40px;[^}]*color:\s*#3370ff;[^}]*box-shadow:\s*4px 0 6px rgba\(31, 35, 41, 0\.03\)/s)
  })

  it('collapses to a 72px category rail and rotates the edge arrow by 180 degrees', async () => {
    const wrapper = mountView()
    await flushPromises()
    const button = wrapper.get('.sidebar-collapse')

    await button.trigger('click')
    expect(wrapper.get('.review-sidebar').classes()).toContain('is-collapsed')
    expect(button.attributes('aria-label')).toBe('展开侧边栏')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.get('svg').classes()).toContain('flipped')
    expect(wrapper.find('.cycle-picker').exists()).toBe(false)
    expect(wrapper.findAll('.category-toggle')).toHaveLength(4)
    expect(wrapper.get('.category-toggle.active .category-label').text()).toBe('我的绩效')
    expect(wrapper.findAll('.review-node-list').every(list => !list.isVisible())).toBe(true)
    expect(sidebarSource).toMatch(/\.review-sidebar\.is-collapsed\s*\{[^}]*width:\s*72px;[^}]*flex-basis:\s*72px/s)
    expect(sidebarSource).toMatch(/\.universe-icon svg\.flipped\s*\{\s*transform:\s*rotate\(180deg\)/s)

    await wrapper.findAll('.category-toggle')[1].trigger('click')
    expect(wrapper.get('.review-sidebar').classes()).toContain('is-collapsed')
    expect(wrapper.get('.sidebar-flyout').attributes('aria-label')).toBe('给他人的评估')
    expect(wrapper.get('.flyout-node').text()).toBe('360°评估')
    expect(sidebarSource).toMatch(/\.sidebar-flyout\s*\{[^}]*left:\s*72px;[^}]*width:\s*188px;[^}]*height:\s*100%/s)

    await button.trigger('click')
    expect(button.attributes('aria-label')).toBe('收起侧边栏')
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)
    expect(button.get('svg').classes()).not.toContain('flipped')
    expect(wrapper.find('.cycle-picker').exists()).toBe(true)
  })

  it('opens the captured submenu on hover or click and selects a node without expanding', async () => {
    const multiNodeOverview = structuredClone(overview)
    multiNodeOverview.categories[0].nodes.push({
      ...multiNodeOverview.categories[0].nodes[0], node_id: 'self', node_name: '自评', task_id: 12,
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(multiNodeOverview)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.sidebar-collapse').trigger('click')

    const categories = wrapper.findAll('.category-toggle')
    await categories[0].trigger('mouseenter')
    expect(categories[0].find('.flyout-notch-inner').exists()).toBe(true)
    expect(sidebarSource).toMatch(/\.flyout-notch\s*\{[^}]*right:\s*-8px;[^}]*z-index:\s*1000;[^}]*border:\s*6px solid transparent;[^}]*border-right-color:\s*rgba\(31, 35, 41, 0\.15\)/s)
    expect(sidebarSource).toMatch(/\.flyout-notch-inner\s*\{[^}]*top:\s*-5px;[^}]*left:\s*-3px;[^}]*border:\s*5px solid transparent;[^}]*border-right-color:\s*#fff/s)
    expect(wrapper.findAll('.flyout-node').map(node => node.text())).toEqual(['工作总结环节', '自评'])
    expect(wrapper.get('.flyout-node.active').text()).toBe('工作总结环节')
    expect(categories[0].attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.review-sidebar').classes()).toContain('has-flyout')
    expect(sidebarSource).toMatch(/\.is-collapsed\.has-flyout \.sidebar-collapse\s*\{[^}]*right:\s*-204px/s)

    await categories[1].trigger('click')
    expect(categories[0].find('.flyout-notch').exists()).toBe(false)
    expect(categories[1].find('.flyout-notch-inner').exists()).toBe(true)
    expect(wrapper.get('.sidebar-flyout').attributes('aria-label')).toBe('给他人的评估')
    expect(wrapper.get('.review-sidebar').classes()).toContain('is-collapsed')
    await categories[0].trigger('click')
    await wrapper.findAll('.flyout-node')[1].trigger('click')
    expect(wrapper.get('.review-heading h2').text()).toBe('自评')
    expect(replace).toHaveBeenCalledWith({ query: { project_id: '1', node: 'self' } })
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)
    expect(wrapper.get('.review-sidebar').classes()).toContain('is-collapsed')
    expect(wrapper.get('.category-toggle.active .category-label').text()).toBe('我的绩效')
    wrapper.unmount()
  })

  it('dismisses the submenu on mouse leave, Escape and outside pointer', async () => {
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.sidebar-collapse').trigger('click')
    const category = wrapper.get('.category-toggle')
    await category.trigger('mouseenter')
    await wrapper.get('.review-sidebar').trigger('mouseleave')
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)

    await category.trigger('click')
    await wrapper.get('.review-sidebar').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)

    await category.trigger('click')
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sidebar-flyout').exists()).toBe(false)
    wrapper.unmount()
  })

  it('supports collapsing each category block from its title button', async () => {
    const wrapper = mountView()
    await flushPromises()

    const categoryToggle = wrapper.get('.category-toggle')
    expect(categoryToggle.attributes('aria-expanded')).toBe('true')
    await categoryToggle.trigger('click')

    expect(categoryToggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.review-node-list').attributes('style')).toContain('display: none')
  })

  it('uses only registered task kind and entry mode for template task navigation', async () => {
    const { performanceTaskEntryRoute } = await import('@/components/performance/performanceTaskEntry')
    const registered = overview.categories[0].nodes[0]
    expect(performanceTaskEntryRoute(registered, 1)).toBe('/performance/review/self-summary?task_id=11&project_id=1&node=summary')
    expect(performanceTaskEntryRoute({ ...registered, task_id: 299, task_kind: 'evaluation' }, 3)).toBe('/performance/review/template-task?task_id=299&project_id=3&node=summary')
    expect(performanceTaskEntryRoute({ ...registered, entry_mode: 'route' }, 1)).toBeNull()
    expect(performanceTaskEntryRoute({ ...registered, task_kind: 'future_task' }, 1)).toBeNull()
    expect(performanceTaskEntryRoute({ ...registered, task_id: undefined }, 1)).toBeNull()
  })

  it('shows node states and keeps internal task navigation inside the SPA', async () => {
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('待完成')
    expect(wrapper.text()).toContain('已逾期')
    expect(wrapper.text()).toContain('未开始')
    await wrapper.get('.review-node').trigger('click')
    await wrapper.get('.primary-button').trigger('click')
    expect(push).toHaveBeenCalledWith('/performance/review/self-summary?task_id=11&project_id=1&node=summary')
  })

  it('keeps the time subtitle on unfinished nodes', async () => {
    const scheduled = structuredClone(overview)
    scheduled.categories[0].nodes[0].end_at = '2026-09-24T15:59:00Z'
    scheduled.categories[2].nodes[0].start_at = '2026-09-24T00:00:00Z'
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(scheduled)

    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.get('.review-heading .review-deadline').text()).toContain('截止时间：')
    await wrapper.findAll('.review-node')[2].trigger('click')
    expect(wrapper.get('.review-heading .review-deadline').text()).toContain('启动时间：')
    expect(wrapper.findAll('.review-panel')).toHaveLength(1)
  })

  it('renders an unstarted direct-manager evaluation with the shared unstarted state', async () => {
    const scheduled = structuredClone(overview)
    Object.assign(scheduled.categories[2].nodes[0], {
      node_id: 'manager-review',
      node_name: '直接上级评估',
      node_type: 'evaluation',
      task_kind: 'evaluation',
      executor_label: '直接上级',
      status: 'not_started',
      start_at: '2026-09-24T00:00:00Z',
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(scheduled)

    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.review-node')[2].trigger('click')

    expect(wrapper.get('.review-panel').classes()).not.toContain('evaluation')
    expect(wrapper.get('.state-illustration img').attributes('src')).toBe('/performance-not-started.svg')
    expect(wrapper.get('.review-panel').text()).toContain('暂未启动')
    expect(wrapper.find('.evaluation-workspace').exists()).toBe(false)
    expect(wrapper.find('.primary-button').exists()).toBe(false)
  })

  it('keeps the submitted task selected and renders its answers in the review panel', async () => {
    const completed = structuredClone(overview)
    Object.assign(completed.categories[0].nodes[0], {
      status: 'completed',
      submitted_at: '2026-09-17T03:10:10Z',
      end_at: '2026-09-24T15:59:00Z',
      editable: true,
      form_schema: [
        { id: 'work', name: '工作总结', description: '描述', allow_multiple: true, fields: [{ id: 'answer', type: 'rich_text', label: '填写内容' }] },
        { id: 'rating', name: '评分评级', fields: [{ id: 'level', type: 'rating', label: '绩效评级', options: [{ id: 'four', label: '4星', color: '#d9f5d6', description: '超出预期' }] }] },
        { id: 'tag', name: '标签型填写题', fields: [{ id: 'contribution', type: 'tag_with_followup', label: '价值贡献', options: [{ id: 'good', label: '做得好的' }] }] },
      ],
      answers: { answer: ['<ol><li><b>已提交内容</b></li></ol>'], level: 'four', contribution: { tags: ['good'], note: '<p>补充说明</p>' } },
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(completed)

    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('.review-sidebar').find('.status-completed').exists()).toBe(false)
    expect(wrapper.text()).toContain('填写内容 1')
    expect(wrapper.text()).toContain('已提交内容')
    expect(wrapper.text()).toContain('你可以在 2026-09-24 23:59（GMT+8） 前继续编辑')
    expect(wrapper.find('.review-heading .review-deadline').exists()).toBe(false)
    expect(wrapper.get('.performance-review-completion-notice__edit').text()).toBe('编辑')
    expect(wrapper.get('.performance-review-completion-notice__edit').attributes('aria-label')).toBe('编辑已提交内容')
    expect(wrapper.get('.performance-review-completion-notice__edit svg').attributes('viewBox')).toBe('0 0 24 24')
    expect(wrapper.get('.performance-review-completion-notice__edit svg').attributes('data-icon')).toBe('EditOutlined')
    expect(wrapper.text()).toContain('4星')
    expect(wrapper.get('.readonly-field-rating').text()).toContain('绩效评级4星超出预期')
    expect(wrapper.text()).toContain('超出预期')
    expect(wrapper.text()).toContain('做得好的')
    expect(wrapper.text()).toContain('补充说明')
    expect(wrapper.get('.rich-answer ol li b').text()).toBe('已提交内容')
    expect(wrapper.text()).not.toContain('暂未填写')
    expect(wrapper.text()).not.toContain('去完成')

    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue({ task_id: 11, has_draft: false, editable: true, submit_allowed: true } as any)
    await wrapper.get('.performance-review-completion-notice__edit').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenLastCalledWith({ query: { project_id: '1', node: 'summary', task_id: '11' } })
    expect(push).toHaveBeenCalledWith('/performance/review/self-summary?task_id=11&project_id=1&node=summary')
  })

  it('shows submitted content without an edit action after the deadline', async () => {
    const completed = structuredClone(overview)
    Object.assign(completed.categories[0].nodes[0], {
      status: 'completed', editable: false, end_at: '2026-07-10T15:59:00Z',
      form_schema: [{ id: 'work', name: '工作总结', fields: [{ id: 'answer', type: 'rich_text', label: '总结' }] }],
      answers: { answer: '<script>alert(1)</script><a href="javascript:alert(1)">恶意链接</a><ul><li>保留列表</li></ul>' },
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(completed)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('保留列表')
    expect(wrapper.find('.rich-answer ul li').exists()).toBe(true)
    expect(wrapper.find('.rich-answer script').exists()).toBe(false)
    expect(wrapper.get('.rich-answer a').attributes('href')).toBeUndefined()
    expect(wrapper.find('.performance-review-completion-notice').exists()).toBe(true)
    expect(wrapper.text()).toContain('该环节已在 2026-07-10 23:59（GMT+8） 截止；如有疑问，请联系你的 HRBP。')
    expect(wrapper.find('.performance-review-completion-notice__edit').exists()).toBe(false)
  })

  it('keeps the member list when every direct-report evaluation is completed', async () => {
    const completedEvaluation = structuredClone(overview)
    Object.assign(completedEvaluation.categories[2].nodes[0], {
      node_id: 'manager-review',
      node_name: '直接上级评估',
      node_type: 'evaluation',
      task_kind: 'evaluation',
      status: 'completed',
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(completedEvaluation)

    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.review-node')[2].trigger('click')

    expect(wrapper.find('.evaluation-workspace').exists()).toBe(true)
    expect(wrapper.find('.performance-review-completion-notice').exists()).toBe(false)
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenCalledWith(1, 'manager-review', 'all', undefined)
  })

  it('renders independent rating columns from task metadata and preserves hidden columns on reload', async () => {
    const row = {
      task_id: 22, employee_no: 'E002', display_name: '已完成员工', status: 'completed', due_at: null,
      job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null,
      department: null, employee_type: null, employment_status: null,
      rating_columns: [{ key: 'rating:grade', label: '年度绩效' }, { key: 'rating:value', label: '价值贡献' }],
      ratings: { 'rating:grade': { label: '3星+', color: '#d9f5d6' }, 'rating:value': { label: 'A', color: '#e1eaff' } },
    }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([row])
    const wrapper = mount(ProjectMemberListPanel, { props: { projectId: 1, reviewContext: { nodeId: 'manager-review', state: 'all' } } })
    await flushPromises()
    expect(wrapper.findAll('th').map(cell => cell.text())).toEqual(expect.arrayContaining(['年度绩效', '价值贡献']))
    expect(wrapper.findAll('.performance-rating-tag').map(tag => tag.text())).toEqual(['3星+', 'A'])
    const exportButton = wrapper.findComponent({ name: 'PerformanceExportButton' })
    const exported = await exportButton.props('loadRows')()
    expect(exported[0]).toEqual(expect.arrayContaining(['年度绩效', '价值贡献']))
    expect(exported[1][exported[0].indexOf('年度绩效')]).toBe('3星+')
    expect(exported[1][exported[0].indexOf('价值贡献')]).toBe('A')
    expect(wrapper.text()).not.toContain('绩效评级')
    const drawer = wrapper.findComponent({ name: 'ProjectMemberColumnDrawer' })
    drawer.vm.$emit('confirm', ['name', 'rating:grade'])
    await flushPromises()
    await wrapper.get('input').setValue('员工')
    await wrapper.get('input').trigger('keyup.enter')
    await flushPromises()
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenLastCalledWith(1, 'manager-review', 'all', '员工')
    expect(wrapper.findAll('.performance-rating-tag').map(tag => tag.text())).toEqual(['3星+'])
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([])
    await wrapper.get('input').trigger('keyup.enter')
    await flushPromises()
    expect(wrapper.findAll('th').map(cell => cell.text())).toContain('年度绩效')
    expect(wrapper.findAll('.performance-rating-tag')).toHaveLength(0)
    wrapper.unmount()
  })

  it('passes the reviewee into the evaluation task route', async () => {
    const evaluation = structuredClone(overview)
    Object.assign(evaluation.categories[2].nodes[0], { node_id: 'manager-review', node_type: 'evaluation', task_kind: 'evaluation', entry_mode: 'template_task', task_id: 22, status: 'pending' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(evaluation)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.review-node')[2].trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', { task_id: 22, employee_no: 'E 002', status: 'pending' })
    await flushPromises()
    expect(push).toHaveBeenLastCalledWith(expect.stringContaining('employee_no=E%20002'))
    wrapper.unmount()
  })

  it('opens a completed evaluation member in the readonly drawer and keeps pending members on task entry', async () => {
    const evaluationOverview = structuredClone(overview)
    Object.assign(evaluationOverview.categories[1].nodes[0], {
      task_id: 22,
      status: 'pending',
      task_kind: 'evaluation',
      entry_mode: 'template_task',
    })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(evaluationOverview)
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{
      task_id: 22,
      aggregate_task_id: null,
      employee_no: 'E002',
      display_name: '已完成员工',
      job_family: '专业',
      job_category: '产品',
      job_sequence: '专业-产品',
      position_level: 'J3',
      hire_date: '2020-01-01',
      department: '产品中心',
      employee_type: '正式员工',
      employment_status: '在职',
      status: 'completed',
      due_at: '2026-10-03T15:59:00Z',
    }])
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({
      task_id: 22,
      task_kind: 'evaluation',
      entry_mode: 'template_task',
      node_name: '360°评估',
      deadline_at: '2026-10-03T15:59:00Z',
      submitted_at: '2026-09-22T07:29:00Z',
      editable: true,
      submit_allowed: true,
      person: { employee_no: 'E002', display_name: '已完成员工' },
      form_schema: [{ id: 'summary', name: '评估内容', fields: [{ id: 'answer', type: 'rich_text', label: '内容' }] }],
      answers: { answer: '已提交内容' },
    })
    const wrapper = mountView()
    await flushPromises()
    await wrapper.findAll('.review-node')[1].trigger('click')
    await flushPromises()
    wrapper.findComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', { id: 22, task_id: 22, employee_no: 'E002', display_name: '已完成员工', status: 'completed' })
    await flushPromises()

    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(22, 'E002')
    expect(document.body.textContent).toContain('已完成员工')
    expect(document.body.textContent).toContain('已提交内容')
    expect(document.body.querySelector('.performance-review-evaluation-drawer__scroll')).not.toBeNull()
    wrapper.unmount()
  })

  it('restores a shared completed task and copies its reference-tab link', async () => {
    const shared = structuredClone(overview)
    Object.assign(shared.categories[2].nodes[0], { node_id: 'manager-review', node_name: '上级评估', node_type: 'evaluation', task_kind: 'evaluation', status: 'completed' })
    Object.assign(routeQuery, { project_id: '1', node: 'manager-review', rootReviewId: '22', activeTab: 'summary' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(shared)
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 22, task_kind: 'evaluation', entry_mode: 'template_task', node_name: '上级评估', submitted_at: '2026-01-01T00:00:00Z', editable: false, submit_allowed: false, person: { employee_no: 'E002', display_name: '授权员工' }, form_schema: [], answers: {}, reference_tabs: [{ key: 'reference-summary', node_id: 'summary', node_name: '工作总结', employee_no: 'E002', status: 'completed', form_schema: [{ id: 'summary', name: '工作总结', fields: [{ id: 'answer', type: 'rich_text', label: '总结' }] }], answers: { answer: '已授权参考内容' }, can_remind: false }] })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = mountView()
    await flushPromises()
    expect(performanceReviewApi.overview).toHaveBeenCalledWith(1, 22, 1)
    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(22)
    expect(document.body.textContent).toContain('已授权参考内容')
    expect(document.body.querySelector('.performance-drawer__mask')).toBeNull()
    ;(document.body.querySelector('[aria-label="复制链接"]') as HTMLButtonElement).click()
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('rootReviewId=22'))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('activeTab=reference-summary'))
    ;(document.body.querySelector('.performance-drawer__outside') as HTMLElement).click()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 250))
    expect(replace).toHaveBeenLastCalledWith({ query: { project_id: '1', node: 'manager-review' } })
    expect(document.body.querySelector('.performance-drawer__panel')).toBeNull()
    wrapper.unmount()
  })

  it('renders self evaluation as a form task instead of the member workspace', async () => {
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce({
      ...overview,
      categories: overview.categories.map(category => category.key === 'mine'
        ? { ...category, nodes: [{ ...category.nodes[0], task_id: 12, node_id: 'self-eval', node_name: '员工自评', node_type: 'evaluation', task_kind: 'evaluation', executor_label: '被评估人', executor_role_code: 'assessment.reviewee', status: 'pending' }] }
        : category),
    })
    Object.assign(routeQuery, { project_id: '1', node: 'self-eval' })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.evaluation-workspace').exists()).toBe(false)
    expect(wrapper.text()).toContain('去完成')
    wrapper.unmount()
  })

  it('keeps the member workspace for manager evaluation nodes', async () => {
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce({
      ...overview,
      categories: overview.categories.map(category => category.key === 'team'
        ? { ...category, nodes: [{ ...category.nodes[0], task_id: 13, node_id: 'manager-eval', node_name: '上级评估', node_type: 'evaluation', task_kind: 'evaluation', executor_label: '实线上级', executor_role_code: 'assessment.line_manager', status: 'pending' }] }
        : category),
    })
    Object.assign(routeQuery, { project_id: '1', node: 'manager-eval' })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.find('.evaluation-workspace').exists()).toBe(true)
    wrapper.unmount()
  })

  it('hides empty evaluation categories while preserving categories with nodes', async () => {
    const withEmptyCategory = structuredClone(overview)
    withEmptyCategory.categories = [
      ...withEmptyCategory.categories.slice(0, 1),
      { key: 'empty', label: '空评估分组', nodes: [] },
      ...withEmptyCategory.categories.slice(1),
    ]
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce(withEmptyCategory)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).not.toContain('空评估分组')
    expect(wrapper.findAll('.category-toggle')).toHaveLength(4)
  })

  it('switches the shared cycle from the review selector and loads that cycle overview', async () => {
    const context = usePerformanceProjectContextStore()
    vi.mocked(performanceNavigationApi.get).mockImplementation(async (cycleId) => navigationOf(cycleId || 1))
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(overview)
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'PerformanceReviewCategorySidebar' }).vm.$emit('select-filter', 2)
    await flushPromises()

    expect(context.activeCycleId).toBe(2)
    expect(performanceNavigationApi.get).toHaveBeenCalledWith(2)
    expect(performanceReviewApi.overview).toHaveBeenLastCalledWith(undefined, undefined, 2)
  })

  it('redirects to the workbench when the selected cycle has no review access', async () => {
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigationOf(1, { can_review: false }))
    const wrapper = mountView()
    await flushPromises()

    expect(replace).toHaveBeenCalledWith('/performance/workbench')
    wrapper.unmount()
  })

  it('shows communication rows directly and uses a readonly drawer for completed rows', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'communicate', node_name: '绩效结果沟通', node_type: 'result_communication', task_kind: 'result_communication', status: 'pending' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'communicate' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ task_id: 22, employee_no: 'E2', display_name: '沟通员工', status: 'completed', due_at: null, completion: '3/5', previous_position_level: 'P5', job_family: null, job_category: null, job_sequence: null, position_level: 'P6', hire_date: null, department: null, employee_type: null, employment_status: null, rating_columns: [{ key: 'rating:grade', label: '绩效评级' }], ratings: { 'rating:grade': { label: 'A', color: '#d9f5d6' } } }])
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 22, task_kind: 'result_communication', entry_mode: 'template_task', node_name: '绩效结果沟通', editable: true, submit_allowed: true, submitted_at: '2026-10-20T00:00:00Z', person: { employee_no: 'E2', display_name: '沟通员工' }, form_schema: [], answers: {} })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.find('.feedback-panel').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('去完成')
    const table = wrapper.findComponent({ name: 'PerformanceManagementTable' })
    expect(table.props('columns').map((column: { label: string }) => column.label)).toEqual(['姓名', '状态', '截止时间', '绩效评级', '360°评估率', '序列', '职级', '入职日期', '所属部门', '员工类型', '上期职级'])
    expect(wrapper.find('.performance-rating-tag').text()).toBe('A')
    expect(wrapper.text()).toContain('3/5')
    expect(wrapper.text()).toContain('P5')
    table.vm.$emit('row-click', { task_id: 22, employee_no: 'E2', display_name: '沟通员工', status: 'completed' })
    await flushPromises()
    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(22, 'E2')
    expect(wrapper.findComponent({ name: 'PerformanceReviewEvaluationDrawer' }).props('readonly')).toBe(true)
    expect(document.body.querySelector('.performance-review-completion-notice__edit')).toBeNull()
    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('opens a newly created voluntary 360 task even when the overview node has no existing task metadata', async () => {
    const node = {
      node_id: 'evaluation-1',
      node_name: '360°反馈（自愿评估）',
      node_type: 'evaluation',
      executor_label: '360°评估人',
      executor_role_code: 'assessment.reviewer_360',
      status: 'pending' as const,
      start_at: null,
      end_at: null,
      action_url: '/performance/review?node=evaluation-1',
    }
    Object.assign(routeQuery, { project_id: '1', node: 'evaluation-1' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'others', label: '给他人的评估', nodes: [node] }] })
    const wrapper = mountView()
    await flushPromises()

    wrapper.findComponent({ name: 'PerformanceReview360FeedbackPanel' }).vm.$emit('open-task', {
      task_id: 12975,
      employee_no: '107187',
      display_name: '被评估人',
      status: 'pending',
    })
    await flushPromises()

    expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=12975&project_id=1&node=evaluation-1&employee_no=107187')
    wrapper.unmount()
  })

  it('scopes voluntary candidates and creation to the currently selected 360 node', async () => {
    const list = vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [], total: 0, node_id: 'second-360', allow_voluntary_evaluation: true })
    const candidates = vi.spyOn(performanceReview360FeedbackApi, 'candidates').mockResolvedValue({ items: [{ employee_no: 'E2', display_name: '同事', department: null, job_sequence: null }], total: 1 })
    const start = vi.spyOn(performanceReview360FeedbackApi, 'start').mockResolvedValue({ task_id: 55, target_employee_no: 'E2' })
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'second-360' }, global: { plugins: [pinia] } })
    await flushPromises()
    expect(list).toHaveBeenCalledWith(1, undefined, 'second-360')
    ;(wrapper.vm as unknown as { openVoluntaryDialog: () => void }).openVoluntaryDialog()
    await flushPromises()
    expect(candidates).toHaveBeenCalledWith(1, undefined, 'second-360')
    wrapper.findComponent({ name: 'PerformancePersonSelect' }).vm.$emit('update:modelValue', 'E2')
    await flushPromises()
    const confirm = Array.from(document.body.querySelectorAll('button')).find(button => button.textContent?.trim() === '前往评估')!
    confirm.click()
    await flushPromises()
    expect(start).toHaveBeenCalledWith(1, 'E2', 'second-360')
    expect(wrapper.emitted('open-task')?.[0]?.[0]).toMatchObject({ task_id: 55, employee_no: 'E2' })
    wrapper.unmount()
  })

  it('opens a pending communication task through the shared template route', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'communicate', node_name: '绩效结果沟通', node_type: 'result_communication', task_kind: 'result_communication', status: 'pending' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'communicate' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const wrapper = mountView()
    await flushPromises()
    wrapper.findComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', { task_id: 23, employee_no: 'E3', display_name: '待沟通', status: 'pending' })
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=23&project_id=1&node=communicate&employee_no=E3')
    wrapper.unmount()
  })

  it('renders calibration with the manager list and passes the frozen phase', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'calibration', node_name: '校准', node_type: 'calibration', task_kind: 'calibration', phase_id: 'phase-2', status: 'pending' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'calibration' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const wrapper = mountView()
    await flushPromises()
    expect(wrapper.findComponent({ name: 'ProjectMemberListPanel' }).exists()).toBe(true)
    expect(wrapper.text()).not.toContain('去完成')
    expect(performanceWorkbenchApi.taskPeople).toHaveBeenCalledWith(1, 'calibration', 'all', undefined, 'phase-2')
    wrapper.unmount()
  })

  it.each(['pending', 'completed', 'overdue'])('opens a %s calibration member in the shared readonly drawer before editing', async status => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'calibration', node_name: '校准', node_type: 'calibration', task_kind: 'calibration', phase_id: 'phase-2', status: 'pending' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'calibration' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const detail = vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 81, node_id: 'calibration', task_kind: 'calibration', entry_mode: 'template_task', node_name: '校准', editable: status !== 'overdue', submit_allowed: status !== 'overdue', person: { employee_no: 'E3', display_name: '被校准人' }, form_schema: [], answers: {} })
    const wrapper = mountView()
    await flushPromises()
    wrapper.getComponent(ProjectMemberListPanel).vm.$emit('select-member', { task_id: 81, employee_no: 'E3', display_name: '被校准人', status })
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    expect(detail).toHaveBeenCalledWith(81, 'E3')
    expect(wrapper.getComponent({ name: 'PerformanceReviewEvaluationDrawer' }).props('readonly')).toBe(false)
    expect(replace).toHaveBeenLastCalledWith({ query: expect.objectContaining({ rootReviewId: '81', node: 'calibration' }) })
    wrapper.getComponent({ name: 'PerformanceReviewEvaluationDrawer' }).vm.$emit('edit', { task_id: 81, employee_no: 'E3' })
    await flushPromises()
    expect(push).toHaveBeenCalledWith('/performance/review/template-task?task_id=81&project_id=1&node=calibration&employee_no=E3')
    wrapper.unmount()
  })

  it('restores calibration source detail from a shared drawer link without navigating to edit', async () => {
    const node = { ...overview.categories[0].nodes[0], node_id: 'calibration', node_name: '校准', node_type: 'calibration', task_kind: 'calibration', phase_id: 'phase-2', status: 'pending' as const }
    Object.assign(routeQuery, { project_id: '1', node: 'calibration', rootReviewId: '81', activeTab: 'calibration' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
    const detail = vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ task_id: 81, task_kind: 'calibration', entry_mode: 'template_task', node_name: '校准', editable: true, submit_allowed: true, person: { employee_no: 'E3', display_name: '被校准人' }, form_schema: [], answers: {} })
    const wrapper = mountView()
    await flushPromises()
    expect(detail).toHaveBeenCalledWith(81)
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.getComponent({ name: 'PerformanceReviewEvaluationDrawer' }).props('modelValue')).toBe(true)
    wrapper.unmount()
  })

  it('keeps unopened communication and calibration stages in the not-started state', async () => {
    for (const type of ['calibration', 'result_communication']) {
      const node = { ...overview.categories[0].nodes[0], node_id: type, node_type: type, task_kind: type, status: 'not_started' as const }
      Object.assign(routeQuery, { project_id: '1', node: type })
      vi.mocked(performanceReviewApi.overview).mockResolvedValue({ ...overview, categories: [{ key: 'team', label: '我团队的绩效', nodes: [node] }] })
      const wrapper = mountView()
      await flushPromises()
      expect(wrapper.text()).toContain('暂未启动')
      expect(wrapper.findComponent({ name: 'PerformanceManagementTable' }).exists()).toBe(false)
      wrapper.unmount()
    }
  })

  it('renders an empty state when the current user has no started project', async () => {
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce({
      projects: [], active_project: null, template_name: '', categories: overview.categories.map(category => ({ ...category, nodes: [] })),
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无已启动的绩效评估')
  })
  it.each(['project', 'review'])('preserves supervisor names and displays blue 0/0 in the %s member list', async entry => {
    const row = { id: 1, task_id: 1, employee_no: 'E1', display_name: '员工', direct_supervisor: '当期上级姓名', status: 'pending', due_at: null, avatar_url: null, rating: null, rating_tone: null, completion: null, job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([row])
    vi.spyOn(projectManagementApi, 'members').mockResolvedValue({ items: [row], total: 1, page: 1, page_size: 50 })
    const wrapper = mount(ProjectMemberListPanel, { props: { projectId: 1, ...(entry === 'review' ? { reviewContext: { nodeId: 'manager', state: 'all' as const } } : {}) } })
    await flushPromises()
    expect(wrapper.text()).toContain('当期上级姓名')
    expect(wrapper.get('.completion-text').text()).toBe('0/0')
    await wrapper.setProps({ projectId: 2 })
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ ...row, completion: '2/3' }])
    vi.mocked(projectManagementApi.members).mockResolvedValue({ items: [{ ...row, completion: '2/3' }], total: 1, page: 1, page_size: 50 })
    await wrapper.setProps({ projectId: 3 })
    await flushPromises()
    expect(wrapper.get('.completion-text').text()).toBe('2/3')
    wrapper.unmount()
  })

  it('passes the shared 360 ratio payload through the review member-list field', async () => {
    const evaluateRatio = { completion: '1/2', evaluated: [{ name: '已评人', dimission: false }], pending: [{ name: '待评人', dimission: false }], dimission_count: 0, invite_stage: 'in_progress' as const }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ task_id: 1, employee_no: 'E1', display_name: '员工', status: 'completed', due_at: null, completion: '1/2', evaluate_ratio: evaluateRatio, job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }])
    const wrapper = mount(ProjectMemberListPanel, { props: { projectId: 1, reviewContext: { nodeId: 'manager', state: 'all' } } })
    await flushPromises()
    expect(wrapper.getComponent({ name: 'PerformanceEvaluateRatioPopover' }).props('ratio')).toEqual(evaluateRatio)
    wrapper.unmount()
  })

  it('displays blue 0/0 instead of a dash in the communication table', async () => {
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ task_id: 1, employee_no: 'E1', display_name: '员工', status: 'pending', due_at: null, completion: null, job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }])
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' } })
    await flushPromises()
    expect(wrapper.get('.feedback-panel__completion').text()).toBe('0/0')
    wrapper.unmount()
  })

  it.each([
    ['pending', '2099-01-01T00:00:00Z', 'pending', '待完成'],
    ['completed', '2020-01-01T00:00:00Z', 'completed', '已完成'],
    ['overdue', null, 'overdue', '已逾期'],
    ['pending', '2020-01-01T00:00:00Z', 'overdue', '已逾期'],
    ['invited', null, 'pending', '待完成'],
    ['not_started', '2020-01-01T00:00:00Z', 'pending', '待完成'],
    ['pending', 'invalid', 'pending', '待完成'],
  ])('uses shared dot status for %s with deadline %s', (status, dueAt, normalized, label) => {
    expect(normalizePerformanceTaskStatus(status, dueAt)).toBe(normalized)
    const wrapper = mount(PerformanceTaskStatus, { props: { status, dueAt } })
    expect(wrapper.text()).toBe(label)
    expect(wrapper.classes()).toContain(`is-${normalized}`)
    expect(wrapper.get('.performance-task-status__dot').attributes('aria-hidden')).toBe('true')
    wrapper.unmount()
  })

  it.each(['review', 'communication'])('renders all three dot statuses in the %s table', async entry => {
    const rows = ['pending', 'completed', 'overdue'].map((status, index) => ({ task_id: index + 1, employee_no: `E${index}`, display_name: `员工${index}`, status, due_at: null, completion: '0/0', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }))
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue(rows)
    const wrapper = entry === 'review'
      ? mount(ProjectMemberListPanel, { props: { projectId: 1, reviewContext: { nodeId: 'manager', state: 'all' } } })
      : mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' } })
    await flushPromises()
    expect(wrapper.findAll('.performance-task-status').map(status => status.text())).toEqual(['待完成', '已完成', '已逾期'])
    expect(wrapper.findAll('.performance-task-status__dot')).toHaveLength(3)
    wrapper.unmount()
  })

  it('keeps shared status labels limited to the three table labels', () => {
    expect(['pending', 'completed', 'overdue'].map(status => performanceTaskStatusLabel(status as 'pending' | 'completed' | 'overdue'))).toEqual(['待完成', '已完成', '已逾期'])
  })

  it.each([
    { label: 'allowed', fields: ['employee_type'], value: '正式员工', visible: true },
    { label: 'denied', fields: [], value: null, visible: false },
    { label: 'allowed with missing snapshot data', fields: ['employee_type'], value: null, visible: true },
  ])('honors employee type field visibility when $label', async ({ fields, value, visible }) => {
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ task_id: 1, employee_no: 'E1', display_name: '员工', status: 'pending', due_at: null, job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: value, employment_status: null, visible_profile_fields: fields }])
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' } })
    await flushPromises()
    const table = wrapper.findComponent({ name: 'PerformanceManagementTable' })
    const drawer = wrapper.findComponent({ name: 'ProjectMemberColumnDrawer' })
    expect(table.props('columns').some((column: { key: string }) => column.key === 'employee_type')).toBe(visible)
    expect(drawer.props('columns').some((column: { key: string }) => column.key === 'employee_type')).toBe(visible)
    expect(wrapper.findComponent({ name: 'PerformanceTableSummary' }).props('hiddenColumnCount')).toBe(0)
    if (value && visible) expect(wrapper.text()).toContain(value)
    if (visible && !value) expect(wrapper.findAll('tbody td').some(cell => cell.text() === '--')).toBe(true)
    if (!visible) {
      drawer.vm.$emit('confirm', ['name', 'employee_type'])
      await flushPromises()
      expect(table.props('columns').some((column: { key: string }) => column.key === 'employee_type')).toBe(false)
    }
    wrapper.unmount()
  })

  it('refreshes permission-derived columns and does not expose denied values in mixed rows', async () => {
    const person = { task_id: 1, employee_no: 'E1', display_name: '员工', status: 'pending', due_at: null, job_family: null, job_category: null, job_sequence: null, position_level: 'P6', hire_date: null, department: null, employee_type: '正式员工', employment_status: null, visible_profile_fields: ['employee_type'] }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([person])
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'communication', mode: 'communication' } })
    await flushPromises()
    expect(wrapper.text()).toContain('正式员工')
    expect(wrapper.text()).not.toContain('职级')
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([{ ...person, employee_type: null, visible_profile_fields: [] }])
    await wrapper.setProps({ projectId: 2 })
    await flushPromises()
    expect(wrapper.text()).not.toContain('员工类型')
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([person, { ...person, task_id: 2, employee_no: 'E2', employee_type: '禁止暴露值', visible_profile_fields: [] }])
    await wrapper.setProps({ projectId: 3 })
    await flushPromises()
    expect(wrapper.text()).toContain('员工类型')
    expect(wrapper.text()).toContain('正式员工')
    expect(wrapper.text()).not.toContain('禁止暴露值')
    wrapper.unmount()
  })

  it('keeps rejected feedback terminal after the deadline and uses the shared red dot', async () => {
    expect(normalizePerformanceTaskStatus('rejected', '2020-01-01T00:00:00Z', true)).toBe('rejected')
    expect(performanceTaskStatusLabel('rejected')).toBe('已拒绝')
    const wrapper = mount(PerformanceTaskStatus, { props: { status: 'rejected', dueAt: '2020-01-01T00:00:00Z', allowRejected: true } })
    expect(wrapper.text()).toBe('已拒绝')
    expect(wrapper.classes()).toContain('is-rejected')
    expect(wrapper.findAll('.performance-task-status__dot')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows the four feedback states without changing their underlying row status', async () => {
    vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [
      { task_id: 1, employee_no: 'E1', display_name: '待完成员工', status: 'pending', due_at: '2099-01-01T00:00:00Z', source_label: '邀请评估', relationship: '同事', department: null, job_sequence: null, position_level: null },
      { task_id: 2, employee_no: 'E2', display_name: '已完成员工', status: 'completed', due_at: '2020-01-01T00:00:00Z', source_label: '邀请评估', relationship: '同事', department: null, job_sequence: null, position_level: null },
      { task_id: 3, employee_no: 'E3', display_name: '逾期员工', status: 'pending', due_at: '2020-01-01T00:00:00Z', source_label: '自愿评估', relationship: '同事', department: null, job_sequence: null, position_level: null },
      { task_id: 4, employee_no: 'E4', display_name: '拒绝员工', status: 'rejected', due_at: '2020-01-01T00:00:00Z', source_label: '邀请评估', relationship: '同事', department: null, job_sequence: null, position_level: null },
    ], total: 4, node_id: 'feedback', allow_voluntary_evaluation: false })
    const wrapper = mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: 'feedback' } })
    await flushPromises()
    expect(wrapper.findAll('.performance-task-status').map(status => status.text())).toEqual(['待完成', '已完成', '已逾期', '已拒绝'])
    expect(wrapper.findAll('.performance-task-status__dot')).toHaveLength(4)
    expect(wrapper.text()).not.toContain('待评估')
    expect(wrapper.text()).not.toContain('已提交')
    expect(wrapper.get('.is-rejected').get('.performance-task-status__dot').attributes('aria-hidden')).toBe('true')
    wrapper.findComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', { task_id: 4, employee_no: 'E4', display_name: '拒绝员工', status: 'rejected' })
    await flushPromises()
    expect(wrapper.emitted('open-task')?.at(-1)).toEqual([{ task_id: 4, employee_no: 'E4', display_name: '拒绝员工', status: 'rejected' }])
    wrapper.unmount()
  })

  it.each(['成员甲', 'gaby.liu刘琦', '很长的姓名'.repeat(12)])('uses the member list avatar rule without duplicating the accessible name for %s', name => {
    const wrapper = mount(PerformanceMemberIdentity, { props: { displayName: name } })
    expect(wrapper.get('.member-avatar').text()).toBe(name.slice(-1))
    expect(wrapper.get('.member-avatar').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.member-name').text()).toBe(name)
    expect(wrapper.find('img').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each(['review', 'feedback', 'communication', 'invite'])('reuses member identity in the %s table and preserves row actions', async entry => {
    const person = { task_id: 41, employee_no: 'E41', display_name: '测试员工甲', status: 'pending' as const, due_at: '2099-01-01T00:00:00Z', job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null }
    vi.mocked(performanceWorkbenchApi.taskPeople).mockResolvedValue([person])
    vi.spyOn(performanceReview360FeedbackApi, 'list').mockResolvedValue({ items: [{ ...person, source_label: '邀请评估', relationship: '同事' }], total: 1, node_id: 'feedback', allow_voluntary_evaluation: false })
    vi.spyOn(performanceReview360InviteApi, 'list').mockResolvedValue({ items: [{ ...person, source_label: '自己邀请', invited_at: null }], total: 1, minimum_invited_count: 0, maximum_invited_count: null, maximum_invite_mode: 'SUGGESTED', second_prompt_enabled: false, second_prompt_count: null, second_prompt_mode: 'SUGGESTED', exclude_default_invite_from_limit: false })
    const wrapper = entry === 'review'
      ? mount(ProjectMemberListPanel, { props: { projectId: 1, reviewContext: { nodeId: 'manager', state: 'all' } } })
      : entry === 'invite'
        ? mount(PerformanceReview360InvitePanel, { props: { projectId: 1, nodeId: 'invite' }, global: { components: { ElTableColumn } } })
        : mount(PerformanceReview360FeedbackPanel, { props: { projectId: 1, nodeId: entry, mode: entry === 'communication' ? 'communication' : 'feedback' } })
    await flushPromises()
    expect(wrapper.findAllComponents(PerformanceMemberIdentity)).toHaveLength(1)
    expect(wrapper.get('.member-avatar').text()).toBe('甲')
    expect(wrapper.get('.member-name').text()).toBe('测试员工甲')
    if (entry === 'invite') {
      expect(wrapper.find('button[aria-label="撤销邀请"]').exists()).toBe(true)
    } else {
      wrapper.findComponent({ name: 'PerformanceManagementTable' }).vm.$emit('row-click', person)
      await flushPromises()
      expect(wrapper.emitted(entry === 'review' ? 'select-member' : 'open-task')?.[0]?.[0]).toEqual(expect.objectContaining({ task_id: 41, employee_no: 'E41' }))
    }
    wrapper.unmount()
  })

  it('hides task status badges when a 360 node has no active tasks', async () => {
    const loaded = structuredClone(overview)
    Object.assign(loaded.categories[1].nodes[0], { show_status: false })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(loaded)
    const wrapper = mountView()
    await flushPromises()
    const sidebar = wrapper.get('.review-sidebar')
    expect(sidebar.findAll('.review-node')).toHaveLength(4)
    expect(sidebar.text()).not.toContain('已逾期')
    expect(sidebar.find('.status-overdue').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides completed badges in the sidebar without removing their navigation entries', async () => {
    const loaded = structuredClone(overview)
    Object.assign(loaded.categories[0].nodes[0], { status: 'completed' })
    vi.mocked(performanceReviewApi.overview).mockResolvedValue(loaded)
    const wrapper = mountView()
    await flushPromises()
    const sidebar = wrapper.get('.review-sidebar')
    expect(sidebar.findAll('.review-node')).toHaveLength(4)
    expect(sidebar.find('.status-completed').exists()).toBe(false)
    expect(sidebar.findAll('.review-node')[0].text()).toBe('工作总结环节')
    expect(sidebar.find('.status-overdue').text()).toBe('已逾期')
    expect(sidebar.find('.status-not_started').exists()).toBe(true)
    await sidebar.findAll('.review-node')[0].trigger('click')
    expect(replace).toHaveBeenLastCalledWith(expect.objectContaining({ query: expect.objectContaining({ node: 'summary' }) }))
    wrapper.unmount()
  })

})
