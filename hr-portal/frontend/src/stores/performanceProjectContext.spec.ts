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

  it('consumes scoped management return state once and invalidates expired or changed identities', async () => {
    const store = usePerformanceProjectContextStore()
    const value = { overview: { active_cycle: { cycle_id: 1 } }, viewMode: 'by-org', scrollTop: 320, timeline: [], completion: { department: null, expanded: ['部门'], sortKey: 'department', sortOrder: 'asc', resultView: 'opened' } } as any
    store.saveManagementReturn(1, 'hrbp', 3, value)
    expect(store.takeManagementReturn(1, 'project_admin', 3)).toBeNull()
    store.saveManagementReturn(1, 'hrbp', 3, value)
    expect(store.takeManagementReturn(1, 'hrbp', 4)).toBeNull()
    store.saveManagementReturn(1, 'hrbp', 3, value)
    expect(store.takeManagementReturn(1, 'hrbp', 3)).toEqual(value)
    expect(store.takeManagementReturn(1, 'hrbp', 3)).toBeNull()
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now)
    store.saveManagementReturn(1, 'hrbp', undefined, value)
    vi.mocked(Date.now).mockReturnValue(now + 300_001)
    expect(store.takeManagementReturn(1, 'hrbp')).toBeNull()
    store.saveManagementReturn(1, 'hrbp', 3, value)
    store.invalidate()
    expect(store.takeManagementReturn(1, 'hrbp', 3)).toBeNull()
    store.saveManagementReturn(1, 'hrbp', 3, value)
    localStorage.setItem('hr_portal.token', 'different-login')
    expect(store.takeManagementReturn(1, 'hrbp', 3)).toBeNull()
    store.saveManagementReturn(1, 'hrbp', 3, value)
    clearEmployeeSwitch()
    expect(store.takeManagementReturn(1, 'hrbp', 3)).toBeNull()
  })

  it('consumes copied audience once and isolates project, cycle and identity', () => {
    const store = usePerformanceProjectContextStore()
    const rules = { groups: [{ conditions: [{ field: 'employee' as const, operator: 'include' as const, values: ['E1'] }] }] }
    store.saveProjectCopyAudience(1, 2, rules)
    rules.groups[0].conditions[0].values.push('E2')
    expect(store.takeProjectCopyAudience(1, 2)?.groups[0].conditions[0].values).toEqual(['E1'])
    expect(store.takeProjectCopyAudience(1, 2)).toBeNull()
    store.saveProjectCopyAudience(1, 2, rules)
    expect(store.takeProjectCopyAudience(2, 2)).toBeNull()
    store.saveProjectCopyAudience(1, 2, rules)
    expect(store.takeProjectCopyAudience(1, 3)).toBeNull()
    store.saveProjectCopyAudience(1, 2, rules)
    clearEmployeeSwitch()
    expect(store.takeProjectCopyAudience(1, 2)).toBeNull()
    store.saveProjectCopyAudience(1, 2, rules)
    localStorage.setItem('hr_portal.token', 'another-login')
    expect(store.takeProjectCopyAudience(1, 2)).toBeNull()
    store.saveProjectCopyAudience(1, 2, rules)
    store.invalidate()
    expect(store.takeProjectCopyAudience(1, 2)).toBeNull()
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

  it('shares scoped resources with TTL and drops invalidated inflight results', async () => {
    const store = usePerformanceProjectContextStore()
    store.setActiveCycleId(1)
    let now = 1000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const loader = vi.fn().mockResolvedValue({ total: 2 })
    expect(await Promise.all([store.loadResource('workbench-summary', loader), store.loadResource('workbench-summary', loader)])).toEqual([{ total: 2 }, { total: 2 }])
    await store.loadResource('workbench-summary', loader)
    expect(loader).toHaveBeenCalledOnce()
    now += 15_001
    await store.loadResource('workbench-summary', loader)
    expect(loader).toHaveBeenCalledTimes(2)
    let resolve!: (value: string) => void
    const old = store.loadResource('review-navigation', () => new Promise<string>(done => { resolve = done }))
    store.invalidate()
    resolve('old')
    await old
    const fresh = vi.fn().mockResolvedValue('fresh')
    expect(await store.loadResource('review-navigation', fresh)).toBe('fresh')
    store.setActiveCycleId(2)
    await store.loadResource('review-navigation', fresh)
    expect(fresh).toHaveBeenCalledTimes(2)
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

  it('drops old navigation synchronously when identity changes', async () => {
    const store = usePerformanceProjectContextStore()
    store.setNavigation(context(2))
    let resolve!: (value: PerformanceNavigationContext) => void
    vi.spyOn(performanceNavigationApi, 'get').mockReturnValueOnce(new Promise(done => { resolve = done }))
    const previous = store.refreshNavigation(2, true)
    clearEmployeeSwitch()
    expect(store.navigationReady).toBe(false)
    expect(store.navigation).toBeNull()
    expect(store.activeCycleId).toBeNull()
    resolve(context(2))
    await previous
    expect(store.navigation).toBeNull()
    expect(store.activeCycleId).toBeNull()
  })

  it('does not persist the tested identity cycle', () => {
    setEmployeeSwitch({ session_id: 'session', session_token: 'token', expires_at: '2099-01-01', effective_identity: { employee_no: 'E2', display_name: '员工二' }, mode: 'TARGET_POLICY' })
    const store = usePerformanceProjectContextStore()
    store.setNavigation(context(2))
    expect(localStorage.getItem('performance.active-cycle-id')).toBeNull()
  })
})
