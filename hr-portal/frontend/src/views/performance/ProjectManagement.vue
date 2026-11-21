<template>
  <div class="project-management-page">
    <PerformanceReviewCategorySidebar
      :categories="categories"
      :projects="[]"
      :active-project="null"
      :selected-node-id="selectedKey"
      :loading="loading"
      :filter-options="filterOptions"
      :active-filter-value="activeCycleId ?? undefined"
      filter-placeholder="暂无可管理的周期"
      :show-node-status="false"
      @select-filter="selectCycle"
      @select-node="selectNode"
    />
    <section ref="managementContent" class="management-content" aria-live="polite">
      <div v-if="loading" class="state-message">正在加载项目管理…</div>
      <div v-else-if="error" class="state-message error-state">
        <p>{{ error }}</p>
        <button type="button" @click="loadOverview(activeCycleId)">重新加载</button>
      </div>
      <div v-else-if="!activeCycle" class="state-message">
        <p>当前没有你作为项目管理员参与的已启动项目</p>
      </div>
      <template v-else>
        <div class="cycle-overview">
          <PerformancePageTitle :title="selectedProject?.project_name || '周期概览'">
            <template #actions>
              <UiButton variant="secondary" class="reviewee-add-trigger" @click="revieweeAddOpen = true"><MemberAddIcon class="reviewee-add-trigger__icon" />添加被评估人</UiButton>
              <PerformanceManagementMemberScope v-if="managementRole === 'hrbp'" :key="scopeKey" />
            </template>
          </PerformancePageTitle>
          <PerformanceLineTabs v-model="activeTab" sticky :tabs="overviewTabs">
            <p v-if="returnRefreshError" role="alert">{{ returnRefreshError }} <button type="button" @click="loadOverview(activeCycleId, false, true)">重新加载</button></p>
            <div v-if="activeTab === 'overview' && statisticsLoading" class="state-message" role="status">正在加载总览统计…</div>
            <div v-else-if="activeTab === 'overview' && statisticsError" class="state-message error-state" role="alert">
              <p>{{ statisticsError }}</p>
              <button type="button" @click="loadOverview(activeCycleId, true)">重新加载</button>
            </div>
            <template v-else-if="activeTab === 'overview'">
              <section v-if="selectedProject" class="management-timeline" aria-label="项目流程时间节点">
                <p v-if="timelineLoading" role="status">正在加载项目流程…</p>
                <p v-else-if="timelineError" role="alert">{{ timelineError }} <button type="button" @click="loadTimeline">重新加载</button></p>
                <PerformanceWorkbenchTimeline v-else :key="scopeKey" :nodes="timelineNodes" />
              </section>
              <CompletionRatePanel ref="completionPanel" :initial-state="returnCompletion" :key="scopeKey" :nodes="completionNodes" :cycle-id="activeCycle.cycle_id" v-model:view-mode="overviewViewMode" :department-provider="projectManagementApi.departmentCompletion" @action="handleCompletionAction" />
              <AuthorizationManagementPanel :authorizations="authorizations" @view="handleAuthorizationView" />
              <AuthorizationManagementPanel title="其他" :authorizations="otherModules" @view="handleOtherView" />
            </template>
            <ProjectMemberListPanel v-else-if="activeTab === 'members'" :key="contentKey" :cycle-id="selectedProject ? undefined : activeCycle.cycle_id" :project-id="memberProjectId" :preference-scope="{ cycle_ref: activeCycle.cycle_id, scene: 'management', project_id: selectedProject?.project_id, role_key: managementRole }" @filter="emit('member-filter')" @authorize-selected="openDelegation('AUTHORIZE', $event)" @transfer-selected="openDelegation('TRANSFER', $event)" @select-member="openMember" @remind-evaluate="handleEvaluateRemind" />
            <ProjectPerformanceMatrix v-else-if="activeTab === 'matrix'" :key="contentKey" :project-id="memberProjectId" :cycle-id="selectedProject ? undefined : activeCycle.cycle_id" :scope-key="scopeKey" :provider="matrixProvider" :cycle-name="activeCycle.cycle_name" @open-member="openMatrixMember" />
            <ProjectStatisticsReportPanel v-else-if="activeTab === 'reports'" :key="contentKey" :cycle-id="activeCycle.cycle_id" :cycle-name="activeCycle.cycle_name" :provider="statisticsProvider" :self-final-provider="selfFinalProvider" :comparison-provider="comparisonProvider" />
            <p v-else class="pane-hint">该页签内容将在后续迭代中开发</p>
          </PerformanceLineTabs>
        </div>
      </template>
    </section>
    <PerformanceMemberReminderDialog v-model="memberReminderOpen" :context="memberReminderContext" />
    <PerformanceTaskOverlay v-model="reminderOpen" :title="reminderContext?.title || '上级评估'" :description="reminderContext?.description" @close="closeReminder">
      <PerformanceReminderPanel v-if="reminderContext" :context="reminderContext" :mode="reminderMode" :description="reminderContext.description" @filter="handleReminderFilter" />
    </PerformanceTaskOverlay>
    <PerformanceReviewEvaluationDrawer
      v-if="drawerMember"
      v-model="drawerOpen"
      :employee-no="drawerMember.employee_no"
      :project-id="drawerMember.project_id"
      :detail-loader="memberDetailLoader"
      :active-tab="drawerActiveTab"
      :member="drawerMember"
      member-management
      readonly
      @update:active-tab="updateMemberTab"
      @close="closeMember"
      @closed="finishClosingMember"
      @copy-link="copyMemberLink"
      @remind="handleDrawerRemind"
      @edit="fillFromDrawer"
      @authorize="openDrawerDelegation('AUTHORIZE', $event)"
      @transfer="openDrawerDelegation('TRANSFER', $event)"
      @delete="removeDrawerMember"
    />
    <PerformanceTaskDelegationDialog v-model="delegationOpen" :action="delegationAction" :tasks="delegationTasks" @completed="delegationCompleted" @refresh="projectContext.invalidate(); viewRefreshKey++" />
    <RevieweeAddDialog
      v-model="revieweeAddOpen"
      :project-id="revieweeAddProjectId"
      :projects="revieweeAddProjects"
      @added="onRevieweeAdded"
    />
    <FrontFocusGroupManagementDialog v-model="focusGroupDialogOpen" :cycle-id="activeCycleId" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import PerformanceManagementMemberScope from '@/components/performance/PerformanceManagementMemberScope.vue'
