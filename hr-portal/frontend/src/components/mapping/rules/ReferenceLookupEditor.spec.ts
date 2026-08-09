import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReferenceLookupEditor from './ReferenceLookupEditor.vue'

const policy = {
  referenceLookup: {
    allowedDatasetIds: ['ref_employee', 'ref_customer'],
    allowedFieldIds: ['employee_no', 'customer_code', 'expense_type'],
  },
}

const rule = () => ({
  sourceFields: ['employee_no'],
  targetFields: ['expense_type'],
  config: {
    referenceDatasetId: 'ref_employee',
    outputMap: { expense_type: 'expense_type' },
    matchRules: [{ id: 'match-1', priority: 0, sourceField: 'employee_no', referenceField: 'employee_no', conditions: {}, onMatch: 'use_and_stop' }],
    unmatched: 'set_default',
    defaultValue: '工资',
  },
})

const stubs = {
  'el-form-item': { props: ['label'], template: '<label><span>{{ label }}</span><slot /></label>' },
  'el-select': { props: ['modelValue', 'placeholder'], emits: ['update:modelValue', 'change'], template: '<select :data-placeholder="placeholder"><slot /></select>' },
  'el-option': { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
  'el-input': { props: ['modelValue', 'placeholder', 'type', 'rows'], emits: ['update:modelValue', 'change', 'input'], template: '<input :data-placeholder="placeholder" :value="modelValue" />' },
  'el-input-number': { props: ['modelValue'], template: '<input type="number" :value="modelValue" />' },
  'el-button': { props: ['disabled', 'link', 'type'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
}

describe('ReferenceLookupEditor policy catalog', () => {
  it('only renders server-allowed dataset and reference-field options', () => {
    const wrapper = mount(ReferenceLookupEditor, {
      props: { rule: rule(), sourceFields: [{ code: 'employee_no', label: '工号' }], targetFields: [{ code: 'expense_type', label: '费用类型' }], policy },
      global: { stubs },
    })
    const options = wrapper.findAll('option').map((option) => option.text())
    expect(options).toEqual(expect.arrayContaining(['ref_employee', 'ref_customer', 'employee_no', 'customer_code', 'expense_type']))
    expect(options).not.toContain('arbitrary_dataset')
  })

  it('clears untrusted dataset and dependent fields fail-closed', () => {
    const unsafe = rule()
    unsafe.config.referenceDatasetId = 'arbitrary_dataset'
    const wrapper = mount(ReferenceLookupEditor, {
      props: { rule: unsafe, sourceFields: ['employee_no'], targetFields: ['expense_type'], policy },
      global: { stubs },
    })
    ;(wrapper.vm as any).changedReferenceDataset()
    expect(unsafe.config.referenceDatasetId).toBe('')
    expect(unsafe.config.outputMap).toEqual({})
    expect(unsafe.config.matchRules).toEqual([])
    expect(wrapper.emitted('change')).toHaveLength(1)
  })

  it('keeps outputMap direction as outputField to referenceField', () => {
    const current = rule()
    const wrapper = mount(ReferenceLookupEditor, {
      props: { rule: current, sourceFields: ['employee_no'], targetFields: ['expense_type'], policy },
      global: { stubs },
    })
    expect(current.config.outputMap).toEqual({ expense_type: 'expense_type' })
    ;(wrapper.vm as any).renameOutput('expense_type', 'expense_category')
    expect(current.config.outputMap).toEqual({ expense_category: 'expense_type' })
  })
})
