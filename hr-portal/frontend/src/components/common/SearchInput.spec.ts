import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import SearchInput from './SearchInput.vue'
import searchInputSource from './SearchInput.vue?raw'

describe('SearchInput', () => {
  it('renders placeholder and emits update:modelValue on input', async () => {
    const wrapper = mount(SearchInput, { props: { modelValue: '', placeholder: '搜索' } })
    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toBe('搜索')
    await input.setValue('张三')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['张三'])
  })

  it('shows clear button only when value exists, and emits clear on click', async () => {
    const wrapper = mount(SearchInput, { props: { modelValue: 'abc', placeholder: '搜索' } })
    const clearBtn = wrapper.find('button')
    expect(clearBtn.exists()).toBe(true)
    await clearBtn.trigger('click')
    expect(wrapper.emitted('clear')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([''])
  })

  it('emits search on Enter', async () => {
    const wrapper = mount(SearchInput, { props: { modelValue: 'abc', placeholder: '搜索' } })
    await wrapper.find('input').trigger('keyup.enter')
    expect(wrapper.emitted('search')).toBeTruthy()
  })

  it('uses shared control tokens, not performance-scoped ones', () => {
    expect(searchInputSource).toMatch(/var\(--control-height\)/)
    expect(searchInputSource).toMatch(/var\(--control-border\)/)
    expect(searchInputSource).toMatch(/var\(--control-radius\)/)
    expect(searchInputSource).toMatch(/var\(--input-padding-x\)/)
    expect(searchInputSource).not.toMatch(/performance-/)
  })
})
