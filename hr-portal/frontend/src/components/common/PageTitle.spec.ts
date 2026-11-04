import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PageTitle from './PageTitle.vue'
import pageTitleSource from './PageTitle.vue?raw'

describe('PageTitle', () => {
  it('renders title with no description layer when description is empty', () => {
    const wrapper = mount(PageTitle, { props: { title: '组织架构' } })
    expect(wrapper.text()).toBe('组织架构')
    expect(wrapper.find('.page-title-desc').exists()).toBe(false)
    expect(wrapper.findAll('.page-title-row')).toHaveLength(1)
  })

  it('renders description below the title when provided', () => {
    const wrapper = mount(PageTitle, {
      props: { title: '组织架构', description: '展示所有组织相关的信息' },
    })
    expect(wrapper.find('.page-title-desc').text()).toBe('展示所有组织相关的信息')
  })

  it('mirrors the REA header block structure (title row h3 + description row span)', () => {
    const wrapper = mount(PageTitle, {
      props: { title: '组织架构', description: '展示所有组织相关的信息' },
    })
    const rows = wrapper.findAll('.page-title-row')
    expect(rows).toHaveLength(2)
    expect(rows[0].find('h3.page-title-text').text()).toBe('组织架构')
    expect(rows[1].find('span.page-title-desc').exists()).toBe(true)
  })

  it('keeps the title gap bottom stable and lets description carry its own top margin (auto-up when absent)', () => {
    expect(pageTitleSource).toMatch(/var\(--page-title-size\)/)
    expect(pageTitleSource).toMatch(/var\(--page-title-line-height\)/)
    expect(pageTitleSource).toMatch(/\.page-title-desc\s*\{[^}]*margin:\s*var\(--page-title-gap-with-desc\) 0 var\(--page-title-gap-bottom\);/s)
    expect(pageTitleSource).toMatch(/v-if="description"/)
    expect(pageTitleSource).not.toMatch(/\.page-title\s*\{[^}]*flex:\s*1;/s)
    expect(pageTitleSource).toMatch(/\.page-title\s*\{[^}]*min-width:\s*0;/s)
    expect(pageTitleSource).toMatch(/<h3 class="page-title-text"/)
  })
})