import PerformanceWorkbenchTimeline, { type WorkbenchTimelineNode } from '@/components/performance/PerformanceWorkbenchTimeline.vue'
import type { ProjectReportComparisonProvider, ProjectReportProvider } from '@/components/performance/projectStatisticsReport'
import { ElMessage } from 'element-plus'
import PerformanceReviewEvaluationDrawer from '@/components/performance/PerformanceReviewEvaluationDrawer.vue'
import { useRoute, useRouter } from 'vue-router'
import {
  projectManagementApi,
  type PerformanceReviewCategory,
  type PerformanceReviewNode,
  type PerformanceTaskDelegationTarget,
  type ProjectManagementOverview,
} from '@/api/performance'
import PerformanceReviewCategorySidebar from '@/components/performance/PerformanceReviewCategorySidebar.vue'
import PerformanceLineTabs, { type PerformanceLineTab } from '@/components/performance/PerformanceLineTabs.vue'
import PerformancePageTitle from '@/components/performance/PerformancePageTitle.vue'
import ProjectStatisticsReportPanel from '@/components/performance/ProjectStatisticsReportPanel.vue'
import ProjectPerformanceMatrix from '@/components/performance/ProjectPerformanceMatrix.vue'
import ProjectMemberListPanel from '@/components/performance/ProjectMemberListPanel.vue'
import CompletionRatePanel from '@/components/performance/CompletionRatePanel.vue'
import AuthorizationManagementPanel from '@/components/performance/AuthorizationManagementPanel.vue'
import FrontFocusGroupManagementDialog from '@/components/performance/focus-group/FrontFocusGroupManagementDialog.vue'
import PerformanceTaskOverlay from '@/components/performance/PerformanceTaskOverlay.vue'
import PerformanceReminderPanel from '@/components/performance/PerformanceReminderPanel.vue'
import PerformanceMemberReminderDialog from '@/components/performance/PerformanceMemberReminderDialog.vue'
import { usePerformanceMemberReminder } from '@/composables/usePerformanceMemberReminder'
import PerformanceTaskDelegationDialog from '@/components/performance/PerformanceTaskDelegationDialog.vue'
import RevieweeAddDialog from '@/components/performance/RevieweeAddDialog.vue'
import MemberAddIcon from '@/components/performance/MemberAddIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { PerformanceReferenceTab, ProjectMember, ProjectMemberTaskOption } from '@/api/performance'
import type { ReminderContext } from '@/components/performance/performanceReminder'
import type { CompletionNode } from '@/components/performance/CompletionNodeCard.vue'
import type { AuthorizationItem } from '@/components/performance/AuthorizationManagementPanel.vue'
import { usePerformanceProjectContextStore, type PerformanceManagementReturnSnapshot } from '@/stores/performanceProjectContext'

const OVERVIEW_NODE_ID = 'cycle-overview'
const OVERVIEW_TABS: PerformanceLineTab[] = [
  { key: 'overview', label: '总览' },
  { key: 'members', label: '成员列表' },
  { key: 'matrix', label: '矩阵分析' },
  { key: 'reports', label: '统计报表' },
]

const route = useRoute()
const router = useRouter()
const projectContext = usePerformanceProjectContextStore()
const managementContent = ref<HTMLElement | null>(null)
const completionPanel = ref<InstanceType<typeof CompletionRatePanel> | null>(null)
const returnCompletion = ref<PerformanceManagementReturnSnapshot['completion']>()
const returnSnapshot = route.query.from_reminder === '1'
  ? projectContext.takeManagementReturn(Number(route.query.cycle_id), String(route.query.management_role || ''), route.query.project_id ? Number(route.query.project_id) : undefined)
  : null
