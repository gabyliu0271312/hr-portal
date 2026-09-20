import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { performanceReviewApi, type PerformanceReviewOverview } from '@/api/performance'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'

const push = vi.fn()
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push, replace }),
}))

import Review from './Review.vue'
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

let pinia: Pinia
function mountView() {
  return mount(Review, {
    global: {
      plugins: [pinia],
      stubs: {
        'el-icon': { template: '<span><slot /></span>' },
        'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<div><slot /></div>', props: ['command'] },
      },
    },
  })
}

describe('PerformanceReview', () => {
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
    expect(reviewContentSource).toContain(':tabs="evaluationTabs" sticky flush')
    expect(reviewContentSource).toMatch(/\.review-panel\.completed\s*\{[^}]*padding:\s*var\(--performance-review-surface-inset\)/s)
  })

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    push.mockReset()
    replace.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(performanceReviewApi, 'overview').mockResolvedValue(overview)
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
    expect(performanceReviewApi.overview).toHaveBeenCalledWith(1, undefined)
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
    expect(performanceTaskEntryRoute(registered, 1)).toBe('/performance/review/self-summary?task_id=11&project_id=1')
    expect(performanceTaskEntryRoute({ ...registered, task_id: 299, task_kind: 'evaluation' }, 3)).toBe('/performance/review/template-task?task_id=299&project_id=3')
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
    expect(push).toHaveBeenCalledWith('/performance/review/self-summary?task_id=11&project_id=1')
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

    expect(wrapper.text()).toContain('已完成')
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

    await wrapper.get('.performance-review-completion-notice__edit').trigger('click')
    expect(replace).toHaveBeenLastCalledWith({ query: { project_id: '1', node: 'summary', task_id: '11' } })
    expect(push).toHaveBeenCalledWith('/performance/review/self-summary?task_id=11&project_id=1')
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

  it('renders an empty state when the current user has no started project', async () => {
    vi.mocked(performanceReviewApi.overview).mockResolvedValueOnce({
      projects: [], active_project: null, template_name: '', categories: overview.categories.map(category => ({ ...category, nodes: [] })),
    })
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.text()).toContain('暂无已启动的绩效评估')
  })
})
