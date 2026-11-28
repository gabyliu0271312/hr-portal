import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceFilterActions from './PerformanceFilterActions.vue'

describe('PerformanceFilterActions', () => {
  it('renders confirm, cancel and clear in reverse flex order and emits actions', async () => {
    const wrapper = mount(PerformanceFilterActions)
    const buttons = wrapper.findAll('button')
    expect(buttons.map(button => button.text())).toEqual(['确定', '取消', '清除'])
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    await buttons[2].trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })

  it('hides clear and disables confirm when requested', () => {
    const wrapper = mount(PerformanceFilterActions, { props: { showClear: false, confirmDisabled: true } })
    expect(wrapper.findAll('button').map(button => button.text())).toEqual(['确定', '取消'])
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
  })

  it('uses small buttons by default and default-size buttons when requested', () => {
    const small = mount(PerformanceFilterActions)
    expect(small.get('.performance-filter-actions').classes()).not.toContain('performance-filter-actions--wide')
    expect(small.findAll('.performance-button').every(button => button.classes().includes('is-small'))).toBe(true)

    const wide = mount(PerformanceFilterActions, { props: { size: 'default' } })
    expect(wide.get('.performance-filter-actions').classes()).toContain('performance-filter-actions--wide')
    expect(wide.findAll('.performance-button').every(button => !button.classes().includes('is-small'))).toBe(true)
  })
})