const emit = defineEmits<{
  'completion-action': [payload: { action: 'remind' | 'enable-result'; nodeKey: string; departmentPath?: string }]
  'authorization-view': [item: AuthorizationItem]
  'member-filter': []
}>()
const overview = ref<ProjectManagementOverview | null>(null)
const activeCycleId = computed(() => projectContext.activeCycleId)
const managementRole = computed(() => String(route.query.management_role || overview.value?.active_role || 'project_admin'))
const requestedScope = computed(() => ({
  ...(route.query.management_role ? { management_role: String(route.query.management_role) as 'hrbp' | 'project_admin' } : {}),
  ...(route.query.project_id ? { project_id: Number(route.query.project_id) } : {}),
}))
const managementScope = computed(() => ({ ...requestedScope.value, management_role: managementRole.value as 'hrbp' | 'project_admin' }))
const scopeKey = computed(() => JSON.stringify([activeCycleId.value, managementRole.value, route.query.project_id || '']))
const selectedKey = computed(() => `${managementRole.value}:${route.query.project_id ? `project-${route.query.project_id}` : OVERVIEW_NODE_ID}`)
const activeTab = ref(String(route.query.tab || (route.query.rootReviewId ? 'members' : 'overview')))
watch(activeTab, tab => {
  if (route.query.tab !== tab) void router.replace({ query: { ...route.query, tab } })
})
watch(() => route.query.tab, tab => {
  if (OVERVIEW_TABS.some(item => item.key === tab)) activeTab.value = String(tab)
})
const drawerMember = ref<{ project_id: number; employee_no: string; root_review_id?: number; display_name?: string; task_id?: number | null; task_map?: ProjectMemberTaskOption[] } | null>(null)
const drawerOpen = ref(false)
const drawerActiveTab = ref(String(route.query.activeTab || ''))
const drawerSourceTab = ref('')
const memberDetailLoader = computed(() => {
  const member = drawerMember.value
  return member ? (tab?: string) => projectManagementApi.memberDetail(member.project_id, member.employee_no, member.root_review_id, tab ?? '') : undefined
})
function memberQuery() {
  return { ...route.query, ...managementQuery(), tab: activeTab.value, member_project_id: String(drawerMember.value?.project_id || ''), employee_no: drawerMember.value?.employee_no, rootReviewId: String(drawerMember.value?.root_review_id || ''), activeTab: drawerActiveTab.value || undefined }
}
async function openMember(member: ProjectMember) {
  if (!member.can_view_detail) return
  drawerMember.value = { project_id: member.project_id || memberProjectId.value, employee_no: member.employee_no, root_review_id: member.root_review_id, display_name: member.display_name, task_id: member.task_id, task_map: member.task_map }
  drawerActiveTab.value = ''
  drawerSourceTab.value = activeTab.value
  drawerOpen.value = true
  await router.replace({ query: memberQuery() })
}
function openMatrixMember(member: { project_id?: number; employee_no: string; root_review_id?: number; can_view_detail?: boolean; display_name?: string; task_id?: number | null; task_map?: ProjectMemberTaskOption[] }) {
  if (!member.can_view_detail) return
  drawerMember.value = { project_id: member.project_id || memberProjectId.value, employee_no: member.employee_no, root_review_id: member.root_review_id, display_name: member.display_name, task_id: member.task_id ?? null, task_map: member.task_map }
  drawerActiveTab.value = ''
  drawerSourceTab.value = activeTab.value
  drawerOpen.value = true
  void router.replace({ query: memberQuery() })
}
async function updateMemberTab(tab: string) {
  drawerActiveTab.value = tab
  if (drawerOpen.value) await router.replace({ query: memberQuery() })
}
async function closeMember() {
  drawerOpen.value = false
  drawerSourceTab.value = ''
  const { rootReviewId: _root, activeTab: _tab, employee_no: _employee, member_project_id: _project, ...query } = route.query
  await router.replace({ query })
}
function finishClosingMember() { if (!drawerOpen.value) drawerMember.value = null }
async function fillFromDrawer(payload: { task_id: string | number; employee_no: string; node_id?: string; node_name?: string; task_kind?: string; phase_id?: string | null; project_id?: number; draft_choice?: 'use' | 'discard' }) {
  const member = drawerMember.value
  const projectId = member?.project_id ?? Number(route.query.member_project_id)
  if (!member || !Number.isFinite(projectId) || projectId <= 0) return
  const path = payload.task_kind === 'work_summary' ? '/performance/review/self-summary' : '/performance/review/template-task'
  const query: Record<string, string> = {
    task_id: String(payload.task_id),
    management_role: managementRole.value,
    ...(activeCycleId.value ? { cycle_id: String(activeCycleId.value) } : {}),
    project_id: String(projectId),
    node: payload.node_id || '',
    employee_no: payload.employee_no,
    ...(payload.phase_id ? { phase_id: payload.phase_id } : {}),
    ...(payload.draft_choice ? { draft_choice: payload.draft_choice } : {}),
    ...(payload.task_kind === 'result_reconsideration' ? {
      return_entry: 'management',
      return_root_review_id: String(member.root_review_id || ''),
      ...(activeCycleId.value ? { cycle_id: String(activeCycleId.value) } : {}),
    } : {}),
  }
  projectContext.invalidateDrawerDetails()
  drawerOpen.value = false
  await router.push({ path, query })
}
async function copyMemberLink() {
  try {
    const resolved = router.resolve({ path: '/performance/project-management', query: memberQuery() })
    await navigator.clipboard.writeText(new URL(resolved.href, window.location.origin).href)
    ElMessage.success('链接已复制')
  } catch { ElMessage.error('复制失败，请从浏览器地址栏复制链接') }
}
function restoreMember() {
  if (!route.query.rootReviewId) { drawerOpen.value = false; return }
  const projectId = Number(route.query.member_project_id)
  const rootId = Number(route.query.rootReviewId)
  const employeeNo = String(route.query.employee_no || '')
  if (!Number.isSafeInteger(projectId) || projectId <= 0 || !Number.isSafeInteger(rootId) || rootId <= 0 || !employeeNo) return
  activeTab.value = String(route.query.tab || drawerSourceTab.value || 'members')
  if (drawerMember.value?.project_id !== projectId || drawerMember.value?.root_review_id !== rootId || drawerMember.value?.employee_no !== employeeNo) {
    drawerMember.value = { project_id: projectId, employee_no: employeeNo, root_review_id: rootId }
  }
  drawerActiveTab.value = String(route.query.activeTab || '')
  drawerOpen.value = true
}
watch(() => [route.query.rootReviewId, route.query.activeTab, route.query.employee_no, route.query.member_project_id], () => { if (!loading.value) restoreMember() })
const overviewTabs = OVERVIEW_TABS
const loading = ref(true)
const error = ref('')
const overviewViewMode = ref(String(route.query.view || 'by-person'))
watch(overviewViewMode, (value) => {
  const query: Record<string, string> = { ...(route.query as Record<string, string>) }
  if (value === 'by-org') query.view = value
  else delete query.view
  void router.replace({ query })
})
const reminderOpen = ref(false)
const reminderMode = 'open-result'
const { reminderOpen: memberReminderOpen, reminderContext: memberReminderContext, openMemberReminder } = usePerformanceMemberReminder()
type ReminderContextWithDescription = ReminderContext & { description?: string; nodeKey?: string }
const reminderContext = ref<ReminderContextWithDescription | null>(null)

