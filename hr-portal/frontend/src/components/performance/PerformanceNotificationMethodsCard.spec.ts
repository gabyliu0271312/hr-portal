import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceNotificationMethodsCard from './PerformanceNotificationMethodsCard.vue'


describe('PerformanceNotificationMethodsCard', () => {
  it('matches the captured notification method structure', () => {
    const wrapper = mount(PerformanceNotificationMethodsCard, {
      props: { emailEnabled: false },
    })
    const inputs = wrapper.findAll('input[type="checkbox"]')

    expect(wrapper.text()).toContain('通知方式')
    expect(wrapper.text()).toContain('系统通知（待办提醒、催办等）的推送方式')
    expect(wrapper.text()).toContain('飞书推送')
    expect(wrapper.text()).toContain('邮件')
    expect(wrapper.text()).toContain('勾选后，邮件通知将会发送到参评人员在飞书中配置的邮箱。')
    expect(inputs).toHaveLength(2)
    expect((inputs[0].element as HTMLInputElement).checked).toBe(true)
    expect((inputs[0].element as HTMLInputElement).disabled).toBe(true)
    expect((inputs[1].element as HTMLInputElement).checked).toBe(false)
  })

  it('emits email changes without exposing a Feishu toggle', async () => {
    const wrapper = mount(PerformanceNotificationMethodsCard, {
      props: { emailEnabled: false },
    })
    await wrapper.findAll('input[type="checkbox"]')[1].setValue(true)

    expect(wrapper.emitted('update:emailEnabled')).toEqual([[true]])
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(2)
  })
})
