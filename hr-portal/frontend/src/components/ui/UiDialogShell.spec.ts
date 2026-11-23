import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiDialogShell from './UiDialogShell.vue'
describe('UiDialogShell nested keyboard isolation', () => {
  it('keeps acknowledgement dialogs open on Escape and backdrop interaction', async () => {
    const wrapper = mount(UiDialogShell, { props: { modelValue: true, title: '知悉公告', dismissible: false, showClose: false, teleport: false } })
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    await wrapper.get('.performance-dialog-overlay').trigger('mousedown')
    expect(wrapper.emitted('close')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
  it('keeps close visible by default and makes it optional without disabling Escape', async () => {
    const wrapper = mount(UiDialogShell, { props: { modelValue: true, title: '关闭行为', teleport: false } })
    expect(wrapper.find('button[aria-label="关闭"]').exists()).toBe(true)
    await wrapper.setProps({ showClose: false })
    expect(wrapper.find('button[aria-label="关闭"]').exists()).toBe(false)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
  it('renders header-start without replacing title, and only closes the nested dialog on Escape', async () => {
    const Nested = defineComponent({ components: { UiDialogShell }, template: `<UiDialogShell :model-value="true" title="全屏" fullscreen :teleport="false" @close="$emit('outer-close')"><template #header-start><button>返回</button></template><UiDialogShell :model-value="true" title="任务确认" :teleport="false" @close="$emit('inner-close')"><p>确认内容</p></UiDialogShell></UiDialogShell>` })
    const wrapper = mount(Nested)
    const dialogs = wrapper.findAll('[role="dialog"]')
    expect(wrapper.find('.performance-dialog__header').text()).toContain('返回全屏')
    await dialogs[1].trigger('keydown', { key: 'Escape' }); await flushPromises()
    expect(wrapper.emitted('inner-close')).toHaveLength(1)
    expect(wrapper.emitted('outer-close')).toBeUndefined()
    wrapper.unmount()
  })
})
