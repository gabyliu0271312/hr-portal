import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import PerformanceLayout from './PerformanceLayout.vue'

const push = vi.fn()
const replace = vi.fn()
const route = { path: '/performance/workbench' }
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push, replace }) }))
vi.mock('@/api/identitySwitch', () => ({ identitySwitchApi: { capability: vi.fn().mockResolvedValue({ can_switch: false }), end: vi.fn() } }))
vi.mock('@/api/performance', async () => {
  const actual = await vi.importActual<typeof import('@/api/performance')>('@/api/performance')
  return { ...actual, performanceApi: { ...actual.performanceApi, getAccessContext: vi.fn().mockResolvedValue({ permission_codes: [], portal_entry_permissions: ['performance.app'] }) } }
})
vi.mock('@/api/client', () => ({ api: { get: vi.fn() } }))

function navigation(canReview: boolean, canManage: boolean) {
  const cycle = { cycle_id: 2, cycle_name: '2026周期', cycle_start_at: '2026-01-01', cycle_end_at: '2026-12-31' }
  return { cycles: [cycle], active_cycle: cycle, can_review: canReview, can_manage: canManage, review_projects: [] }
}

let pinia: ReturnType<typeof createPinia>
function mountLayout() {
  return mount(PerformanceLayout, {
    global: {
      plugins: [pinia],
      stubs: {
        'router-view': { template: '<div />' },
        'el-container': { template: '<div><slot /></div>' },
        'el-main': { template: '<main><slot /></main>' },
        'el-aside': { template: '<aside><slot /></aside>' },
        'el-avatar': { template: '<span><slot /></span>' },
        'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<button><slot /></button>' },
        GlobalAiAssistant: true,
        PerformanceIdentitySwitchDialog: true,
        PerformanceIdentitySwitchRecords: true,
      },
    },
  })
}

describe('PerformanceLayout cycle navigation', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    route.path = '/performance/workbench'
    push.mockReset()
    replace.mockReset()
  })

  it('shows tabs only from the selected cycle navigation context', async () => {
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigation(true, false))
    const wrapper = mountLayout()
    await flushPromises()
    expect(wrapper.findAll('.tab-button').map(tab => tab.text())).toEqual(['工作台', '绩效评估'])
    context.setNavigation(navigation(false, true))
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tab-button').map(tab => tab.text())).toEqual(['工作台', '项目管理'])
  })

  it('falls back to workbench when the current tab is hidden after a cycle change', async () => {
    route.path = '/performance/review'
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigation(true, true))
    mountLayout()
    await flushPromises()
    context.setNavigation(navigation(false, true))
    await flushPromises()
    expect(replace).toHaveBeenCalledWith('/performance/workbench')
  })

  it('hides protected tabs while navigation is loading or failed', async () => {
    const context = usePerformanceProjectContextStore()
    context.setNavigation(navigation(true, true))
    const wrapper = mountLayout()
    context.setNavigationLoading(true)
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tab-button').map(tab => tab.text())).toEqual(['工作台'])
    context.setNavigationError('加载失败')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.tab-button').map(tab => tab.text())).toEqual(['工作台'])
  })
})
