import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import PerformanceDistributionRuleRow from './PerformanceDistributionRuleRow.vue'
import PerformanceDistributionRuleDrawer from './PerformanceDistributionRuleDrawer.vue'

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

  it('disables an assessment item already used by another rule', async () => {
    mount(PerformanceDistributionRuleDrawer, { props: { modelValue: true, assessmentOptions, usedAssessmentIds: ['grade'] }, attachTo: document.body })
    ;(document.body.querySelector('[aria-label="分布评估项"]') as HTMLButtonElement).click()
    await Promise.resolve()
    const option = document.body.querySelector('[role="option"]') as HTMLButtonElement
    expect(option.disabled).toBe(true)
    expect(option.title).toBe('该评估项已配置分布规则')
  })
})
