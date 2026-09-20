<template>
  <div class="review-page">
    <PerformanceReviewCategorySidebar
      :categories="overview?.categories || emptyCategories"
      :projects="overview?.projects || []"
      :active-project="overview?.active_project || null"
      :selected-node-id="selectedNodeId"
      :loading="loading"
      @select-project="selectProject"
      @select-node="selectNode"
    />
    <PerformanceReviewContent
      :loading="loading"
      :error="error"
      :template-name="overview?.template_name || ''"
      :node="selectedNode"
      :project-id="activeProjectId"
      @retry="loadOverview(activeProjectId)"
      @open-node="openNode"
      @open-member="openMember"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  performanceReviewApi,
  type PerformanceReviewCategory,
  type PerformanceReviewNode,
  type PerformanceReviewOverview,
} from '@/api/performance'
import PerformanceReviewCategorySidebar from '@/components/performance/PerformanceReviewCategorySidebar.vue'
import PerformanceReviewContent from '@/components/performance/PerformanceReviewContent.vue'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import { performanceTaskEntryRoute } from '@/components/performance/performanceTaskEntry'

const route = useRoute()
const router = useRouter()
const projectContext = usePerformanceProjectContextStore()
const routeProjectId = Number(route.query.project_id)
if (Number.isFinite(routeProjectId) && routeProjectId > 0) projectContext.setActiveProjectId(routeProjectId)
const activeProjectId = computed(() => projectContext.activeProjectId || undefined)
const overview = ref<PerformanceReviewOverview | null>(null)
const selectedNodeId = ref(String(route.query.node || projectContext.selectedReviewNode(activeProjectId.value) || ''))
const loading = ref(true)
const error = ref('')
const emptyCategories: PerformanceReviewCategory[] = [
  { key: 'mine', label: '我的绩效', nodes: [] },
  { key: 'others', label: '给他人的评估', nodes: [] },
  { key: 'team', label: '我团队的绩效', nodes: [] },
  { key: 'other', label: '其他事项', nodes: [] },
]

const allNodes = computed(() => overview.value?.categories.flatMap(category => category.nodes) || [])
const selectedNode = computed(() => allNodes.value.find(node => node.node_id === selectedNodeId.value) || allNodes.value[0] || null)

function applyOverview(loaded: PerformanceReviewOverview) {
  overview.value = loaded
  const projectId = loaded.active_project?.project_id
  if (projectId) {
    projectContext.setActiveProjectId(projectId)
    projectContext.setReviewOverview(loaded)
    if (String(route.query.project_id || '') !== String(projectId)) void router.replace({ query: { ...route.query, project_id: String(projectId) } })
  }
  const rememberedNode = projectContext.selectedReviewNode(projectId)
  if (!allNodes.value.some(node => node.node_id === selectedNodeId.value)) {
    selectedNodeId.value = allNodes.value.some(node => node.node_id === rememberedNode) ? rememberedNode : allNodes.value[0]?.node_id || ''
  }
  if (projectId && selectedNodeId.value) projectContext.setSelectedReviewNode(projectId, selectedNodeId.value)
}
function routeTaskId() {
  const taskId = Number(route.query.task_id)
  return Number.isFinite(taskId) && taskId > 0 ? taskId : undefined
}
async function loadOverview(projectId?: number, silent = false) {
  if (!silent) loading.value = true
  if (!silent) error.value = ''
  try {
    const loaded = await performanceReviewApi.overview(projectId, routeTaskId())
    if (projectId && activeProjectId.value !== projectId) return
    applyOverview(loaded)
    error.value = ''
  } catch {
    if (!silent) error.value = '绩效评估加载失败，请稍后重试'
  } finally {
    if (!silent) loading.value = false
  }
}
async function selectProject(rawProjectId: number | string) {
  const projectId = Number(rawProjectId)
  if (!Number.isFinite(projectId) || projectId <= 0) return
  const unchanged = projectId === activeProjectId.value && overview.value?.active_project?.project_id === projectId
  projectContext.setActiveProjectId(projectId)
  selectedNodeId.value = projectContext.selectedReviewNode(projectId)
  const { node: _node, task_id: _taskId, ...query } = route.query
  await router.replace({ query: { ...query, project_id: String(projectId) } })
  if (unchanged) return
  const cached = projectContext.reviewOverview(projectId)
  if (cached) {
    applyOverview(cached)
    loading.value = false
    await loadOverview(projectId, true)
  } else await loadOverview(projectId)
}
async function selectNode(node: PerformanceReviewNode) {
  selectedNodeId.value = node.node_id
  if (activeProjectId.value) projectContext.setSelectedReviewNode(activeProjectId.value, node.node_id)
  const { task_id: _taskId, ...query } = route.query
  await router.replace({ query: { ...query, project_id: String(activeProjectId.value || ''), node: node.node_id } })
}
async function openNode(node: PerformanceReviewNode) {
  const taskRoute = performanceTaskEntryRoute(node, activeProjectId.value)
  if (taskRoute) {
    await router.replace({ query: { ...route.query, project_id: String(activeProjectId.value || ''), node: node.node_id, task_id: String(node.task_id) } })
    await router.push(taskRoute)
    return
  }
  if (node.entry_mode === 'template_task') return
  await router.push(node.action_url)
}
async function openMember(payload: { node: PerformanceReviewNode; member: { aggregate_task_id?: number | null; employee_no: string } }) {
  const taskId = payload.member.aggregate_task_id || payload.node.task_id
  if (!taskId) return
  const taskRoute = performanceTaskEntryRoute({ ...payload.node, task_id: taskId }, activeProjectId.value)
  if (!taskRoute) return
  await router.replace({ query: { ...route.query, project_id: String(activeProjectId.value || ''), node: payload.node.node_id, task_id: String(taskId), employee_no: payload.member.employee_no } })
  await router.push(taskRoute)
}
onMounted(() => {
  const cached = projectContext.reviewOverview(activeProjectId.value)
  if (cached) {
    applyOverview(cached)
    loading.value = false
    void loadOverview(activeProjectId.value, true)
  } else void loadOverview(activeProjectId.value)
})
</script>

<style scoped>
:global(html:has(.review-page)) { scrollbar-gutter: auto; }
.review-page { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex: 1; overflow: hidden; background: #f4f6f8; }
@media (max-width: 720px) { .review-page { display: block; } }
</style>
