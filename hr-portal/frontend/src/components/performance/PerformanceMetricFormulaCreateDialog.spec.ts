import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceMetricFormulaCreateDialog from './PerformanceMetricFormulaCreateDialog.vue'

const stubs = {
  PerformanceDialogShell: {
    props: ['modelValue', 'title', 'loading'],
    emits: ['close', 'update:modelValue'],
    template: '<div v-if="modelValue" class="dialog-shell"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></div>',
  },
  PerformanceFormItem: {
    props: ['label', 'required', 'invalid', 'errorMessage'],
    template: '<div class="form-item"><label>{{ label }}<span v-if="required">*</span></label><slot /><span v-if="invalid" class="field-error">{{ errorMessage }}</span></div>',
  },
  PerformanceTextField: {
    props: ['modelValue', 'inputId', 'ariaLabel', 'invalid'],
    emits: ['update:modelValue'],
    template: '<input :id="inputId" :aria-label="ariaLabel" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  PerformanceFormulaEditor: {
    props: ['modelValue', 'invalid'],
    emits: ['update:modelValue', 'insert', 'more'],
    template: '<textarea aria-label="公式编辑器" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  PerformanceButton: {
    props: ['variant', 'type', 'loading', 'disabled', 'ariaLabel'],
    emits: ['click'],
    template: '<button :type="type || \'button\'" :aria-label="ariaLabel" :disabled="disabled || loading" @click="$emit(\'click\')"><slot /></button>',
  },
}

describe('PerformanceMetricFormulaCreateDialog', () => {
  it('renders the captured formula form and footer actions', () => {
    const wrapper = mount(PerformanceMetricFormulaCreateDialog, {
      props: { modelValue: true },
      global: { stubs },
    })

    expect(wrapper.get('h2').text()).toBe('添加评分公式')
    expect(wrapper.findAll('.form-item')[0].text()).toContain('公式名称')
    expect(wrapper.findAll('.form-item')[1].text()).toContain('公式编辑器')
    expect(wrapper.find('[aria-label="公式名称"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="公式编辑器"]').exists()).toBe(true)
    expect(wrapper.findAll('footer button').length).toBe(3)
    expect(wrapper.get('footer').text()).toContain('取消')
    expect(wrapper.get('footer').text()).toContain('确认')
  })

  it('validates required fields and emits a structured formula draft', async () => {
    const wrapper = mount(PerformanceMetricFormulaCreateDialog, {
      props: { modelValue: true },
      global: { stubs },
    })

    await wrapper.get('form').trigger('submit')
    expect(wrapper.findAll('.field-error').map(error => error.text())).toEqual(['请输入公式名称', '请输入公式内容'])

    await wrapper.get('[aria-label="公式名称"]').setValue('季度完成率')
    await wrapper.get('[aria-label="公式编辑器"]').setValue('RoundUp(score, 1)')
    await wrapper.findAll('footer button').find(button => button.text() === '确认')?.trigger('click')

    expect(wrapper.emitted('confirm')).toEqual([[{ name: '季度完成率', formula: 'RoundUp(score, 1)' }]])
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('supports edit mode with an initial formula', () => {
    const wrapper = mount(PerformanceMetricFormulaCreateDialog, {
      props: { modelValue: true, mode: 'edit', initialValue: { name: '完成率', formula: 'score / target' } },
      global: { stubs },
    })

    expect(wrapper.get('h2').text()).toBe('编辑评分公式')
    expect(wrapper.get('[aria-label="公式名称"]').attributes('value')).toBe('完成率')
    expect(wrapper.get('[aria-label="公式编辑器"]').attributes('value')).toBe('score / target')
  })
})
