import { defineStore } from 'pinia'
import { ref, shallowRef, watch } from 'vue'
import { employeeSwitchEpoch, employeeSwitchSession } from './identitySwitch'
import { getToken } from '@/api/client'
import { performanceNavigationApi, clearPerformanceInFlightRequests, type ProjectManagementOverview, type ProjectManagementDepartmentCompletion, type PerformanceCycleNavigationItem, type PerformanceNavigationContext, type PerformanceProjectPayload, type PerformanceReviewOverview, type PerformanceWorkbenchProject, type PerformanceWorkbenchTaskGroup, type PerformanceWorkbenchTimelineNode } from '@/api/performance'

const STORAGE_KEY = 'performance.active-cycle-id'

export interface PerformanceWorkbenchSnapshot {
  timeline: PerformanceWorkbenchTimelineNode[]
  pending: PerformanceWorkbenchTaskGroup[]
  completed: PerformanceWorkbenchTaskGroup[]
}

export interface PerformanceManagementReturnSnapshot {
  overview: ProjectManagementOverview
  viewMode: string
  scrollTop: number
  timeline: Array<{ node_id: string; node_name: string; range: string; ended: boolean; current: boolean }>
  completion: {
    department: ProjectManagementDepartmentCompletion | null
    expanded: string[]
    sortKey: string
    sortOrder: 'asc' | 'desc' | ''
    resultView: string
  }
}

