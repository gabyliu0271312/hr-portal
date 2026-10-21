import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceTextField from './PerformanceTextField.vue'
import textFieldSource from './PerformanceTextField.vue?raw'

describe('PerformanceTextField', () => {
  it('fits the shared compact Feishu input to its container and emits edits', async () => {
    const wrapper = mount(PerformanceTextField, { props: { modelValue: '页面名称', variant: 'feishu-input', width: '272px', ariaLabel: '页面名称' } })
    expect(wrapper.find('.feishu-input-wrap').exists()).toBe(true)
    expect(wrapper.get('input').attributes('aria-label')).toBe('页面名称')
    expect(textFieldSource).toContain('width: 100%; min-width: 20px;')
    expect(textFieldSource).not.toContain('width: 730.333px')
    await wrapper.get('input').setValue('修改后的页面')
    expect(wrapper.emitted('update:modelValue')).toEqual([['修改后的页面']])
  })
  it('grows a textarea to its content without a scrollbar', async () => {
    const wrapper = mount(PerformanceTextField, { props: { modelValue: '', type: 'textarea' } })
    const textarea = wrapper.get('textarea')
    Object.defineProperty(textarea.element, 'scrollHeight', { configurable: true, value: 126 })
    await textarea.setValue('第一行\n第二行\n第三行')

    expect(textarea.element.style.height).toBe('126px')
  })
})
