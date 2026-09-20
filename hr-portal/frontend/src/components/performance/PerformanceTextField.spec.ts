import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceTextField from './PerformanceTextField.vue'

describe('PerformanceTextField', () => {
  it('grows a textarea to its content without a scrollbar', async () => {
    const wrapper = mount(PerformanceTextField, { props: { modelValue: '', type: 'textarea' } })
    const textarea = wrapper.get('textarea')
    Object.defineProperty(textarea.element, 'scrollHeight', { configurable: true, value: 126 })
    await textarea.setValue('第一行\n第二行\n第三行')

    expect(textarea.element.style.height).toBe('126px')
  })
})
