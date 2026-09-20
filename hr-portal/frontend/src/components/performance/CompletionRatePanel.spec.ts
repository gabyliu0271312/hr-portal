import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CompletionRatePanel from './CompletionRatePanel.vue'
import panelSource from './CompletionRatePanel.vue?raw'
import sectionCardHeaderSource from './PerformanceSectionCardHeader.vue?raw'
import filterButtonSource from './PerformanceFilterButton.vue?raw'
import completionCardSource from './CompletionNodeCard.vue?raw'
import gridCardSource from './PerformanceGridCard.vue?raw'

const nodes = [
  { key: 'work-summary', title: '填写工作总结', progress: '98.28%', deadline: '2026-07-10 23:59（GMT+8）（已截止）' },
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
    expect(labels).toEqual(['按人查看', '按组织查看', '已开通', '已复议'])
    expect(wrapper.find('.filter-button').text()).toContain('筛选')
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
      [{ action: 'remind', nodeKey: 'work-summary' }],
      [{ action: 'enable-result', nodeKey: 'view-result' }],
    ])
  })

  it('uses the captured geometry and typography (bar 2x16, progress DIN 28px, grid 3 cols)', () => {
    expect(sectionCardHeaderSource).toMatch(/\.header-bar\s*\{[^}]*width:\s*2px;[^}]*height:\s*16px;[^}]*background:\s*#3370ff/s)
    expect(filterButtonSource).toMatch(/\.filter-button:hover\s*\{[^}]*background:\s*#f2f3f5;/s)
    expect(filterButtonSource).toMatch(/\.filter-button:active\s*\{[^}]*background:\s*#eff0f1;/s)
    expect(completionCardSource).toMatch(/font-family:\s*'DIN Alternate'/)
    expect(completionCardSource).toMatch(/font-size:\s*28px;[^}]*color:\s*#3370ff/s)
    expect(gridCardSource).toMatch(/border:\s*1px solid #dee0e3;[^}]*border-radius:\s*8px/s)
    expect(panelSource).toMatch(/grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
    expect(panelSource).toMatch(/gap:\s*16px/)
  })
})
