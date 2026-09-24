import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceSubjectVisibilityEditor from './PerformanceSubjectVisibilityEditor.vue'

const stubs = {
  PerformanceDialogShell: {
    props: ['modelValue', 'title', 'loading'],
    emits: ['update:modelValue', 'close'],
    template: '<section v-if="modelValue" class="dialog"><h2>{{ title }}</h2><slot /><slot name="footer" /></section>',
  },
  PerformanceCheckbox: {
    props: ['modelValue', 'label', 'disabled'],
    emits: ['update:modelValue'],
    template: '<button class="field" :disabled="disabled" @click="$emit(\'update:modelValue\', !modelValue)">{{ label }}:{{ modelValue }}</button>',
  },
}

const role = { role_key: 'reviewee', role_name: '被评估人', visible_labels: [], visible_fields: ['department'] }
const options = [{ key: 'department', label: '部门' }, { key: 'position_level', label: '职级' }]

describe('PerformanceSubjectVisibilityEditor', () => {
  it('reuses shared dialog and checkbox controls and emits ordered fields', async () => {
    const wrapper = mount(PerformanceSubjectVisibilityEditor, {
      props: { modelValue: true, role, fieldOptions: options },
      global: { stubs },
    })

    expect(wrapper.get('.dialog h2').text()).toBe('编辑被评估人可见字段')
    expect(wrapper.findAll('.field').map(field => field.text())).toEqual(['部门:true', '职级:false'])
    await wrapper.findAll('.field')[1].trigger('click')
    await wrapper.findAll('.subject-visibility-editor__actions button')[1].trigger('click')

    expect(wrapper.emitted('submit')).toEqual([[['department', 'position_level']]])
  })

  it('cancels without submitting', async () => {
    const wrapper = mount(PerformanceSubjectVisibilityEditor, {
      props: { modelValue: true, role, fieldOptions: options },
      global: { stubs },
    })
    await wrapper.findAll('.subject-visibility-editor__actions button')[0].trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(wrapper.emitted('submit')).toBeUndefined()
  })
})
