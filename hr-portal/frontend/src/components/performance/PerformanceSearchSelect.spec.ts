import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceMultiSelect from './PerformanceMultiSelect.vue'
import PerformanceRoleMultiSelect from './PerformanceRoleMultiSelect.vue'
import PerformanceSelectShell from './PerformanceSelectShell.vue'

const options = ['1', '2', '3', '4', '5', '6', '7'].map(value => ({ value, label: `周${value}` }))
const stubs = { Teleport: true, ElPopover: { template: '<div><slot name="reference" /><slot /></div>' } }
afterEach(() => { vi.restoreAllMocks() })

function mockLayout(initialWidth = 160) {
  let width = initialWidth
  const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const size = this.classList.contains('performance-select-shell__content') ? width
      : this.classList.contains('performance-select-shell__measure-tag') ? 60
        : this.classList.contains('performance-select-shell__overflow-count') ? 28 : 6
    return { x: 0, y: 0, top: 0, left: 0, right: size, bottom: 28, width: size, height: 28, toJSON: () => ({}) }
  })
  return { spy, resize: (next: number) => { width = next } }
}
function create(values: string[], width = 160) {
  const layout = mockLayout(width)
  const wrapper = mount(PerformanceSearchSelect, {
    props: { modelValue: values, options, multiple: true, 'onUpdate:modelValue': value => { void wrapper.setProps({ modelValue: value }) } },
    global: { stubs },
  })
  return { wrapper, layout }
}
const visibleLabels = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('.performance-select-shell__content > .performance-select-shell__tag > .performance-select-shell__tag-content').map(tag => tag.text())

