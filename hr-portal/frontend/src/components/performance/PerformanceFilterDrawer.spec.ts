import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceFilterDrawer, { type PerformanceFilterDrawerField } from './PerformanceFilterDrawer.vue'

const stubs = { Teleport: true }
const nodesField: PerformanceFilterDrawerField = {
  key: 'departmentIds',
  label: '部门',
  type: 'tree',
  placeholder: '请选择',
  nodes: [{ value: '技术中台', label: '技术中台', level: 1, children: [] }],
}

function mountDrawer(overrides: Record<string, unknown> = {}) {
  let wrapper!: ReturnType<typeof mount>
  wrapper = mount(PerformanceFilterDrawer, {
    props: {
      modelValue: true,
      fields: [nodesField],
      'onUpdate:modelValue': (value: boolean) => { void wrapper.setProps({ modelValue: value }) },
      ...overrides,
    },
    global: { stubs },
  })
  return wrapper
}

describe('PerformanceFilterDrawer', () => {
  it('renders the fixed filter fields and actions', () => {
    const wrapper = mountDrawer()
    expect(wrapper.text()).toContain('筛选成员')
    expect(wrapper.text()).toContain('部门')
    const actions = wrapper.findAll('.performance-filter-drawer__footer button').map(button => button.text())
    expect(actions).toEqual(['确定', '取消', '清除'])
  })

  it('applies selected tree values and clears the draft', async () => {
    const wrapper = mountDrawer()
    await wrapper.get('.performance-select-shell__selector').trigger('click')
    await wrapper.get('.performance-organization-tree-node__label').trigger('click')
    await wrapper.get('.performance-filter-drawer__footer button').trigger('click')
    expect(wrapper.emitted('apply')?.[0]?.[0]).toEqual({ departmentIds: ['技术中台'] })

    await wrapper.setProps({ modelValue: true })
    await wrapper.findAll('.performance-filter-drawer__footer button')[2].trigger('click')
    await wrapper.get('.performance-filter-drawer__footer button').trigger('click')
    expect(wrapper.emitted('apply')?.[1]?.[0]).toEqual({ departmentIds: [] })
  })

  it('shows an inline error and retries when tree options fail to load', async () => {
    const wrapper = mountDrawer({ error: '筛选选项加载失败，请重试' })
    expect(wrapper.text()).toContain('筛选选项加载失败，请重试')
    expect(wrapper.find('.performance-organization-tree-node').exists()).toBe(false)
    expect(wrapper.find('.performance-filter-drawer__unavailable').exists()).toBe(true)

    await wrapper.get('.performance-filter-drawer__error .performance-button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})
