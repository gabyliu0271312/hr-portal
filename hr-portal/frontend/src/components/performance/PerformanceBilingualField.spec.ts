import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceBilingualField from './PerformanceBilingualField.vue'

describe('PerformanceBilingualField', () => {
  it('renders label, required mark, chinese row and add-english button', () => {
    const wrapper = mount(PerformanceBilingualField, {
      props: { modelValue: { zh: '', en: '' }, label: '名称', required: true },
    })
    expect(wrapper.text()).toContain('名称')
    expect(wrapper.text()).toContain('*')
    expect(wrapper.text()).toContain('中文')
    expect(wrapper.text()).toContain('添加英文')
    expect(wrapper.findAll('.language-tag')).toHaveLength(1)
  })

  it('reveals the english row and hides the add button on click', async () => {
    const wrapper = mount(PerformanceBilingualField, {
      props: { modelValue: { zh: '', en: '' }, label: '名称' },
    })
    await wrapper.get('.performance-bilingual-field__add').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.language-tag')).toHaveLength(2)
    expect(wrapper.find('.performance-bilingual-field__add').exists()).toBe(false)
  })

  it('pre-reveals the english row when initial en is non-empty', () => {
    const wrapper = mount(PerformanceBilingualField, {
      props: { modelValue: { zh: '', en: 'English' }, label: '名称' },
    })
    expect(wrapper.findAll('.language-tag')).toHaveLength(2)
    expect(wrapper.find('.performance-bilingual-field__add').exists()).toBe(false)
  })

  it('emits updated zh value from the chinese input', async () => {
    const wrapper = mount(PerformanceBilingualField, {
      props: { modelValue: { zh: '', en: '' }, label: '名称' },
    })
    const input = wrapper.get('input')
    await input.setValue('评估角色')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ zh: '评估角色', en: '' }])
  })

  it('renders a counted textarea row in textarea mode with count suffix', () => {
    const wrapper = mount(PerformanceBilingualField, {
      props: { modelValue: { zh: '描述内容', en: '' }, label: '描述', type: 'textarea', maxLength: 2000 },
    })
    expect(wrapper.text()).toContain('描述')
    expect(wrapper.text()).toContain('中文')
    expect(wrapper.find('textarea').exists()).toBe(true)
    expect(wrapper.text()).toMatch(/0\/2000|2000/)
  })
})
