import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PerformanceAudienceRuleEditor, { type PerformanceAudienceGroup } from './PerformanceAudienceRuleEditor.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'

const organizationTree = [{ value: '集团', label: '集团', level: 1, children: [{ value: '集团/研发', label: '研发', level: 2, children: [] }] }]
const emptyGroups = [{ conditions: [{ field: '' as const, operator: 'include' as const, values: [] }] }]

afterEach(() => { document.body.innerHTML = '' })

describe('PerformanceAudienceRuleEditor', () => {
  it.each([
    ['employment_status', '在职状态', 'employment_statuses'],
    ['job_family', '职位族', 'job_families'],
    ['job_category', '职位类', 'job_categories'],
    ['position_level', '职级', 'position_levels'],
    ['standard_position', '标准职位', 'standard_positions'],
  ] as const)('loads %s snapshot options lazily and keeps saved selections through retries', async (field, label, source) => {
    const wrapper = mount(PerformanceAudienceRuleEditor, {
      props: { modelValue: [{ conditions: [{ field, operator: 'include', values: ['原快照'] }] }], allowedFields: [field], snapshotOptions: { organization_tree: [], people: [], employee_types: [], [source]: [] } },
      attachTo: document.body,
    })
    expect(wrapper.emitted('open-options')).toBeUndefined()
    const select = wrapper.findAllComponents(PerformanceSearchSelect)[2]
    expect(select.props('multiple')).toBe(true)
    await wrapper.get(`input[aria-label="${label}范围"]`).trigger('click')
    expect(wrapper.emitted('open-options')).toHaveLength(1)
    await wrapper.setProps({ error: '加载失败，请重试' })
    expect(wrapper.text()).toContain('加载失败，请重试')
    await wrapper.setProps({ error: '', snapshotOptions: { organization_tree: [], people: [], employee_types: [], [source]: [{ value: '新增快照', label: '新增快照' }] } })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(select.props('modelValue')).toEqual(['原快照'])
    expect(select.props('options')).toEqual([{ value: '新增快照', label: '新增快照' }])
    select.vm.$emit('update:modelValue', ['原快照', '新增快照'])
    await flushPromises()
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[])[0].conditions[0].values).toEqual(['原快照', '新增快照'])
    wrapper.unmount()
  })

  it('shares the date picker and resets values and operators when switching departure date fields', async () => {
    const wrapper = mount(PerformanceAudienceRuleEditor, {
      props: { modelValue: [{ conditions: [{ field: 'employment_status', operator: 'exclude', values: ['离职'] }] }], allowedFields: ['employment_status', 'departure_date'], snapshotOptions: { organization_tree: [], people: [], employee_types: [], departure_date_range: { min: '2026-01-01', max: '2026-10-28' } } },
    })
    wrapper.findAllComponents(PerformanceSearchSelect)[0].vm.$emit('update:modelValue', 'departure_date')
    await flushPromises()
    const groups = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[]
    expect(groups[0].conditions[0]).toEqual({ field: 'departure_date', operator: 'before', values: [] })
    await wrapper.setProps({ modelValue: groups })
    const date = wrapper.getComponent(PerformanceDateTimeField)
    expect(date.props('initialDate')).toBe('2026-01-01')
    expect(date.props('dateOnly')).toBe(true)
    const operator = wrapper.findAllComponents(PerformanceSearchSelect)[1]
    expect(operator.props('options')!.map(option => option.value)).toEqual(['before', 'not_before', 'after', 'not_after'])
    date.vm.$emit('update:modelValue', '2026-10-28')
    await flushPromises()
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[])[0].conditions[0].values).toEqual(['2026-10-28'])
    wrapper.unmount()
  })

  it('loads roster employee types lazily and preserves selected values on failure or reload', async () => {
    const wrapper = mount(PerformanceAudienceRuleEditor, {
      props: { modelValue: [{ conditions: [{ field: 'employee_type', operator: 'include', values: ['实习生'] }] }], allowedFields: ['employee_type', 'hire_date'], employeeTypeOptions: [] },
      attachTo: document.body,
    })
    expect(wrapper.emitted('open-options')).toBeUndefined()
    await wrapper.get('input[aria-label="人员类型范围"]').trigger('click')
    expect(wrapper.emitted('open-options')).toHaveLength(1)
    await wrapper.setProps({ error: '加载失败，请重试' })
    expect(wrapper.get('[role="alert"]').text()).toContain('加载失败')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.setProps({ error: '', employeeTypeOptions: [{ value: '实习生', label: '实习生' }, { value: '正式员工', label: '正式员工' }] })
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    const option = [...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(item => item.textContent?.includes('正式员工'))!
    option.click()
    await flushPromises()
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[])[0].conditions[0].values).toEqual(['实习生', '正式员工'])
    wrapper.unmount()
  })

  it('uses exactly one shared calendar with the four date comparison operators', async () => {
    const wrapper = mount(PerformanceAudienceRuleEditor, {
      props: { modelValue: [{ conditions: [{ field: 'hire_date', operator: 'before', values: [] }] }], allowedFields: ['employee_type', 'hire_date'], hireDateRange: { min: '2020-01-01', max: '2026-10-20' } },
      attachTo: document.body,
    })
    expect(wrapper.findAllComponents(PerformanceDateTimeField)).toHaveLength(1)
    const calendar = wrapper.getComponent(PerformanceDateTimeField)
    expect(calendar.props('dateOnly')).toBe(true)
    expect(calendar.props('initialDate')).toBe('2020-01-01')
    const operator = wrapper.findAllComponents(PerformanceSearchSelect)[1]
    expect(operator.props('options')).toEqual([
      { value: 'before', label: '早于' }, { value: 'not_before', label: '不早于' },
      { value: 'after', label: '晚于' }, { value: 'not_after', label: '不晚于' },
    ])
    for (const value of ['before', 'not_before', 'after', 'not_after']) {
      operator.vm.$emit('update:modelValue', value)
      await flushPromises()
      const groups = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[]
      expect(groups[0].conditions[0].operator).toBe(value)
      await wrapper.setProps({ modelValue: groups })
    }
    calendar.vm.$emit('update:modelValue', '2026-10-20')
    await flushPromises()
    const groups = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[]
    expect(groups[0].conditions[0]).toEqual({ field: 'hire_date', operator: 'not_after', values: ['2026-10-20'] })
    await wrapper.setProps({ modelValue: groups })
    await wrapper.get('input[aria-label="入职日期"]').trigger('click')
    expect(wrapper.emitted('open-options')).toHaveLength(1)
    await wrapper.setProps({ disabled: true })
    expect(wrapper.get('input[aria-label="入职日期"]').attributes('disabled')).toBeDefined()
    expect(operator.props('disabled')).toBe(true)
    wrapper.findAllComponents(PerformanceSearchSelect)[0].vm.$emit('update:modelValue', 'employee_type')
    await flushPromises()
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[])[0].conditions[0]).toEqual({ field: 'employee_type', operator: 'include', values: [] })
    wrapper.unmount()
  })
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
    expect(wrapper.get('.performance-audience-rule-editor__scope-or').findAll('span')).toHaveLength(3)
    expect(wrapper.get('.performance-audience-rule-editor__scope-or').classes()).toContain('performance-condition-logic-group__rail')
    expect(wrapper.get('.performance-audience-rule-editor__scope-or').element.parentElement?.className).toBe('performance-audience-rule-editor__groups')
    expect(wrapper.get('.performance-audience-rule-editor__rows').element.children).toHaveLength(2)
    expect(wrapper.get('.performance-audience-rule-editor__condition.has-delete').element.parentElement?.className).toBe('performance-audience-rule-editor__group')
    expect(wrapper.find('.performance-condition-logic-group').exists()).toBe(false)
    expect(wrapper.findAll('[aria-label^="删除范围"]')).toHaveLength(2)
    await wrapper.get('[aria-label="删除范围 2"]').trigger('click')
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[])).toHaveLength(1)
  })

  it('combines reviewee conditions with AND inside groups and OR between groups without changing the scope rule shape', async () => {
    const first = { field: 'department' as const, operator: 'include' as const, values: ['集团'] }
    const wrapper = mount(PerformanceAudienceRuleEditor, {
      props: { modelValue: [{ conditions: [first] }], allowedFields: ['department', 'employee'], organizationTree },
    })
    await wrapper.get('.performance-audience-rule-editor__group > .text-button').trigger('click')
    const twoConditions = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[]
    expect(twoConditions).toEqual([{ conditions: [first, { field: '', operator: 'include', values: [] }] }])
    await wrapper.setProps({ modelValue: twoConditions })
    expect(wrapper.get('.performance-condition-logic-group__rail').text()).toBe('且')
    expect(wrapper.findAll('[aria-label^="删除范围 1 条件"]')).toHaveLength(2)
    await wrapper.get('[aria-label="删除范围 1 条件 2"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([{ conditions: [first] }])
    await wrapper.setProps({ modelValue: twoConditions })
    await wrapper.get('.performance-audience-rule-editor__scope-tools button').trigger('click')
    const twoGroups = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as PerformanceAudienceGroup[]
    expect(twoGroups).toHaveLength(2)
    await wrapper.setProps({ modelValue: twoGroups })
    expect(wrapper.findAll('.performance-condition-logic-group__rail').map(rail => rail.text())).toEqual(['且'])
    expect(wrapper.get('.performance-audience-rule-editor__or').text()).toBe('或')
    expect(wrapper.get('.performance-audience-rule-editor__or').element.parentElement?.className).toBe('performance-audience-rule-editor__group')
    await wrapper.get('[aria-label="删除范围 2"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(twoConditions)
  })


  it('shows each group matched count as a preview link', async () => {
    const wrapper = mount(PerformanceAudienceRuleEditor, {
      props: { modelValue: [{ conditions: [{ field: 'department', operator: 'include', values: ['集团/研发'] }] }], allowedFields: ['department'], organizationTree, groupCounts: [5] },
    })
    expect(wrapper.get('.performance-audience-rule-editor__group-heading').text()).toContain('同时满足以下条件：5人')
    await wrapper.get('.performance-audience-rule-editor__count-link').trigger('click')
    expect(wrapper.emitted('open-preview')).toEqual([[0]])
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
