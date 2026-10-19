import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PerformanceCalibrationConditionGroup from './PerformanceCalibrationConditionGroup.vue'
import PerformanceCalibrationRuleDrawer from './PerformanceCalibrationRuleDrawer.vue'
import type { PerformanceProjectFlowRule } from '@/api/performance'
import { CALIBRATOR_RELATION_OPTIONS } from './performanceConditionFields'

const condition = (field: 'employee' | 'calibrator_relation', values: string[] = []) => ({ field, operator: 'INCLUDE' as const, values })
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
    wrapper.findComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', ['HRBP', 'DIRECT_SUBORDINATES'])
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ conditions: [condition('calibrator_relation', ['DIRECT_SUBORDINATES'])] })
    wrapper.unmount()
  })

  it('clears stale values when changing fields', async () => {
    const wrapper = mount(PerformanceCalibrationConditionGroup, {
      props: { modelValue: { conditions: [condition('employee', ['E1'])] }, title: '条件组 1', fieldLabel: '校准人', fieldOptions: [{ value: 'employee', label: '人员' }, { value: 'calibrator_relation', label: '与校准人关系' }] },
    })
    await wrapper.get('.calibration-select select').setValue('calibrator_relation')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ conditions: [condition('calibrator_relation')] })
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