const delegationOpen = ref(false)
const delegationAction = ref<'AUTHORIZE' | 'TRANSFER'>('AUTHORIZE')
const delegationTasks = ref<PerformanceTaskDelegationTarget[]>([])
const selectedDelegationMembers = ref<ProjectMember[]>([])

function openDelegation(action: 'AUTHORIZE' | 'TRANSFER', members: ProjectMember[]) {
  if (!members.length || activeCycleId.value === null) return
  delegationAction.value = action
  selectedDelegationMembers.value = members
  delegationTasks.value = members.map(member => ({
    task_id: member.task_id || 0,
    project_id: member.project_id || memberProjectId.value,
    employee_no: member.employee_no,
    display_name: member.display_name,
    task_map: member.task_map || [],
  }))
  delegationOpen.value = true
}

function openDrawerDelegation(action: 'AUTHORIZE' | 'TRANSFER', payload: { project_id: number; employee_no: string; root_review_id?: number; display_name?: string; task_id?: number | null; task_map?: ProjectMemberTaskOption[] }) {
  if (activeCycleId.value === null) return
  delegationAction.value = action
  selectedDelegationMembers.value = []
  delegationTasks.value = [{
    task_id: payload.task_id || 0,
    project_id: payload.project_id,
    employee_no: payload.employee_no,
    display_name: payload.display_name,
    task_map: payload.task_map || [],
  }]
  delegationOpen.value = true
}

const deletingMember = ref(false)
async function removeDrawerMember(payload: { project_id: number; employee_no: string; root_review_id?: number; display_name?: string }) {
  if (deletingMember.value) return
  const cycleId = activeCycleId.value
  const key = scopeKey.value
  deletingMember.value = true
  try {
    await projectManagementApi.removeMember(payload.project_id, payload.employee_no, payload.root_review_id)
    projectContext.invalidate()
  } catch (failure: any) {
    const detail = failure?.response?.data?.detail
    ElMessage.error(typeof detail === 'string' ? detail : detail?.message || '删除失败，请稍后重试')
    return
  } finally {
    deletingMember.value = false
  }
  ElMessage.success('操作成功')
  if (activeCycleId.value !== cycleId || scopeKey.value !== key) return
  viewRefreshKey.value++
  if (drawerMember.value?.project_id === payload.project_id && drawerMember.value?.employee_no === payload.employee_no) {
    drawerOpen.value = false
    drawerMember.value = null
    try { await closeMember() }
    catch { ElMessage.warning('人员已删除，详情链接清理失败，请刷新页面') }
  }
  if (activeCycleId.value === cycleId) await loadOverview(cycleId)
}

function delegationCompleted(count: number, _notificationStatus: string | undefined, recordId?: number, skippedCount = 0) {
  projectContext.invalidateDrawerDetails()
  delegationOpen.value = false
  delegationTasks.value = []
  selectedDelegationMembers.value = []
  void loadOverview(activeCycleId.value ?? undefined)
  if (skippedCount) ElMessage.success(`已处理 ${count} 个任务，跳过 ${skippedCount} 个无原处理人任务`)
  const cycleId = activeCycleId.value
  if (cycleId === null || !count || !recordId) return
  void router.push({ name: 'PerformanceAuthorizationRecords', query: { ...managementQuery(), cycle_id: String(cycleId), highlight_id: recordId ? String(recordId) : undefined, highlight_tab: delegationAction.value === 'TRANSFER' ? 'transfer' : 'authorization' } })
}

