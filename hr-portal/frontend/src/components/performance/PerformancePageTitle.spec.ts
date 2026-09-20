import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformancePageTitle from './PerformancePageTitle.vue'
import pageTitleSource from './PerformancePageTitle.vue?raw'

describe('PerformancePageTitle', () => {
  it('renders the title text', () => {
    const wrapper = mount(PerformancePageTitle, { props: { title: '周期概览' } })
    expect(wrapper.text()).toBe('周期概览')
  })

  it('uses the captured typography tokens (18px/600/32px line-height, truncate)', () => {
    expect(pageTitleSource).toMatch(/var\(--performance-page-title-size\)/)
    expect(pageTitleSource).toMatch(/var\(--performance-page-title-line-height\)/)
    expect(pageTitleSource).toMatch(/white-space:\s*nowrap/)
    expect(pageTitleSource).toMatch(/text-overflow:\s*ellipsis/)
    expect(pageTitleSource).toMatch(/\.page-title-text\s*\{[^}]*flex:\s*1;/s)
  })

  it('does not stretch vertically inside a column parent (no flex grow on root)', () => {
    expect(pageTitleSource).not.toMatch(/\.page-title\s*\{[^}]*flex:\s*1;/s)
    expect(pageTitleSource).toMatch(/\.page-title\s*\{[^}]*min-width:\s*0;/s)
  })

  it('hides the actions row when no slot content is provided', () => {
    const plain = mount(PerformancePageTitle, { props: { title: '周期概览' } })
    expect(plain.find('.page-title-actions').exists()).toBe(false)

    const withActions = mount(PerformancePageTitle, {
      props: { title: '周期概览' },
      slots: { default: '<p class="meta">附属信息</p>' },
    })
    expect(withActions.find('.page-title-actions .meta').exists()).toBe(true)
  })
})
