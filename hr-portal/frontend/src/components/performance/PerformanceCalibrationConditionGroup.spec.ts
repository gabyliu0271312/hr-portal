import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PerformanceCalibrationConditionGroup from './PerformanceCalibrationConditionGroup.vue'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'
import PerformanceOrganizationSelect from './PerformanceOrganizationSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformanceCalibrationRuleDrawer from './PerformanceCalibrationRuleDrawer.vue'
import type { PerformanceProjectFlowRule } from '@/api/performance'
import { CALIBRATOR_RELATION_OPTIONS } from './performanceConditionFields'

const condition = (field: 'department' | 'employee' | 'hire_date' | 'calibrator_relation', values: string[] = [], operator: 'INCLUDE' | 'EXCLUDE' | 'before' | 'not_before' | 'after' | 'not_after' = field === 'hire_date' ? 'before' : 'INCLUDE') => ({ field, operator, values })
afterEach(() => { document.body.innerHTML = '' })

describe('PerformanceCalibrationConditionGroup', () => {
  it('adds conjunctive conditions, removes one, and keeps at least one', async () => {
    const wrapper = mount(PerformanceCalibrationConditionGroup, {
      props: { modelValue: { conditions: [condition('employee', ['E1'])] }, title: '条件组 1', fieldLabel: '校准人', fieldOptions: [{ value: 'employee', label: '人员' }] },
    })
    await wrapper.get('.calibration-condition-group__add').trigger('click')
    const updated = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as { conditions: ReturnType<typeof condition>[] }
    expect(updated.conditions).toEqual([condition('employee', ['E1']), condition('employee')])
    await wrapper.setProps({ modelValue: updated })
    expect(wrapper.get('.performance-condition-logic-group__rail').text()).toBe('且')
    expect(wrapper.findAll('[aria-label^="删除校准人条件"]')).toHaveLength(2)
    await wrapper.get('[aria-label="删除校准人条件 2"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ conditions: [condition('employee', ['E1'])] })
    await wrapper.setProps({ modelValue: { conditions: [condition('employee', ['E1'])] } })
    expect(wrapper.find('[aria-label^="删除校准人条件"]').exists()).toBe(false)
  })

  it('offers only fixed calibrator relation values, never people', async () => {
    const wrapper = mount(PerformanceCalibrationConditionGroup, {
      props: {
        modelValue: { conditions: [condition('calibrator_relation')] },
        title: '条件组 1', fieldLabel: '校准范围',
        fieldOptions: [{ value: 'calibrator_relation', label: '与校准人关系' }],
        valueOptions: [{ value: 'E1', label: '员工 E1' }],
      },
      attachTo: document.body,
    })
    expect(wrapper.get('input[aria-label="校准范围条件值"]').attributes('placeholder')).toBe('请选择与校准人的关系')
    await wrapper.get('input[aria-label="校准范围条件值"]').trigger('click')
    const options = [...document.body.querySelectorAll('.performance-flat-option-list__option')].map(option => option.textContent?.trim())
    expect(options).toEqual(CALIBRATOR_RELATION_OPTIONS.map(option => option.label))
    expect(options).not.toContain('员工 E1')
    ;(document.body.querySelectorAll('.performance-flat-option-list__option')[2] as HTMLButtonElement).click()
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ conditions: [condition('calibrator_relation', ['INDIRECT_SUBORDINATES'])] })
    wrapper.findAllComponents({ name: 'PerformanceSearchSelect' }).find(select => select.props('multiple'))!.vm.$emit('update:modelValue', ['HRBP', 'DIRECT_SUBORDINATES'])
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ conditions: [condition('calibrator_relation', ['DIRECT_SUBORDINATES'])] })
    wrapper.unmount()
  })

  it('uses the standard organization, person, and hire-date controls for scope fields', async () => {
    const organizationTree = [{ value: '集团', label: '集团', level: 1, children: [] }]
    const wrapper = mount(PerformanceCalibrationConditionGroup, {
      props: {
        modelValue: { conditions: [condition('department')] },
        title: '条件组 1', fieldLabel: '校准范围',
        fieldOptions: [{ value: 'department', label: '部门' }, { value: 'employee', label: '人员' }, { value: 'hire_date', label: '入职日期' }],
        valueOptions: [{ value: 'E1', label: '员工 E1' }], organizationTree, hireDateRange: { min: '2025-01-01', max: '2026-01-01' },
      },
    })
    expect(wrapper.getComponent(PerformanceOrganizationSelect).props('nodes')).toEqual(organizationTree)
    wrapper.findAllComponents({ name: 'PerformanceSearchSelect' })[0].vm.$emit('update:modelValue', 'employee')
    await wrapper.setProps({ modelValue: wrapper.emitted('update:modelValue')?.at(-1)?.[0] as any })
    expect(wrapper.getComponent(PerformancePersonSelect).props('options')).toEqual([{ value: 'E1', label: '员工 E1' }])
    wrapper.findAllComponents({ name: 'PerformanceSearchSelect' })[0].vm.$emit('update:modelValue', 'hire_date')
    const hireDateModel = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as any
    expect(hireDateModel).toEqual({ conditions: [condition('hire_date')] })
    await wrapper.setProps({ modelValue: hireDateModel })
    expect(wrapper.getComponent(PerformanceDateTimeField).props()).toMatchObject({ dateOnly: true, initialDate: '2025-01-01' })
    expect(wrapper.findAllComponents({ name: 'PerformanceSearchSelect' })[1].props('options')).toEqual([
      { value: 'before', label: '早于' }, { value: 'not_before', label: '不早于' }, { value: 'after', label: '晚于' }, { value: 'not_after', label: '不晚于' },
    ])
    wrapper.getComponent(PerformanceDateTimeField).vm.$emit('update:modelValue', '2026-01-15')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ conditions: [condition('hire_date', ['2026-01-15'])] })
  })
})

