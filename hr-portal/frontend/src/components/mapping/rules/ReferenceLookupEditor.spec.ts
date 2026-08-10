import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReferenceLookupEditor from './ReferenceLookupEditor.vue'

const policy = {
  referenceLookup: {
    allowedDatasetIds: ['ref_employee', 'ref_customer'],
    allowedFieldIds: ['employee_no', 'customer_code', 'expense_type'],
    datasetFields: { ref_employee: ['employee_no', 'expense_type'], ref_customer: ['customer_code'] },
    datasetLabels: { ref_employee: 'ref_employee', ref_customer: 'ref_customer' },
  },
}

const rule = () => ({
  sourceFields: ['employee_no'],
  targetFields: ['expense_type'],
  config: {
    lookupConfigs: [{ id: 'lookup-1', priority: 10, referenceDatasetId: 'ref_employee', sourceField: 'employee_no', referenceMatchField: 'employee_no', referenceReturnField: 'expense_type', targetField: 'expense_type', conditions: {} }],
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
  'el-divider': { template: '<hr />' },
}

describe('ReferenceLookupEditor policy catalog', () => {
  it('only renders server-allowed dataset and reference-field options', () => {
    const wrapper = mount(ReferenceLookupEditor, {
      props: { rule: rule(), sourceFields: [{ code: 'employee_no', label: '工号' }], targetFields: [{ code: 'expense_type', label: '费用类型' }], policy },
      global: { stubs },
    })
    const options = wrapper.findAll('option').map((option) => option.text())
    expect(options).toEqual(expect.arrayContaining(['ref_employee', 'ref_customer', 'employee_no', 'expense_type']))
    expect(options).not.toContain('customer_code')
    expect(options).not.toContain('arbitrary_dataset')
  })

  it('clears untrusted dataset and dependent fields fail-closed', () => {
    const unsafe = rule()
    unsafe.config.lookupConfigs[0].referenceDatasetId = 'arbitrary_dataset'
    const wrapper = mount(ReferenceLookupEditor, {
      props: { rule: unsafe, sourceFields: ['employee_no'], targetFields: ['expense_type'], policy },
      global: { stubs },
    })
    expect(unsafe.config.lookupConfigs[0].referenceDatasetId).toBe('')
    expect(unsafe.config.lookupConfigs[0].referenceMatchField).toBe('')
    expect(unsafe.config.lookupConfigs[0].referenceReturnField).toBe('')
    expect(wrapper.emitted('change')).toHaveLength(1)
  })

  it('keeps one shared target field across Lookup configurations', () => {
    const current = rule()
    current.config.lookupConfigs.push({ id: 'lookup-2', priority: 20, referenceDatasetId: 'ref_customer', sourceField: 'employee_no', referenceMatchField: 'customer_code', referenceReturnField: 'expense_type', targetField: '', conditions: {} })
    const wrapper = mount(ReferenceLookupEditor, {
      props: { rule: current, sourceFields: ['employee_no'], targetFields: ['expense_type'], policy },
      global: { stubs },
    })
    ;(wrapper.vm as any).syncTarget('expense_category')
    expect(current.config.lookupConfigs.map((item: any) => item.targetField)).toEqual(['expense_category', 'expense_category'])
    expect(current.targetFields).toEqual(['expense_category'])
  })
})
