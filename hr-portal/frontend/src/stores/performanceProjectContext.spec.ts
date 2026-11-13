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

  it('merges drawer requests and isolates tab, cycle and identity cache keys', async () => {
    const store = usePerformanceProjectContextStore()
    store.setActiveCycleId(1)
    let resolve!: (value: { answer: string }) => void
    const loader = vi.fn(() => new Promise<{ answer: string }>(done => { resolve = done }))
    const first = store.loadDrawerDetail('project:1:employee:E1:tab:A', loader)
    const second = store.loadDrawerDetail('project:1:employee:E1:tab:A', loader)
    expect(loader).toHaveBeenCalledOnce()
    resolve({ answer: 'first' })
    await Promise.all([first, second])
    await store.loadDrawerDetail('project:1:employee:E1:tab:A', loader)
    expect(loader).toHaveBeenCalledOnce()
    const next = vi.fn().mockResolvedValue({ answer: 'next' })
    await store.loadDrawerDetail('project:1:employee:E1:tab:B', next)
    store.setActiveCycleId(2)
    await store.loadDrawerDetail('project:1:employee:E1:tab:A', next)
    clearEmployeeSwitch()
    await store.loadDrawerDetail('project:1:employee:E1:tab:A', next)
    expect(next).toHaveBeenCalledTimes(3)
  })

  it('does not restore invalidated inflight drawer results', async () => {
    const store = usePerformanceProjectContextStore()
    let resolve!: (value: string) => void
    const old = store.loadDrawerDetail('member', () => new Promise<string>(done => { resolve = done }))
    store.invalidate()
    resolve('old')
    await old
    const loader = vi.fn().mockResolvedValue('fresh')
    expect(await store.loadDrawerDetail('member', loader)).toBe('fresh')
    expect(loader).toHaveBeenCalledOnce()
  })

  it('shares report inflight work with a 30 second TTL and rejects invalidated results', async () => {
    const store = usePerformanceProjectContextStore()
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const loader = vi.fn().mockResolvedValue({ total: 3 })
    await Promise.all([store.loadReport('cycle:1:department', loader), store.loadReport('cycle:1:department', loader)])
    await store.loadReport('cycle:1:department', loader)
    expect(loader).toHaveBeenCalledOnce()
    now += 30_001
    await store.loadReport('cycle:1:department', loader)
    expect(loader).toHaveBeenCalledTimes(2)
    let resolve!: (value: number) => void
    const old = store.loadReport('cycle:1:level', () => new Promise<number>(done => { resolve = done }))
    const version = store.cacheVersion
    store.invalidateReviewOverview(1)
    expect(store.cacheVersion).toBe(version + 1)
    resolve(1)
    await old
    const fresh = vi.fn().mockResolvedValue(2)
    expect(await store.loadReport('cycle:1:level', fresh)).toBe(2)
    expect(fresh).toHaveBeenCalledOnce()
  })

  it('does not persist the tested identity cycle', () => {
    setEmployeeSwitch({ session_id: 'session', session_token: 'token', expires_at: '2099-01-01', effective_identity: { employee_no: 'E2', display_name: '员工二' }, mode: 'TARGET_POLICY' })
    const store = usePerformanceProjectContextStore()
    store.setNavigation(context(2))
    expect(localStorage.getItem('performance.active-cycle-id')).toBeNull()
  })
})
