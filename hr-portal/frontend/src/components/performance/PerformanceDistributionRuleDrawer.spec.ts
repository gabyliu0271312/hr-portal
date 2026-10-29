import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import PerformanceDistributionRuleRow from './PerformanceDistributionRuleRow.vue'
import PerformanceDistributionRuleDrawer from './PerformanceDistributionRuleDrawer.vue'
import PerformanceDistributionRuleEditor from './PerformanceDistributionRuleEditor.vue'
import PerformanceAudienceRuleEditor from './PerformanceAudienceRuleEditor.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'

const assessmentOptions = [{ id: 'grade', label: '绩效等级', description: '最终评级', grade_options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }] }]

afterEach(() => { document.body.innerHTML = '' })

describe('PerformanceDistributionRuleDrawer', () => {
  it('validates required fields and submits a complete rule', async () => {
    const wrapper = mount(PerformanceDistributionRuleDrawer, { props: { modelValue: true, assessmentOptions }, attachTo: document.body })
    const confirm = document.body.querySelector('.performance-drawer-footer__confirm') as HTMLButtonElement
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('评估项为必填')

    wrapper.findComponent(PerformanceAssessmentSelect).vm.$emit('update:modelValue', 'grade')
    await wrapper.vm.$nextTick()
    expect(document.body.textContent).toContain('绩效等级共2个评级结果：')
    expect(Array.from(document.body.querySelectorAll('.distribution-assessment-summary span')).map(item => item.textContent)).toEqual(['A', 'B'])
    const condition = wrapper.findComponent(PerformanceDistributionRuleRow)
    condition.vm.$emit('update:modelValue', { control_mode: 'HARD', grade_codes: ['A'], operator: 'GTE', value: 20, unit: 'PERCENT' })
    await wrapper.vm.$nextTick()
    confirm.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({ assessment_item_id: 'grade', min_people_count: 0, rounding_method: 'ROUND', conditions: [{ grade_codes: ['A'], value: 20 }] })
  })

  it('shows all comparison operators and grade codes only', async () => {
    let wrapper = mount(PerformanceDistributionRuleDrawer, { props: { modelValue: true, assessmentOptions }, attachTo: document.body })
    wrapper.findComponent(PerformanceAssessmentSelect).vm.$emit('update:modelValue', 'grade')
    await wrapper.vm.$nextTick()
    let row = wrapper.findComponent(PerformanceDistributionRuleRow)
    await row.find('[aria-label="分布比较符"]').trigger('click')
    expect(Array.from(document.body.querySelectorAll('[role="option"]')).map(item => item.textContent)).toEqual(['等于', '小于', '小于等于', '大于', '大于等于'])
    wrapper.unmount()
    document.body.innerHTML = ''

    wrapper = mount(PerformanceDistributionRuleDrawer, { props: { modelValue: true, assessmentOptions }, attachTo: document.body })
    wrapper.findComponent(PerformanceAssessmentSelect).vm.$emit('update:modelValue', 'grade')
    await wrapper.vm.$nextTick()
    row = wrapper.findComponent(PerformanceDistributionRuleRow)
    await row.find('input[aria-label="分布等级"]').trigger('focus')
    await wrapper.vm.$nextTick()
    expect(Array.from(document.body.querySelectorAll('[role="option"]')).map(item => item.textContent)).toEqual(['A', 'B'])
  })

  it('offers no-forced-rounding with the exact explanatory tooltip', async () => {
    const wrapper = mount(PerformanceDistributionRuleDrawer, { props: { modelValue: true, assessmentOptions }, attachTo: document.body })
    const radioGroup = wrapper.findComponent(PerformanceRadioGroup)
    const rounding = radioGroup.props('options') as Array<{ value: string; label: string }>
    expect(rounding.find(option => option.value === 'NONE')?.label).toBe('不强制取整')
    const tooltip = wrapper.findAllComponents({ name: 'PerformanceInfoPopover' }).find(component => String(component.props('content')).includes('实际人数会与此小数值直接对比'))
    expect(tooltip?.props('content')).toContain('强制/建议的人数值计算得小数值时，实际人数会与此小数值直接对比。')
    expect(tooltip?.props('preserveNewlines')).toBe(true)
  })

  it('disables an assessment item already used by another rule', async () => {
    mount(PerformanceDistributionRuleDrawer, { props: { modelValue: true, assessmentOptions, usedAssessmentIds: ['grade'] }, attachTo: document.body })
    ;(document.body.querySelector('[aria-label="分布评估项"]') as HTMLButtonElement).click()
    await Promise.resolve()
    const option = document.body.querySelector('[role="option"]') as HTMLButtonElement
    expect(option.disabled).toBe(true)
    expect(option.title).toBe('该评估项已配置分布规则')
  })

  it('uses separate audience editors for department and other-dimension distribution scopes', async () => {
    const wrapper = mount(PerformanceDistributionRuleEditor, {
      props: {
        modelValue: {
          assessment_item_id: 'grade',
          min_people_count: 0,
          conditions: [{ control_mode: 'HARD', grade_codes: ['A'], operator: 'GTE', value: 20, unit: 'PERCENT' }],
          rounding_method: 'ROUND',
          execution_scope: {
            calibration_scope: false,
            department: true,
            other_dimension: true,
            rules: [
              { type: 'DEPARTMENT', values: ['研发部'] },
              { type: 'DEPARTMENT_LEVEL', values: ['department_2'] },
              { type: 'POSITION_LEVEL', values: ['P6'] },
            ],
          },
        },
        assessmentOptions,
        showExecutionScope: true,
        positionLevelOptions: [{ value: 'P6', label: 'P6' }],
      },
      attachTo: document.body,
    })
    const editors = wrapper.findAllComponents(PerformanceAudienceRuleEditor)
    expect(editors).toHaveLength(2)
    expect(editors[0].props('showScopeHeading')).toBe(false)
    expect(editors[0].props('customFields')).toEqual([{ value: 'department_level', label: '部门等级', component: expect.anything() }])
    expect(editors[0].props('modelValue')).toEqual([
      { conditions: [{ field: 'department', operator: 'include', values: ['研发部'] }] },
      { conditions: [{ field: 'department_level', operator: 'include', values: ['department_2'] }] },
    ])
    expect(editors[1].props('modelValue')).toEqual([{ conditions: [{ field: 'position_level', operator: 'include', values: ['P6'] }] }])
    editors[0].vm.$emit('update:modelValue', [
      { conditions: [{ field: 'department', operator: 'include', values: ['研发部'] }] },
      { conditions: [{ field: 'department', operator: 'include', values: ['销售部'] }] },
    ])
    await wrapper.vm.$nextTick()
    expect((wrapper.emitted('update:modelValue')?.at(-1)?.[0] as any).execution_scope.rules).toEqual([
      { type: 'POSITION_LEVEL', values: ['P6'] },
      { type: 'DEPARTMENT', values: ['研发部'] },
      { type: 'DEPARTMENT', values: ['销售部'] },
    ])
  })
})
