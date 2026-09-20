import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ReviewQuestionFormType from './ReviewQuestionFormType.vue'

function mountType(entryMode: 'regular_question' | 'sub_question') {
  return mount(ReviewQuestionFormType, {
    props: { modelValue: 'regular', entryMode },
    global: {
      stubs: {
        PerformanceRadioGroup: {
          props: ['options'],
          template: '<div><span v-for="option in options" :key="option.value">{{ option.label }}</span></div>',
        },
      },
    },
  })
}

describe('ReviewQuestionFormType entry variants', () => {
  it('shows four types for ordinary questions', () => {
    expect(mountType('regular_question').text()).toContain('OKR 评估项')
  })

  it('removes OKR for sub-questions while reusing the same component', () => {
    const text = mountType('sub_question').text()
    expect(text).toContain('常规评估项')
    expect(text).toContain('加分项')
    expect(text).toContain('减分项')
    expect(text).not.toContain('OKR 评估项')
  })
})
