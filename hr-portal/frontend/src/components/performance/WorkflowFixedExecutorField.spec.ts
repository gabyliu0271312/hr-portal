import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WorkflowFixedExecutorField from './WorkflowFixedExecutorField.vue'
import { SUBJECT_EXECUTOR_OPTION } from './performanceExecutorOptions'

describe('WorkflowFixedExecutorField', () => {
  it('renders the required executor field by composing the shared tag', () => {
    const wrapper = mount(WorkflowFixedExecutorField, { props: { executor: SUBJECT_EXECUTOR_OPTION } })

    expect(wrapper.get('h4').text()).toBe('环节执行人')
    expect(wrapper.get('.workflow-fixed-executor-field__required').text()).toBe('*')
    expect(wrapper.get('.performance-executor-tag').text()).toBe('被评估人')
  })

  it('supports reuse for a differently labelled optional fixed executor field', () => {
    const wrapper = mount(WorkflowFixedExecutorField, {
      props: { executor: SUBJECT_EXECUTOR_OPTION, label: '默认执行人', required: false },
    })

    expect(wrapper.get('h4').text()).toBe('默认执行人')
    expect(wrapper.find('.workflow-fixed-executor-field__required').exists()).toBe(false)
  })
})
