import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it, vi } from 'vitest'
import DefaultLayout from '@/layouts/Default.vue'
import { MENU_ROUTE_MAP } from './menuRoutes'

describe('standard field navigation', () => {
  it('maps both the group and catalog to the people field settings', () => {
    expect(MENU_ROUTE_MAP['warehouse.standard_fields']).toBe('/people/field-settings')
    expect(MENU_ROUTE_MAP['warehouse.standard_fields.catalog']).toBe('/people/field-settings')
  })
})

const systemMenus = [
  { id: 1, parent_id: null, code: 'system', label: '系统设置' },
  { id: 2, parent_id: 1, code: 'system.auth', label: '权限管理' },
  { id: 3, parent_id: 1, code: 'system.params', label: '参数设置' },
  { id: 4, parent_id: 2, code: 'system.identity_management', label: '身份管理' },
  { id: 5, parent_id: 3, code: 'system.master_entities', label: '主数据定义' },
]

vi.mock('@/stores/user', () => ({
  useUserStore: () => ({
    user: { display_name: '测试管理员' },
    roles: ['测试角色'],
    menus: systemMenus,
    topMenus: systemMenus.filter(menu => menu.parent_id === null),
    childrenOf: (id: number) => systemMenus.filter(menu => menu.parent_id === id),
  }),
}))
vi.mock('@/components/GlobalAiAssistant.vue', () => ({ default: { template: '<div />' } }))

const systemEntries = [
  ['身份管理', 'system.identity_management', '/system/identity-management'],
  ['主数据定义', 'system.master_entities', '/people/master-data'],
] as const

describe('system sidebar navigation', () => {
  it.each(systemEntries)('maps %s to its registered page', (_label, code, path) => {
    expect(MENU_ROUTE_MAP[code]).toBe(path)
  })

  it.each(systemEntries)('opens %s from the actual sidebar instead of falling back home', async (label, code, path) => {
    const page = { template: '<div>目标页面</div>' }
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: DefaultLayout, children: [
        { path: 'home', component: { template: '<div>首页</div>' } },
        { path: 'system/roles', component: page, meta: { menuCode: 'system.roles' } },
        ...systemEntries.map(([, menuCode, routePath]) => ({ path: routePath, component: page, meta: { menuCode } })),
      ] }],
    })
    await router.push('/system/roles')
    await router.isReady()
    const wrapper = mount({ template: '<RouterView />' }, {
      global: {
        plugins: [router],
        stubs: Object.fromEntries(['ElContainer', 'ElAside', 'ElMain', 'ElDropdown', 'ElDropdownMenu', 'ElDropdownItem'].map(name => [name, { template: '<div><slot /></div>' }])),
      },
    })
    try {
      await flushPromises()
      const entry = wrapper.findAll('.leaf-item').find(item => item.text() === label)
      expect(entry).toBeDefined()
      await entry!.trigger('click')
      await flushPromises()
      expect(router.currentRoute.value.fullPath).toBe(path)
      expect(router.currentRoute.value.meta.menuCode).toBe(code)
      expect(wrapper.find('.leaf-item.active').text()).toBe(label)
    } finally {
      wrapper.unmount()
    }
  })
})