function handleDrawerRemind(reference: PerformanceReferenceTab) {
  const member = drawerMember.value
  if (!member) return
  openMemberReminder({ projectId: member.project_id, cycleId: activeCycle.value?.cycle_id, employeeNo: reference.employee_no || member.employee_no, displayName: member.display_name, nodeId: reference.node_id, targetKind: reference.kind === 'reviewer_360' ? 'reviewer_360' : undefined, taskId: reference.kind === 'reviewer_360' ? undefined : reference.task_id || undefined })
}
function handleEvaluateRemind(payload: { member: { project_id?: number; employee_no: string; display_name?: string }; pendingCount: number }) {
  const cycle = activeCycle.value
  if (!cycle || !payload.pendingCount) return
  openMemberReminder({ projectId: Number(payload.member.project_id || memberProjectId.value), cycleId: cycle.cycle_id, employeeNo: payload.member.employee_no, displayName: payload.member.display_name, targetKind: 'reviewer_360' })
}

function formatDeadline(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value
    return result
  }, {})
  const text = `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}（GMT+8）`
  return date.getTime() <= Date.now() ? `${text}（已截止）` : text
}

const completionNodes = computed<CompletionNode[]>(() => {
  const loaded = overview.value?.completion_nodes || []
  return loaded.filter(node => node.configured !== false && node.status !== 'unavailable').map(node => ({
    key: node.key,
    title: node.title,
    status: node.status,
    progress: node.status === 'not_started' ? '未开始' : node.completion_rate == null ? '--' : `${node.completion_rate.toFixed(2)}%`,
    completionStatus: `${node.completed_count}/${node.total_count}`,
    deadline: formatDeadline(node.deadline_at),
    canRemind: node.can_remind,
    canOpenResult: node.can_open_result,
    openableCount: node.openable_count,
    openedProgress: node.completion_rate == null ? '--' : `${node.completion_rate.toFixed(2)}%`,
    openedCompletionStatus: `${node.completed_count}/${node.total_count}`,
    reconsideredProgress: `${(node.completed_count ? (node.reconsidered_count ?? 0) / node.completed_count * 100 : 0).toFixed(2)}%`,
    reconsideredCompletionStatus: `${node.reconsidered_count ?? 0}/${node.completed_count}`,
    reconsideredDeadline: formatDeadline(node.reconsideration_deadline_at ?? null),
    reminderTitle: node.reminder_title,
    reminderDescription: node.reminder_description,
  }))
})

const authorizations = ref<AuthorizationItem[]>([
  { key: 'evaluation-transfer', title: '评估任务授权及转交', description: '查看和管理评估任务授权转交记录' },
  { key: 'calibration-auth', title: '校准任务授权', description: '可协助校准人将任务授权他人校准' },
])

// 「其他」分组：可新增其他管理类模块卡片；查看跳转后续开发
const otherModules = ref<AuthorizationItem[]>([
  { key: 'focus-people', title: '人员组管理', description: '可将管理范围内的人员，添加进对应的人员组中' },
])

const filterOptions = computed(() => projectContext.cycles.map(cycle => ({ value: cycle.cycle_id, label: cycle.cycle_name })))

const managementCategories = computed(() => overview.value?.categories ?? [{
  key: 'project_admin' as const, label: overview.value?.category?.label || '项目管理员', projects: overview.value?.projects || [],
}])
const categories = computed<PerformanceReviewCategory[]>(() => managementCategories.value.map(category => ({
  key: category.key,
  label: category.label,
  nodes: [
    { node_id: `${category.key}:${OVERVIEW_NODE_ID}`, node_name: '周期概览', node_type: 'cycle_overview' },
    ...category.projects.map(project => ({ node_id: `${category.key}:project-${project.project_id}`, node_name: project.project_name, node_type: 'project' })),
  ].map(node => ({ ...node, executor_label: '', status: 'pending', start_at: null, end_at: null, action_url: '' }) as PerformanceReviewNode),
})))
const activeCycle = computed(() => overview.value?.active_cycle || null)
const selectedProject = computed(() => overview.value?.projects.find(project => project.project_id === Number(route.query.project_id)) || null)
const memberProjectId = computed(() => selectedProject.value?.project_id ?? 0)
const matrixProvider = computed(() => {
  const cycleId = activeCycle.value?.cycle_id || 0
  const scope = { ...managementScope.value }
  return () => projectManagementApi.managementMatrix(cycleId, scope)
})
const statisticsProvider = computed<ProjectReportProvider>(() => {
  const scope = { ...managementScope.value }
  const key = scopeKey.value
  return async ({ cycleId, dimension = 'department', indicatorKey }) => {
    const report = await projectContext.loadReport(`management:${key}:statistics:${dimension}:${indicatorKey || ''}`, () => projectManagementApi.levelStatistics(cycleId, dimension, scope, indicatorKey))
    return { ...report, ratings: report.ratings.map(rating => ({ ...rating, color: rating.color ?? undefined })) }
  }
})
const selfFinalProvider = computed(() => {
  const cycleId = activeCycle.value?.cycle_id || 0
  const scope = { ...managementScope.value }
  const key = scopeKey.value
  return async () => {
    const report = await projectContext.loadReport(`management:${key}:self-final`, () => projectManagementApi.selfFinalComparison(cycleId, scope))
    const normalize = (ratings: typeof report.ratings) => ratings.map(rating => ({ ...rating, color: rating.color ?? undefined }))
    return { ...report, ratings: normalize(report.ratings), xRatings: report.xRatings ? normalize(report.xRatings) : undefined, yRatings: report.yRatings ? normalize(report.yRatings) : undefined }
  }
})

