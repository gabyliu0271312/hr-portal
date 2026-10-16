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
    expect(wrapper.get('input[aria-label="范围字段"]').attributes('readonly')).toBeDefined()
    expect(wrapper.find('.performance-organization-tree-select__trigger').exists()).toBe(false)
    const valueSelector = wrapper.findAll('.performance-audience-rule-editor__condition .performance-search-select__trigger').at(-1)!
    expect(valueSelector.text()).toContain('请选择')
    expect(valueSelector.find('input[role="combobox"]').attributes('disabled')).toBeDefined()
    await valueSelector.trigger('click')
    expect(wrapper.emitted('open-options')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.get('.performance-audience-rule-editor__condition .performance-search-select__trigger').trigger('click')
    await flushPromises()
    const department = [...document.body.querySelectorAll<HTMLButtonElement>('.performance-flat-option-list__option')].find(option => option.textContent === '部门')
    expect(department).toBeDefined()
    department!.click()
    await flushPromises()
    const groups = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[]
    expect(groups?.[0].conditions[0]).toEqual({ field: 'department', operator: 'include', values: [] })
    await wrapper.setProps({ modelValue: groups })
    expect(wrapper.emitted('open-options')).toBeUndefined()
    await wrapper.get('.performance-organization-tree-select__trigger').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('open-options')).toHaveLength(1)
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[])?.[0].conditions[0].values).toEqual([])
  })

  it('uses the same selector shell for field, operator and value without loading options early', async () => {
    const wrapper = mount(PerformanceAudienceRuleEditor, {
      props: { modelValue: emptyGroups, allowedFields: ['department', 'employee'], organizationTree },
      attachTo: document.body,
    })
    const selectors = wrapper.findAll('.performance-audience-rule-editor__condition .performance-select-shell__selector')
    expect(selectors).toHaveLength(3)
    expect(selectors[0].classes()).toContain('is-plain')
    expect(selectors[1].classes()).toContain('is-plain')
    expect(selectors[2].classes()).toContain('disabled')
    expect(selectors[2].classes()).toContain('disabled-white')
    expect(selectors[0].text()).toBe('请选择范围')
    expect(selectors[1].text()).toBe('包含')
    await selectors[0].trigger('click')
    await flushPromises()
    expect(wrapper.emitted('open-options')).toBeUndefined()
    expect(document.body.querySelectorAll('.performance-flat-option-list__option')).toHaveLength(2)
    ;([...document.body.querySelectorAll<HTMLButtonElement>('.performance-flat-option-list__option')].find(option => option.textContent === '员工') as HTMLButtonElement).click()
    await flushPromises()
    const groups = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[]
    await wrapper.setProps({ modelValue: groups })
    expect(wrapper.findAll('.performance-audience-rule-editor__condition .performance-select-shell__selector')).toHaveLength(3)
    expect(wrapper.find('input[aria-label="员工范围"]').exists()).toBe(true)
    expect(wrapper.emitted('open-options')).toBeUndefined()
  })

  it('matches the captured scope card and adds removable OR conditions', async () => {
    const wrapper = mount(PerformanceAudienceRuleEditor, {
      props: { modelValue: [{ conditions: [{ field: 'department', operator: 'include', values: [] }] }], allowedFields: ['department', 'employee'], organizationTree, scopeMode: true },
      attachTo: document.body,
    })
    expect(wrapper.get('.performance-audience-rule-editor__scope-heading').text()).toBe('人员范围满足以下任一条件')
    expect(wrapper.find('.performance-audience-rule-editor__group-heading').exists()).toBe(false)
    expect(wrapper.find('.performance-audience-rule-editor__scope-or').exists()).toBe(false)
    expect(wrapper.get('.performance-audience-rule-editor__scope-add').attributes('aria-label')).toBe('添加条件')
    expect(wrapper.find('[aria-label="删除范围 1"]').exists()).toBe(false)

    await wrapper.get('.performance-audience-rule-editor__scope-add').trigger('click')
    const added = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[]
    expect(added).toHaveLength(2)
    await wrapper.setProps({ modelValue: added })
    expect(wrapper.findAll('.performance-audience-rule-editor__condition')).toHaveLength(2)
    expect(wrapper.get('.performance-audience-rule-editor__scope-or').text()).toBe('或')
    expect(wrapper.findAll('[aria-label^="删除范围"]')).toHaveLength(2)
    await wrapper.get('[aria-label="删除范围 2"]').trigger('click')
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[])).toHaveLength(1)
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
