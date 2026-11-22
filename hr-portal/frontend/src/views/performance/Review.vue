<template>
  <div class="review-page">
    <PerformanceReviewCategorySidebar
      :categories="visibleCategories"
      :filter-options="cycleOptions"
      :active-filter-value="projectContext.activeCycleId ?? undefined"
      @select-filter="selectCycle"
      :projects="overview?.projects || []"
      :active-project="overview?.active_project || null"
      :selected-node-id="resultScopeKind ? selectedNodeId : calibrationSelected ? '__calibration__' : isReviewer360Node(selectedNode || {}) ? '__reviewer-360__' : `${activeProjectId}:${selectedNodeId}`"
      :loading="loading"
      @select-project="selectProject"
      @select-node="selectNode"
    >
    </PerformanceReviewCategorySidebar>
    <PerformanceResultScopeView v-if="resultScopeKind && projectContext.activeCycleId" :kind="resultScopeKind" :cycle-id="projectContext.activeCycleId" />
    <PerformanceCalibrationWorkspace
      v-else-if="calibrationSelected && projectContext.activeCycleId"
      :cycle-id="projectContext.activeCycleId"
      :node-id="selectedNode?.node_id"
      @open-member="openMember"
      @remind-evaluate="openEvaluateReminder"
    >
      <template #all-people="{ tasks, cycleId, tab }"><CalibrationAllPeople :tasks="tasks" :cycle-id="cycleId" :tab="tab" @open-member="openMember" /></template>
      <template #matrix="{ scope }"><CalibrationScopeAnalysis :scope="scope" :cycle-id="projectContext.activeCycleId" tab="matrix" @open-member="openMember" /></template>
      <template #report="{ scope }"><CalibrationScopeAnalysis :scope="scope" :cycle-id="projectContext.activeCycleId" tab="report" @open-member="openMember" /></template>
    </PerformanceCalibrationWorkspace>
    <PerformanceReviewContent
      v-else
      :loading="loading"
      :error="error"
      :template-name="overview?.template_name || ''"
      :node="selectedNode"
      :feedback-sources="selectedNode && isReviewer360Node(selectedNode) ? reviewer360Sources : undefined"
      :project-id="activeProjectId"
      :member-preference-scope="activeProjectId && projectContext.activeCycleId && selectedNodeId ? { cycle_ref: projectContext.activeCycleId, scene: 'evaluation', project_id: activeProjectId, node_id: selectedNodeId } : undefined"
      :result-unavailable="resultUnavailable"
      :content-title="selectedNode?.node_type === 'result_view' ? resultPageTitle : undefined"
      @retry="loadOverview(activeProjectId)"
      @open-node="openNode"
      @open-member="openMember"
      @remind-evaluate="openEvaluateReminder"
    >
      <template #heading-actions><PerformanceResultReconsiderationMenu v-if="selectedNode?.node_type === 'result_view' && !resultLoading && !resultError && !reconsiderationError" :status="reconsideration" :expired="reconsiderationExpired" :busy="reconsiderationBusy" @start="reconsiderationPanel?.open()" /></template>
      <div v-if="selectedNode?.node_type === 'result_view'" class="review-results" aria-label="我的绩效结果">
        <div v-if="resultLoading" role="status">正在加载绩效结果…</div>
        <div v-else-if="resultError" role="alert">{{ resultError }} <button type="button" @click="loadMyResults">重新加载</button></div>
        <template v-else>
          <PerformanceResultReconsideration v-if="activeProjectId" :key="`${activeProjectId}-${selectedNodeId}`" ref="reconsiderationPanel" :project-id="activeProjectId" :status="reconsideration" :expired="reconsiderationExpired" :loading="reconsiderationLoading" :load-error="reconsiderationError" @retry="loadReconsideration()" @updated="reconsideration = $event" @busy="reconsiderationBusy = $event" />
          <div v-if="!hasResultContent">暂无可查看的绩效结果</div>
          <section v-for="region in visibleResultRegions" :key="region.key" class="result-region" :data-region-id="region.key" :aria-label="region.title">
            <h3 v-if="region.kind === 'reference' && region.reference_kind !== 'reviewer_360'">{{ region.title }}</h3>
            <PerformanceResultReviewer360Block v-if="region.reference_kind === 'reviewer_360'" :title="region.title" :contents="region.contents" :visibility="region.visibility" :detail-mode="region.detail_mode" />
            <PerformanceOkrPanel v-else-if="region.reference_kind === 'okr'" :okr="region.okr || null" :okrs="region.okrs || []" />
            <template v-else>
              <PerformanceTemplateRenderer v-for="content in region.contents" :key="content.task_id" mode="readonly" :sections="content.form_schema" :answers="content.answers" />
              <p v-if="region.kind === 'reference' && !region.contents.some(content => content.form_schema.length)">暂无可查看内容</p>
            </template>
          </section>
        </template>
      </div>
    </PerformanceReviewContent>
    <PerformanceReviewEvaluationDrawer
      v-if="drawerMember"
      v-model="drawerOpen"
      :project-id="drawerMember.member.project_id || activeProjectId"
      :task-id="drawerMember.task_id"
      :detail-loader="drawerDetailLoader"
      :employee-no="drawerMember.member.employee_no"
      :node-name="drawerMember.node.node_name"
      :person="drawerMember.member"
      :active-tab="drawerMember.active_tab"
      :readonly="Boolean(performanceReviewDisplay(drawerMember.node.node_type)?.completedReadonly)"
      @update:active-tab="updateDrawerTab"
      @close="closeDrawer"
      @closed="finishClosingDrawer"
      @copy-link="copyDrawerLink"
      @edit="editDrawerTask"
      @remind="openDrawerReminder"
    />
    <PerformanceMemberReminderDialog v-model="reminderOpen" :context="reminderContext" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import {
  performanceReviewApi,
  projectManagementApi,
  type PerformanceReferenceTab,
  type PerformanceReviewMemberContext,
  type PerformanceReviewNode,
  type PerformanceReviewOverview,
  type PerformanceResultRegion,
} from '@/api/performance'
import PerformanceMemberReminderDialog from '@/components/performance/PerformanceMemberReminderDialog.vue'
import { usePerformanceMemberReminder } from '@/composables/usePerformanceMemberReminder'
import PerformanceResultReconsideration from '@/components/performance/PerformanceResultReconsideration.vue'
import PerformanceResultReconsiderationMenu from '@/components/performance/PerformanceResultReconsiderationMenu.vue'
import PerformanceTemplateRenderer from '@/components/performance/PerformanceTemplateRenderer.vue'
import PerformanceResultReviewer360Block, { hasVisibleReviewer360Content } from '@/components/performance/PerformanceResultReviewer360Block.vue'
import PerformanceOkrPanel from '@/components/performance/PerformanceOkrPanel.vue'
import PerformanceReviewCategorySidebar, { type ReviewNavigationNode } from '@/components/performance/PerformanceReviewCategorySidebar.vue'
import PerformanceResultScopeView from '@/components/performance/PerformanceResultScopeView.vue'
import PerformanceCalibrationWorkspace from '@/components/performance/calibration/PerformanceCalibrationWorkspace.vue'
import CalibrationAllPeople from '@/components/performance/calibration/CalibrationAllPeople.vue'
import CalibrationScopeAnalysis from '@/components/performance/calibration/CalibrationScopeAnalysis.vue'
import PerformanceReviewContent from '@/components/performance/PerformanceReviewContent.vue'
import PerformanceReviewEvaluationDrawer from '@/components/performance/PerformanceReviewEvaluationDrawer.vue'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import { performanceTaskEntryRoute } from '@/components/performance/performanceTaskEntry'
import { isReviewer360Node, isSelfEvaluationNode } from '@/components/performance/performanceExecutorOptions'
import { performanceReviewDisplay } from '@/components/performance/performanceReviewDisplay'
import { supportsReminderSourceTask } from '@/components/performance/performanceReminder'

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
const resultRegions = ref<PerformanceResultRegion[]>([])
const resultPageTitle = ref('')
const visibleResultRegions = computed(() => resultRegions.value.filter(region => region.reference_kind !== 'reviewer_360' || region.visibility === 'hidden' || region.contents.some(hasVisibleReviewer360Content)))
const hasResultContent = computed(() => visibleResultRegions.value.some(region => region.reference_kind === 'okr' || region.visibility === 'hidden' || region.contents.some(content => content.form_schema.length > 0)))
const resultLoading = ref(false)
const resultError = ref('')
const resultUnavailable = ref(false)
const reconsideration = ref<Awaited<ReturnType<typeof projectManagementApi.resultReconsideration>> | null>(null)
const reconsiderationPanel = ref<InstanceType<typeof PerformanceResultReconsideration> | null>(null)
const reconsiderationBusy = ref(false)
const reconsiderationLoading = ref(false)
const reconsiderationError = ref('')
const clock = ref(Date.now())
const clockTimer = window.setInterval(() => { clock.value = Date.now() }, 1000)
const reconsiderationExpired = computed(() => {
  const value = reconsideration.value?.deadline_at
  if (!value) return true
  const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`
  return !Number.isFinite(Date.parse(normalized)) || clock.value > Date.parse(normalized)
})
const resultsEntry = ref(route.query.entry === 'results')
let resultRequest = 0
let reconsiderationRequest = 0
onBeforeUnmount(() => { ++resultRequest; ++reconsiderationRequest; clearInterval(clockTimer) })
async function loadReconsideration(resultEpoch = resultRequest) {
  const projectId = activeProjectId.value
  if (!projectId || selectedNode.value?.node_type !== 'result_view') return
  const request = ++reconsiderationRequest
  reconsiderationLoading.value = true
  reconsiderationError.value = ''
  try {
    const value = await projectManagementApi.resultReconsideration(projectId)
    if (resultEpoch === resultRequest && request === reconsiderationRequest) reconsideration.value = value
  } catch (cause: any) {
    if (resultEpoch === resultRequest && request === reconsiderationRequest && cause?.response?.data?.detail !== 'RECONSIDERATION_NOT_CONFIGURED') reconsiderationError.value = '复议状态加载失败，请重试'
  } finally {
    if (resultEpoch === resultRequest && request === reconsiderationRequest) reconsiderationLoading.value = false
  }
}
async function loadMyResults() {
  const projectId = activeProjectId.value
  const request = ++resultRequest
  resultRegions.value = []
  resultUnavailable.value = false
  resultPageTitle.value = ''
  reconsideration.value = null
  ++reconsiderationRequest
  reconsiderationBusy.value = false
  reconsiderationLoading.value = false
  reconsiderationError.value = ''
  resultError.value = ''
  resultLoading.value = false
  if (!projectId || selectedNode.value?.node_type !== 'result_view') return
  resultLoading.value = true
  try {
    const response = await projectManagementApi.myResults(projectId)
    if (request !== resultRequest) return
    resultPageTitle.value = response.content_page_name || selectedNode.value?.node_name || ''
    resultRegions.value = response.regions ?? [{ key: 'result', kind: 'result', title: resultPageTitle.value, contents: response.contents || [] }]
    void loadReconsideration(request)
  } catch (cause: any) {
    if (request === resultRequest) {
      if (cause?.response?.status === 404 && cause?.response?.data?.detail === 'RESULT_NOT_FOUND') resultUnavailable.value = true
      else resultError.value = '绩效结果加载失败，请重试'
    }
  } finally {
    if (request === resultRequest) resultLoading.value = false
  }
}
const TEAM_RESULT_NODE_ID = '__team-results__'
const FOCUS_RESULT_NODE_ID = '__focus-results__'
const resultScopeKind = computed<'team' | 'focus' | null>(() => {
  const navigation = projectContext.navigation
  if (projectContext.navigationLoading || navigation?.active_cycle?.cycle_id !== projectContext.activeCycleId) return null
  if (selectedNodeId.value === TEAM_RESULT_NODE_ID && navigation?.can_view_team_results) return 'team'
  if (selectedNodeId.value === FOCUS_RESULT_NODE_ID && navigation?.can_view_focus_results) return 'focus'
  return null
})
const scopeRoute = () => route.query.node === TEAM_RESULT_NODE_ID || route.query.node === FOCUS_RESULT_NODE_ID
const resultScopeNodes = computed<PerformanceReviewNode[]>(() => [
  ...(projectContext.navigation?.can_view_team_results ? [{ node_id: TEAM_RESULT_NODE_ID, node_name: '查看团队绩效结果', node_type: 'team_results', entry_mode: 'none' as const, executor_label: '', status: 'completed' as const, start_at: null, end_at: null, action_url: '' }] : []),
  ...(projectContext.navigation?.can_view_focus_results ? [{ node_id: FOCUS_RESULT_NODE_ID, node_name: '关注人员的绩效结果', node_type: 'focus_results', entry_mode: 'none' as const, executor_label: '', status: 'completed' as const, start_at: null, end_at: null, action_url: '' }] : []),
])
const projectCategories = computed(() => {
  const categories: Array<{ key: string; label: string; nodes: ReviewNavigationNode[] }> = []
  const projects = overview.value?.projects || []
  for (const project of projects) {
    const source = project.project_id === overview.value?.active_project?.project_id ? overview.value : projectContext.reviewOverview(project.project_id)
    for (const category of source?.categories || []) {
      if (!category.nodes.length) continue
      let target = categories.find(item => item.key === category.key)
      if (!target) { target = { ...category, nodes: [] }; categories.push(target) }
      target.nodes.push(...category.nodes.map(node => ({ ...node, project_id: project.project_id, navigation_id: `${project.project_id}:${node.node_id}` })))
    }
  }
  if (resultScopeNodes.value.length) {
    const team = categories.find(category => category.key === 'team')
    if (team) team.nodes.push(...resultScopeNodes.value)
    else categories.push({ key: 'team', label: '我团队的绩效', nodes: resultScopeNodes.value })
  }
  const order = ['mine', 'others', 'team', 'other']
  return categories.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
})
const reviewer360Sources = computed(() => projectCategories.value.flatMap(category => category.nodes)
  .filter(node => node.project_id && isReviewer360Node(node))
  .map(node => ({ project_id: node.project_id!, node_id: node.node_id, project_name: overview.value?.projects.find(project => project.project_id === node.project_id)?.project_name || '', node_name: node.node_name })))
const visibleCategories = computed(() => projectCategories.value.map(category => {
  const nodes: ReviewNavigationNode[] = []
  const feedback = category.nodes.filter(isReviewer360Node)
  for (const node of category.nodes) {
    if (node.node_type === 'calibration') {
      if (nodes.some(item => item.node_type === 'calibration')) continue
      const calibration = category.nodes.filter(item => item.node_type === 'calibration')
      const status = ['overdue', 'pending', 'not_started', 'completed'].find(value => calibration.some(item => item.status === value)) as PerformanceReviewNode['status'] || 'completed'
      nodes.push({ ...node, navigation_id: '__calibration__', status })
      continue
    }
    if (!isReviewer360Node(node)) { nodes.push(node); continue }
    if (nodes.some(isReviewer360Node)) continue
    const status = ['overdue', 'pending', 'not_started', 'completed'].find(value => feedback.some(item => item.show_status !== false && item.status === value)) as PerformanceReviewNode['status'] || 'completed'
    nodes.push({ ...node, navigation_id: '__reviewer-360__', status, show_status: feedback.some(item => item.show_status !== false) })
  }
  return { ...category, nodes }
}))
const cycleOptions = computed(() => projectContext.cycles.map(cycle => ({ value: cycle.cycle_id, label: cycle.cycle_name })))
const allNodes = computed(() => projectCategories.value.flatMap(category => category.nodes).filter(node => !node.project_id || node.project_id === activeProjectId.value))
const selectedNode = computed(() => resultScopeKind.value ? allNodes.value.find(node => node.node_id === selectedNodeId.value) || null : overview.value?.active_project?.project_id === activeProjectId.value ? allNodes.value.find(node => node.node_id === selectedNodeId.value) || null : null)
const calibrationSelected = computed(() => selectedNode.value?.node_type === 'calibration' && selectedNode.value.status !== 'not_started' || route.query.calibration_open === '1')
watch([activeProjectId, () => selectedNode.value?.node_id, () => selectedNode.value?.node_type], () => { void loadMyResults() })
const drawerMember = ref<{ node: PerformanceReviewNode; member: PerformanceReviewMemberContext; task_id: number; active_tab: string } | null>(null)
const drawerOpen = ref(false)
const drawerDetailLoader = computed(() => {
  const member = drawerMember.value
  const projectId = member?.member.project_id || member?.node.project_id || activeProjectId.value
  return member ? (tab?: string) => projectContext.loadDrawerDetail(
    JSON.stringify(['review', projectId, member.member.employee_no, member.task_id, tab || '']),
    () => performanceReviewApi.templateTask(member.task_id, member.member.employee_no || undefined, { view: 'drawer', tab }),
  ) : undefined
})
function finishClosingDrawer() { if (!drawerOpen.value) drawerMember.value = null }
function clearDrawerQuery() {
  const { rootReviewId: _rootReview, activeTab: _activeTab, employee_no: _employee, member_project_id: _memberProject, ...query } = route.query
  return query
}
function drawerQuery() {
  const current = drawerMember.value
  return { ...clearDrawerQuery(), project_id: String(activeProjectId.value || ''), node: current?.node.node_id, ...(current?.node.node_type === 'calibration' ? { member_project_id: String((current.member as { project_id?: number }).project_id || activeProjectId.value || '') } : {}), rootReviewId: String(current?.task_id || ''), activeTab: current?.active_tab === 'evaluation' ? current.node.node_id : current?.active_tab }
}
async function closeDrawer() {
  drawerOpen.value = false
  await router.replace({ query: clearDrawerQuery() })
}
async function updateDrawerTab(value: string) {
  if (!drawerMember.value) return
  drawerMember.value.active_tab = value
  await router.replace({ query: drawerQuery() })
}
async function copyDrawerLink() {
  if (!drawerMember.value) return
  try {
    const url = router.resolve({ path: '/performance/review', query: drawerQuery() }).href
    await navigator.clipboard.writeText(new URL(url, window.location.origin).href)
    ElMessage.success('链接已复制')
  } catch { ElMessage.error('复制失败，请从浏览器地址栏复制链接') }
}
function restoreDrawer() {
  const taskId = Number(route.query.rootReviewId)
  const node = projectCategories.value.flatMap(category => category.nodes).find(item => item.node_id === String(route.query.node || '') && (!route.query.member_project_id || item.project_id === Number(route.query.member_project_id)))
  if (!Number.isSafeInteger(taskId) || taskId <= 0 || !node || !(node.task_kind === 'evaluation' || performanceReviewDisplay(node.node_type)?.completedView === 'drawer')) return
  if (drawerMember.value?.task_id === taskId && drawerMember.value.node.node_id === node.node_id) {
    drawerMember.value.active_tab = !route.query.activeTab || route.query.activeTab === node.node_id ? 'evaluation' : String(route.query.activeTab)
    drawerOpen.value = true
    return
  }
  selectedNodeId.value = node.node_id
  drawerMember.value = { node, task_id: taskId, member: { employee_no: '', project_id: Number(route.query.member_project_id) || undefined }, active_tab: !route.query.activeTab || route.query.activeTab === node.node_id ? 'evaluation' : String(route.query.activeTab) }
  drawerOpen.value = true
}
watch(() => route.query.project_id, value => {
  const projectId = Number(value)
  if (scopeRoute() || !Number.isSafeInteger(projectId) || projectId <= 0 || projectId === activeProjectId.value) return
  if (!projectContext.navigation?.review_projects.some(project => project.project_id === projectId)) {
    overview.value = null
    error.value = '当前项目不存在或无权查看'
    return
  }
  projectContext.setActiveProjectId(projectId)
  selectedNodeId.value = String(route.query.node || '')
  drawerMember.value = null
  void loadOverview(projectId)
})
watch(() => route.query.node, value => {
  if (scopeRoute()) {
    selectedNodeId.value = resultScopeNodes.value.find(node => node.node_id === value)?.node_id || ''
    error.value = selectedNodeId.value ? '' : '当前评估环节不存在或无权查看'
    return
  }
  if (loading.value || overview.value?.active_project?.project_id !== activeProjectId.value || !value) return
  const node = allNodes.value.find(item => item.node_id === String(value))
  selectedNodeId.value = node?.node_id || ''
  error.value = node ? '' : '当前评估环节不存在或无权查看'
  if (node && activeProjectId.value) projectContext.setSelectedReviewNode(activeProjectId.value, node.node_id)
})
watch(() => [route.query.rootReviewId, route.query.activeTab, route.query.node], () => {
  if (!route.query.rootReviewId) drawerOpen.value = false
  else restoreDrawer()
})

function applyOverview(loaded: PerformanceReviewOverview) {
  overview.value = loaded
  const projectId = loaded.active_project?.project_id
  if (projectId) {
    projectContext.setActiveProjectId(projectId)
    projectContext.setReviewOverview(loaded)
    if (!scopeRoute() && String(route.query.project_id || '') !== String(projectId)) void router.replace({ query: { ...route.query, cycle_id: projectContext.activeCycleId ? String(projectContext.activeCycleId) : undefined, project_id: String(projectId) } })
  }
  const rememberedNode = projectContext.selectedReviewNode(projectId)
  if (resultsEntry.value) {
    selectedNodeId.value = allNodes.value.find(node => node.node_type === 'result_view')?.node_id || ''
    if (selectedNodeId.value) {
      const { entry: _entry, task_id: _task, ...query } = clearDrawerQuery()
      void router.replace({ query: { ...query, cycle_id: String(projectContext.activeCycleId || ''), project_id: String(projectId || ''), node: selectedNodeId.value } })
    } else error.value = '当前项目没有可查看的绩效结果入口'
  } else if (!allNodes.value.some(node => node.node_id === selectedNodeId.value)) {
    if (route.query.node) {
      selectedNodeId.value = allNodes.value.find(node => node.node_id === String(route.query.node))?.node_id || ''
      if (!selectedNodeId.value) error.value = '当前评估环节不存在或无权查看'
    } else selectedNodeId.value = allNodes.value.some(node => node.node_id === rememberedNode) ? rememberedNode : allNodes.value[0]?.node_id || ''
  }
  if (projectId && selectedNodeId.value) projectContext.setSelectedReviewNode(projectId, selectedNodeId.value)
  restoreDrawer()
}
function routeTaskId() {
  const taskId = Number(route.query.rootReviewId || route.query.task_id)
  return Number.isFinite(taskId) && taskId > 0 ? taskId : undefined
}
let overviewRequest = 0
let disposed = false
onBeforeUnmount(() => { disposed = true; ++overviewRequest })
async function loadOverview(projectId?: number, silent = false) {
  if (disposed) return
  const request = ++overviewRequest
  const cycleId = projectContext.activeCycleId
  const cacheVersion = projectContext.cacheVersion
  const current = () => !disposed && request === overviewRequest && cycleId === projectContext.activeCycleId && cacheVersion === projectContext.cacheVersion && (!projectId || activeProjectId.value === projectId)
  if (!silent) loading.value = true
  if (!silent) error.value = ''
  try {
    const loaded = await performanceReviewApi.overview(projectId, routeTaskId(), cycleId || undefined)
    if (!current()) return
    error.value = ''
    applyOverview(loaded)
    if (!silent) loading.value = false
    await Promise.all(loaded.projects.filter(project => project.project_id !== loaded.active_project?.project_id).map(async project => {
      try {
        const value = await performanceReviewApi.overview(project.project_id, undefined, cycleId || undefined)
        if (current() && value.active_project?.project_id === project.project_id) projectContext.setReviewOverview(value)
      } catch {
        if (current()) error.value = '部分项目评估导航加载失败，请重试'
      }
    }))
    if (!current()) return
    if (projectContext.navigation && projectContext.navigation.can_review !== (loaded.projects.length > 0 || Boolean(projectContext.navigation.can_view_team_results || projectContext.navigation.can_view_focus_results))) {
      const navigation = await projectContext.refreshNavigation(projectContext.activeCycleId || undefined, true)
      if (current() && !navigation.can_review) await router.replace('/performance/workbench')
    }
  } catch {
    if (current() && !silent) error.value = '绩效评估加载失败，请稍后重试'
  } finally {
    if (current() && !silent) loading.value = false
  }
}
async function selectCycle(rawCycleId: number | string) {
  const cycleId = Number(rawCycleId)
  if (!Number.isFinite(cycleId) || cycleId <= 0 || cycleId === projectContext.activeCycleId) return
  overview.value = null
  selectedNodeId.value = ''
  drawerMember.value = null
  loading.value = true
  try {
    const navigation = await projectContext.selectCycle(cycleId)
    if (projectContext.activeCycleId !== cycleId) return
    if (!navigation.can_review) { await router.replace('/performance/workbench'); return }
    await router.replace({ query: { cycle_id: String(cycleId) } })
    await loadOverview()
  } catch { error.value = '绩效评估加载失败，请稍后重试' }
  finally { loading.value = false }
}
async function selectProject(rawProjectId: number | string) {
  const projectId = Number(rawProjectId)
  if (!Number.isFinite(projectId) || projectId <= 0) return
  const unchanged = projectId === activeProjectId.value && overview.value?.active_project?.project_id === projectId
  projectContext.setActiveProjectId(projectId)
  selectedNodeId.value = projectContext.selectedReviewNode(projectId)
  await router.replace({ query: { cycle_id: String(projectContext.activeCycleId), project_id: String(projectId) } })
  if (unchanged) return
  const cached = projectContext.reviewOverview(projectId)
  if (cached) {
    applyOverview(cached)
    loading.value = false
    await loadOverview(projectId, true)
  } else await loadOverview(projectId)
}
async function selectNode(node: ReviewNavigationNode) {
  const cycleId = projectContext.activeCycleId
  resultsEntry.value = false
  if (node.project_id && node.project_id !== activeProjectId.value) {
    projectContext.setSelectedReviewNode(node.project_id, node.node_id)
    await selectProject(node.project_id)
    if (activeProjectId.value !== node.project_id || cycleId !== projectContext.activeCycleId || disposed) return
  }
  error.value = ''
  selectedNodeId.value = node.node_id
  if (node.node_id === TEAM_RESULT_NODE_ID || node.node_id === FOCUS_RESULT_NODE_ID) {
    drawerMember.value = null
    await router.replace({ query: { cycle_id: String(projectContext.activeCycleId || ''), node: node.node_id } })
    return
  }
  if (activeProjectId.value) projectContext.setSelectedReviewNode(activeProjectId.value, node.node_id)
  drawerMember.value = null
  const { task_id: _taskId, entry: _entry, tab: _tab, calibration_open: _calibrationOpen, calibration_scope: _calibrationScope, calibration_tab: _calibrationTab, ...query } = clearDrawerQuery()
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
async function openMember(payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext }) {
  const taskId = payload.member.task_id || payload.member.aggregate_task_id || payload.node.task_id
  if (!taskId) return
  const memberProjectId = payload.member.project_id || payload.node.project_id || activeProjectId.value
  payload = { ...payload, member: { ...payload.member, project_id: memberProjectId } }
  if (isReviewer360Node(payload.node) && memberProjectId && memberProjectId !== activeProjectId.value) {
    const cycleId = projectContext.activeCycleId
    await selectProject(memberProjectId)
    if (disposed || cycleId !== projectContext.activeCycleId || memberProjectId !== activeProjectId.value) return
  }
  if (isReviewer360Node(payload.node)) {
    const source = allNodes.value.find(node => node.node_id === payload.node.node_id && isReviewer360Node(node))
    if (!source) return
    payload = { ...payload, node: source }
    selectedNodeId.value = source.node_id
  }
  if (payload.node.node_type === 'calibration' || payload.member.status === 'completed' && ((payload.node.task_kind === 'evaluation' && !isSelfEvaluationNode(payload.node)) || performanceReviewDisplay(payload.node.node_type)?.completedView === 'drawer')) {
    drawerMember.value = { node: payload.node, member: payload.member, task_id: taskId, active_tab: 'evaluation' }
    drawerOpen.value = true
    await router.replace({ query: drawerQuery() })
    return
  }
  drawerMember.value = null
  const taskNode = isReviewer360Node(payload.node)
    ? { ...payload.node, task_id: taskId, task_kind: 'evaluation' as const, entry_mode: 'template_task' as const }
    : { ...payload.node, task_id: taskId }
  let taskRoute = performanceTaskEntryRoute(taskNode, activeProjectId.value, payload.member.employee_no)
  if (!taskRoute) return
  if (payload.node.node_type === 'result_reconsideration' && projectContext.activeCycleId) taskRoute += `&cycle_id=${projectContext.activeCycleId}`
  await router.replace({ query: { ...clearDrawerQuery(), project_id: String(activeProjectId.value || ''), node: payload.node.node_id, task_id: String(taskId), employee_no: payload.member.employee_no } })
  await router.push(taskRoute)
}
const { reminderOpen, reminderContext, openMemberReminder } = usePerformanceMemberReminder()
function openEvaluateReminder(payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext; pendingCount: number }) {
  if (!payload.pendingCount) return
  const sourceTaskId = payload.member.task_id || payload.member.aggregate_task_id || payload.node.task_id || undefined
  const memberProjectId = payload.member.project_id || payload.node.project_id || activeProjectId.value
  openMemberReminder({ projectId: Number(memberProjectId), cycleId: projectContext.activeCycleId || undefined, employeeNo: payload.member.employee_no, displayName: payload.member.display_name, sourceTaskId: supportsReminderSourceTask(payload.node.task_kind || payload.node.node_type) ? sourceTaskId : undefined, targetKind: 'reviewer_360' })
}
function openDrawerReminder(reference: PerformanceReferenceTab, sourceTaskId?: number) {
  const member = drawerMember.value
  openMemberReminder({ projectId: Number(member?.member.project_id || member?.node.project_id || activeProjectId.value), cycleId: projectContext.activeCycleId || undefined, employeeNo: reference.employee_no || member?.member.employee_no || '', displayName: member?.member.display_name, sourceTaskId: sourceTaskId || (member && supportsReminderSourceTask(member.node.task_kind || member.node.node_type) ? member.task_id : undefined), nodeId: reference.node_id, targetKind: reference.kind === 'reviewer_360' ? 'reviewer_360' : undefined, taskId: reference.kind === 'reviewer_360' ? undefined : reference.task_id || undefined })
}
async function editDrawerTask(payload: { task_id: string | number; employee_no: string; draft_choice?: 'use' | 'discard'; task_kind?: string; node_id?: string; phase_id?: string | null; project_id?: number }) {
  const current = drawerMember.value
  projectContext.invalidateDrawerDetails()
  drawerMember.value = null
  if (!current) return
  const node = payload.node_id && payload.node_id !== current.node.node_id
    ? allNodes.value.find(item => item.node_id === payload.node_id) || { ...current.node, node_id: payload.node_id, task_kind: payload.task_kind }
    : current.node
  const memberProjectId = payload.project_id || current.member.project_id || current.node.project_id || activeProjectId.value
  let taskRoute = performanceTaskEntryRoute({ ...node, task_kind: payload.task_kind || node.task_kind || (node.node_type === 'calibration' ? 'calibration' : undefined), entry_mode: 'template_task', task_id: Number(payload.task_id), draft_choice: payload.draft_choice }, memberProjectId, payload.employee_no)
  if (!taskRoute) return
  if ((payload.task_kind || node.task_kind) === 'result_reconsideration' && projectContext.activeCycleId) taskRoute += `&cycle_id=${projectContext.activeCycleId}`
  if (payload.phase_id) taskRoute += `&phase_id=${encodeURIComponent(payload.phase_id)}`
  await router.replace({ query: { ...clearDrawerQuery(), project_id: String(activeProjectId.value || ''), node: node.node_id, task_id: String(payload.task_id), employee_no: payload.employee_no } })
  await router.push(taskRoute)
}
onMounted(async () => {
  const routeCycleId = Number(route.query.cycle_id)
  try {
    if (!projectContext.navigationReady || (routeCycleId > 0 && routeCycleId !== projectContext.activeCycleId)) {
      await projectContext.ensureNavigation(Number.isFinite(routeCycleId) && routeCycleId > 0 ? routeCycleId : undefined)
    }
    if (disposed) return
    if (Number.isFinite(routeProjectId) && routeProjectId > 0) projectContext.setActiveProjectId(routeProjectId)
  } catch { if (!disposed) { error.value = projectContext.navigationError || '绩效评估加载失败，请稍后重试'; loading.value = false }; return }
  if (disposed) return
  if (projectContext.navigation && !projectContext.navigation.can_review && !scopeRoute()) { await router.replace('/performance/workbench'); return }
  if (scopeRoute()) {
    selectedNodeId.value = resultScopeNodes.value.find(node => node.node_id === route.query.node)?.node_id || ''
    if (!selectedNodeId.value) { error.value = '当前评估环节不存在或无权查看'; loading.value = false; return }
    await router.replace({ query: { cycle_id: String(projectContext.activeCycleId), node: selectedNodeId.value, tab: route.query.tab,
      ...(route.query.member_project_id ? { member_project_id: route.query.member_project_id, employee_no: route.query.employee_no, rootReviewId: route.query.rootReviewId, activeTab: route.query.activeTab } : {}),
    } })
  }
  if (projectContext.navigation && !projectContext.navigation.review_projects.some(project => project.project_id === activeProjectId.value)) {
    if (routeProjectId > 0 && !scopeRoute()) { error.value = '当前项目不存在或无权查看'; loading.value = false; return }
    projectContext.setActiveProjectId(projectContext.navigation.review_projects[0]?.project_id ?? null)
  }
  const cached = projectContext.reviewOverview(activeProjectId.value)
  if (cached) {
    applyOverview(cached)
    loading.value = false
    void loadOverview(activeProjectId.value, true)
  } else void loadOverview(activeProjectId.value)
})
</script>

<style scoped>
.review-results{min-width:0;width:100%;color:var(--color-text-primary)}
.result-region{min-width:0}.result-region + .result-region{margin-top:var(--spacing-4)}
.result-region > h3{margin:0 0 16px;font-size:16px;line-height:24px;font-weight:600}
.result-region > .performance-template-renderer + .performance-template-renderer{margin-top:var(--spacing-4)}
.result-region > p{color:var(--color-text-secondary)}
.result-reconsideration-action{margin-top:24px;padding-top:16px;border-top:1px solid var(--color-border)}
.result-reconsideration-action p{margin:0 0 12px;line-height:22px;color:var(--color-text-secondary)}
.result-reconsideration-action span{color:var(--color-text-secondary);font-size:14px}
:global(html:has(.review-page)) { scrollbar-gutter: auto; }
.review-page { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex: 1; overflow: hidden; background: var(--performance-page-surface); }
@media (max-width: 720px) { .review-page { display: block; } }
</style>
