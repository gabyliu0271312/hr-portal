import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceRatingTag from './PerformanceRatingTag.vue'
import ReviewRuleConfigRenderer from './ReviewRuleConfigRenderer.vue'
import { PERFORMANCE_LEVEL_COLORS, performanceLevelBackground } from './performanceColorOptions'

describe('PerformanceRatingTag', () => {
  it.each(PERFORMANCE_LEVEL_COLORS)('uses the same configured background as template rules: $value', ({ value, trigger }) => {
    const tag = mount(PerformanceRatingTag, { props: { label: '自定义评级', color: value } })
    const template = mount(ReviewRuleConfigRenderer, { props: {
      entryMode: 'regular_question', ruleType: '评级', config: { levels: [{ id: 'custom', code: '自定义评级', color: value }] },
    } })
    const templateColor = (template.get('.level-code-pill').element as HTMLElement).style.backgroundColor
    expect((tag.element as HTMLElement).style.backgroundColor).toBe(templateColor)
    expect(performanceLevelBackground(value)).toBe(trigger)
    tag.unmount()
    template.unmount()
  })

  it('does not derive color from a star label and updates when configuration changes', async () => {
    const wrapper = mount(PerformanceRatingTag, { props: { label: '1星', color: PERFORMANCE_LEVEL_COLORS[3].value } })
    expect((wrapper.element as HTMLElement).style.backgroundColor).toBe(PERFORMANCE_LEVEL_COLORS[3].trigger)
    await wrapper.setProps({ color: PERFORMANCE_LEVEL_COLORS[8].value, label: '任意等级' })
    expect((wrapper.element as HTMLElement).style.backgroundColor).toBe(PERFORMANCE_LEVEL_COLORS[8].trigger)
    expect(wrapper.attributes('title')).toBe('任意等级')
    wrapper.unmount()
  })

  it('preserves custom colors and existing normalization and missing-color behavior', () => {
    expect(performanceLevelBackground(' RGB(251,191,188) ')).toBe(PERFORMANCE_LEVEL_COLORS[0].trigger)
    expect(performanceLevelBackground('#123456')).toBe('#123456')
    expect(performanceLevelBackground(undefined)).toBe('transparent')
    const wrapper = mount(PerformanceRatingTag, { props: { label: '无配置颜色' } })
    expect((wrapper.element as HTMLElement).style.backgroundColor).toBe('transparent')
    wrapper.unmount()
  })
})