const comparisonProvider = computed<ProjectReportComparisonProvider>(() => {
  const cycleId = activeCycle.value?.cycle_id || 0
  const scope = { ...managementScope.value }
  const key = scopeKey.value
  return async query => {
    const report = await projectContext.loadReport(`management:${key}:comparison:${JSON.stringify(query)}`, () => projectManagementApi.comparison(cycleId, query, scope))
    const normalize = (ratings: typeof report.ratings) => ratings.map(rating => ({ ...rating, color: rating.color ?? undefined }))
    return { ...report, ratings: normalize(report.ratings), xRatings: report.xRatings ? normalize(report.xRatings) : undefined, yRatings: report.yRatings ? normalize(report.yRatings) : undefined }
  }
})

const revieweeAddOpen = ref(false)
const viewRefreshKey = ref(0)
const contentKey = computed(() => `${scopeKey.value}:${viewRefreshKey.value}`)
const revieweeAddProjects = computed(() => overview.value?.projects?.filter(project => project.status === 'STARTED') ?? [])
const revieweeAddProjectId = computed(() => {
  const projects = revieweeAddProjects.value
  if (!projects.length) return null
  return selectedProject.value?.project_id ?? projects[0].project_id ?? null
})

function onRevieweeAdded() {
  // 快照一致性模型：添加被评估人 = 一次写入最新成员快照 + 建任务树，
  // 成员列表/总览完成率/矩阵/统计均查同一快照。这里只重绘当前所在视图一次。
  const currentCycleId = activeCycleId.value
  viewRefreshKey.value += 1
  projectContext.invalidateDrawerDetails()
  void loadOverview(currentCycleId)
}

function applyOverview(loaded: ProjectManagementOverview) {
  if (route.query.project_id && !loaded.projects.some(project => project.project_id === Number(route.query.project_id))) throw new Error('INVALID_MANAGEMENT_PROJECT')
  overview.value = loaded
  if (loaded.active_cycle) projectContext.setActiveCycleId(loaded.active_cycle.cycle_id)
}

let overviewRequest = 0
let disposed = false
let contextReady = false
let selectingCycle = false
let normalizingRole = false
const statisticsLoaded = ref(false)
const statisticsLoading = ref(false)
const statisticsError = ref('')
const returnRefreshError = ref('')
async function loadOverview(cycleId?: number | null, statisticsOnly = false, background = false, lightweight = false) {
  const request = ++overviewRequest
  const key = scopeKey.value
  const version = projectContext.cacheVersion
  const includeStatistics = !lightweight && activeTab.value === 'overview'
  loading.value = !statisticsOnly && !background
  statisticsLoading.value = statisticsOnly && !background
  if (!background) statisticsLoaded.value = false
  statisticsError.value = ''
  returnRefreshError.value = ''
  error.value = ''
  const current = () => !disposed && request === overviewRequest && key === scopeKey.value && version === projectContext.cacheVersion
  try {
    const loaded = await projectManagementApi.overview(cycleId ?? undefined, { ...requestedScope.value }, includeStatistics)
    if (!current()) return
    if (loaded.active_cycle && cycleId != null && loaded.active_cycle.cycle_id !== cycleId) throw new Error('INVALID_MANAGEMENT_CYCLE')
    if (!route.query.management_role && (loaded.active_role || !loaded.categories)) {
      normalizingRole = true
      try { await router.replace({ query: { ...route.query, management_role: loaded.active_role || 'project_admin' } }) }
      finally { normalizingRole = false }
      if (disposed || request !== overviewRequest) return
    }
    applyOverview(loaded)
    statisticsLoaded.value = includeStatistics
  } catch (failure: any) {
    if (current()) {
      const message = failure?.response?.status === 403 ? '无权访问当前管理范围' : '项目管理加载失败，请稍后重试'
      if (background) {
        projectContext.clearManagementReturn()
        if ([401, 403, 404].includes(failure?.response?.status) || failure?.message?.startsWith('INVALID_MANAGEMENT_')) {
          overview.value = null
          returnCompletion.value = undefined
          error.value = message
        } else returnRefreshError.value = '总览刷新失败，当前显示返回前的数据'
      } else if (statisticsOnly) {
        overview.value = overview.value ? { ...overview.value, completion_nodes: [] } : null
        statisticsError.value = message
      } else {
        overview.value = null
        error.value = message
      }
    }
  } finally {
    if (!disposed && request === overviewRequest) {
      loading.value = false
      statisticsLoading.value = false
    }
  }
}
watch([activeTab, loading], () => {
  if (activeTab.value !== 'overview') {
    if (statisticsLoading.value) overviewRequest++
    statisticsLoading.value = false
    statisticsError.value = ''
    return
  }
  if (!loading.value && activeCycle.value && !statisticsLoaded.value && !statisticsLoading.value && !error.value && !statisticsError.value) void loadOverview(activeCycleId.value, true)
})

