import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceButton from './PerformanceButton.vue'
import buttonSource from './PerformanceButton.vue?raw'

describe('PerformanceButton', () => {
  it('maps variants to shared state classes and disables loading actions', () => {
    const wrapper = mount(PerformanceButton, {
      props: { variant: 'primary', loading: true },
      slots: { default: '保存' },
    })

    expect(wrapper.get('button').classes()).toContain('performance-button--primary')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('保存')
  })

  it.each([{ disabled: true }, { loading: true }])('keeps shared link actions natively disabled for %j', async state => {
    const wrapper = mount(PerformanceButton, { props: { variant: 'link', ...state }, slots: { default: '编辑' } })
    expect(wrapper.get('button').classes()).toContain('performance-button--link')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
    wrapper.unmount()
  })

  it.each(['text', 'link'] as const)('uses the shared disabled token for %s actions', async variant => {
    const wrapper = mount(PerformanceButton, { props: { variant, disabled: true }, slots: { default: '删除' } })
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('click')).toBeUndefined()
    expect(buttonSource).toContain('.performance-button--text:disabled, .performance-button--link:disabled { color: var(--performance-button-link-disabled-color); opacity: 1; }')
    wrapper.unmount()
  })

  it('emits the native click event for enabled actions', async () => {
    const wrapper = mount(PerformanceButton, { slots: { default: '取消' } })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
