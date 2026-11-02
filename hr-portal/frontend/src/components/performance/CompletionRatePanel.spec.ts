import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CompletionRatePanel from './CompletionRatePanel.vue'
import panelSource from './CompletionRatePanel.vue?raw'
import sectionCardHeaderSource from './PerformanceSectionCardHeader.vue?raw'
import filterButtonSource from './PerformanceFilterButton.vue?raw'
import completionCardSource from './CompletionNodeCard.vue?raw'
import gridCardSource from './PerformanceGridCard.vue?raw'

const nodes = [
  { key: 'work-summary', title: '填写工作总结', progress: '98.28%', canRemind: true, deadline: '2026-07-10 23:59（GMT+8）（已截止）' },
  { key: 'view-result', title: '查看绩效结果', progress: '96.55%', deadline: null },
  { key: 'result-reconsideration', title: '结果复议处理', progress: '0.00%', deadline: '2026-08-28 23:59（GMT+8）（已截止）' },
]

function mountPanel() {
  return mount(CompletionRatePanel, { props: { nodes } })
}

describe('CompletionRatePanel', () => {
  it('renders the captured header bar title, segmented tools and filter button', () => {
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('完成率')
    expect(wrapper.find('.header-bar').exists()).toBe(true)
    expect(wrapper.findAll('.segmented-control')).toHaveLength(2)
    const labels = wrapper.findAll('.segment').map(item => item.text())
    expect(labels).toEqual(['全部', '按部门', '已开通', '已复议'])
    expect(wrapper.find('.filter-button').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('.segment')[3].attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('.segment')[3].attributes('title')).toBe('该功能暂不可用')
  })

  it('renders node cards with progress and deadline, and -- for missing deadline', () => {
    const wrapper = mountPanel()
    const cards = wrapper.findAll('.completion-node-card')
    expect(cards).toHaveLength(3)
    expect(cards[0].find('.card-progress').text()).toBe('98.28%')
    expect(cards[0].text()).toContain('完成情况：--')
    expect(cards[0].text()).toContain('截止时间：2026-07-10 23:59（GMT+8）（已截止）')
    expect(cards[1].text()).toContain('截止时间：--')
  })

  it('shows 去催办 on the first six cards, 去开通 on view-result, and none on reconsideration', () => {
    const wrapper = mountPanel()
    const buttons = wrapper.findAll('.text-button')
    expect(buttons).toHaveLength(2)
    expect(buttons.map(item => item.text())).toEqual(['去催办', '去开通'])
    expect(buttons[0].attributes('aria-label')).toBe('去催办')
    expect(buttons[1].attributes('aria-label')).toBe('去开通')
    expect(wrapper.find('[data-icon="BellOutlined"]').exists()).toBe(false)
    expect(wrapper.find('[data-icon="PaReleaseResultOutlined"]').exists()).toBe(false)
  })

  it('emits a business action instead of handling reminder and enablement internally', async () => {
    const wrapper = mountPanel()
    const buttons = wrapper.findAll('.text-button')

    await buttons[0].trigger('click')
    await buttons[1].trigger('click')

    expect(wrapper.emitted('action')).toEqual([
      [expect.objectContaining({ action: 'remind', nodeKey: 'work-summary', title: '填写工作总结' })],
      [expect.objectContaining({ action: 'enable-result', nodeKey: 'view-result' })],
    ])
  })

  it('renders 未开始 with the captured muted typography and hides actions', () => {
    const wrapper = mount(CompletionRatePanel, {
      props: {
        nodes: [{ key: 'future', title: '未来环节', progress: '未开始', completionStatus: '0/406', deadline: '2099-01-01 23:59（GMT+8）', status: 'not_started' }],
      },
    })

    expect(wrapper.find('.card-progress').text()).toBe('未开始')
    expect(wrapper.find('.card-progress').classes()).toContain('no-start')
    expect(wrapper.findAll('.text-button')).toHaveLength(0)
    expect(completionCardSource).toMatch(/\.card-progress\.no-start\s*\{[^}]*font-size:\s*20px;[^}]*font-weight:\s*600;[^}]*color:\s*#8f959e/s)
  })

  it('uses the captured geometry and typography (bar 2x16, progress DIN 28px, grid 3 cols)', () => {
    expect(sectionCardHeaderSource).toMatch(/\.header-bar\s*\{[^}]*width:\s*2px;[^}]*height:\s*16px;[^}]*background:\s*#3370ff/s)
    expect(filterButtonSource).toMatch(/\.filter-button:hover\s*\{[^}]*background:\s*var\(--performance-button-secondary-hover-background\);/s)
    expect(filterButtonSource).toMatch(/\.filter-button:active\s*\{[^}]*background:\s*var\(--color-surface-disabled\);/s)
    expect(completionCardSource).toMatch(/font-family:\s*'DIN Alternate'/)
    expect(completionCardSource).toMatch(/font-size:\s*28px;[^}]*color:\s*#3370ff/s)
    expect(gridCardSource).toMatch(/border:\s*1px solid #dee0e3;[^}]*border-radius:\s*8px/s)
    expect(panelSource).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
    expect(panelSource).toMatch(/gap:\s*16px/)
  })
})


