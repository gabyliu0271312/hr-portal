import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import Dialog from './PerformanceManagerStandardDialog.vue'

function open() {
  return mount(Dialog, {
    props: { modelValue: true, value: { manager_standard: 'inservice_direct_underling', specific_employee_types: [] }, options: [{ value: '正式', label: '正式' }], saving: false, error: '' },
    global: { stubs: { teleport: true } },
  })
}

describe('管理者判定标准弹窗', () => {
  it('shows two captured choices and validates an empty specific selection', async () => {
    const wrapper = open()
    expect(wrapper.get('h2').text()).toBe('设置管理者的判定标准')
    expect(wrapper.find('.manager-standard-dialog__types').exists()).toBe(false)
    await wrapper.findAll('input[type="radio"]')[1].setValue()
    expect(wrapper.find('.manager-standard-dialog__types').exists()).toBe(true)
    await wrapper.findAll('button').find(button => button.text() === '确定')!.trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toBe('请选择指定人员类型')
    expect(wrapper.emitted('save')).toBeUndefined()
    wrapper.unmount()
  })

  it('isolates draft values, clears types for the first standard and never writes on cancel', async () => {
    const wrapper = open()
    await wrapper.setProps({ modelValue: false, value: { manager_standard: 'specific_employee_type_underling', specific_employee_types: ['正式'] } })
    await wrapper.setProps({ modelValue: true })
    expect(wrapper.findComponent({ name: 'PerformanceSearchSelect' }).props('modelValue')).toEqual(['正式'])
    await wrapper.findAll('input[type="radio"]')[0].setValue()
    await wrapper.findAll('button').find(button => button.text() === '确定')!.trigger('click')
    expect(wrapper.emitted('save')).toEqual([[{ manager_standard: 'inservice_direct_underling', specific_employee_types: [] }]])
    expect(wrapper.props('value').specific_employee_types).toEqual(['正式'])
    await wrapper.findAll('button').find(button => button.text() === '取消')!.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(wrapper.emitted('save')).toHaveLength(1)
    wrapper.unmount()
  })

  it('disables dismissal and repeat submission during saving', async () => {
    const wrapper = open()
    await wrapper.setProps({ saving: true })
    const buttons = wrapper.findAll('button')
    expect(buttons.every(button => button.attributes('disabled') !== undefined)).toBe(true)
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
