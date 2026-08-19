import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceExecutorTag from './PerformanceExecutorTag.vue'
import { SUBJECT_EXECUTOR_OPTION } from './performanceExecutorOptions'

describe('PerformanceExecutorTag', () => {
  it('renders the shared executor label and stable backend-facing type', () => {
    const wrapper = mount(PerformanceExecutorTag, { props: { executor: SUBJECT_EXECUTOR_OPTION } })

    expect(wrapper.text()).toBe('被评估人')
    expect(wrapper.get('.performance-executor-tag').attributes('data-executor-type')).toBe('SUBJECT')
    expect(wrapper.get('.performance-executor-tag').classes()).toContain('ud__tag-neutral-option')
  })
})
