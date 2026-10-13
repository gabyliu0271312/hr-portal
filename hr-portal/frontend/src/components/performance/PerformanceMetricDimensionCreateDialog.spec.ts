import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PerformanceReviewRuleOption } from '@/api/performance'
import PerformanceMetricDimensionCreateDialog from './PerformanceMetricDimensionCreateDialog.vue'

const metricTypes = [
  { id: 1, name: '定性指标', field_ids: [], fields: '', updated_by: '', updated_at: '' },
]
const reviewRules: PerformanceReviewRuleOption[] = [{
  id: 2, name: '评分规则', review_type: '评分', status: 'active', created_at: '', updated_at: '', remark: '', creator: '', config_summary: {}, is_used: false, deletable: true,
}]

const shellStub = {
  props: ['modelValue', 'title', 'loading'],
  template: '<section v-if="modelValue"><h2>{{ title }}</h2><div class="dialog-body"><slot /></div><footer><slot name="footer" /></footer></section>',
}

describe('PerformanceMetricDimensionCreateDialog', () => {
  it('validates required dimension name, metric types, and shared rule', async () => {
    const wrapper = mount(PerformanceMetricDimensionCreateDialog, {
      props: { modelValue: true, metricTypeOptions: metricTypes, reviewRuleOptions: reviewRules },
      global: { stubs: { PerformanceDialogShell: shellStub } },
    })

    await wrapper.get('.metric-dimension-footer button').trigger('click')
    expect(wrapper.text()).toContain('请输入维度名称')
    expect(wrapper.text()).toContain('请选择可添加的指标类型')
    expect(wrapper.text()).toContain('请选择评分或评级')
  })

  it('shows required percentage weight input when weight switch is enabled', async () => {
    const wrapper = mount(PerformanceMetricDimensionCreateDialog, {
      props: { modelValue: true, metricTypeOptions: metricTypes, reviewRuleOptions: reviewRules },
      global: { stubs: { PerformanceDialogShell: shellStub } },
    })

    expect(wrapper.find('#metric-dimension-weight').exists()).toBe(false)
    await wrapper.get('#metric-dimension-name').setValue('经营结果')
    await wrapper.get('[aria-label="需设置维度权重"]').trigger('click')
    expect(wrapper.find('#metric-dimension-weight').exists()).toBe(true)
    await wrapper.get('.metric-dimension-footer button').trigger('click')
    expect(wrapper.text()).toContain('请输入维度权重')
    await wrapper.get('#metric-dimension-weight').setValue('25')
    await wrapper.get('.metric-dimension-checkbox-group input').setValue(true)
    await wrapper.get('.metric-dimension-review-rule-select .select-shell > button').trigger('click')
    await wrapper.get('[role="option"]').trigger('click')
    await wrapper.get('.metric-dimension-footer button').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({ need_weight: true, weight: 25 })
    await wrapper.get('[aria-label="需设置维度权重"]').trigger('click')
    expect(wrapper.find('#metric-dimension-weight').exists()).toBe(false)
    await wrapper.get('.metric-dimension-footer button').trigger('click')
    expect(wrapper.emitted('confirm')?.[1]?.[0]).toMatchObject({ need_weight: false, weight: null })
  })

  it('emits the captured dimension payload after selecting types and review rule', async () => {
    const wrapper = mount(PerformanceMetricDimensionCreateDialog, {
      props: { modelValue: true, metricTypeOptions: metricTypes, reviewRuleOptions: reviewRules },
      global: { stubs: { PerformanceDialogShell: shellStub } },
    })

    const options = wrapper.findAll('.metric-dimension-rule-group > *')
    expect(options[0]?.text()).toContain('使用相同规则')
    expect(options[1]?.classes()).toContain('metric-dimension-review-rule-select')
    expect(options[2]?.text()).toContain('使用不同规则')

    await wrapper.get('#metric-dimension-name').setValue('经营结果')
    await wrapper.get('.metric-dimension-checkbox-group input').setValue(true)
    await wrapper.get('.performance-assessment-select > .select-shell > button').trigger('click')
    await wrapper.get('[role="option"]').trigger('click')
    await wrapper.get('.metric-dimension-footer button').trigger('click')

    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({
      name: '经营结果',
      description: '',
      need_weight: false,
      metric_type_ids: [1],
      allow_reviewee_add_metrics: false,
      review_rule_mode: 'same',
      review_rule_id: 2,
    })
  })

  it('clears the shared rule when switching to different rules', async () => {
    const wrapper = mount(PerformanceMetricDimensionCreateDialog, {
      props: { modelValue: true, metricTypeOptions: metricTypes, reviewRuleOptions: reviewRules },
      global: { stubs: { PerformanceDialogShell: shellStub } },
    })

    await wrapper.get('#metric-dimension-name').setValue('经营结果')
    await wrapper.get('.metric-dimension-checkbox-group input').setValue(true)
    await wrapper.get('.performance-radio-option input[value="different"]').setValue(true)
    expect(wrapper.find('.metric-dimension-review-rule-select').exists()).toBe(false)
    await wrapper.get('.metric-dimension-footer button').trigger('click')

    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({ review_rule_mode: 'different', review_rule_id: null })
  })

  it('shows captured reviewee settings only while enabled and saves edited choices', async () => {
    const wrapper = mount(PerformanceMetricDimensionCreateDialog, {
      props: { modelValue: true, metricTypeOptions: metricTypes, reviewRuleOptions: reviewRules },
      global: { stubs: { PerformanceDialogShell: shellStub } },
    })

    expect(wrapper.find('[aria-label="被评估人添加指标设置"]').exists()).toBe(false)
    await wrapper.get('[aria-label="允许被评估人添加指标"]').trigger('click')
    const settings = wrapper.get('[aria-label="被评估人添加指标设置"]')
    expect(settings.text()).toContain('添加指标的方式')
    expect(settings.text()).toContain('可选用指标库的指标')
    expect(settings.text()).toContain('可选用指标库的指标或添加自定义指标')
    expect(settings.text()).toContain('评分方式')
    expect(settings.get('.metric-reviewee-scoring__line').text()).toBe('指标库的指标：以指标库设定的方式为准')
    const custom = settings.get('.metric-reviewee-scoring__custom')
    expect(custom.get('.metric-reviewee-scoring__line').text()).toBe('非指标库的指标')
    expect(custom.findAll(':scope > *')[1]?.classes()).toContain('metric-reviewee-scoring__select')
    expect(custom.get('[aria-label="非指标库的指标评分方式"]').text()).toBe('手动评分')
    expect(settings.findAll('.metric-reviewee-scoring__dot')).toHaveLength(2)
    expect(settings.text()).toContain('指标数量设置')
    expect(settings.get('[aria-label="至少添加 1 条指标"]').element).toHaveProperty('checked', true)
    expect(settings.get('input[value="library_or_custom"]').element).toHaveProperty('checked', true)
    await settings.get('input[value="library"]').setValue(true)
    expect(settings.get('.metric-reviewee-scoring__line').text()).toBe('指标库的指标：以指标库设定的方式为准')
    expect(settings.find('.metric-reviewee-scoring__custom').exists()).toBe(false)
    expect(settings.find('[aria-label="非指标库的指标评分方式"]').exists()).toBe(false)
    expect(settings.findAll('.metric-reviewee-scoring__dot')).toHaveLength(1)
    await settings.get('input[value="library_or_custom"]').setValue(true)
    expect(settings.find('.metric-reviewee-scoring__custom').exists()).toBe(true)
    await settings.get('input[value="library"]').setValue(true)
    await settings.get('[aria-label="至少添加 1 条指标"]').setValue(false)
    await wrapper.get('#metric-dimension-name').setValue('经营结果')
    await wrapper.get('.metric-dimension-checkbox-group input').setValue(true)
    await wrapper.get('.metric-dimension-review-rule-select .select-shell > button').trigger('click')
    await wrapper.get('[role="option"]').trigger('click')
    await wrapper.get('.metric-dimension-footer button').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toMatchObject({
      allow_reviewee_add_metrics: true,
      reviewee_add_method: 'library',
      reviewee_scoring_method: 'manual',
      reviewee_min_one_metric: false,
    })

    await wrapper.get('[aria-label="允许被评估人添加指标"]').trigger('click')
    expect(wrapper.find('[aria-label="被评估人添加指标设置"]').exists()).toBe(false)
    await wrapper.get('[aria-label="允许被评估人添加指标"]').trigger('click')
    expect(wrapper.get('input[value="library"]').element).toHaveProperty('checked', true)
    expect(wrapper.get('[aria-label="至少添加 1 条指标"]').element).toHaveProperty('checked', false)
  })
})
