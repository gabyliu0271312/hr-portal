import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import UiTag from './UiTag.vue'
import tagSource from './UiTag.vue?raw'

describe('UiTag', () => {
  it('renders the shared neutral tag shell with slotted text', () => {
    const wrapper = mount(UiTag, { slots: { default: '部门' } })

    expect(wrapper.get('.ui-tag').classes()).toEqual(expect.arrayContaining(['ud__tag', 'ud__tag-md', 'ud__tag-rect', 'ud__tag-neutral-option']))
    expect(wrapper.get('.ui-tag__content').text()).toBe('部门')
  })

  it('reads tag geometry and colors from the shared tokens', () => {
    expect(tagSource).toContain('var(--ui-tag-height)')
    expect(tagSource).toContain('var(--ui-tag-padding-x)')
    expect(tagSource).toContain('var(--ui-tag-radius)')
    expect(tagSource).toContain('var(--ui-tag-background)')
    expect(tagSource).toContain('var(--ui-tag-text)')
    expect(tagSource).toContain('var(--ui-tag-line-height)')
  })
})
