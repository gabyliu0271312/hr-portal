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
  it('reuses the calendar in date-only mode without time controls or automatic selection', async () => {
    wrapper = mount(PerformanceDateTimeField, {
      attachTo: document.body,
      props: { modelValue: '', dateOnly: true, initialDate: '2020-01-01', ariaLabel: '入职日期' },
    })
    await wrapper.get('input').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('open')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(document.body.querySelector('.performance-datetime-calendar__heading')?.textContent).toContain('2020年')
    expect(document.body.querySelector('.performance-datetime-time')).toBeNull()
    await wrapper.setProps({ initialDate: '2020-02-01' })
    expect(document.body.querySelector('.performance-datetime-calendar__heading')?.textContent).toContain('2月')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    document.body.querySelector<HTMLButtonElement>('[data-date="2020-02-15"]')!.click()
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('.performance-datetime-panel__confirm')!.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2020-02-15'])
    await wrapper.get('input').setValue('2026-02-30')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2026-02-30'])
    expect(wrapper.get('input').element.validationMessage).toContain('请输入有效日期')
  })

  it('displays a space instead of T and defaults selected start/end dates to boundary times', async () => {
    wrapper = mount(PerformanceDateTimeField, {
      attachTo: document.body,
      props: { modelValue: '2026-10-14T09:30', timeRole: 'start' },
    })

    expect(wrapper.get('input').element.value).toBe('2026-10-14 09:30')
    await wrapper.get('input').trigger('click')
    await flushPromises()
    document.body.querySelector<HTMLButtonElement>('[data-date="2026-10-20"]')?.click()
    document.body.querySelector<HTMLButtonElement>('.performance-datetime-panel__confirm')?.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['2026-10-20T00:00'])

    wrapper.unmount()
    await new Promise(resolve => setTimeout(resolve, 220))
    wrapper = mount(PerformanceDateTimeField, {
      attachTo: document.body,
      props: { modelValue: '', timeRole: 'end' },
    })
    await wrapper.get('input').trigger('click')
    await flushPromises()
    expect(document.body.querySelectorAll('.performance-datetime-panel')).toHaveLength(1)
    document.body.querySelector<HTMLButtonElement>('[data-date]')?.click()
    await flushPromises()
    expect(document.body.querySelector<HTMLButtonElement>('.performance-datetime-panel__confirm')?.disabled).toBe(false)
    document.body.querySelector<HTMLButtonElement>('.performance-datetime-panel__confirm')?.click()
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toMatch(/^\d{4}-\d{2}-\d{2}T23:59$/)
  })

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
