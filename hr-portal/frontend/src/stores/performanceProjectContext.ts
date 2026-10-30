import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { employeeSwitchSession } from './identitySwitch'
import { performanceNavigationApi, type PerformanceCycleNavigationItem, type PerformanceNavigationContext, type PerformanceReviewOverview, type PerformanceWorkbenchProject, type PerformanceWorkbenchTaskGroup, type PerformanceWorkbenchTimelineNode } from '@/api/performance'

const STORAGE_KEY = 'performance.active-cycle-id'

export interface PerformanceWorkbenchSnapshot {
  timeline: PerformanceWorkbenchTimelineNode[]
  pending: PerformanceWorkbenchTaskGroup[]
  completed: PerformanceWorkbenchTaskGroup[]
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

  function setActiveCycleId(cycleId: number | null) {
    if (activeCycleId.value !== cycleId) {
      activeProjectId.value = null
      workbenchProjects.value = null
      reviewOverviews.value = {}
      workbenchSnapshots.value = {}
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
  function reviewOverview(projectId: number | null | undefined) { return projectId ? reviewOverviews.value[projectId] || null : null }
  function setSelectedReviewNode(projectId: number, nodeId: string) { selectedReviewNodes.value = { ...selectedReviewNodes.value, [projectId]: nodeId } }
  function selectedReviewNode(projectId: number | null | undefined) { return projectId ? selectedReviewNodes.value[projectId] || '' : '' }
  function setWorkbenchProjects(projects: PerformanceWorkbenchProject[]) { workbenchProjects.value = projects }
  function setWorkbenchSnapshot(projectId: number, snapshot: PerformanceWorkbenchSnapshot) { workbenchSnapshots.value = { ...workbenchSnapshots.value, [projectId]: snapshot } }
  function workbenchSnapshot(projectId: number | null | undefined) { return projectId ? workbenchSnapshots.value[projectId] || null : null }

  function resetIdentity() {
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
    resetIdentity,
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
    reviewOverview,
    setSelectedReviewNode,
    selectedReviewNode,
    setWorkbenchProjects,
    setWorkbenchSnapshot,
    workbenchSnapshot,
  }
})
