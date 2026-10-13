import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceNotificationDisableConfirm from './PerformanceNotificationDisableConfirm.vue'

function mountConfirm(saving = false) {
  return mount(PerformanceNotificationDisableConfirm, {
    props: { modelValue: true, saving },
    global: { stubs: { Teleport: true } },
  })
}

describe('PerformanceNotificationDisableConfirm', () => {
  it('shows the captured warning and keeps the setting on 保留', async () => {
    const wrapper = mountConfirm()
    expect(wrapper.get('[role="alertdialog"]').attributes('aria-modal')).toBe('true')
    expect(wrapper.text()).toContain('确定取消勾选吗')
    expect(wrapper.text()).toContain('取消后，所有人都将收不到该通知。')
    expect(wrapper.get('svg path').attributes('d')).toBe('M23 12c0 6.075-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1s11 4.925 11 11ZM12 7a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z')
    await wrapper.get('.notification-confirm__keep').trigger('click')
    expect(wrapper.emitted('keep')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('emits confirm only on 确定 and blocks both buttons while saving', async () => {
    const wrapper = mountConfirm()
    await wrapper.get('.notification-confirm__confirm').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    await wrapper.setProps({ saving: true })
    expect(wrapper.findAll('button:disabled')).toHaveLength(2)
    await wrapper.get('.notification-confirm__confirm').trigger('click')
    await wrapper.get('.notification-confirm__keep').trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('keep')).toBeUndefined()
  })
})
