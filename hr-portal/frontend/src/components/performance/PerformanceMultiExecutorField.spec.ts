import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceMultiExecutorField from './PerformanceMultiExecutorField.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'

describe('PerformanceMultiExecutorField', () => {
  it('selects multiple specified people, retains saved names and allows clearing', async () => {
    const wrapper = mount(PerformanceMultiExecutorField, { props: {
      modelValue: { mode: 'MULTI_ROLE', roles: [{ type: 'SPECIFIED_PERSON', people: [{ employee_no: 'old', display_name: '历史人员' }] }] },
      peopleOptions: [{ employee_no: 'new', display_name: '新人员' }],
    } })
    const picker = wrapper.getComponent(PerformancePersonSelect)
    expect(picker.props('multiple')).toBe(true)
    expect(picker.props('options')).toContainEqual({ value: 'old', label: '历史人员' })
    picker.vm.$emit('update:modelValue', ['old', 'new'])
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ mode: 'MULTI_ROLE', roles: [{ type: 'SPECIFIED_PERSON', people: [{ employee_no: 'old', display_name: '历史人员' }, { employee_no: 'new', display_name: '新人员' }] }] })
    picker.vm.$emit('update:modelValue', [])
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ mode: 'MULTI_ROLE', roles: [{ type: 'SPECIFIED_PERSON', people: [] }] })
    await wrapper.setProps({ disabled: true })
    expect(picker.props('disabled')).toBe(true)
    wrapper.unmount()
  })

  it('defaults to HRBP and requires an explicit role toggle', () => {
    const wrapper = mount(PerformanceMultiExecutorField, {
      props: { modelValue: { mode: 'MULTI_ROLE', roles: [{ type: 'HRBP' }] } },
    })
    expect(wrapper.text()).toContain('HRBP')
    expect((wrapper.findAll('input[type="checkbox"]')[1].element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.find('.multi-executor-help').text()).toContain('共同填写一份复议结果')
  })

  it('emits shared role config with manager levels', async () => {
    const wrapper = mount(PerformanceMultiExecutorField, {
      props: { modelValue: { mode: 'MULTI_ROLE', roles: [{ type: 'HRBP' }] } },
    })
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)
    const emitted = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { roles: Array<{ type: string; levels?: string[] }> }
    expect(emitted.roles).toContainEqual({ type: 'REAL_LINE_MANAGER', levels: ['DIRECT_MANAGER'] })
  })
})
