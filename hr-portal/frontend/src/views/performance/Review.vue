<template>
  <div class="review-page">
    <section v-if="route.query.entry === 'results'" class="review-results" aria-label="我的绩效结果">
      <h1>我的绩效结果</h1>
      <div v-if="resultLoading" role="status">正在加载绩效结果…</div>
      <div v-else-if="resultError" role="alert">{{ resultError }}</div>
      <template v-else>
        <div v-if="!myResults.length && !myResultContents.length">暂无可查看的绩效结果</div>
        <ul v-if="myResults.length"><li v-for="item in myResults" :key="`${item.task_id}-${item.field_id}`">{{ item.label }}</li></ul>
        <PerformanceTemplateRenderer v-for="content in myResultContents" :key="content.task_id" mode="readonly" :sections="content.form_schema" :answers="content.answers" />
        <div v-if="reconsideration" class="result-reconsideration-action">
          <p>{{ reconsideration.prompt }}</p>
          <button v-if="reconsideration.can_submit" type="button" class="primary-button" @click="reconsiderationOpen = true">发起复议</button>
          <span v-else-if="reconsideration.submitted_at">已发起复议</span>
        </div>
      </template>
    </section>
    <template v-else>
    <PerformanceReviewCategorySidebar
      :categories="visibleCategories"
      :filter-options="cycleOptions"
      :active-filter-value="projectContext.activeCycleId ?? undefined"
      @select-filter="selectCycle"
      :projects="overview?.projects || []"
      :active-project="overview?.active_project || null"
      :selected-node-id="selectedNodeId"
      :loading="loading"
      @select-project="selectProject"
      @select-node="selectNode"
    >
      <template #cycle-actions><PerformanceFocusGroupMembersDialog :cycle-id="projectContext.activeCycleId || null" /></template>
    </PerformanceReviewCategorySidebar>
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
    <PerformanceReviewEvaluationDrawer
      v-if="drawerMember"
      v-model="drawerOpen"
      :task-id="drawerMember.task_id"
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
      @remind="openReminderPlaceholder"
    />
    </template>
    <PerformanceConfirmDialog v-model="reconsiderationOpen" appearance="submit" confirm-variant="primary" message="发起复议" description="确定发起复议后，配置的处理人会收到通知并负责跟进。" confirm-text="确定" cancel-text="取消" :loading="reconsiderationSaving" :confirm-disabled="!reconsiderationReason.trim()" :error-message="reconsiderationError" @confirm="submitReconsideration">
      <template #check><PerformanceFormField v-model="reconsiderationReason" label="复议理由" textarea required :maxlength="1500" show-count :placeholder="reconsideration?.instruction || '请输入复议理由'" /></template>
    </PerformanceConfirmDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import {
  performanceReviewApi,
  projectManagementApi,
  type PerformanceReferenceTab,
  type PerformanceReviewMemberContext,
  type PerformanceReviewNode,
  type PerformanceReviewOverview,
  type SelfSummarySection,
} from '@/api/performance'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import PerformanceFormField from '@/components/performance/PerformanceFormField.vue'
import PerformanceTemplateRenderer from '@/components/performance/PerformanceTemplateRenderer.vue'
import PerformanceReviewCategorySidebar from '@/components/performance/PerformanceReviewCategorySidebar.vue'
import PerformanceFocusGroupMembersDialog from '@/components/performance/PerformanceFocusGroupMembersDialog.vue'
import PerformanceReviewContent from '@/components/performance/PerformanceReviewContent.vue'
import PerformanceReviewEvaluationDrawer from '@/components/performance/PerformanceReviewEvaluationDrawer.vue'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import { performanceTaskEntryRoute } from '@/components/performance/performanceTaskEntry'
import { isReviewer360Node, isSelfEvaluationNode } from '@/components/performance/performanceExecutorOptions'
import { performanceReviewDisplay } from '@/components/performance/performanceReviewDisplay'

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
const myResults = ref<Array<{ task_id: number; field_id: string; option_id: string; label: string }>>([])
const myResultContents = ref<Array<{ task_id: number; form_schema: SelfSummarySection[]; answers: Record<string, unknown> }>>([])
const resultLoading = ref(false)
const resultError = ref('')
const reconsideration = ref<Awaited<ReturnType<typeof projectManagementApi.resultReconsideration>> | null>(null)
const reconsiderationOpen = ref(false)
const reconsiderationReason = ref('')
const reconsiderationSaving = ref(false)
const reconsiderationError = ref('')
async function submitReconsideration() {
  if (!activeProjectId.value || !reconsiderationReason.value.trim()) return
  reconsiderationSaving.value = true
  reconsiderationError.value = ''
  try {
    await projectManagementApi.submitResultReconsideration(activeProjectId.value, reconsiderationReason.value.trim())
    reconsiderationOpen.value = false
    await loadMyResults()
    ElMessage.success('复议已提交')
  } catch { reconsiderationError.value = '复议提交失败，请确认提交时间和复议状态后重试' }
  finally { reconsiderationSaving.value = false }
}
async function loadMyResults() {
  if (!activeProjectId.value) { myResults.value = []; myResultContents.value = []; return }
  resultLoading.value = true
  reconsideration.value = null
  resultError.value = ''
  try {
    const response = await projectManagementApi.myResults(activeProjectId.value)
    myResults.value = response.results
    myResultContents.value = response.contents || []
    const requestProjectId = activeProjectId.value
    void projectManagementApi.resultReconsideration(requestProjectId).then(value => { if (activeProjectId.value === requestProjectId) reconsideration.value = value }).catch(() => { if (activeProjectId.value === requestProjectId) reconsideration.value = null })
  } catch {
    myResults.value = []
    myResultContents.value = []
    resultError.value = '当前结果尚未开通或不可查看'
  } finally {
    resultLoading.value = false
  }
}
const visibleCategories = computed(() => (overview.value?.categories || []).filter(category => category.nodes.length > 0))
const cycleOptions = computed(() => projectContext.cycles.map(cycle => ({ value: cycle.cycle_id, label: cycle.cycle_name })))
const allNodes = computed(() => visibleCategories.value.flatMap(category => category.nodes))
const selectedNode = computed(() => allNodes.value.find(node => node.node_id === selectedNodeId.value) || allNodes.value[0] || null)
const drawerMember = ref<{ node: PerformanceReviewNode; member: PerformanceReviewMemberContext; task_id: number; active_tab: string } | null>(null)
const drawerOpen = ref(false)
function finishClosingDrawer() { if (!drawerOpen.value) drawerMember.value = null }
function clearDrawerQuery() {
  const { rootReviewId: _rootReview, activeTab: _activeTab, employee_no: _employee, ...query } = route.query
  return query
}
function drawerQuery() {
  const current = drawerMember.value
  return { ...clearDrawerQuery(), project_id: String(activeProjectId.value || ''), node: current?.node.node_id, rootReviewId: String(current?.task_id || ''), activeTab: current?.active_tab === 'evaluation' ? current.node.node_id : current?.active_tab }
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
  const node = allNodes.value.find(item => item.node_id === String(route.query.node || ''))
  if (!Number.isSafeInteger(taskId) || taskId <= 0 || !node || !(node.task_kind === 'evaluation' || performanceReviewDisplay(node.node_type)?.completedView === 'drawer')) return
  if (drawerMember.value?.task_id === taskId && drawerMember.value.node.node_id === node.node_id) {
    drawerMember.value.active_tab = !route.query.activeTab || route.query.activeTab === node.node_id ? 'evaluation' : String(route.query.activeTab)
    drawerOpen.value = true
    return
  }
  selectedNodeId.value = node.node_id
  drawerMember.value = { node, task_id: taskId, member: { employee_no: '' }, active_tab: !route.query.activeTab || route.query.activeTab === node.node_id ? 'evaluation' : String(route.query.activeTab) }
  drawerOpen.value = true
}
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
    if (String(route.query.project_id || '') !== String(projectId)) void router.replace({ query: { ...route.query, cycle_id: projectContext.activeCycleId ? String(projectContext.activeCycleId) : undefined, project_id: String(projectId) } })
  }
  const rememberedNode = projectContext.selectedReviewNode(projectId)
  if (!allNodes.value.some(node => node.node_id === selectedNodeId.value)) {
    selectedNodeId.value = allNodes.value.some(node => node.node_id === rememberedNode) ? rememberedNode : allNodes.value[0]?.node_id || ''
  }
  if (projectId && selectedNodeId.value) projectContext.setSelectedReviewNode(projectId, selectedNodeId.value)
  restoreDrawer()
}
function routeTaskId() {
  const taskId = Number(route.query.rootReviewId || route.query.task_id)
  return Number.isFinite(taskId) && taskId > 0 ? taskId : undefined
}
async function loadOverview(projectId?: number, silent = false) {
  if (!silent) loading.value = true
  if (!silent) error.value = ''
  try {
    const loaded = await performanceReviewApi.overview(projectId, routeTaskId(), projectContext.activeCycleId || undefined)
    if (projectId && activeProjectId.value !== projectId) return
    applyOverview(loaded)
    error.value = ''
    if (projectContext.navigation && projectContext.navigation.can_review !== (loaded.projects.length > 0)) {
      const navigation = await projectContext.refreshNavigation(projectContext.activeCycleId || undefined, true)
      if (!navigation.can_review) await router.replace('/performance/workbench')
    }
  } catch {
    if (!silent) error.value = '绩效评估加载失败，请稍后重试'
  } finally {
    if (!silent) loading.value = false
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
async function selectNode(node: PerformanceReviewNode) {
  selectedNodeId.value = node.node_id
  if (activeProjectId.value) projectContext.setSelectedReviewNode(activeProjectId.value, node.node_id)
  drawerMember.value = null
  const { task_id: _taskId, ...query } = clearDrawerQuery()
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
  if (payload.member.status === 'completed' && ((payload.node.task_kind === 'evaluation' && !isSelfEvaluationNode(payload.node)) || performanceReviewDisplay(payload.node.node_type)?.completedView === 'drawer')) {
    drawerMember.value = { node: payload.node, member: payload.member, task_id: taskId, active_tab: 'evaluation' }
    drawerOpen.value = true
    await router.replace({ query: drawerQuery() })
    return
  }
  drawerMember.value = null
  const taskNode = isReviewer360Node(payload.node)
    ? { ...payload.node, task_id: taskId, task_kind: 'evaluation' as const, entry_mode: 'template_task' as const }
    : { ...payload.node, task_id: taskId }
  const taskRoute = performanceTaskEntryRoute(taskNode, activeProjectId.value, payload.member.employee_no)
  if (!taskRoute) return
  await router.replace({ query: { ...clearDrawerQuery(), project_id: String(activeProjectId.value || ''), node: payload.node.node_id, task_id: String(taskId), employee_no: payload.member.employee_no } })
  await router.push(taskRoute)
}
async function openReminderPlaceholder(reference: PerformanceReferenceTab) {
  await router.push({ name: 'PerformanceReminderPlaceholder', query: { project_id: String(activeProjectId.value || ''), node_id: reference.node_id, task_id: String(reference.task_id || ''), employee_no: reference.employee_no } })
}
async function editDrawerTask(payload: { task_id: string | number; employee_no: string; draft_choice?: 'use' | 'discard' }) {
  const current = drawerMember.value
  drawerMember.value = null
  if (!current) return
  const taskRoute = performanceTaskEntryRoute({ ...current.node, task_id: Number(payload.task_id), draft_choice: payload.draft_choice }, activeProjectId.value, payload.employee_no)
  if (!taskRoute) return
  await router.replace({ query: { ...clearDrawerQuery(), project_id: String(activeProjectId.value || ''), node: current.node.node_id, task_id: String(payload.task_id), employee_no: payload.employee_no } })
  await router.push(taskRoute)
}
onMounted(async () => {
  const routeCycleId = Number(route.query.cycle_id)
  try {
    if (!projectContext.navigationReady) await projectContext.ensureNavigation(Number.isFinite(routeCycleId) && routeCycleId > 0 ? routeCycleId : undefined)
  } catch { error.value = projectContext.navigationError || '绩效评估加载失败，请稍后重试'; loading.value = false; return }
  if (projectContext.navigation && !projectContext.navigation.can_review) { await router.replace('/performance/workbench'); return }
  if (route.query.entry === 'results') { void loadMyResults(); return }
  if (projectContext.navigation && !projectContext.navigation.review_projects.some(project => project.project_id === activeProjectId.value)) {
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
.review-results{width:100%;padding:var(--performance-review-surface-inset);overflow:auto;background:var(--performance-review-page-bg);color:var(--color-text-primary)}
.review-results h1{margin:0 0 var(--spacing-5);font-size:var(--font-size-xl)}
.result-reconsideration-action .primary-button{min-height:32px;padding:4px 16px;border:0;border-radius:6px;background:var(--color-primary);color:var(--color-bg-card);cursor:pointer}
.result-reconsideration-action{margin-top:24px;padding:16px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-bg-card)}.result-reconsideration-action p{margin:0 0 12px;color:var(--color-text-secondary);line-height:22px}.result-reconsideration-action span{color:var(--color-text-secondary);font-size:14px}
.review-results ul{margin:0;padding:0;list-style:none}
.review-results li{padding:var(--spacing-4);border-bottom:1px solid var(--color-border);background:var(--color-bg-card)}
:global(html:has(.review-page)) { scrollbar-gutter: auto; }
.review-page { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex: 1; overflow: hidden; background: var(--performance-page-surface); }
@media (max-width: 720px) { .review-page { display: block; } }
</style>
