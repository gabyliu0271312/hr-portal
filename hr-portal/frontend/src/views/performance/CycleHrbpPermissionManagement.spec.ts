import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { describe, expect, it } from 'vitest'
import CycleHrbpPermissionManagement from './CycleHrbpPermissionManagement.vue'

async function mountPage(path = '/performance/settings/cycles/1/hrbp-auth?activeKey=auth-list') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/performance/settings/cycles', name: 'PerformanceCycles', component: { template: '<div />' } },
      { path: '/performance/settings/cycles/:cycleId/hrbp-auth', name: 'PerformanceCycleHrbpPermissions', component: CycleHrbpPermissionManagement },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(CycleHrbpPermissionManagement, {
    global: {
      plugins: [router],
      stubs: { PermissionButton: { template: '<button v-bind="$attrs"><slot /></button>' } },
    },
  })
  await flushPromises()
  return { wrapper, router }
}

describe('CycleHrbpPermissionManagement', () => {
  it('renders the static shell and switches between captured tabs', async () => {
    const { wrapper, router } = await mountPage()

    expect(wrapper.text()).toContain('HRBP 权限管理')
    expect(wrapper.text()).toContain('HRBP 可管理的绩效数据范围')
    expect(wrapper.get('[aria-label="HRBP 权限表格"]').exists()).toBe(true)

    await wrapper.findAll('.line-tab').find(tab => tab.text() === '变更记录')?.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query.activeKey).toBe('history')
    expect(wrapper.get('[aria-label="变更记录"]').exists()).toBe(true)
  })

  it('returns to the cycle list from the shared page header', async () => {
    const { wrapper, router } = await mountPage()
    await wrapper.get('.full-screen-modal-header-back').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('PerformanceCycles')
  })
})
