import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceCountedTextarea from './PerformanceCountedTextarea.vue'

describe('PerformanceCountedTextarea', () => {
  it('renders the counter inside the resizable textarea wrapper', async () => {
    const wrapper = mount(PerformanceCountedTextarea, {
      props: { modelValue: '复议说明', label: '提示文案', maxLength: 5, inputId: 'prompt', required: true },
    })

    expect(wrapper.get('.performance-counted-textarea__control').find('.performance-counted-textarea__suffix').exists()).toBe(true)
    expect(wrapper.get('.performance-counted-textarea__count').text()).toBe('4/5')
    expect(wrapper.get('textarea').attributes('maxlength')).toBeUndefined()

    await wrapper.get('textarea').setValue('超过五个字符限制')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('超过五个字')
  })
})
