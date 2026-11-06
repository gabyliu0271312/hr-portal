import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceHrbpScopeDialog from './PerformanceHrbpScopeDialog.vue'
import PerformanceAudienceRuleEditor from './PerformanceAudienceRuleEditor.vue'

const global = { stubs: { PerformanceDialogShell: { template: '<div><slot /><slot name="footer" /></div>' } } }

async function dialog(initialValue?: any[]) {
  const wrapper = mount(PerformanceHrbpScopeDialog, { props: { modelValue: false, initialValue }, global })
  await wrapper.setProps({ modelValue: true })
  return wrapper
}

describe('HRBP scope persistence', () => {
  it('submits complete include/exclude AND/OR rules without flattening people', async () => {
    const groups = [
      { conditions: [{ field: 'department', operator: 'include', values: ['集团/研发'] }, { field: 'employee', operator: 'exclude', values: ['E1'] }] },
      { conditions: [{ field: 'directLeader', operator: 'include', values: ['M1'] }] },
    ]
    const wrapper = await dialog(groups)
    expect(wrapper.getComponent(PerformanceAudienceRuleEditor).props('minGroups')).toBe(0)
    await wrapper.get('.performance-button--primary').trigger('click')
    expect(wrapper.emitted('submit')).toEqual([[{ groups }]])
    expect(groups[0].conditions).toHaveLength(2)
    wrapper.unmount()
  })

  it('allows clearing every group and rejects incomplete conditions', async () => {
    const wrapper = await dialog()
    const editor = wrapper.getComponent(PerformanceAudienceRuleEditor)
    expect(editor.props('modelValue')).toEqual([{ conditions: [{ field: 'directLeader', operator: 'include', values: [] }] }])
    expect(wrapper.get('.performance-button--primary').attributes('disabled')).toBeDefined()
    editor.vm.$emit('update:modelValue', [])
    await wrapper.vm.$nextTick()
    await wrapper.get('.performance-button--primary').trigger('click')
    expect(wrapper.emitted('submit')).toEqual([[{ groups: [] }]])
    wrapper.unmount()
  })

  it('clones the saved rules and resets cancelled edits on reopen', async () => {
    const initialValue = [{ conditions: [{ field: 'employee', operator: 'exclude', values: ['E1'] }] }]
    const wrapper = await dialog(initialValue)
    const editor = wrapper.getComponent(PerformanceAudienceRuleEditor)
    editor.vm.$emit('update:modelValue', [])
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    expect(editor.props('modelValue')).toEqual(initialValue)
    expect(initialValue[0].conditions[0].values).toEqual(['E1'])
    wrapper.unmount()
  })
})
