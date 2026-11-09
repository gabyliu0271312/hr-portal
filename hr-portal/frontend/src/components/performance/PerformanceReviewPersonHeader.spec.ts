import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceReviewPersonHeader from './PerformanceReviewPersonHeader.vue'
import source from './PerformanceReviewPersonHeader.vue?raw'

describe('PerformanceReviewPersonHeader visibility data', () => {
  it('uses server-provided profile fields without changing the existing line format', () => {
    const wrapper = mount(PerformanceReviewPersonHeader, {
      props: {
        person: {
          employee_no: 'E001',
          display_name: '员工一',
          department: '不应回退展示',
          profile_fields: [
            { key: 'department', label: '部门', value: '研发中心' },
            { key: 'position_level', label: '职级', value: 'P6' },
          ],
        },
      },
    })

    expect(wrapper.get('.performance-review-person-header__profile-line').text()).toBe('研发中心P6')
    expect(wrapper.findAll('.performance-review-person-header__profile-separator')).toHaveLength(1)
    wrapper.unmount()
  })
  it('labels only allowed supervisor and hire-date values without changing other profile fields', () => {
    const wrapper = mount(PerformanceReviewPersonHeader, { props: { person: {
      employee_no: 'E1', display_name: '员工', department: '不应回退', direct_supervisor_name: '不应回退',
      profile_fields: [
        { key: 'department', label: '部门', value: '研发中心' },
        { key: 'direct_supervisor', label: '直属上级', value: '经理一' },
        { key: 'hire_date', label: '入职日期', value: '2017-11-01' },
        { key: 'position_level', label: '职级', value: 'P6' },
        { key: 'direct_supervisor', label: '直属上级', value: '' },
        { key: 'hire_date', label: '入职日期', value: '' },
      ],
    } } })
    expect(wrapper.findAll('.performance-review-person-header__profile-value').map(part => part.text())).toEqual(['研发中心', '直属上级：经理一', '2017-11-01 入职', 'P6'])
    expect(wrapper.text()).not.toContain('不应回退')
    wrapper.unmount()
  })

  it('does not add labels or fallback data for empty server profile fields', () => {
    const wrapper = mount(PerformanceReviewPersonHeader, { props: { person: { employee_no: 'E1', display_name: '员工', department: '不可见部门', direct_supervisor_name: '不可见上级', profile_fields: [] } } })
    expect(wrapper.findAll('.performance-review-person-header__profile-value')).toHaveLength(0)
    expect(wrapper.text()).not.toContain('直属上级：')
    expect(wrapper.text()).not.toContain('入职')
    expect(wrapper.text()).not.toContain('不可见')
    wrapper.unmount()
  })

  it('places actions only in the name row and keeps the profile line as its full-width sibling', () => {
    const wrapper = mount(PerformanceReviewPersonHeader, { props: { person: { employee_no: 'E1', display_name: '长姓名'.repeat(20), profile_fields: [{ key: 'department', label: '部门', value: '长部门'.repeat(20) }, { key: 'position_level', label: '职级', value: 'J3' }] } } })
    const row = wrapper.get('.performance-review-person-header__primary-row')
    const info = wrapper.get('.performance-review-person-header__info')
    expect(row.get('strong').text()).toBe('长姓名'.repeat(20))
    expect(row.find('.performance-review-person-header__actions').exists()).toBe(true)
    expect(info.get('.performance-review-person-header__profile-line').element.parentElement).toBe(info.element)
    expect(row.find('.performance-review-person-header__profile-line').exists()).toBe(false)
    expect(source).toMatch(/__profile-line\{[^}]*text-overflow:ellipsis;white-space:nowrap/)
    expect(source).toMatch(/__profile-value\{display:inline;white-space:nowrap\}/)
    expect(source).not.toContain('__actions::before')
    expect(source).toContain('--performance-review-person-action-gap')
    expect(source).toContain('actions-end')
    wrapper.unmount()
  })

  it('renders slotted actions in the shared toolbar after copy link', () => {
    const wrapper = mount(PerformanceReviewPersonHeader, {
      props: { person: { employee_no: 'E1', display_name: '员工' } },
      slots: { 'actions-end': '<button aria-label="更多成员操作">更多</button>' },
    })
    const actions = wrapper.get('.performance-review-person-header__actions')
    expect(actions.get('[aria-label="复制链接"]').element.nextElementSibling).toBe(actions.get('.performance-review-person-header__actions-end').element)
    expect(actions.get('[aria-label="更多成员操作"]').element.tagName).toBe('BUTTON')
    wrapper.unmount()
  })

  it('preserves translation, language selection and copy actions after moving the toolbar', async () => {
    const wrapper = mount(PerformanceReviewPersonHeader, { props: { person: { employee_no: 'E1', display_name: '员工' } } })
    await wrapper.get('[aria-label="翻译成简体中文"]').trigger('click')
    await wrapper.get('[aria-label="选择翻译语言"]').trigger('click')
    await wrapper.get('[aria-label="复制链接"]').trigger('click')
    expect(wrapper.emitted('translate')).toHaveLength(1)
    expect(wrapper.emitted('translate-menu')).toHaveLength(1)
    expect(wrapper.emitted('copy-link')).toHaveLength(1)
    wrapper.unmount()
  })

})
