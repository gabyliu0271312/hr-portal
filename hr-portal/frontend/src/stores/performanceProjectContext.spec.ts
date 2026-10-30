import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { performanceNavigationApi, type PerformanceNavigationContext } from '@/api/performance'
import { usePerformanceProjectContextStore } from './performanceProjectContext'
import { clearEmployeeSwitch, setEmployeeSwitch } from './identitySwitch'

function context(cycleId: number): PerformanceNavigationContext {
  const cycle = { cycle_id: cycleId, cycle_name: `周期${cycleId}`, cycle_start_at: `2026-0${cycleId}-01`, cycle_end_at: `2026-0${cycleId}-28` }
  return { cycles: [cycle], active_cycle: cycle, can_review: cycleId === 2, can_manage: cycleId === 1, review_projects: [] }
}

describe('performance cycle context', () => {
  beforeEach(() => {
    clearEmployeeSwitch()
    setActivePinia(createPinia())
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('persists the shared cycle instead of a page-specific project', () => {
    const store = usePerformanceProjectContextStore()
    store.setNavigation(context(2))
    store.setActiveProjectId(20)
    expect(store.activeCycleId).toBe(2)
    expect(localStorage.getItem('performance.active-cycle-id')).toBe('2')
    expect(localStorage.getItem('performance.active-project-id')).toBeNull()
  })

  it('clears old-cycle page caches when the cycle changes', () => {
    const store = usePerformanceProjectContextStore()
    store.setNavigation(context(2))
    store.setActiveProjectId(20)
    store.setWorkbenchProjects([{ project_id: 20, project_name: '项目', cycle_name: '周期2', cycle_start_at: '', cycle_end_at: '', project_status: 'STARTED' }])
    store.setActiveCycleId(1)
    expect(store.activeProjectId).toBeNull()
    expect(store.workbenchProjects).toBeNull()
  })

  it('drops a stale navigation response after a newer cycle wins', async () => {
    let resolveFirst!: (value: PerformanceNavigationContext) => void
    vi.spyOn(performanceNavigationApi, 'get')
      .mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve }))
      .mockResolvedValueOnce(context(1))
    const store = usePerformanceProjectContextStore()
    const first = store.refreshNavigation(2, true)
    await store.selectCycle(1)
    resolveFirst(context(2))
    await first
    expect(store.activeCycleId).toBe(1)
    expect(store.navigation?.active_cycle?.cycle_id).toBe(1)
  })

  it('does not persist the tested identity cycle', () => {
    setEmployeeSwitch({ session_id: 'session', session_token: 'token', expires_at: '2099-01-01', effective_identity: { employee_no: 'E2', display_name: '员工二' }, mode: 'TARGET_POLICY' })
    const store = usePerformanceProjectContextStore()
    store.setNavigation(context(2))
    expect(localStorage.getItem('performance.active-cycle-id')).toBeNull()
  })
})
