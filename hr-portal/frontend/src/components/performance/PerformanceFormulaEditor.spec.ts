import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import editorSource from './PerformanceFormulaEditor.vue?raw'
import PerformanceFormulaEditor from './PerformanceFormulaEditor.vue'

describe('PerformanceFormulaEditor', () => {
  it('renders the captured resource tabs and shows Int details only while hovered', async () => {
    const wrapper = mount(PerformanceFormulaEditor, { props: { modelValue: '' } })

    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('函数')
    expect(wrapper.findAll('.formula-resource-item').map(item => item.text().trim())).toEqual([
      'Int插入',
      'Round插入',
      'RoundUp插入',
      'RoundDown插入',
      'Ceiling插入',
      'Floor插入',
      'Max插入',
      'Min插入',
      'IsNull插入',
    ])
    expect(wrapper.find('.formula-resource-description').exists()).toBe(false)
    await wrapper.get('.formula-resource-item').trigger('mouseenter')
    expect(wrapper.get('.formula-resource-description__title').text()).toBe('Int(数字)')
    expect(wrapper.get('.formula-resource-description__tips').text()).toContain('向下取整')
    expect(wrapper.get('.formula-resource-example__row').text()).toBe('99.44')
    expect(wrapper.get('.formula-resource-example__result').text()).toContain('返回值')
    expect(wrapper.get('.formula-resource-example__result span').text()).toBe('返回值')
    expect(wrapper.find('.formula-resource-example__result svg').exists()).toBe(true)
    await wrapper.get('.formula-resource-item').trigger('mouseleave')
    expect(wrapper.find('.formula-resource-description').exists()).toBe(false)
    expect(wrapper.find('.formula-resource-more').exists()).toBe(false)
    expect(wrapper.get('.performance-search-input').attributes('style')).toContain('var(--performance-formula-resource-search-width)')
    expect(wrapper.find('textarea[placeholder^="1. 可直接输入函数"]').exists()).toBe(true)
    expect(editorSource).toContain('font: 400 var(--font-size-md)/30px var(--font-sans)')
    expect(editorSource).toContain('textarea::placeholder { color: var(--color-text-primary); opacity: 1; }')
  })

  it('filters resources and emits the inserted function', async () => {
    const wrapper = mount(PerformanceFormulaEditor, { props: { modelValue: '' } })
    const search = wrapper.get('input[placeholder="搜索"]')

    await search.setValue('round')
    expect(wrapper.findAll('.formula-resource-item').map(item => item.text().trim())).toEqual([
      'Round插入',
      'RoundUp插入',
      'RoundDown插入',
    ])

    const round = wrapper.get('.formula-resource-item')
    await round.trigger('mouseenter')
    expect(wrapper.get('.formula-resource-description__title').text()).toBe('Round')
    await round.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['Round'])
    expect(wrapper.emitted('insert')?.at(-1)?.[0]).toMatchObject({ name: 'Round' })
    await round.trigger('mouseleave')
    expect(wrapper.find('.formula-resource-description').exists()).toBe(false)
    expect(wrapper.findAll('.formula-resource-item.is-selected')).toHaveLength(0)
    expect(editorSource).toContain('.formula-resource-item:hover { background:')
    expect(editorSource).not.toContain('.formula-resource-item.is-selected { background:')
  })

  it('keeps unprovided fields empty and renders captured operators without duplicates', async () => {
    const wrapper = mount(PerformanceFormulaEditor, { props: { modelValue: '' } })

    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click')
    expect(wrapper.get('.formula-resource-empty').text()).toBe('暂无数据')
    await wrapper.get('[role="tab"]:nth-child(3)').trigger('click')
    expect(wrapper.findAll('.formula-resource-item__name').map(item => item.text())).toEqual([
      '+', '-', '*', '/', '==', '!=', '<', '<=', 'and', 'or', 'if', 'then', 'else',
    ])

    const plus = wrapper.get('.formula-resource-item')
    expect(wrapper.find('.formula-resource-description').exists()).toBe(false)
    await plus.trigger('mouseenter')
    expect(wrapper.get('.formula-resource-description__title').text()).toBe('+')
    expect(wrapper.get('.formula-resource-example__title').text()).toBe('示例')
    expect(wrapper.get('.formula-resource-example__code').text()).toBe('')
    expect(wrapper.find('.formula-resource-description__tips').exists()).toBe(false)
    await plus.trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['+'])
    await plus.trigger('mouseleave')
    expect(wrapper.find('.formula-resource-description').exists()).toBe(false)
    expect(editorSource).toContain('background: var(--performance-formula-resource-hover-bg); color: var(--color-primary)')
  })
})