function clearScopeState() {
  overviewRequest++
  statisticsLoaded.value = false
  statisticsLoading.value = false
  statisticsError.value = ''
  returnRefreshError.value = ''
  timelineRequest++
  returnCompletion.value = undefined
  timelineNodes.value = []
  timelineError.value = ''
  drawerOpen.value = false
  drawerMember.value = null
  drawerSourceTab.value = ''
  drawerActiveTab.value = ''
  memberReminderOpen.value = false
  memberReminderContext.value = null
  closeReminder()
  delegationOpen.value = false
  delegationTasks.value = []
  selectedDelegationMembers.value = []
  revieweeAddOpen.value = false
  focusGroupDialogOpen.value = false
  projectContext.invalidateDrawerDetails()
}
function managementQuery() {
  return {
    ...(activeCycleId.value ? { cycle_id: String(activeCycleId.value) } : {}),
    management_role: managementRole.value,
    ...(route.query.project_id ? { project_id: String(route.query.project_id) } : {}),
  }
}
function cleanMemberQuery() {
  const { rootReviewId: _root, activeTab: _tab, employee_no: _employee, member_project_id: _project, ...query } = route.query
  return query
}
async function selectCycle(rawCycleId: number | string) {
  const cycleId = Number(rawCycleId)
  if (!Number.isSafeInteger(cycleId) || cycleId <= 0 || cycleId === activeCycleId.value) return
  clearScopeState()
  loading.value = true
  selectingCycle = true
  try {
    const navigation = await projectContext.selectCycle(cycleId)
    if (projectContext.activeCycleId !== cycleId) return
    if (!navigation.can_manage) { await router.replace('/performance/workbench'); return }
    const { project_id: _project, ...query } = cleanMemberQuery()
    await router.replace({ query: { ...query, cycle_id: String(cycleId), management_role: managementRole.value, tab: activeTab.value } })
    await loadOverview(cycleId)
  } catch { error.value = '项目管理加载失败，请稍后重试' }
  finally { selectingCycle = false; loading.value = false }
}

async function selectNode(node: PerformanceReviewNode) {
  const [role, target] = node.node_id.split(':')
  if (!categories.value.some(category => category.key === role && category.nodes.some(item => item.node_id === node.node_id))) return
  await router.replace({ query: {
    ...cleanMemberQuery(),
    ...managementQuery(),
    management_role: role,
    project_id: target === OVERVIEW_NODE_ID ? undefined : target.replace('project-', ''),
    tab: activeTab.value,
  } })
}

watch([() => route.query.cycle_id, () => route.query.management_role, () => route.query.project_id], async () => {
  if (!contextReady || selectingCycle || normalizingRole || route.name === 'PerformanceProjectReminder') return
  clearScopeState()
  loading.value = true
  const cycleId = Number(route.query.cycle_id) || activeCycleId.value
  const key = JSON.stringify([route.query.cycle_id, route.query.management_role, route.query.project_id])
  try {
    if (cycleId && cycleId !== activeCycleId.value) {
      selectingCycle = true
      try { await projectContext.selectCycle(cycleId) } finally { selectingCycle = false }
    }
    if (key !== JSON.stringify([route.query.cycle_id, route.query.management_role, route.query.project_id])) return
    await loadOverview(cycleId)
    if (!error.value) restoreMember()
  } catch { error.value = '项目管理加载失败，请稍后重试'; loading.value = false }
}, { flush: 'sync' })

const timelineNodes = ref<WorkbenchTimelineNode[]>([])
const timelineLoading = ref(false)
const timelineError = ref('')
if (returnSnapshot) {
  applyOverview(returnSnapshot.overview)
  overviewViewMode.value = returnSnapshot.viewMode
  returnCompletion.value = returnSnapshot.completion
  timelineNodes.value = returnSnapshot.timeline
  statisticsLoaded.value = true
  loading.value = false
}
let timelineRequest = 0
function formatDateTime(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date)
    .reduce<Record<string, string>>((result, part) => { result[part.type] = part.value; return result }, {})
  return `${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`
}
async function loadTimeline() {
  const request = ++timelineRequest
  const key = scopeKey.value
  const projectId = selectedProject.value?.project_id
  const cycleId = activeCycle.value?.cycle_id
  timelineNodes.value = []
  timelineError.value = ''
  timelineLoading.value = false
  if (!projectId || !cycleId || activeTab.value !== 'overview' || loading.value || statisticsLoading.value || statisticsError.value) return
  timelineLoading.value = true
  const current = () => !disposed && request === timelineRequest && key === scopeKey.value
  try {
    const nodes = await projectManagementApi.timeline(cycleId, projectId, managementRole.value as 'hrbp' | 'project_admin')
    if (current()) timelineNodes.value = nodes.map(node => ({
      node_id: node.node_id, node_name: node.node_name,
      range: !node.start_at && !node.end_at ? '时间待配置' : `${formatDateTime(node.start_at) || '--'} - ${formatDateTime(node.end_at) || '--'}`,
      ended: node.status === 'ended', current: node.status === 'in_progress',
    }))
  } catch {
    if (current()) timelineError.value = '项目流程加载失败，请稍后重试'
  } finally {
    if (current()) timelineLoading.value = false
  }
}
watch(() => [scopeKey.value, activeTab.value, loading.value, statisticsLoading.value, statisticsError.value], () => { void loadTimeline() })

