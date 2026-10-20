import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceAuthorizationDialog from './PerformanceAuthorizationDialog.vue'

const stubs = {
  PerformanceDialogShell: {
    props: ['modelValue', 'title'],
    emits: ['update:modelValue'],
    template: '<div v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot /><slot name="footer" /></div>',
  },
  PerformanceFormItem: { props: ['label'], template: '<div class="form-item"><label>{{ label }}</label><slot /></div>' },
  PerformanceSearchSelect: { props: ['placeholder', 'disabled'], template: '<div class="select" :aria-disabled="disabled">{{ placeholder }}</div>' },
  PerformanceButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
}

describe('PerformanceAuthorizationDialog', () => {
  it('renders the add authorization shell with disabled data controls', () => {
    const wrapper = mount(PerformanceAuthorizationDialog, { props: { modelValue: true, mode: 'users' }, global: { stubs } })
    expect(wrapper.get('[role="dialog"] h2').text()).toBe('添加授权')
    expect(wrapper.text()).toContain('选择用户')
    expect(wrapper.text()).toContain('授权角色')
    expect(wrapper.findAll('.select')).toHaveLength(2)
    expect(wrapper.findAll('button')[1].attributes('disabled')).toBeDefined()
  })

  it('switches copy for the rule authorization shell', () => {
    const wrapper = mount(PerformanceAuthorizationDialog, { props: { modelValue: true, mode: 'rules' }, global: { stubs } })
    expect(wrapper.get('[role="dialog"] h2').text()).toBe('添加规则')
    expect(wrapper.text()).toContain('用户范围')
  })
})