describe('PerformanceCalibrationRuleDrawer', () => {
  it('blocks incomplete new groups without discarding the open draft', async () => {
    const wrapper = mount(PerformanceCalibrationRuleDrawer, { props: { modelValue: true }, attachTo: document.body })
    const drawer = () => document.body.querySelector('.calibration-rule-drawer')!
    const click = async (selector: string) => { (drawer().querySelector(selector) as HTMLElement).click(); await wrapper.vm.$nextTick() }
    const subjectAdd = '.calibration-rule-section:first-child .calibration-rule-link'
    const scopeAdd = '.calibration-rule-section:nth-child(2) .calibration-rule-link'
    await click('.calibration-rule-section:first-child .calibration-condition-group__add')
    await click(subjectAdd)
    await click(scopeAdd)
    expect([...drawer().querySelectorAll('.performance-condition-logic-group__rail')].map(rail => rail.textContent)).toEqual(['且'])
    expect(drawer().querySelectorAll('.calibration-rule-group-or')).toHaveLength(2)
    expect([...drawer().querySelectorAll('.calibration-rule-group-or')].map(node => node.textContent)).toEqual(['或', '或'])
    expect(drawer().querySelectorAll('[aria-label^="删除校准人条件组"]')).toHaveLength(2)
    await click('[aria-label="删除校准人条件组 2"]')
    expect(drawer().querySelectorAll('[aria-label^="删除校准人条件组"]')).toHaveLength(0)
    await click(subjectAdd)
    const description = drawer().querySelector('.calibration-description-input input') as HTMLInputElement
    description.value = '校准规则备注'; description.dispatchEvent(new Event('input', { bubbles: true }))
    await click('.calibration-radio-group--vertical input[value="RULE"]')
    ;(document.body.querySelector('.performance-drawer-footer__confirm') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain('校准人')
    expect(drawer().querySelectorAll('.calibration-condition-group')).toHaveLength(4)
  })

  it('reopens populated AND/OR rules without dropping conditions and emits full DTO', async () => {
    const original: PerformanceProjectFlowRule = {
      subject_type: 'PERSON', operator: 'INCLUDE', scope: 'RULE', allow_authorize: true,
      subject_source: 'RULE', subject_groups: [
        { conditions: [condition('employee', ['E1']), condition('employee', ['E2'])] },
        { conditions: [condition('employee', ['E3'])] },
      ],
      scope_groups: [{ conditions: [condition('calibrator_relation', ['DIRECT_SUBORDINATES'])] }, { conditions: [condition('calibrator_relation', ['INDIRECT_SUBORDINATES'])] }],
      description: '已保存的描述',
    }
    const wrapper = mount(PerformanceCalibrationRuleDrawer, { props: { modelValue: true, rule: original, mode: 'edit' }, attachTo: document.body })
    const drawer = () => document.body.querySelector('.calibration-rule-drawer')!
    expect(drawer().querySelectorAll('.calibration-rule-section:first-child .calibration-condition-group')).toHaveLength(2)
    expect(drawer().querySelectorAll('.calibration-rule-section:nth-child(2) .calibration-condition-group')).toHaveLength(2)
    expect([...drawer().querySelectorAll('.performance-condition-logic-group__rail')].map(node => node.textContent)).toEqual(['且'])
    expect([...drawer().querySelectorAll('.calibration-rule-group-or')].map(node => node.textContent)).toEqual(['或', '或'])
    expect((drawer().querySelector('.calibration-description-input input') as HTMLInputElement).value).toBe('已保存的描述')
    ;(document.body.querySelector('.performance-drawer-footer__confirm') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toEqual(original)
    wrapper.unmount()
  })

  it('shows saved relation labels for all, direct, and indirect subordinates', async () => {
    const rule: PerformanceProjectFlowRule = {
      subject_type: 'PERSON', operator: 'INCLUDE', scope: 'RULE', allow_authorize: false,
      subject_groups: [{ conditions: [condition('employee', ['E1'])] }],
      scope_groups: [{ conditions: [condition('calibrator_relation', CALIBRATOR_RELATION_OPTIONS.map(option => option.value))] }],
    }
    const wrapper = mount(PerformanceCalibrationRuleDrawer, { props: { modelValue: true, rule, mode: 'edit' }, attachTo: document.body })
    const selected = document.body.querySelector('.calibration-rule-section:nth-child(2) .calibration-value-select')!
    for (const option of CALIBRATOR_RELATION_OPTIONS) expect(selected.textContent).toContain(option.label)
    ;(document.body.querySelector('.performance-drawer-footer__confirm') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject({ scope_groups: rule.scope_groups })
    wrapper.unmount()
  })

  it('keeps the draft open until the parent reports a successful save', async () => {
    const rule: PerformanceProjectFlowRule = {
      subject_type: 'PERSON', operator: 'INCLUDE', scope: 'RULE', allow_authorize: false,
      subject_groups: [{ conditions: [condition('employee', ['E1'])] }],
      scope_groups: [{ conditions: [condition('calibrator_relation', ['DIRECT_SUBORDINATES'])] }],
    }
    const wrapper = mount(PerformanceCalibrationRuleDrawer, { props: { modelValue: true, rule, saving: false }, attachTo: document.body })
    const confirm = document.body.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('confirm')?.at(-1)?.[0]).toMatchObject(rule)
    expect(document.body.querySelector('[aria-label="校准规则编辑"]')).not.toBeNull()
    await wrapper.setProps({ saving: true, saveError: '校准规则保存失败' })
    expect((document.body.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement).disabled).toBe(true)
    expect(document.body.querySelector('.calibration-rule-error')?.textContent).toContain('保存失败')
    wrapper.unmount()
  })

  it('supports a two-step distribution draft with independently enabled execution scopes', async () => {
    const rule: PerformanceProjectFlowRule = {
      subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false,
      subject_groups: [{ conditions: [condition('employee', ['E1'])] }],
    }
    const wrapper = mount(PerformanceCalibrationRuleDrawer, {
      props: {
        modelValue: true,
        rule,
        assessmentOptions: [{ id: 'grade', label: '综合评级', grade_options: [{ value: 'A', label: 'A' }] }],
        distributionMode: 'BY_CALIBRATION_SCOPE',
        organizationTree: [{ value: '集团', label: '集团', level: 1, children: [] }],
        positionLevelOptions: [{ value: 'P6', label: 'P6' }],
      },
      attachTo: document.body,
    })
    const footer = () => document.body.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement
    expect(footer().textContent).toBe('下一步')
    footer().click()
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.calibration-step-guide')?.textContent).toContain('分布规则')
    expect((document.body.querySelector('.performance-drawer-footer__cancel') as HTMLButtonElement).textContent).toBe('上一步')
    expect(document.body.textContent).toContain('分布规则 1')
    ;(document.body.querySelector('[aria-label="删除分布规则 1"]') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('暂无分布规则')
    ;(document.body.querySelector('.calibration-distribution-empty button') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    const department = document.body.querySelector('input[aria-label="指定部门内执行分布"]') as HTMLInputElement
    department.click()
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('部门等级')
    expect(document.body.textContent).not.toContain('职级')
    const other = document.body.querySelector('input[aria-label="指定其他维度内执行分布"]') as HTMLInputElement
    other.click()
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('职级')
    const whole = document.body.querySelector('input[aria-label="校准范围内整体执行"]') as HTMLInputElement
    whole.click()
    await wrapper.vm.$nextTick()
    expect((document.body.querySelectorAll('input[aria-label="校准范围内整体执行"]')[0] as HTMLInputElement).checked).toBe(true)
    ;(document.body.querySelector('.performance-drawer-footer__cancel') as HTMLButtonElement).click()
    await wrapper.vm.$nextTick()
    expect(document.body.querySelector('.calibration-rule-section')?.textContent).toContain('校准人')
    wrapper.unmount()
  })

  it('keeps legacy rules without new groups on edit', async () => {
    const legacy: PerformanceProjectFlowRule = { subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }
    const wrapper = mount(PerformanceCalibrationRuleDrawer, { props: { modelValue: true, rule: legacy, mode: 'edit' }, attachTo: document.body })
    ;(document.body.querySelector('.performance-drawer-footer__confirm') as HTMLElement).click()
    await wrapper.vm.$nextTick()
    const emitted = wrapper.emitted('confirm')?.at(-1)?.[0] as PerformanceProjectFlowRule
    expect(emitted.subject_groups).toBeUndefined()
    expect(emitted.scope_groups).toBeUndefined()
    expect(emitted.scope).toBe('PROJECT_ALL')
    wrapper.unmount()
  })
})