function storedCycleId() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export const usePerformanceProjectContextStore = defineStore('performance-project-context', () => {
  const activeProjectId = ref<number | null>(null)
  const activeCycleId = ref<number | null>(employeeSwitchSession.value ? null : storedCycleId())
  const cycles = shallowRef<PerformanceCycleNavigationItem[]>([])
  const navigation = shallowRef<PerformanceNavigationContext | null>(null)
  const navigationLoading = ref(false)
  const navigationError = ref('')
  const navigationReady = ref(false)
  const reviewOverviews = shallowRef<Record<number, PerformanceReviewOverview>>({})
  const selectedReviewNodes = ref<Record<number, string>>({})
  const workbenchProjects = shallowRef<PerformanceWorkbenchProject[] | null>(null)
  const workbenchSnapshots = shallowRef<Record<number, PerformanceWorkbenchSnapshot>>({})
  const drawerDetails = new Map<string, unknown>()
  const drawerRequests = new Map<string, Promise<unknown>>()
  const cacheVersion = ref(0)
  const reports = new Map<string, { value: unknown; expiresAt: number }>()
  const reportRequests = new Map<string, Promise<unknown>>()
  let managementReturn: { key: string; expiresAt: number; value: PerformanceManagementReturnSnapshot } | null = null
  function managementReturnKey(cycleId: number, role: string, projectId?: number) {
    return JSON.stringify([getToken(), employeeSwitchEpoch.value, cycleId, role, projectId ?? null])
  }
  function saveManagementReturn(cycleId: number, role: string, projectId: number | undefined, value: PerformanceManagementReturnSnapshot) {
    managementReturn = { key: managementReturnKey(cycleId, role, projectId), expiresAt: Date.now() + 300_000, value }
  }
  function takeManagementReturn(cycleId: number, role: string, projectId?: number) {
    const cached = managementReturn
    managementReturn = null
    return cached && cached.expiresAt > Date.now() && cached.key === managementReturnKey(cycleId, role, projectId) ? cached.value : null
  }
  function clearManagementReturn() { managementReturn = null }
  let projectCopyAudience: { key: string; rules: NonNullable<PerformanceProjectPayload['evaluator_rules']> } | null = null
  function saveProjectCopyAudience(cycleId: number, projectId: number, rules: NonNullable<PerformanceProjectPayload['evaluator_rules']>) {
    projectCopyAudience = { key: managementReturnKey(cycleId, 'project-copy', projectId), rules: JSON.parse(JSON.stringify(rules)) }
  }
  function takeProjectCopyAudience(cycleId: number, projectId: number) {
    const cached = projectCopyAudience
    projectCopyAudience = null
    return cached?.key === managementReturnKey(cycleId, 'project-copy', projectId) ? cached.rules : null
  }
  function invalidate() {
    clearManagementReturn()
    projectCopyAudience = null
    clearPerformanceInFlightRequests()
    cacheVersion.value += 1
    resources.clear()
    resourceRequests.clear()
    drawerDetails.clear()
    drawerRequests.clear()
    reports.clear()
    reportRequests.clear()
    reviewOverviews.value = {}
    workbenchSnapshots.value = {}
    workbenchProjects.value = null
  }
  const resources = new Map<string, { value: unknown; expiresAt: number }>()
  const resourceRequests = new Map<string, Promise<unknown>>()
  function resourceScope(key: string) {
    return JSON.stringify([getToken(), employeeSwitchEpoch.value, activeCycleId.value, cacheVersion.value, key])
  }
  async function loadResource<T>(key: string, loader: () => Promise<T>, ttlMs = 15_000): Promise<T> {
    const scopedKey = resourceScope(key)
    const cached = resources.get(scopedKey)
    if (cached && cached.expiresAt > Date.now()) return cached.value as T
    resources.delete(scopedKey)
    const pending = resourceRequests.get(scopedKey)
    if (pending) return pending as Promise<T>
    const request = loader().then(value => {
      if (scopedKey === resourceScope(key)) resources.set(scopedKey, { value, expiresAt: Date.now() + ttlMs })
      return value
    }).finally(() => {
      if (resourceRequests.get(scopedKey) === request) resourceRequests.delete(scopedKey)
    })
    resourceRequests.set(scopedKey, request)
    return request
  }
  let drawerVersion = 0
  function invalidateDrawerDetails() {
    drawerVersion += 1
    drawerDetails.clear()
    drawerRequests.clear()
  }
  async function loadReport<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const scopedKey = JSON.stringify([employeeSwitchEpoch.value, activeCycleId.value, key])
    const cached = reports.get(scopedKey)
    if (cached && cached.expiresAt > Date.now()) return cached.value as T
    const pending = reportRequests.get(scopedKey)
    if (pending) return pending as Promise<T>
    const version = cacheVersion.value
    const request = loader().then(value => {
      if (version === cacheVersion.value) reports.set(scopedKey, { value, expiresAt: Date.now() + 30_000 })
      return value
    }).finally(() => {
      if (reportRequests.get(scopedKey) === request) reportRequests.delete(scopedKey)
    })
    reportRequests.set(scopedKey, request)
    return request
  }
  async function loadDrawerDetail<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const scopedKey = JSON.stringify([employeeSwitchEpoch.value, activeCycleId.value, key])
    if (drawerDetails.has(scopedKey)) return drawerDetails.get(scopedKey) as T
    const pending = drawerRequests.get(scopedKey)
    if (pending) return pending as Promise<T>
    const version = cacheVersion.value
    const detailVersion = drawerVersion
    const request = loader().then(detail => {
      if (version === cacheVersion.value && detailVersion === drawerVersion) drawerDetails.set(scopedKey, detail)
      return detail
    }).finally(() => {
      if (drawerRequests.get(scopedKey) === request) drawerRequests.delete(scopedKey)
    })
    drawerRequests.set(scopedKey, request)
    return request
  }
  watch(employeeSwitchEpoch, resetIdentity, { flush: 'sync' })

  function setActiveCycleId(cycleId: number | null) {
    if (activeCycleId.value !== cycleId) {
      activeProjectId.value = null
      workbenchProjects.value = null
      reviewOverviews.value = {}
      workbenchSnapshots.value = {}
      invalidate()
    }
    activeCycleId.value = cycleId
    navigationReady.value = true
    if (employeeSwitchSession.value) return
    try {
      if (cycleId) localStorage.setItem(STORAGE_KEY, String(cycleId))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {}
  }
  function setNavigation(value: PerformanceNavigationContext) {
    cycles.value = value.cycles
    navigation.value = value
    navigationLoading.value = false
    navigationError.value = ''
    navigationReady.value = true
    setActiveCycleId(value.active_cycle?.cycle_id ?? null)
  }
  function setNavigationLoading(value: boolean) { navigationLoading.value = value }
  function setNavigationError(value: string) { navigationError.value = value; navigationLoading.value = false; navigation.value = null }
  let navigationRequest: Promise<PerformanceNavigationContext> | null = null
  let requestVersion = 0
  async function refreshNavigation(cycleId = activeCycleId.value, force = false) {
    if (navigationRequest && !force) return navigationRequest
    const version = ++requestVersion
    navigationLoading.value = true
    navigationError.value = ''
    const request = performanceNavigationApi.get(cycleId || undefined)
      .then(value => { if (version === requestVersion) setNavigation(value); return value })
      .catch(error => { if (version === requestVersion) setNavigationError('绩效周期加载失败，请稍后重试'); throw error })
      .finally(() => { if (navigationRequest === request) navigationRequest = null })
    navigationRequest = request
    return request
  }
  async function selectCycle(cycleId: number) {
    setActiveCycleId(cycleId)
    return refreshNavigation(cycleId, true)
  }
  async function ensureNavigation(cycleId?: number) {
    if (navigationRequest) return navigationRequest
    if (navigation.value && navigation.value.active_cycle?.cycle_id === activeCycleId.value && (!cycleId || cycleId === activeCycleId.value)) return navigation.value
    const persistedCycle = activeCycleId.value
    try {
      return await refreshNavigation(cycleId || persistedCycle)
    } catch (error: any) {
      if (cycleId || !persistedCycle || error?.response?.status !== 404) throw error
      return refreshNavigation(null, true)
    }
  }
  function setActiveProjectId(projectId: number | null) {
    activeProjectId.value = projectId
  }
  function setReviewOverview(overview: PerformanceReviewOverview) {
    const projectId = overview.active_project?.project_id
    if (projectId) reviewOverviews.value = { ...reviewOverviews.value, [projectId]: overview }
  }
  function invalidateReviewOverview(projectId: number) {
    invalidate()
    const next = { ...reviewOverviews.value }
    delete next[projectId]
    reviewOverviews.value = next
  }
  function reviewOverview(projectId: number | null | undefined) { return projectId ? reviewOverviews.value[projectId] || null : null }
  function setSelectedReviewNode(projectId: number, nodeId: string) { selectedReviewNodes.value = { ...selectedReviewNodes.value, [projectId]: nodeId } }
  function selectedReviewNode(projectId: number | null | undefined) { return projectId ? selectedReviewNodes.value[projectId] || '' : '' }
  function setWorkbenchProjects(projects: PerformanceWorkbenchProject[]) { workbenchProjects.value = projects }
  function setWorkbenchSnapshot(projectId: number, snapshot: PerformanceWorkbenchSnapshot) { workbenchSnapshots.value = { ...workbenchSnapshots.value, [projectId]: snapshot } }
  function workbenchSnapshot(projectId: number | null | undefined) { return projectId ? workbenchSnapshots.value[projectId] || null : null }

  function resetIdentity() {
    invalidate()
    ++requestVersion
    navigationRequest = null
    activeCycleId.value = null
    cycles.value = []
    navigation.value = null
    navigationLoading.value = false
    navigationError.value = ''
    navigationReady.value = false
    activeProjectId.value = null
    reviewOverviews.value = {}
    selectedReviewNodes.value = {}
    workbenchProjects.value = null
    workbenchSnapshots.value = {}
  }
  return {
    loadResource,
    saveProjectCopyAudience,
    takeProjectCopyAudience,
    saveManagementReturn,
    takeManagementReturn,
    clearManagementReturn,
    resetIdentity,
    loadDrawerDetail,
    invalidateDrawerDetails,
    cacheVersion,
    invalidate,
    loadReport,
    navigationReady,
    navigationLoading,
    navigationError,
    navigation,
    cycles,
    activeCycleId,
    setActiveCycleId,
    setNavigation,
    setNavigationLoading,
    setNavigationError,
    refreshNavigation,
    ensureNavigation,
    selectCycle,
    activeProjectId,
    workbenchProjects,
    setActiveProjectId,
    setReviewOverview,
    invalidateReviewOverview,
    reviewOverview,
    setSelectedReviewNode,
    selectedReviewNode,
    setWorkbenchProjects,
    setWorkbenchSnapshot,
    workbenchSnapshot,
  }
})
