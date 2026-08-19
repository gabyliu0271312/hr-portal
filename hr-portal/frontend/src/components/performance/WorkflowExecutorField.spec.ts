import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import WorkflowExecutorField from './WorkflowExecutorField.vue'
import {
  RESULT_COMMUNICATION_EXECUTOR_OPTIONS,
  REVIEWER_360_CONFIRM_MANAGER_LEVEL_OPTIONS,
} from './performanceExecutorOptions'

describe('WorkflowExecutorField', () => {
  it('renders a configurable shared executor field and emits manager-level changes', async () => {
    const wrapper = mount(WorkflowExecutorField, {
      props: {
        modelValue: '实线上级',
        executorTypes: ['DIRECT_MANAGER'],
        options: RESULT_COMMUNICATION_EXECUTOR_OPTIONS,
        managerLevelOptions: REVIEWER_360_CONFIRM_MANAGER_LEVEL_OPTIONS,
      },
    })

    expect(wrapper.get('.form-label').text()).toBe('环节执行人*')
    expect(wrapper.findAll('.check-row').map(row => row.text())).toEqual(['直属上级', '隔 1 级上级', '隔 2 级上级'])

    await wrapper.findAll('.ud__checkbox__input')[1].setValue(true)
    expect(wrapper.emitted('update:executorTypes')?.at(-1)).toEqual([['DIRECT_MANAGER', 'LEVEL_1_MANAGER']])
  })

  it('hides manager levels when the shared selector uses a virtual manager', () => {
    const wrapper = mount(WorkflowExecutorField, {
      props: {
        modelValue: '虚线上级',
        executorTypes: ['DIRECT_MANAGER'],
        options: RESULT_COMMUNICATION_EXECUTOR_OPTIONS,
        managerLevelOptions: REVIEWER_360_CONFIRM_MANAGER_LEVEL_OPTIONS,
      },
    })

    expect(wrapper.find('.sub-options').exists()).toBe(false)
  })
})
