import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PageTitle from './PageTitle.vue'
import pageTitleSource from './PageTitle.vue?raw'

describe('PageTitle', () => {
  it('renders title with no description layer when description is empty', () => {
    const wrapper = mount(PageTitle, { props: { title: '组织架构' } })
    expect(wrapper.text()).toBe('组织架构')
    expect(wrapper.find('.page-title-desc').exists()).toBe(false)
  })

  it('renders description below the title when provided', () => {
    const wrapper = mount(PageTitle, {
      props: { title: '组织架构', description: '展示所有组织相关的信息' },
    })
    expect(wrapper.find('.page-title-desc').text()).toBe('展示所有组织相关的信息')
  })

  it('keeps the title gap bottom stable and lets description carry its own top margin (auto-up when absent)', () => {
    expect(pageTitleSource).toMatch(/var\(--page-title-size\)/)
    expect(pageTitleSource).toMatch(/var\(--page-title-line-height\)/)
    expect(pageTitleSource).toMatch(/\.page-title-desc\s*\{[^}]*margin:\s*var\(--page-title-gap-with-desc\) 0 var\(--page-title-gap-bottom\);/s)
    expect(pageTitleSource).toMatch(/v-if="description"/)
    expect(pageTitleSource).not.toMatch(/\.page-title\s*\{[^}]*flex:\s*1;/s)
    expect(pageTitleSource).toMatch(/\.page-title\s*\{[^}]*min-width:\s*0;/s)
  })
})
