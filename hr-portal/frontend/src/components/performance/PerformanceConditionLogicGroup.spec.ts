import { h } from 'vue'
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PerformanceConditionLogicGroup from './PerformanceConditionLogicGroup.vue'

const mountGroup = (count: number, operator: '且' | '或') => mount(PerformanceConditionLogicGroup, {
  props: { count, operator },
  slots: { default: ({ index }: { index: number }) => h('div', { class: 'condition-row' }, String(index)) },
})

describe('PerformanceConditionLogicGroup', () => {
  it('shows a vertical AND rail spanning all rows but omits it for one row', () => {
    const single = mountGroup(1, '且')
    expect(single.find('.performance-condition-logic-group__rail').exists()).toBe(false)
    const multiple = mountGroup(3, '且')
    expect(multiple.get('.performance-condition-logic-group__rail').text()).toBe('且')
    expect(multiple.get('.performance-condition-logic-group__rows').element.children).toHaveLength(3)
    expect(multiple.get('.performance-condition-logic-group__rows').element.parentElement?.className).toBe('performance-condition-logic-group')
  })

  it('renders only the original bracket node when railOnly is enabled', () => {
    const wrapper = mount(PerformanceConditionLogicGroup, { props: { count: 2, operator: '或', railOnly: true } })
    expect(wrapper.classes()).toContain('performance-condition-logic-group__rail')
    expect(wrapper.findAll('span')).toHaveLength(3)
    expect(wrapper.find('.performance-condition-logic-group__rows').exists()).toBe(false)
  })

  it('shows the same rail for OR groups', () => {
    expect(mountGroup(2, '或').get('.performance-condition-logic-group__rail').text()).toBe('或')
  })
})
