import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PerformanceLineTabs from './PerformanceLineTabs.vue'
import performanceLineTabsSource from './PerformanceLineTabs.vue?raw'

const tabs = [
  { key: 'overview', label: '总览' },
  { key: 'members', label: '成员列表' },
  { key: 'matrix', label: '矩阵分析' },
  { key: 'reports', label: '统计报表', disabled: true },
]

function mountTabs(modelValue = 'overview', props: Record<string, unknown> = {}) {
  return mount(PerformanceLineTabs, {
    props: { tabs, modelValue, ...props },
    slots: { default: '<p class="pane-body">pane</p>' },
  })
}

describe('PerformanceLineTabs', () => {
  it('renders the captured tab labels in order with active state on the first tab', () => {
    const wrapper = mountTabs()
    const labels = wrapper.findAll('.line-tab').map(item => item.text())
    expect(labels).toEqual(['总览', '成员列表', '矩阵分析', '统计报表'])
    const classes = wrapper.findAll('.line-tab').map(item => item.classes())
    expect(classes[0]).toContain('active')
    expect(classes[1]).not.toContain('active')
  })

  it('uses the captured ink geometry tokens (3px height, top 33px, divider top 35px)', () => {
    const wrapper = mountTabs()
    expect(performanceLineTabsSource).toMatch(/\.line-tabs-ink\s*\{[^}]*top:\s*33px;[^}]*height:\s*3px/s)
    expect(performanceLineTabsSource).toMatch(/\.line-tabs-divider\s*\{[^}]*top:\s*35px;[^}]*height:\s*1px/s)
    expect(performanceLineTabsSource).toMatch(/cubic-bezier\(0\.34, 0\.69, 0\.1, 1\)/)
    expect(performanceLineTabsSource).toMatch(/var\(--performance-line-tabs-ink\)/)
    // 容器节奏：负 margin 对齐内容区 token，保证 tabs 条撑满全宽
    expect(performanceLineTabsSource).toMatch(/margin:\s*0 calc\(-1 \* var\(--performance-review-surface-inset\)\)/)
    // ink 与 divider 共享内层 holder 的坐标起点，内层 holder 撑满白色内容容器跨度
    expect(wrapper.find('.line-tabs-overflow > .line-tabs-ink').exists()).toBe(true)
    expect(wrapper.find('.line-tabs-wrap > .line-tabs-divider').exists()).toBe(true)
    expect(wrapper.find('.line-tabs-holder > .line-tabs-divider').exists()).toBe(false)
    expect(performanceLineTabsSource).toMatch(/\.line-tabs-wrap\s*\{[^}]*flex:\s*1;[^}]*min-width:\s*0/s)
    expect(performanceLineTabsSource).toMatch(/\.line-tabs-divider\s*\{[^}]*right:\s*0;[^}]*height:\s*1px/s)
    // 采集：divider 底部到白卡顶部保留 holder 的 12px margin，不额外增加 content padding
    expect(performanceLineTabsSource).toMatch(/\.line-tabs-content\s*\{[^}]*padding-top:\s*0;[^}]*background:\s*var\(--performance-line-tabs-surface\)/s)
    expect(wrapper.find('.line-tabs-content .line-tabs-pane .pane-body').exists()).toBe(true)
  })

  it('keeps flush tabs inside their container without changing the default inset mode', () => {
    const normal = mountTabs()
    const flush = mountTabs('members', { flush: true })
    expect(normal.get('.line-tabs').classes()).not.toContain('flush')
    expect(flush.get('.line-tabs').classes()).toContain('flush')
    expect(performanceLineTabsSource).toMatch(/\.line-tabs\.flush \.line-tabs-holder\s*\{[^}]*margin-right:\s*0;[^}]*margin-left:\s*0;[^}]*padding-right:\s*0;[^}]*padding-left:\s*0/s)
    expect(flush.get('.pane-body').text()).toBe('pane')
  })

  it('applies sticky positioning only with the sticky prop', () => {
    const normal = mountTabs()
    expect(normal.find('.line-tabs-holder').classes()).not.toContain('sticky')
    expect(performanceLineTabsSource).toMatch(/\.line-tabs\.sticky \.line-tabs-holder\s*\{[^}]*position:\s*sticky;[^}]*top:\s*calc\(-1 \* var\(--performance-review-surface-inset\)\);[^}]*z-index:\s*30/s)
    const sticky = mountTabs('overview', { sticky: true })
    expect(sticky.find('.line-tabs').classes()).toContain('sticky')
  })

  it('emits update:modelValue on tab click and ignores disabled or active tab', async () => {
    const wrapper = mountTabs()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['members']])

    const again = mountTabs('members')
    await again.findAll('.line-tab')[1].trigger('click')
    expect(again.emitted('update:modelValue')).toBeUndefined()

    const disabled = mountTabs()
    await disabled.findAll('.line-tab')[3].trigger('click')
    expect(disabled.emitted('update:modelValue')).toBeUndefined()
    expect(disabled.findAll('.line-tab')[3].attributes('disabled')).toBeDefined()
  })

  it('marks aria-selected on the active tab only', () => {
    const wrapper = mountTabs('matrix')
    const states = wrapper.findAll('.line-tab').map(item => item.attributes('aria-selected'))
    expect(states).toEqual(['false', 'false', 'true', 'false'])
  })

  it('moves ink measurement when modelValue changes', async () => {
    const wrapper = mountTabs()
    await wrapper.findAll('.line-tab')[2].trigger('click')
    await new Promise(resolve => setTimeout(resolve, 0))
    const ink = wrapper.find('.line-tabs-ink')
    expect(ink.exists()).toBe(true)
  })

  it('observes resize to remeasure ink without errors', async () => {
    const disconnect = vi.fn()
    const observe = vi.fn()
    vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect = disconnect })
    const wrapper = mountTabs()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(observe).toHaveBeenCalled()
    wrapper.unmount()
    expect(disconnect).toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
