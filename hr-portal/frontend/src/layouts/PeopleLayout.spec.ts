import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PeopleLayout from './PeopleLayout.vue'
import peopleLayoutSource from './PeopleLayout.vue?raw'

const push = vi.fn()
const replace = vi.fn()
const route = { path: '/people/overview' }
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push, replace }) }))
vi.mock('@/stores/user', () => ({
  useUserStore: () => ({ user: { display_name: '测试管理员' }, menus, logout: logoutMock }),
}))
vi.mock('@/components/app-switcher/AppSwitcher.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/app-switcher/AppBrand.vue', () => ({ default: { template: '<span />' } }))

let menus: { code: string }[]
let logoutMock: ReturnType<typeof vi.fn>

function mountLayout() {
  return mount(PeopleLayout, {
    global: {
      plugins: [createPinia()],
      stubs: {
        'router-view': { template: '<div />' },
        'el-container': { template: '<div><slot /></div>' },
        'el-main': { template: '<main><slot /></main>' },
        'el-aside': { template: '<aside><slot /></aside>' },
        'el-avatar': { template: '<span><slot /></span>' },
        'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { props: ['command'], template: '<button @click="$emit(\'command\', command)"><slot /></button>' },
      },
      directives: { loading: () => {} },
    },
  })
}

describe('PeopleLayout admin entry', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    route.path = '/people/overview'
    menus = []
    logoutMock = vi.fn().mockResolvedValue(undefined)
  })

  it('shows 后台管理 only with people.admin', () => {
    menus = [{ code: 'people.admin' }]
    const wrapper = mountLayout()
    expect(wrapper.findAll('button').some(item => item.text() === '后台管理')).toBe(true)
    wrapper.unmount()
  })

  it('hides 后台管理 without people.admin', () => {
    menus = [{ code: 'people.app' }]
    const wrapper = mountLayout()
    expect(wrapper.findAll('button').some(item => item.text() === '后台管理')).toBe(false)
    wrapper.unmount()
  })

  it('keeps the people sidebar free of admin sections', () => {
    menus = [{ code: 'people.admin' }]
    const wrapper = mountLayout()
    expect(wrapper.text()).not.toContain('创梦人力后台')
    expect(wrapper.text()).toContain('主数据概览')
    wrapper.unmount()
  })

  it('opens the settings admin shell in a new tab', () => {
    expect(peopleLayoutSource).toContain("window.open('/people/settings', '_blank', 'noopener')")
  })
})