async function handleCompletionAction(payload: { action: 'remind' | 'enable-result'; nodeKey: string; title: string; description?: string; departmentPath?: string }) {
  emit('completion-action', payload)
  if (payload.action === 'enable-result' && activeCycle.value) {
    reminderContext.value = {
      projectId: memberProjectId.value, cycleId: activeCycle.value.cycle_id, nodeId: 'result-view', nodeType: 'result_view',
      reviewType: 'result_opening', title: '开通绩效结果', sectionTitle: '未开通的被评估人',
      description: '仅可选择当前周期内符合开通条件的被评估人',
    }
    reminderOpen.value = true
    return
  }
  if (payload.action !== 'remind' || !activeCycle.value) return
  if (overview.value && statisticsLoaded.value) {
    projectContext.saveManagementReturn(activeCycle.value.cycle_id, managementRole.value, route.query.project_id ? Number(route.query.project_id) : undefined, {
      overview: overview.value, viewMode: overviewViewMode.value, scrollTop: managementContent.value?.scrollTop || 0,
      timeline: timelineNodes.value,
      completion: completionPanel.value?.returnState() || { department: null, expanded: [], sortKey: '', sortOrder: '', resultView: 'opened' },
    })
  }
  const match = payload.description?.match(/完成率：([\d.]+)%[　\s]*\|[　\s]*完成情况：(\d+)\/(\d+)/)
  await router.push({
    name: 'PerformanceProjectReminder',
    query: {
      ...managementQuery(),
      node_key: payload.nodeKey,
      reminder_title: payload.title,
      reminder_description: payload.description || '',
      department: payload.departmentPath || '',
      view: overviewViewMode.value,
      ...(match ? { completion_rate: match[1], completed: match[2], total: match[3] } : {}),
    },
  })
}

async function handleAuthorizationView(item: AuthorizationItem) {
  if (!activeCycle.value) return
  await router.push({ name: item.key === 'calibration-auth' ? 'PerformanceCalibrationAuthorization' : 'PerformanceAuthorizationRecords', query: { ...managementQuery() } })
}

const focusGroupDialogOpen = ref(false)

function handleOtherView(item: AuthorizationItem) {
  if (item.key !== 'focus-people') return
  focusGroupDialogOpen.value = true
}

function closeReminder() {
  reminderOpen.value = false
  reminderContext.value = null
}

function handleReminderFilter() {}

onMounted(async () => {
  const routeCycleId = Number(route.query.cycle_id)
  try {
    if (!projectContext.navigationReady) await projectContext.ensureNavigation(Number.isFinite(routeCycleId) && routeCycleId > 0 ? routeCycleId : undefined)
    if (projectContext.navigation && !projectContext.navigation.can_manage) { await router.replace('/performance/workbench'); return }
    const cycleId = projectContext.activeCycleId
    if (String(route.query.cycle_id || '') !== String(cycleId || '')) await router.replace({ query: { ...route.query, cycle_id: cycleId ? String(cycleId) : undefined } })
    if (returnSnapshot) {
      await nextTick()
      if (managementContent.value) managementContent.value.scrollTop = returnSnapshot.scrollTop
      contextReady = true
      void loadOverview(cycleId, false, true)
      return
    }
    await loadOverview(cycleId, false, false, route.query.from_reminder === '1')
    if (!error.value) restoreMember()
    contextReady = true
  } catch { error.value = '项目管理加载失败，请稍后重试'; loading.value = false }
})
onBeforeUnmount(() => { disposed = true; overviewRequest++; timelineRequest++ })
</script>

<style scoped>
:where(.project-management-page, .project-reminder-page, .authorization-records, .calibration-authorization) { font-family: 'Helvetica Neue', Tahoma, 'PingFang SC', 'Microsoft Yahei', Arial, 'Hiragino Sans GB', sans-serif; }

.project-management-page { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex: 1; overflow: hidden; background: var(--performance-page-surface); }
.management-content { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; overflow-y: auto; padding: var(--performance-review-surface-inset) var(--performance-review-surface-inset) 24px; background: var(--performance-line-tabs-surface); }
.management-timeline { padding: var(--spacing-6) var(--spacing-4); margin-bottom: var(--spacing-4); background: var(--color-bg-card); border-radius: var(--radius-lg); }
.management-timeline p { margin: 0; color: var(--color-text-secondary); }
.management-timeline button { border: 0; background: transparent; color: var(--color-primary); cursor: pointer; }
.cycle-overview { display: flex; min-width: 0; flex-direction: column; }
.pane-hint { margin: 16px 0 0; color: #8f959e; font-size: 13px; }
.state-message { display: grid; flex: 1; place-content: center; gap: 8px; color: #646a73; font-size: 14px; text-align: center; }
.state-message.error-state { color: #d14343; }
.state-message button { justify-self: center; padding: 6px 18px; border: 0; border-radius: 6px; background: var(--color-primary, #3370ff); color: #fff; cursor: pointer; }
.panel-hint { margin: 4px 0 0; color: #8f959e; font-size: 13px; }
.reviewee-add-trigger { margin-left: var(--spacing-3); min-width: 125px; }
.reviewee-add-trigger__icon { flex: none; font-size: var(--font-size-md); margin-right: var(--spacing-1); color: var(--performance-button-secondary-text); }
@media (max-width: 720px) { .project-management-page { display: block; overflow: visible; } }
</style>
