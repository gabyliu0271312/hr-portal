import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WorkbenchLocalizedField from './WorkbenchLocalizedField.vue'

describe('WorkbenchLocalizedField', () => {
  it('adds an editable English field and reuses native labels and max lengths', async () => {
    const wrapper = mount(WorkbenchLocalizedField, { props: { modelValue: '中文', english: '', label: '公告标题', maxlength: 128 } })
    expect(wrapper.findAll('input')).toHaveLength(1)
    await wrapper.get('button').trigger('click')
    expect(wrapper.get('input[aria-label="公告标题（英文）"]').attributes('maxlength')).toBe('128')
    await wrapper.get('input[aria-label="公告标题（英文）"]').setValue('Notice')
    expect(wrapper.emitted('update:english')?.[0]).toEqual(['Notice'])
    await wrapper.get('input[aria-label="公告标题（中文）"]').setValue('新标题')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['新标题'])
  })
  it('renders English on edit and exposes error and disabled states', () => {
    const wrapper = mount(WorkbenchLocalizedField, { props: { modelValue: '', english: 'English', label: '公告描述', maxlength: 1000, multiline: true, disabled: true, error: '描述有误', englishError: '英文有误' } })
    expect(wrapper.findAll('textarea')).toHaveLength(2)
    expect(wrapper.findAll('textarea').every(node => node.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.findAll('[aria-invalid="true"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('描述有误')
    expect(wrapper.text()).toContain('英文有误')
    expect(wrapper.get('textarea').attributes('maxlength')).toBe('1000')
  })
})
