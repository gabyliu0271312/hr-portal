import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'

let wrapper: ReturnType<typeof mount> | undefined

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  document.body.innerHTML = ''
})

describe('PerformanceDateTimeField', () => {
  it('opens the custom calendar and commits the selected date and time', async () => {
    wrapper = mount(PerformanceDateTimeField, {
      attachTo: document.body,
      props: { modelValue: '2026-10-14T09:30', inputId: 'cycle-start' },
    })

    await wrapper.get('#cycle-start').trigger('click')
    await flushPromises()

    const panel = document.body.querySelector('.performance-datetime-panel')
    expect(panel).not.toBeNull()
    expect(panel?.querySelectorAll('[data-date]').length).toBe(42)
    expect(panel?.querySelectorAll('[data-time^="hour-"]').length).toBe(24)
    expect(panel?.querySelectorAll('[data-time^="minute-"]').length).toBe(60)

    panel?.querySelector<HTMLButtonElement>('[data-date="2026-10-20"]')?.click()
    panel?.querySelector<HTMLButtonElement>('[data-time="hour-15"]')?.click()
    panel?.querySelector<HTMLButtonElement>('[data-time="minute-45"]')?.click()
    panel?.querySelector<HTMLButtonElement>('.performance-datetime-panel__confirm')?.click()
    await flushPromises()

    expect(wrapper.emitted('update:modelValue')).toEqual([['2026-10-20T15:45']])
    await new Promise(resolve => setTimeout(resolve, 220))
    expect(document.body.querySelector('.performance-datetime-panel')).toBeNull()
  })

  it('keeps the original value when cancelling or clicking outside', async () => {
    wrapper = mount(PerformanceDateTimeField, {
      attachTo: document.body,
      props: { modelValue: '2026-10-14T09:30' },
    })

    await wrapper.get('input').trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.performance-datetime-panel__cancel')?.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.get('input').trigger('click')
    await flushPromises()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 220))
    expect(document.body.querySelector('.performance-datetime-panel')).toBeNull()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('moves the calendar between months and preserves the input contract', async () => {
    wrapper = mount(PerformanceDateTimeField, {
      attachTo: document.body,
      props: { modelValue: '2026-01-31T00:00' },
    })

    await wrapper.get('input').trigger('click')
    await flushPromises()
    const nextMonth = document.body.querySelector<HTMLButtonElement>('[aria-label="下一月"]')
    nextMonth?.click()
    await flushPromises()

    expect(document.body.querySelector('.performance-datetime-calendar__heading')?.textContent).toContain('2月')
    expect(wrapper.get('input').attributes('type')).toBe('text')
    expect(wrapper.get('input').attributes('aria-haspopup')).toBe('dialog')
  })
})
