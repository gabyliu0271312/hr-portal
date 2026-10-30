import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import PeopleAdminLayout from './PeopleAdminLayout.vue'

const push = vi.fn()
const replace = vi.fn()
let routePath = '/people/settings/master-data'
vi.mock('vue-router', () => ({ useRoute: () => ({ path: routePath }), useRouter: () => ({ push, replace }) }))
vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ user: { display_name: '测试管理员' }, logout: vi.fn().mockResolvedValue(undefined) }),
}))
vi.mock('@/components/app-switcher/AppBrand.vue', () => ({ default: { template: '<span />' } }))

function mountLayout() {
  return mount(PeopleAdminLayout, {
    global: {
      plugins: [createPinia()],
      stubs: {
        'router-view': { template: '<div />' },
        'el-avatar': { template: '<span><slot /></span>' },
        'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<button><slot /></button>' },
        'el-icon': { template: '<span><slot /></span>' },
      },
    },
  })
}

describe('PeopleAdminLayout', () => {
  it('renders the three migrated admin entries', () => {
    const wrapper = mountLayout()
    expect(wrapper.text()).toContain('主数据定义')
    expect(wrapper.text()).toContain('字段设置')
    expect(wrapper.text()).toContain('字段分类')
    wrapper.unmount()
  })

  it('highlights the active section and navigates on click', async () => {
    routePath = '/people/settings/master-data'
    const wrapper = mountLayout()
    expect(wrapper.find('.admin-menu-item.active').text()).toContain('主数据定义')
    const buttons = wrapper.findAll('.admin-menu-item')
    await buttons.find(item => item.text() === '字段设置')!.trigger('click')
    expect(push).toHaveBeenCalledWith('/people/settings/field-settings')
    wrapper.unmount()
  })
})