describe('department completion interactions', () => {
  it('loads scoped rows, expands children and sorts the departments', async () => {
    const provider = vi.fn().mockResolvedValue({ columns: [{ key: 'self-review', title: '自评' }], rows: [
      { id: '公司/部门A', department: '部门A', metrics: { 'self-review': { completion_rate: 50, completed_count: 1, total_count: 2 } }, children: [{ id: '公司/部门A/子部门C', department: '子部门C', metrics: { 'self-review': { completion_rate: 0, completed_count: 0, total_count: 1 } } }] },
      { id: '公司/部门B', department: '部门B', metrics: { 'self-review': { completion_rate: 100, completed_count: 1, total_count: 1 } } },
    ] })
    const wrapper = mount(CompletionRatePanel, { props: { nodes: [], cycleId: 3, departmentProvider: provider, viewMode: 'by-person' } })
    await wrapper.findAll('.segment')[1].trigger('click')
    expect(wrapper.emitted('update:viewMode')).toEqual([['by-org']])
    await wrapper.setProps({ viewMode: 'by-org' })
    await flushPromises()
    expect(provider).toHaveBeenCalledWith(3)
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
    await wrapper.get('[aria-label="展开部门A"]').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
    expect(wrapper.text()).toContain('子部门C')
    await wrapper.findAll('.performance-sort-header')[1].trigger('click')
    expect(wrapper.find('tbody tr').text()).toContain('部门B')
    wrapper.unmount()
  })

  it('emits the clicked department cell rate with its own metrics and path', async () => {
    const provider = vi.fn().mockResolvedValue({ columns: [{ key: 'self-review', title: '自评' }], rows: [
      { id: '公司/部门A', department: '部门A', metrics: { 'self-review': { completion_rate: 50, completed_count: 1, total_count: 2 } } },
    ] })
    const wrapper = mount(CompletionRatePanel, { props: { nodes: [], cycleId: 3, departmentProvider: provider, viewMode: 'by-org' } })
    await flushPromises()
    await wrapper.get('.rate-link').trigger('click')
    expect(wrapper.emitted('action')).toEqual([[expect.objectContaining({
      action: 'remind', nodeKey: 'self-review', title: '自评', departmentPath: '公司/部门A',
      description: '完成率：50.00%　|　完成情况：1/2',
    })]])
    wrapper.unmount()
  })

  it('does not show reminder actions when eligibility is false', () => {
    const wrapper = mount(CompletionRatePanel, { props: { nodes: [{ key: 'summary', title: '总结', progress: '100%', deadline: null, status: 'completed', canRemind: false }] } })
    expect(wrapper.findAll('.node-action')).toHaveLength(0)
    wrapper.unmount()
  })
})
