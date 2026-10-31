import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import PerformanceLayout from './PerformanceLayout.vue'
import { api } from '@/api/client'
import { identitySwitchApi } from '@/api/identitySwitch'
import { clearEmployeeSwitch, employeeSwitchNotice, employeeSwitchSession, setEmployeeSwitch } from '@/stores/identitySwitch'

enableAutoUnmount(afterEach)

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

function switchedSession(id = 'current') {
  return { session_id: id, session_token: `secret-${id}`, expires_at: '2099-01-01', effective_identity: { employee_no: id, display_name: id }, mode: 'TARGET_POLICY' as const }
}

describe('PerformanceLayout identity recovery', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    clearEmployeeSwitch()
    vi.mocked(identitySwitchApi.capability).mockReset().mockResolvedValue({ can_switch: true, can_manage_control: false, others_enabled: true, generation: 7, test_delivery_enabled: false })
    vi.mocked(api.get).mockReset().mockResolvedValue({ data: { expires_at: '2099-02-01' } })
  })

  it('checks immediately on focus and keeps the server renewal expiry', async () => {
    setEmployeeSwitch(switchedSession())
    mountLayout()
    await flushPromises()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(api.get).toHaveBeenCalledWith('/performance/identity-switch/session', { headers: { 'X-App-Switch-Session': 'secret-current' } })
    expect(employeeSwitchSession.value?.expires_at).toBe('2099-02-01')
  })

  it('clears an expired session while leaving switching available without reloading', async () => {
    vi.mocked(api.get).mockRejectedValueOnce({ response: { status: 410, data: { detail: '身份切换已到期，请恢复本人' } } })
    setEmployeeSwitch(switchedSession('expired'))
    const wrapper = mountLayout()
    await flushPromises()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(employeeSwitchSession.value).toBeNull()
    expect(employeeSwitchNotice.value).toContain('已到期')
    expect(wrapper.findAll('button').some(button => button.text() === '切换用户')).toBe(true)
    setEmployeeSwitch(switchedSession('replacement'))
    await flushPromises()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(employeeSwitchSession.value?.session_id).toBe('replacement')
    expect(employeeSwitchNotice.value).toBe('')
  })

  it.each([undefined, 503])('keeps the session on a transient heartbeat failure (%s)', async status => {
    vi.mocked(api.get).mockRejectedValueOnce(status ? { response: { status } } : new Error('network error'))
    setEmployeeSwitch(switchedSession())
    mountLayout()
    await flushPromises()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(employeeSwitchSession.value?.session_id).toBe('current')
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(2)
    expect(employeeSwitchSession.value?.expires_at).toBe('2099-02-01')
  })

  it('deduplicates the same heartbeat and ignores old-session 410 after replacement', async () => {
    let rejectOld!: (error: unknown) => void
    vi.mocked(api.get).mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject }))
    setEmployeeSwitch(switchedSession('old'))
    mountLayout()
    await flushPromises()
    window.dispatchEvent(new Event('focus'))
    window.dispatchEvent(new Event('focus'))
    expect(api.get).toHaveBeenCalledTimes(1)
    setEmployeeSwitch(switchedSession('new'))
    await flushPromises()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(2)
    rejectOld({ response: { status: 410, data: { detail: '旧会话到期' } } })
    await flushPromises()
    expect(employeeSwitchSession.value?.session_id).toBe('new')
    expect(employeeSwitchNotice.value).toBe('')
  })

  it('does not hide the new switch entry when an old capability request fails late', async () => {
    let rejectOld!: (error: unknown) => void
    vi.mocked(identitySwitchApi.capability).mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject }))
    const wrapper = mountLayout()
    await flushPromises()
    setEmployeeSwitch(switchedSession('new'))
    await flushPromises()
    expect(wrapper.findAll('button').some(button => button.text() === '切换用户')).toBe(true)
    rejectOld(new Error('old context network error'))
    await flushPromises()
    expect(wrapper.findAll('button').some(button => button.text() === '切换用户')).toBe(true)
  })

  it('removes resume listeners on unmount', async () => {
    setEmployeeSwitch(switchedSession())
    const wrapper = mountLayout()
    await flushPromises()
    wrapper.unmount()
    window.dispatchEvent(new Event('focus'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(api.get).not.toHaveBeenCalled()
  })
})
