import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PerformanceDistributionTips from './PerformanceDistributionTips.vue'
import type { PerformanceDistributionTips as Tips } from '@/api/performance'

enableAutoUnmount(afterEach)

const tips = (): Tips => ({
  enabled: true,
  total_people: 5,
  rated_people: 5,
  rules: [
    {
      assessment_item_id: 'grade',
      assessment_label: '绩效评级',
      conditions: [
        { control_mode: 'HARD', grades: ['S'], operator: 'LTE', value: 20, unit: 'PERCENT', rounding: 'ROUND', target_people: 1, current_people: 2, diff: 1, violated: true },
        { control_mode: 'SOFT', grades: ['D'], operator: 'LTE', value: 20, unit: 'PERCENT', rounding: 'ROUND', target_people: 0, current_people: 1, diff: 1, violated: true },
      ],
    },
  ],
  lines: [],
})

describe('PerformanceDistributionTips', () => {
  it('renders violated HARD/SOFT rules with semantic tags and diff highlight', () => {
    const wrapper = mount(PerformanceDistributionTips, { props: { tips: tips() } })

    expect(wrapper.find('.performance-distribution-tips').exists()).toBe(true)
    expect(wrapper.find('.distribution-tips__title').text()).toContain('绩效结果强制 / 建议分布')
    expect(wrapper.findAll('.distribution-tips__group-title').map(el => el.text())).toEqual(['强制分布', '建议分布'])
    const tags = wrapper.findAll('.distribution-tips__status-tag')
    expect(tags.map(el => el.text())).toEqual(['不符合', '不符合'])
    expect(tags[0].classes()).toContain('distribution-tips__status-tag--error')
    expect(tags[1].classes()).toContain('distribution-tips__status-tag--warning')
    // HARD：S 小于等于 20%，目标 1 人、当前 2 人 → 当前多于目标，需减少 1 人（diff 高亮）
    expect(wrapper.find('.distribution-tips__rule-heading').text()).toContain('绩效评级')
    expect(wrapper.findAll('.distribution-tips__rule-formula').map(el => el.text())).toEqual(['S 小于等于 20%', 'D 小于等于 20%'])
    expect(wrapper.find('.distribution-tips__rule-state').text()).toContain('当前 2 人')
    const diff = wrapper.find('.distribution-tips__diff--error')
    expect(diff.text()).toBe('1')
    expect(wrapper.find('.distribution-tips__rule-line').text()).toContain('需小于等于 1 人，当前 2 人，需减少 1人')
    expect(wrapper.findAll('.distribution-tips__rule').length).toBe(2)
    expect(wrapper.find('.distribution-tips__note').text()).toContain('四舍五入')
  })

  it('skips rules that are not violated', () => {
    const data = tips()
    data.rules[0].conditions[0].violated = false
    data.rules[0].conditions[1].violated = false
    const wrapper = mount(PerformanceDistributionTips, { props: { tips: data } })
    expect(wrapper.findAll('.distribution-tips__group-title').length).toBe(0)
    expect(wrapper.findAll('.distribution-tips__rule').length).toBe(0)
  })

  it.each(['HARD', 'SOFT'] as const)('%s does not warn when the current count is below an inclusive upper limit', controlMode => {
    const data = tips()
    data.rules[0].conditions = [{ ...data.rules[0].conditions[0], control_mode: controlMode, grades: ['4星', '5星'], value: 25, target_people: 30, current_people: 5, diff: -25, violated: false }]
    const wrapper = mount(PerformanceDistributionTips, { props: { tips: data } })
    expect(wrapper.find('.distribution-tips__status-tag').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('需减少')
    expect(wrapper.text()).not.toContain('需增加')
  })

  it.each(['HARD', 'SOFT'] as const)('%s renders all comparison boundaries and adjustment directions', controlMode => {
    const data = tips()
    data.rules[0].conditions = [
      { ...data.rules[0].conditions[0], operator: 'EQ', value: 30, target_people: 35, current_people: 0, diff: -35 },
      { ...data.rules[0].conditions[0], operator: 'EQ', target_people: 35, current_people: 40, diff: 5 },
      { ...data.rules[0].conditions[0], operator: 'LTE', target_people: 30, current_people: 35, diff: 5 },
      { ...data.rules[0].conditions[0], operator: 'GTE', target_people: 35, current_people: 5, diff: -30 },
      { ...data.rules[0].conditions[0], operator: 'LT', target_people: 30, current_people: 30, diff: 0 },
      { ...data.rules[0].conditions[0], operator: 'LT', target_people: 30, current_people: 35, diff: 5 },
      { ...data.rules[0].conditions[0], operator: 'GT', target_people: 35, current_people: 35, diff: 0 },
      { ...data.rules[0].conditions[0], operator: 'GT', target_people: 35, current_people: 30, diff: -5 },
    ].map(condition => ({ ...condition, control_mode: controlMode }))
    const wrapper = mount(PerformanceDistributionTips, { props: { tips: data } })
    expect(wrapper.findAll('.distribution-tips__rule-line').map(el => el.text())).toEqual([
      expect.stringContaining('需等于 35 人，当前 0 人，需增加 35人'),
      expect.stringContaining('需等于 35 人，当前 40 人，需减少 5人'),
      expect.stringContaining('需小于等于 30 人，当前 35 人，需减少 5人'),
      expect.stringContaining('需大于等于 35 人，当前 5 人，需增加 30人'),
      expect.stringContaining('需小于 30 人，当前 30 人，需减少 1人'),
      expect.stringContaining('需小于 30 人，当前 35 人，需减少 6人'),
      expect.stringContaining('需大于 35 人，当前 35 人，需增加 1人'),
      expect.stringContaining('需大于 35 人，当前 30 人，需增加 6人'),
    ])
  })

  it('uses the same precise comparison label for people and percentage rules', () => {
    const data = tips()
    data.rules[0].conditions[0].unit = 'PEOPLE'
    const wrapper = mount(PerformanceDistributionTips, { props: { tips: data } })
    expect(wrapper.find('.distribution-tips__rule-state').text()).toBe('需小于等于 1 人，当前 2 人')
  })

  it('collapses and expands the rule groups', async () => {
    const wrapper = mount(PerformanceDistributionTips, { props: { tips: tips() } })
    const toggle = wrapper.find('.distribution-tips__toggle')
    expect(toggle.text()).toBe('收起全部')
    expect(wrapper.find('.distribution-tips__group').exists()).toBe(true)

    await toggle.trigger('click')
    expect(toggle.text()).toBe('展开全部')
    expect(wrapper.find('.distribution-tips__group').exists()).toBe(false)
    expect(wrapper.find('.distribution-tips__note').exists()).toBe(false)

    await toggle.trigger('click')
    expect(wrapper.find('.distribution-tips__group').exists()).toBe(true)
  })

  it('renders nothing without tips and hides toggle when no rules', () => {
    const none = mount(PerformanceDistributionTips, { props: { tips: null } })
    expect(none.find('.performance-distribution-tips').exists()).toBe(false)

    const empty = tips()
    empty.rules = []
    const wrapper = mount(PerformanceDistributionTips, { props: { tips: empty } })
    expect(wrapper.find('.distribution-tips__toggle').exists()).toBe(false)
  })

  it('renders nothing when the backend switch is disabled', () => {
    const data = tips()
    data.enabled = false
    const wrapper = mount(PerformanceDistributionTips, { props: { tips: data } })
    expect(wrapper.find('.performance-distribution-tips').exists()).toBe(false)
  })
})
