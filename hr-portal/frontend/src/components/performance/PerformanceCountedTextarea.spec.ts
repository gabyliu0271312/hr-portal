import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceCountedTextarea from './PerformanceCountedTextarea.vue'

describe('PerformanceCountedTextarea', () => {
  it('reuses the input with an accessible hidden label and language badge', async () => {
    const wrapper = mount(PerformanceCountedTextarea, {
      props: { modelValue: '', label: '中文授权提示', maxLength: 1000, inputId: 'zh', hideLabel: true, language: '中文', height: '116px' },
    })
    expect(wrapper.get('label').attributes('for')).toBe('zh')
    expect(wrapper.get('.performance-counted-textarea__label').classes()).toContain('is-hidden')
    expect(wrapper.get('.performance-counted-textarea__language').text()).toBe('中文')
    expect(wrapper.find('.performance-counted-textarea__count').exists()).toBe(false)
    expect(wrapper.get('textarea').element.style.height).toBe('116px')
    await wrapper.get('textarea').setValue('😀'.repeat(1001))
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toBe('😀'.repeat(1000))
    await wrapper.setProps({ modelValue: '😀', language: '', hideLabel: false })
    expect(wrapper.get('.performance-counted-textarea__count').text()).toBe('1/1000')
  })

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