describe('shared performance selectors', () => {
  it('supports detailed single options and a shared footer without changing ordinary selectors', async () => {
    const wrapper = mount(PerformanceSearchSelect, {
      props: { modelValue: '1', selectionStyle: 'plain', optionLayout: 'detailed', ariaLabel: '目标周期', options: [{ value: '1', label: '全年', subLabel: '2026-01-01 - 2026-12-31' }] },
      slots: { footer: '<button>新建</button>' },
      global: { stubs },
    })
    await wrapper.get('.performance-select-shell__selector').trigger('click')
    expect(wrapper.get('[role="listbox"]').classes()).toContain('performance-flat-option-list--detailed')
    expect(wrapper.get('.performance-flat-option-list__sub').text()).toBe('2026-01-01 - 2026-12-31')
    expect(wrapper.get('.performance-flat-option-list__footer').text()).toBe('新建')
    await wrapper.get('[role="option"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['1'])
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })
  it('locks referenced tags and clear while allowing other tags to be removed and the menu to open', async () => {
    const wrapper = mount(PerformanceSelectShell, {
      props: { modelValue: ['1', '2'], selectedItems: options.slice(0, 2), lockedValues: ['1'] },
      global: { stubs },
    })
    await flushPromises()
    expect(wrapper.get('button[aria-label="移除周1"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('button[aria-label="清空已选"]').attributes('disabled')).toBeDefined()
    await wrapper.get('button[aria-label="移除周1"]').trigger('click')
    await wrapper.get('button[aria-label="清空已选"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.get('button[aria-label="移除周2"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['1']])
    await wrapper.get('.performance-select-shell__selector').trigger('click')
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('true')
    wrapper.unmount()
  })

  it('preserves selected order, reserves the count width and shows only overflow items in the popover', async () => {
    const { wrapper } = create(['5', '1', '3', '7'])
    await flushPromises()
    expect(visibleLabels(wrapper)).toEqual(['周5', '周1'])
    expect(wrapper.get('.performance-select-shell__content .performance-select-shell__overflow-count').text()).toBe('+2')
    expect(wrapper.findAll('.performance-select-shell__overflow-items .performance-select-shell__tag-content').map(tag => tag.text())).toEqual(['周3', '周7'])
    await wrapper.get('.performance-select-shell__content button[aria-label="移除周5"]').trigger('click')
    await flushPromises()
    expect(wrapper.props('modelValue')).toEqual(['1', '3', '7'])
    expect(visibleLabels(wrapper)).toEqual(['周1', '周3'])
    expect(wrapper.get('.performance-select-shell__content .performance-select-shell__overflow-count').text()).toBe('+1')
    await wrapper.get('.performance-select-shell__overflow-items button[aria-label="移除周7"]').trigger('click')
    await flushPromises()
    expect(visibleLabels(wrapper)).toEqual(['周1', '周3'])
    expect(wrapper.find('.performance-select-shell__content .performance-select-shell__overflow-count').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows all fitting tags without reserving an unnecessary count', async () => {
    const { wrapper } = create(['5', '1', '3'], 188)
    await flushPromises()
    expect(visibleLabels(wrapper)).toEqual(['周5', '周1', '周3'])
    expect(wrapper.find('.performance-select-shell__content .performance-select-shell__overflow-count').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not recalculate labels just because the window resized', async () => {
    const { wrapper, layout } = create(['5', '1', '3', '7'])
    await flushPromises()
    layout.resize(500)
    window.dispatchEvent(new Event('resize'))
    await flushPromises()
    expect(visibleLabels(wrapper)).toEqual(['周5', '周1'])
    await wrapper.get('.performance-select-shell__selector').trigger('click')
    await flushPromises()
    expect(visibleLabels(wrapper)).toEqual(['周5', '周1', '周3', '周7'])
    wrapper.unmount()
  })

  it('uses right checkmarks for single and multiple choices, and appends reselected values', async () => {
    const { wrapper } = create(['5', '1'])
    await wrapper.get('.performance-select-shell__selector').trigger('click')
    expect(wrapper.find('[type="checkbox"]').exists()).toBe(false)
    expect(wrapper.findAll('.performance-flat-option-list__checkmark')).toHaveLength(2)
    await wrapper.findAll('[role="option"]')[4].trigger('click')
    await wrapper.findAll('[role="option"]')[4].trigger('click')
    expect(wrapper.props('modelValue')).toEqual(['1', '5'])
    await wrapper.setProps({ modelValue: '3', multiple: false, selectionStyle: 'plain' })
    expect(wrapper.findAll('.performance-flat-option-list__checkmark')).toHaveLength(1)
    await wrapper.findAll('[role="option"]')[0].trigger('click')
    expect(wrapper.props('modelValue')).toBe('1')
    expect(wrapper.get('[role="combobox"]').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('supports only a counter in narrow fields, keeps old values readable and blocks disabled removal', async () => {
    const { wrapper } = create(['5', '1', '3'], 50)
    await flushPromises()
    expect(visibleLabels(wrapper)).toEqual([])
    expect(wrapper.get('.performance-select-shell__content .performance-select-shell__overflow-count').text()).toBe('+3')
    await wrapper.setProps({ modelValue: ['old'], options: [] })
    await flushPromises()
    expect(wrapper.get('.performance-select-shell__overflow-items .performance-select-shell__tag-content').text()).toBe('old')
    await wrapper.setProps({ disabled: true })
    await wrapper.get('.performance-select-shell__overflow-items button').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it.each([PerformanceMultiSelect, PerformanceRoleMultiSelect])('reuses the shared behavior in legacy multiselect wrappers', async component => {
    const wrapper = mount(component as typeof PerformanceMultiSelect, { props: { modelValue: [], options: [] }, global: { stubs } })
    expect(wrapper.findComponent(PerformanceSearchSelect).exists()).toBe(true)
    await wrapper.get('.performance-select-shell__selector').trigger('click')
    expect(wrapper.get('.performance-flat-option-list__empty').text()).toBe('暂无可选项')
    wrapper.unmount()
  })

  it('remoteSearch: keeps the popup closed until a keyword is typed (REA active state has no panel)', async () => {
    const wrapper = mount(PerformanceSearchSelect, {
      props: { modelValue: [], options, multiple: true, remoteSearch: true },
      global: { stubs },
    })
    // active 态（点击选择器、无搜索词）：弹层不出现
    await wrapper.get('.performance-select-shell__selector').trigger('click')
    await flushPromises()
    expect(wrapper.find('.performance-select-shell__popup').exists()).toBe(false)
    // 输入搜索词后：弹层出现且渲染匹配的 options（remoteSearch 下也本地过滤）
    const input = wrapper.get('input.performance-select-shell__input')
    await input.setValue('周1')
    await flushPromises()
    expect(wrapper.find('.performance-select-shell__popup').exists()).toBe(true)
    expect(wrapper.findAll('.performance-flat-option-list__option').map(option => option.text())).toEqual(['周1'])
    // 清空关键词：弹层关闭
    await input.setValue('')
    await flushPromises()
    expect(wrapper.find('.performance-select-shell__popup').exists()).toBe(false)
    wrapper.unmount()
  })

  it('remoteSearch: emits search only when a keyword is present', async () => {
    const wrapper = mount(PerformanceSearchSelect, {
      props: { modelValue: [], options, multiple: true, remoteSearch: true },
      global: { stubs },
    })
    await wrapper.get('.performance-select-shell__selector').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('search')).toBeUndefined()
    const input = wrapper.get('input.performance-select-shell__input')
    await input.setValue('周2')
    await flushPromises()
    const searches = (wrapper.emitted('search') ?? []).flat()
    expect(searches).toContain('周2')
    wrapper.unmount()
  })
})
