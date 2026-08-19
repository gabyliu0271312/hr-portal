import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceMultiExecutorField from './PerformanceMultiExecutorField.vue'

describe('PerformanceMultiExecutorField', () => {
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
