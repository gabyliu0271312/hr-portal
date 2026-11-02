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
    treeNode(5, '职能中心', 2, true),
  ]),
]

describe('OrganizationTree', () => {
  it('renders all top-level nodes with names', () => {
    const wrapper = mount(OrganizationTree, { props: { nodes: fixture } })
    expect(wrapper.text()).toContain('创梦天地')
    expect(wrapper.text()).toContain('游戏事业部')
    expect(wrapper.text()).toContain('职能中心')
    wrapper.unmount()
  })

  it('tags inactive nodes as 停用', () => {
    const wrapper = mount(OrganizationTree, { props: { nodes: fixture } })
    expect(wrapper.text()).toContain('发行中心')
    expect(wrapper.find('.organization-tree-node__inactive').text()).toBe('停用')
    wrapper.unmount()
  })

  it('auto-expands ancestor chains while searching so matches become visible', async () => {
    // 模拟页面过滤结果：根与一级为祖先（有匹配后代、自身未匹配），二级为命中节点
    const searchFixture = [
      { ...fixture[0], __searchMatch: false, __hasSearchDescendant: true, children: [
        { ...fixture[0].children[0], __searchMatch: false, __hasSearchDescendant: true, children: [
          { ...fixture[0].children[0].children[0], __searchMatch: true, __hasSearchDescendant: false },
        ]},
      ]},
    ]
    const wrapper = mount(OrganizationTree, { props: { nodes: searchFixture, searching: true } })
    // 命中节点必须在 DOM 中可见（祖先自动展开），且自身匹配节点不作为父链展开条件
    expect(wrapper.text()).toContain('研发中心')
    expect(wrapper.text()).toContain('游戏事业部')
    wrapper.unmount()
  })
})
