<template>
  <div class="review-page">
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
    </PerformanceReviewCategorySidebar>
    <PerformanceReviewContent
      :loading="loading"
      :error="error"
      :template-name="overview?.template_name || ''"
      :node="selectedNode"
      :project-id="activeProjectId"
      :content-title="selectedNode?.node_type === 'result_view' ? resultPageTitle : undefined"
      @retry="loadOverview(activeProjectId)"
      @open-node="openNode"
      @open-member="openMember"
    >
      <div v-if="selectedNode?.node_type === 'result_view'" class="completed-content review-results" aria-label="我的绩效结果">
        <div v-if="resultLoading" role="status">正在加载绩效结果…</div>
        <div v-else-if="resultError" role="alert">{{ resultError }} <button type="button" @click="loadMyResults">重新加载</button></div>
        <template v-else>
          <div v-if="!hasResultContent">暂无可查看的绩效结果</div>
          <section v-for="region in resultRegions" :key="region.key" class="result-region" :data-region-id="region.key" :aria-label="region.title">
            <h3 v-if="region.kind === 'reference'">{{ region.title }}</h3>
            <PerformanceOkrPanel v-if="region.reference_kind === 'okr'" :okr="region.okr || null" :okrs="region.okrs || []" />
            <template v-else>
              <PerformanceTemplateRenderer v-for="content in region.contents" :key="content.task_id" mode="readonly" :sections="content.form_schema" :answers="content.answers" />
              <p v-if="region.kind === 'reference' && !region.contents.some(content => content.form_schema.length)">暂无可查看内容</p>
            </template>
          </section>
          <div v-if="reconsideration" class="result-reconsideration-action">
            <p>{{ reconsideration.prompt }}</p>
            <UiButton v-if="reconsideration.can_submit" variant="primary" @click="reconsiderationOpen = true">发起复议</UiButton>
            <span v-else-if="reconsideration.submitted_at">已发起复议</span>
          </div>
        </template>
      </div>
    </PerformanceReviewContent>
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
    <PerformanceConfirmDialog v-model="reconsiderationOpen" appearance="submit" confirm-variant="primary" message="发起复议" description="确定发起复议后，配置的处理人会收到通知并负责跟进。" confirm-text="确定" cancel-text="取消" :loading="reconsiderationSaving" :confirm-disabled="!reconsiderationReason.trim()" :error-message="reconsiderationError" @confirm="submitReconsideration">
      <template #check><PerformanceFormField v-model="reconsiderationReason" label="复议理由" textarea required :maxlength="1500" show-count :placeholder="reconsideration?.instruction || '请输入复议理由'" /></template>
    </PerformanceConfirmDialog>
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
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import PerformanceFormField from '@/components/performance/PerformanceFormField.vue'
import PerformanceTemplateRenderer from '@/components/performance/PerformanceTemplateRenderer.vue'
import PerformanceOkrPanel from '@/components/performance/PerformanceOkrPanel.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceReviewCategorySidebar from '@/components/performance/PerformanceReviewCategorySidebar.vue'
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
const resultRegions = ref<PerformanceResultRegion[]>([])
const resultPageTitle = ref('')
const hasResultContent = computed(() => resultRegions.value.some(region => region.reference_kind === 'okr' || region.contents.some(content => content.form_schema.length > 0)))
const resultLoading = ref(false)
const resultError = ref('')
const reconsideration = ref<Awaited<ReturnType<typeof projectManagementApi.resultReconsideration>> | null>(null)
const reconsiderationOpen = ref(false)
const reconsiderationReason = ref('')
const reconsiderationSaving = ref(false)
const reconsiderationError = ref('')
const resultsEntry = ref(route.query.entry === 'results')
let resultRequest = 0
onBeforeUnmount(() => { ++resultRequest })
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
  const projectId = activeProjectId.value
  const request = ++resultRequest
  resultRegions.value = []
  resultPageTitle.value = ''
  reconsideration.value = null
  reconsiderationOpen.value = false
  resultError.value = ''
  resultLoading.value = false
  if (!projectId || selectedNode.value?.node_type !== 'result_view') return
  resultLoading.value = true
  try {
    const response = await projectManagementApi.myResults(projectId)
    if (request !== resultRequest) return
    resultPageTitle.value = response.content_page_name || selectedNode.value?.node_name || ''
    resultRegions.value = response.regions ?? [{ key: 'result', kind: 'result', title: resultPageTitle.value, contents: response.contents || [] }]
    void projectManagementApi.resultReconsideration(projectId).then(value => { if (request === resultRequest) reconsideration.value = value }).catch(() => { if (request === resultRequest) reconsideration.value = null })
  } catch {
    if (request === resultRequest) resultError.value = '当前结果尚未开通或不可查看'
  } finally {
    if (request === resultRequest) resultLoading.value = false
  }
}
const visibleCategories = computed(() => (overview.value?.categories || []).filter(category => category.nodes.length > 0))
const cycleOptions = computed(() => projectContext.cycles.map(cycle => ({ value: cycle.cycle_id, label: cycle.cycle_name })))
const allNodes = computed(() => visibleCategories.value.flatMap(category => category.nodes))
const selectedNode = computed(() => overview.value?.active_project?.project_id === activeProjectId.value ? allNodes.value.find(node => node.node_id === selectedNodeId.value) || null : null)
watch([activeProjectId, () => selectedNode.value?.node_id, () => selectedNode.value?.node_type], () => { void loadMyResults() })
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
watch(() => route.query.node, value => {
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
    if (String(route.query.project_id || '') !== String(projectId)) void router.replace({ query: { ...route.query, cycle_id: projectContext.activeCycleId ? String(projectContext.activeCycleId) : undefined, project_id: String(projectId) } })
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
async function loadOverview(projectId?: number, silent = false) {
  if (!silent) loading.value = true
  if (!silent) error.value = ''
  try {
    const loaded = await performanceReviewApi.overview(projectId, routeTaskId(), projectContext.activeCycleId || undefined)
    if (projectId && activeProjectId.value !== projectId) return
    error.value = ''
    applyOverview(loaded)
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
  resultsEntry.value = false
  error.value = ''
  selectedNodeId.value = node.node_id
  if (activeProjectId.value) projectContext.setSelectedReviewNode(activeProjectId.value, node.node_id)
  drawerMember.value = null
  const { task_id: _taskId, entry: _entry, ...query } = clearDrawerQuery()
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
    if (!projectContext.navigationReady || (routeCycleId > 0 && routeCycleId !== projectContext.activeCycleId)) {
      await projectContext.ensureNavigation(Number.isFinite(routeCycleId) && routeCycleId > 0 ? routeCycleId : undefined)
    }
    if (Number.isFinite(routeProjectId) && routeProjectId > 0) projectContext.setActiveProjectId(routeProjectId)
  } catch { error.value = projectContext.navigationError || '绩效评估加载失败，请稍后重试'; loading.value = false; return }
  if (projectContext.navigation && !projectContext.navigation.can_review) { await router.replace('/performance/workbench'); return }
  if (projectContext.navigation && !projectContext.navigation.review_projects.some(project => project.project_id === activeProjectId.value)) {
    if (routeProjectId > 0) { error.value = '当前项目不存在或无权查看'; loading.value = false; return }
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
.result-region h3{margin:0 0 16px;font-size:16px;line-height:24px;font-weight:600}
.result-region > .performance-template-renderer + .performance-template-renderer{margin-top:var(--spacing-4)}
.result-region p{color:var(--color-text-secondary)}
.result-reconsideration-action{margin-top:24px;padding-top:16px;border-top:1px solid var(--color-border)}
.result-reconsideration-action p{margin:0 0 12px;line-height:22px;color:var(--color-text-secondary)}
.result-reconsideration-action span{color:var(--color-text-secondary);font-size:14px}
:global(html:has(.review-page)) { scrollbar-gutter: auto; }
.review-page { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex: 1; overflow: hidden; background: var(--performance-page-surface); }
@media (max-width: 720px) { .review-page { display: block; } }
</style>
