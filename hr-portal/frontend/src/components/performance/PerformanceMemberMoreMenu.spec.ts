import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceMemberMoreMenu from './PerformanceMemberMoreMenu.vue'

const member = {
  project_id: 1,
  employee_no: 'E001',
  root_review_id: 5,
  display_name: 'alice.xiao肖惠方',
  task_id: 10,
  task_map: [{ task_id: 10, stage_id: 'stage-1', stage_key: 'manager', stage_label: '评估', role_key: 'DIRECT_SUPERVISOR', role_label: '直属上级', handler_ref: 'M1', can_authorize: true }],
}

describe('PerformanceMemberMoreMenu', () => {
  it('keeps unauthorized actions visible but disabled and emits no delegation', async () => {
    const wrapper = mount(PerformanceMemberMoreMenu, { props: { member: { ...member, task_map: member.task_map.map(option => ({ ...option, can_authorize: false })) } } })
    await wrapper.get('[aria-label="更多成员操作"]').trigger('click')
    const items = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    expect(items[0].textContent).toBe('授权他人处理')
    expect(items[1].textContent).toBe('转交他人处理')
    expect(items[0].disabled).toBe(true)
    expect(items[1].disabled).toBe(true)
    items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    items[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(wrapper.emitted('authorize')).toBeUndefined()
    expect(wrapper.emitted('transfer')).toBeUndefined()
    expect(items[3].disabled).toBe(false)
    wrapper.unmount()
  })

  it('renders no trigger without member context', () => {
    const wrapper = mount(PerformanceMemberMoreMenu, { props: { member: null } })
    expect(wrapper.find('[aria-label="更多成员操作"]').exists()).toBe(false)
  })

  it('opens a 4-item menu and emits on select', async () => {
    const wrapper = mount(PerformanceMemberMoreMenu, { props: { member } })
    await wrapper.find('[aria-label="更多成员操作"]').trigger('click')
    const items = [...document.body.querySelectorAll('[role="menuitem"]')]
    expect(items).toHaveLength(4)
    expect(items.map(item => item.textContent)).toEqual(['授权他人处理', '转交他人处理', '转移', '删除'])
    expect(items[2].hasAttribute('disabled')).toBe(true)
    expect(items[2].querySelector('[data-icon="MoveOutlined"]')).not.toBeNull()
    expect(items[2].querySelectorAll('path')).toHaveLength(3)

    items[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('authorize')).toHaveLength(1)
    expect(wrapper.emitted('authorize')![0][0]).toMatchObject({ project_id: 1, employee_no: 'E001', root_review_id: 5, task_id: 10 })

    await wrapper.find('[aria-label="更多成员操作"]').trigger('click')
    const items2 = [...document.body.querySelectorAll('[role="menuitem"]')]
    items2[1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('transfer')).toHaveLength(1)

    await wrapper.find('[aria-label="更多成员操作"]').trigger('click')
    const items3 = [...document.body.querySelectorAll('[role="menuitem"]')]
    items3[3].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('delete')).toHaveLength(1)
    wrapper.unmount()
  })

  it('shows hover hint popovers for authorize and transfer items', async () => {
    const wrapper = mount(PerformanceMemberMoreMenu, { props: { member } })
    await wrapper.find('[aria-label="更多成员操作"]').trigger('click')
    const items = [...document.body.querySelectorAll('[role="menuitem"]')]

    items[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.performance-member-more-menu-popover')?.textContent).toContain('授权后，原评估人仍有任务权限')

    items[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.performance-member-more-menu-popover')?.textContent).toContain('转交后，原评估人将失去任务权限')

    wrapper.unmount()
  })
})
