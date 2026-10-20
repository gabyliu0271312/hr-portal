import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { ElPopover } from 'element-plus'
import PerformanceTimeField from './PerformanceTimeField.vue'

async function create(value = '10:00') {
  const wrapper = mount(PerformanceTimeField, { attachTo: document.body, props: { modelValue: value, 'onUpdate:modelValue': next => { void wrapper.setProps({ modelValue: next }) } }, global: { stubs: { teleport: true } } })
  wrapper.getComponent(ElPopover).vm.$emit('update:visible', true)
  await flushPromises()
  return wrapper
}

describe('PerformanceTimeField', () => {
  it('offers two independent hour and half-hour columns without changing the string on scroll', async () => {
    const wrapper = await create()
    const lists = wrapper.findAll('[role="listbox"]')
    expect(lists).toHaveLength(2)
    expect(lists[0].findAll('[role="option"]').map(item => item.text())).toEqual(Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')))
    expect(lists[1].findAll('[role="option"]').map(item => item.text())).toEqual(['00', '30'])
    await lists[0].trigger('scroll')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('input').attributes('readonly')).toBeDefined()
    expect(wrapper.findAll('.performance-time-panel__tail')).toHaveLength(2)
    wrapper.unmount()
  })

  it('updates one part at a time without closing and keeps arbitrary legacy minutes', async () => {
    const wrapper = await create('09:05')
    let lists = wrapper.findAll('[role="listbox"]')
    expect(lists[1].findAll('[role="option"]').map(item => item.text())).toEqual(['00', '05', '30'])
    await lists[0].findAll('button')[23].trigger('click')
    expect(wrapper.props('modelValue')).toBe('23:05')
    lists = wrapper.findAll('[role="listbox"]')
    await lists[1].findAll('button')[2].trigger('click')
    expect(wrapper.props('modelValue')).toBe('23:30')
    expect(wrapper.findAll('[role="listbox"]')[1].findAll('button').map(item => item.text())).toEqual(['00', '30'])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('supports keyboard selection, traps Tab and closes on Escape without bubbling', async () => {
    const wrapper = await create()
    const hours = wrapper.findAll('[role="listbox"]')[0]
    await hours.trigger('keydown', { key: 'End' })
    expect(wrapper.props('modelValue')).toBe('23:00')
    await hours.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.props('modelValue')).toBe('22:00')
    await hours.trigger('keydown', { key: 'Home' })
    expect(wrapper.props('modelValue')).toBe('00:00')
    wrapper.get('input').element.focus()
    await wrapper.get('input').trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(hours.element)
    await hours.trigger('keydown', { key: 'Tab' })
    expect(document.activeElement).toBe(wrapper.findAll('[role="listbox"]')[1].element)
    await hours.trigger('keydown', { key: 'Escape' })
    await flushPromises()
    expect(wrapper.get('input').attributes('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(wrapper.get('input').element)
    wrapper.unmount()
  })

  it('forwards invalid and disabled state and blocks changes when disabled', async () => {
    const wrapper = await create()
    await wrapper.setProps({ disabled: true, invalid: true })
    expect(wrapper.get('input').attributes('disabled')).toBeDefined()
    expect(wrapper.get('input').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('.performance-time-field').classes()).toContain('is-invalid')
    expect(wrapper.getComponent(ElPopover).props('disabled')).toBe(true)
    wrapper.unmount()
  })
})
