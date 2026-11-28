import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceDateRangePicker from './PerformanceDateRangePicker.vue'

const stubs = { Teleport: true }

function mountPicker() {
  let wrapper!: ReturnType<typeof mount>
  wrapper = mount(PerformanceDateRangePicker, {
    props: {
      modelValue: [],
      'onUpdate:modelValue': (value: string[]) => { void wrapper.setProps({ modelValue: value }) },
    },
    global: { stubs },
  })
  return wrapper
}

describe('PerformanceDateRangePicker', () => {
  it('opens a dual-month panel and emits a completed range', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.performance-date-range-picker__control').trigger('click')
    const months = wrapper.findAll('.performance-date-range-picker__month')
    expect(months).toHaveLength(2)

    const title = months[0].get('.performance-date-range-picker__title').text()
    const year = Number(title.match(/(\d{4})年/)?.[1])
    const month = Number(title.match(/(\d{1,2})月/)?.[1])
    expect(year).toBeGreaterThan(2000)

    const days = () => wrapper.findAll('.performance-date-range-picker__month')[0]
      .findAll('.performance-date-range-picker__cell')
      .filter(cell => !cell.classes().includes('is-out'))
    await days().find(cell => cell.text() === '1')!.trigger('click')
    await days().find(cell => cell.text() === '15')!.trigger('click')

    const expected = `${year}-${String(month).padStart(2, '0')}-`
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([`${expected}01`, `${expected}15`])
    expect(wrapper.find('.performance-date-range-picker__panel').exists()).toBe(false)
  })

  it('switches between month and year selection modes', async () => {
    const wrapper = mountPicker()
    await wrapper.get('.performance-date-range-picker__control').trigger('click')

    await wrapper.findAll('.performance-date-range-picker__month')[0].findAll('.performance-date-range-picker__title-btn')[1].trigger('click')
    expect(wrapper.find('.performance-date-range-picker__mode--month').exists()).toBe(true)
    expect(wrapper.findAll('.performance-date-range-picker__mode-cell')).toHaveLength(12)
    await wrapper.findAll('.performance-date-range-picker__mode-cell')[2].trigger('click')
    expect(wrapper.findAll('.performance-date-range-picker__month')[0].get('.performance-date-range-picker__title').text()).toContain('3月')

    await wrapper.findAll('.performance-date-range-picker__month')[0].findAll('.performance-date-range-picker__title-btn')[0].trigger('click')
    expect(wrapper.find('.performance-date-range-picker__mode--year').exists()).toBe(true)
    expect(wrapper.findAll('.performance-date-range-picker__mode-cell')).toHaveLength(20)
    await wrapper.findAll('.performance-date-range-picker__mode-cell')[0].trigger('click')
    expect(wrapper.find('.performance-date-range-picker__mode--year').exists()).toBe(false)
  })

  it('shows the explicit date format from the model value', () => {
    const wrapper = mount(PerformanceDateRangePicker, {
      props: { modelValue: ['2026-11-01', '2026-11-15'] },
      global: { stubs },
    })
    const inputs = wrapper.findAll('.performance-date-range-picker__input')
    expect((inputs[0].element as HTMLInputElement).value).toBe('2026/11/01')
    expect((inputs[1].element as HTMLInputElement).value).toBe('2026/11/15')
  })
})
