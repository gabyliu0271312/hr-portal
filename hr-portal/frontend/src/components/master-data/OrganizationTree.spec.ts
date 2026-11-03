import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import OrganizationTree from './OrganizationTree.vue'

function treeNode(id: number, name: string, level: number, is_active = true, children: any[] = []) {
  return { id, code: `N${id}`, name, parent_id: null, level, is_leaf: children.length === 0, is_active, children }
}

const fixture = [
  treeNode(1, '创梦天地', 1, true, [
    treeNode(2, '游戏事业部', 2, true, [
      treeNode(3, '研发中心', 3, true),
      treeNode(4, '发行中心', 3, false),
    ]),
    treeNode(5, '职能中心', 2, false),
  ]),
]

describe('OrganizationTree', () => {
  it('renders first level only by default (deeper levels stay collapsed)', () => {
    const wrapper = mount(OrganizationTree, { props: { nodes: fixture } })
    expect(wrapper.text()).toContain('创梦天地')
    expect(wrapper.text()).toContain('游戏事业部')
    // 默认仅展开根组织：根下的一级(游戏事业部)可见，更深层级(研发中心/发行中心)收起
    expect(wrapper.text()).not.toContain('研发中心')
    expect(wrapper.text()).not.toContain('发行中心')
    wrapper.unmount()
  })

  it('expands a collapsed node on toggle', async () => {
    const wrapper = mount(OrganizationTree, { props: { nodes: fixture } })
    expect(wrapper.text()).not.toContain('研发中心')
    // 默认仅展开根组织：根(创梦天地)展开其一级，一级(游戏事业部)收起；点击游戏事业部展开下一级
    const buttons = wrapper.findAll('button.org-table__expand')
    expect(buttons.length).toBe(2)
    await buttons[1].trigger('click')
    expect(wrapper.text()).toContain('研发中心')
    expect(wrapper.text()).toContain('发行中心')
    wrapper.unmount()
  })

  it('tags visible inactive nodes as 停用', () => {
    const wrapper = mount(OrganizationTree, { props: { nodes: fixture } })
    // 职能中心 level-1 停用、默认可见
    expect(wrapper.find('.org-table__inactive').text()).toBe('停用')
    wrapper.unmount()
  })

  it('auto-expands ancestor chains while searching so matches become visible', () => {
    const searchFixture = [
      { ...fixture[0], __searchMatch: false, __hasSearchDescendant: true, children: [
        { ...fixture[0].children[0], __searchMatch: false, __hasSearchDescendant: true, children: [
          { ...fixture[0].children[0].children[0], __searchMatch: true, __hasSearchDescendant: false },
        ]},
      ]},
    ]
    const wrapper = mount(OrganizationTree, { props: { nodes: searchFixture, searching: true } })
    expect(wrapper.text()).toContain('研发中心')
    wrapper.unmount()
  })
})
