import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { PerformanceReviewOverview, PerformanceWorkbenchProject, PerformanceWorkbenchTaskGroup, PerformanceWorkbenchTimelineNode } from '@/api/performance'

const STORAGE_KEY = 'performance.active-project-id'

export interface PerformanceWorkbenchSnapshot {
  timeline: PerformanceWorkbenchTimelineNode[]
  pending: PerformanceWorkbenchTaskGroup[]
  completed: PerformanceWorkbenchTaskGroup[]
}

function storedProjectId() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

export const usePerformanceProjectContextStore = defineStore('performance-project-context', () => {
  const activeProjectId = ref<number | null>(storedProjectId())
  const reviewOverviews = shallowRef<Record<number, PerformanceReviewOverview>>({})
  const selectedReviewNodes = ref<Record<number, string>>({})
  const workbenchProjects = shallowRef<PerformanceWorkbenchProject[] | null>(null)
  const workbenchSnapshots = shallowRef<Record<number, PerformanceWorkbenchSnapshot>>({})

  function setActiveProjectId(projectId: number | null) {
    activeProjectId.value = projectId
    try {
      if (projectId) localStorage.setItem(STORAGE_KEY, String(projectId))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {}
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

  return {
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
