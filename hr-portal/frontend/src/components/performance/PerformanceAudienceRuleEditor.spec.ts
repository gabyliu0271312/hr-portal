import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PerformanceAudienceRuleEditor, { type PerformanceAudienceGroup } from './PerformanceAudienceRuleEditor.vue'

const organizationTree = [{ value: '集团', label: '集团', level: 1, children: [{ value: '集团/研发', label: '研发', level: 2, children: [] }] }]
const emptyGroups = [{ conditions: [{ field: '' as const, operator: 'include' as const, values: [] }] }]

afterEach(() => { document.body.innerHTML = '' })

describe('PerformanceAudienceRuleEditor', () => {
  it('does not preselect a field or load options until a value selector opens', async () => {
    const wrapper = mount(PerformanceAudienceRuleEditor, {
      props: { modelValue: emptyGroups, allowedFields: ['department', 'employee'], organizationTree, personOptions: [{ value: 'E001', label: '员工（E001）' }] },
      attachTo: document.body,
    })
    expect((wrapper.get('select[aria-label="范围字段"]').element as HTMLSelectElement).value).toBe('')
    expect(wrapper.find('.performance-organization-tree-select__trigger').exists()).toBe(false)
    const valueSelector = wrapper.get('.performance-search-select__trigger')
    expect(valueSelector.text()).toContain('请选择')
    expect(valueSelector.find('input[role="combobox"]').attributes('disabled')).toBeDefined()
    await valueSelector.trigger('click')
    expect(wrapper.emitted('open-options')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.get('select[aria-label="范围字段"]').setValue('department')
    const groups = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[]
    expect(groups?.[0].conditions[0]).toEqual({ field: 'department', operator: 'include', values: [] })
    await wrapper.setProps({ modelValue: groups })
    expect(wrapper.emitted('open-options')).toBeUndefined()
    await wrapper.get('.performance-organization-tree-select__trigger').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('open-options')).toHaveLength(1)
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[])?.[0].conditions[0].values).toEqual([])
  })

  it('reuses the organization tree and only selects a department after clicking a node', async () => {
    const wrapper = mount(PerformanceAudienceRuleEditor, {
      props: { modelValue: [{ conditions: [{ field: 'department', operator: 'include', values: [] }] }], allowedFields: ['department', 'employee'], organizationTree },
      attachTo: document.body,
    })
    await wrapper.get('.performance-organization-tree-select__trigger').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    document.body.querySelectorAll<HTMLButtonElement>('.performance-organization-tree-node__label')[1].click()
    await flushPromises()
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[])?.[0].conditions[0].values).toEqual(['集团/研发'])
  })
})
