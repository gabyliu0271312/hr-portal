import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceManagementMemberScope from './PerformanceManagementMemberScope.vue'

async function openScope(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('button').trigger('click')
  await flushPromises()
}
function checkbox(label: string) {
  return document.body.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
}
function change(label: string, checked: boolean) {
  const input = checkbox(label)
  input.checked = checked
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('PerformanceManagementMemberScope', () => {
  it('defaults to period, supports dual selection and keeps at least one checked', async () => {
    const wrapper = mount(PerformanceManagementMemberScope, { attachTo: document.body })
    try {
      expect(wrapper.text()).toContain('本周期我负责的人员')
      await openScope(wrapper)
      expect(checkbox('本周期我负责的人员').checked).toBe(true)
      expect(checkbox('本周期我负责的人员').disabled).toBe(false)
      change('本周期我负责的人员', false)
      await flushPromises()
      expect(checkbox('本周期我负责的人员').checked).toBe(true)
      expect(checkbox('全选').indeterminate).toBe(true)
      change('当前我负责的人员', true)
      await flushPromises()
      expect(wrapper.text()).toContain('成员范围：全部')
      expect(checkbox('全选').checked).toBe(true)
      change('本周期我负责的人员', false)
      await flushPromises()
      expect(wrapper.text()).toContain('当前我负责的人员')
      expect(checkbox('当前我负责的人员').disabled).toBe(false)
      change('全选', true)
      await flushPromises()
      expect(checkbox('本周期我负责的人员').checked).toBe(true)
      expect(checkbox('当前我负责的人员').checked).toBe(true)
      change('全选', false)
      await flushPromises()
      expect(checkbox('本周期我负责的人员').checked).toBe(true)
      expect(checkbox('当前我负责的人员').checked).toBe(false)
      expect(wrapper.emitted()).not.toHaveProperty('change')
    } finally { wrapper.unmount() }
  })

  it('uses the captured dropdown placement and lets labels toggle their entire rows', async () => {
    const wrapper = mount(PerformanceManagementMemberScope, { attachTo: document.body })
    try {
      await openScope(wrapper)
      const popover = wrapper.getComponent({ name: 'PerformancePopover' })
      expect(popover.props()).toMatchObject({ align: 'end', side: 'bottom', gap: 4, showArrow: false })
      expect(document.body.querySelector('.performance-popover__arrow')).toBeNull()
      const rows = document.body.querySelectorAll<HTMLElement>('.management-member-scope-row')
      ;(rows[1].lastElementChild as HTMLElement).click()
      await flushPromises()
      expect(checkbox('当前我负责的人员').checked).toBe(true)
      expect(wrapper.text()).toContain('成员范围：全部')
      expect(document.body.querySelector('[data-icon="CheckboxIndeterminate"]')).toBeNull()
      rows[0].click()
      await flushPromises()
      expect(wrapper.text()).toContain('成员范围：当前我负责的人员')
      expect(checkbox('全选').indeterminate).toBe(true)
      expect(document.body.querySelector('[data-icon="CheckboxIndeterminate"]')).not.toBeNull()
    } finally { wrapper.unmount() }
  })

  it('closes on outside click and Escape, restores focus and retains local selection', async () => {
    const wrapper = mount(PerformanceManagementMemberScope, { attachTo: document.body })
    try {
      await wrapper.get('button').trigger('keydown', { key: 'ArrowDown' })
      await flushPromises()
      expect(document.activeElement).toBe(checkbox('本周期我负责的人员'))
      change('当前我负责的人员', true)
      await flushPromises()
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      await flushPromises()
      expect(document.body.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement).toBe(wrapper.get('button').element)
      await openScope(wrapper)
      expect(checkbox('全选').checked).toBe(true)
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
      await flushPromises()
      expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')
    } finally { wrapper.unmount() }
  })
})
