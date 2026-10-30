import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, reactive } from 'vue'
import AppSwitcher from './AppSwitcher.vue'
import { APP_CATALOG } from '@/constants/appCatalog'

const push = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push }),
}))

const userStore = reactive({ menus: [] as { code: string }[] })

vi.mock('@/stores/user', () => ({
  useUserStore: () => userStore,
}))

const TeleportStub = defineComponent({
  props: ['to', 'disabled'],
  template: '<div class="teleport-stub"><slot /></div>',
})

describe('AppSwitcher', () => {
  it('仅当前一个应用时不弹窗（点击无反应）', async () => {
    userStore.menus = []
    const wrapper = mount(AppSwitcher, { props: { current: 'portal' }, global: { stubs: { Teleport: TeleportStub } } })
    await wrapper.find('.app-switcher__trigger').trigger('click')
    expect(wrapper.find('.app-switcher__panel').exists()).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })

  it('有多个应用时打开弹窗并展示有权应用', async () => {
    userStore.menus = [{ code: 'performance.app' }, { code: 'people.app' }]
    const wrapper = mount(AppSwitcher, { props: { current: 'portal' }, global: { stubs: { Teleport: TeleportStub } } })
    await wrapper.find('.app-switcher__trigger').trigger('click')
    expect(wrapper.find('.app-switcher__panel').exists()).toBe(true)
    const items = wrapper.findAll('.app-switcher__item')
    expect(items.length).toBe(3)
    expect(items[1].text()).toContain('创梦绩效')
    expect(items[2].text()).toContain('创梦人力')
  })

  it('点击其他应用跳转，点击当前应用不跳转', async () => {
    userStore.menus = [{ code: 'performance.app' }, { code: 'people.app' }]
    const wrapper = mount(AppSwitcher, { props: { current: 'performance' }, global: { stubs: { Teleport: TeleportStub } } })
    await wrapper.find('.app-switcher__trigger').trigger('click')
    await wrapper.findAll('.app-switcher__item')[1].trigger('click')
    expect(push).not.toHaveBeenCalled() // 当前应用
    await wrapper.find('.app-switcher__trigger').trigger('click')
    await wrapper.findAll('.app-switcher__item')[2].trigger('click')
    expect(push).toHaveBeenCalledWith(APP_CATALOG[2].entryPath)
  })
})
