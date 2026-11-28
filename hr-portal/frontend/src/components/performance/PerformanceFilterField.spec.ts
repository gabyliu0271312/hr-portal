import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceFilterField from './PerformanceFilterField.vue'
import type { PerformanceFilterField as PerformanceFilterFieldDescriptor } from './performanceFilterTypes'

const stubs = {
  PerformanceFormItem: { template: '<div><slot /></div>' },
  PerformanceSearchSelect: {
    props: ['modelValue', 'options', 'multiple'],
    emits: ['update:modelValue'],
    template: '<button class="select" @click="$emit(\'update:modelValue\', multiple ? [\'enabled\'] : \'enabled\')">select</button>',
  },
  PerformancePersonSelect: {
    props: ['modelValue', 'options', 'multiple'],
    emits: ['update:modelValue'],
    template: '<button class="person" :data-model="typeof modelValue === \'string\' ? modelValue : JSON.stringify(modelValue)" @click="$emit(\'update:modelValue\', multiple ? [\'张三\'] : \'张三\')">person</button>',
  },
}

function mountField(field: PerformanceFilterFieldDescriptor, modelValue: string[]) {
  return mount(PerformanceFilterField, { props: { field, modelValue }, global: { stubs } })
}

describe('PerformanceFilterField', () => {
  it('normalizes a multiple select value to an array', async () => {
    const wrapper = mountField({ key: 'status', label: '状态', type: 'select', multiple: true, options: [] }, [])
    await wrapper.get('.select').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['enabled']])
  })

  it('normalizes a single person value to a one-item array', async () => {
    const wrapper = mountField({ key: 'manager', label: '项目管理员', type: 'person', multiple: false }, [])
    await wrapper.get('.person').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([['张三']])
  })

  it('passes a single stored value to the child as a scalar', () => {
    const wrapper = mountField({ key: 'manager', label: '项目管理员', type: 'person', multiple: false }, ['李四'])
    expect(wrapper.get('.person').attributes('data-model')).toBe('李四')
  })
})
