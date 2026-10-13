import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ProjectReportNavigation from './ProjectReportNavigation.vue'

describe('ProjectReportNavigation', () => {
  it('renders three groups, nine links and the observed active indicator', async () => {
    const wrapper = mount(ProjectReportNavigation, { props: { collapsed: false, activeKey: 'department', menuHeight: 160 } })
    expect(wrapper.findAll('.report-menu-group').map(item => item.text())).toEqual(['结果总览', '统计详情', '差异分析'])
    expect(wrapper.findAll('.report-menu-item')).toHaveLength(9)
    expect(wrapper.get('[aria-current="location"]').text()).toBe('部门统计')
    expect(wrapper.get('.report-menu-indicator').attributes('style')).toContain('translateY(109px)')
    expect(wrapper.get('.report-menu-rail').attributes('style')).toContain('408px')
    expect(wrapper.get('.report-menu').attributes('style')).toContain('160px')
    await wrapper.get('[data-key="history"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['history']])
    wrapper.unmount()
  })

  it('unmounts the full menu in the collapsed variant and keeps the captured expand icon', async () => {
    const wrapper = mount(ProjectReportNavigation, { props: { collapsed: false, activeKey: 'overview', menuHeight: 408 } })
    await wrapper.get('[aria-label="收起报表目录"]').trigger('click')
    expect(wrapper.emitted('update:collapsed')).toEqual([[true]])
    await wrapper.setProps({ collapsed: true })
    expect(wrapper.find('.report-menu').exists()).toBe(false)
    expect(wrapper.find('.report-collapse-button').exists()).toBe(false)
    const button = wrapper.get('[aria-label="展开报表目录"]')
    expect(button.attributes('aria-expanded')).toBe('false')
    expect(button.find('svg').attributes('data-icon')).toBe('UpLeftOutlined')
    expect(button.find('path').attributes('d')).toContain('M19.558 17.637l-5.636-5.636')
    await button.trigger('click')
    expect(wrapper.emitted('update:collapsed')).toEqual([[true], [false]])
    wrapper.unmount()
  })
})
