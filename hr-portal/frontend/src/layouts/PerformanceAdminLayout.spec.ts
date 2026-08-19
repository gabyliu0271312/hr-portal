import { createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import PerformanceAdminLayout from './PerformanceAdminLayout.vue'

function mountLayout() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/performance/settings/cycles', name: 'PerformanceCycles', component: { template: '<div />' } },
      { path: '/performance/settings/templates', name: 'PerformanceTemplates', component: { template: '<div />' } },
    ],
  })

  return mount(PerformanceAdminLayout, {
    global: {
      plugins: [createPinia(), router],
      stubs: {
        'el-avatar': { template: '<span><slot /></span>' },
        'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<button><slot /></button>' },
        'router-view': { props: ['section'], template: '<div :data-section="section" />' },
      },
    },
  })
}

describe('PerformanceAdminLayout', () => {
  it('renders the confirmed standalone shell and switches placeholder sections', async () => {
    const wrapper = mountLayout()

    expect(wrapper.text()).toContain('创梦绩效设置')
    expect(wrapper.get('[aria-current="page"]').text()).toContain('席位管理')
    expect(wrapper.text()).not.toContain('通用设置')
    expect(wrapper.text()).not.toContain('飞书管理后台')

    const templates = wrapper.findAll('button').find((button) => button.text().includes('绩效模板'))
    await templates?.trigger('click')

    expect(wrapper.get('[aria-current="page"]').text()).toContain('绩效模板')
    expect(wrapper.findAll('[data-section="templates"]')).toHaveLength(1)
  })

  it('navigates the template menu to its canonical route', async () => {
    const wrapper = mountLayout()
    const router = wrapper.vm.$router
    await router.isReady()

    const templates = wrapper.findAll('button').find((button) => button.text().includes('绩效模板'))
    await templates?.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('PerformanceTemplates')
  })

  it('navigates the cycle menu to its canonical route', async () => {
    const wrapper = mountLayout()
    const router = wrapper.vm.$router
    await router.isReady()

    const cycles = wrapper.findAll('button').find((button) => button.text().includes('周期与项目'))
    await cycles?.trigger('click')
    await new Promise((resolve) => setTimeout(resolve, 0))
    await router.isReady()

    expect(router.currentRoute.value.name).toBe('PerformanceCycles')
  })
})
