import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PerformanceCalibrationConditionGroup from './PerformanceCalibrationConditionGroup.vue'
import PerformanceCalibrationRuleDrawer from './PerformanceCalibrationRuleDrawer.vue'
import type { PerformanceProjectFlowRule } from '@/api/performance'

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
      scope_groups: [{ conditions: [condition('calibrator_relation', ['CURRENT'])] }, { conditions: [condition('calibrator_relation', ['PARENT'])] }],
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
