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
    <section class="management-content" aria-live="polite">
      <div v-if="loading" class="state-message">正在加载项目管理…</div>
      <div v-else-if="error" class="state-message error-state">
        <p>{{ error }}</p>
        <button type="button" @click="loadOverview(activeCycleId)">重新加载</button>
      </div>
      <div v-else-if="!activeCycle" class="state-message">
        <p>当前没有你作为项目管理员参与的已启动项目</p>
      </div>
      <template v-else>
        <div v-if="!selectedProject" class="cycle-overview">
          <PerformancePageTitle title="周期概览">
            <template #actions>
              <UiButton variant="secondary" class="reviewee-add-trigger" @click="revieweeAddOpen = true"><MemberAddIcon class="reviewee-add-trigger__icon" />添加被评估人</UiButton>
            </template>
          </PerformancePageTitle>
          <PerformanceLineTabs v-model="activeTab" sticky :tabs="overviewTabs">
            <CompletionRatePanel v-if="activeTab === 'overview'" :nodes="completionNodes" :cycle-id="activeCycle.cycle_id" v-model:view-mode="overviewViewMode" :department-provider="projectManagementApi.departmentCompletion" @action="handleCompletionAction" />
            <AuthorizationManagementPanel v-if="activeTab === 'overview'" :authorizations="authorizations" @view="handleAuthorizationView" />
            <AuthorizationManagementPanel v-if="activeTab === 'overview'" title="其他" :authorizations="otherModules" @view="handleOtherView" />
            <ProjectMemberListPanel v-else-if="activeTab === 'members'" :key="viewRefreshKey" :cycle-id="activeCycle.cycle_id" :project-id="memberProjectId" @filter="emit('member-filter')" @authorize-selected="openDelegation('AUTHORIZE', $event)" @transfer-selected="openDelegation('TRANSFER', $event)" @select-member="openMember" @remind-evaluate="handleEvaluateRemind" />
            <ProjectPerformanceMatrix v-else-if="activeTab === 'matrix'" :key="viewRefreshKey" :project-id="memberProjectId" :cycle-name="activeCycle.cycle_name" />
            <ProjectStatisticsReportPanel v-else-if="activeTab === 'reports'" :key="viewRefreshKey" :cycle-id="activeCycle.cycle_id" :cycle-name="activeCycle.cycle_name" />
            <p v-else class="pane-hint">该页签内容将在后续迭代中开发</p>
          </PerformanceLineTabs>
        </div>
        <div v-else class="management-heading">
          <PerformancePageTitle :title="selectedProject.project_name">
            <p class="panel-hint">项目管理内容将在后续迭代中开发</p>
          </PerformancePageTitle>
        </div>
      </template>
    </section>
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
      readonly
      @update:active-tab="updateMemberTab"
      @close="closeMember"
      @closed="finishClosingMember"
      @copy-link="copyMemberLink"
      @edit="fillFromDrawer"
    />
    <PerformanceTaskDelegationDialog v-model="delegationOpen" :action="delegationAction" :tasks="delegationTasks" @completed="delegationCompleted" />
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
import { computed, onMounted, ref, watch } from 'vue'
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
import PerformanceTaskDelegationDialog from '@/components/performance/PerformanceTaskDelegationDialog.vue'
import RevieweeAddDialog from '@/components/performance/RevieweeAddDialog.vue'
import MemberAddIcon from '@/components/performance/MemberAddIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { ProjectMember } from '@/api/performance'
import type { ReminderContext } from '@/components/performance/performanceReminder'
import type { CompletionNode } from '@/components/performance/CompletionNodeCard.vue'
import type { AuthorizationItem } from '@/components/performance/AuthorizationManagementPanel.vue'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'

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
const emit = defineEmits<{
  'completion-action': [payload: { action: 'remind' | 'enable-result'; nodeKey: string; departmentPath?: string }]
  'authorization-view': [item: AuthorizationItem]
  'member-filter': []
}>()
const overview = ref<ProjectManagementOverview | null>(null)
const activeCycleId = computed(() => projectContext.activeCycleId)
const selectedKey = ref('')
const activeTab = ref(route.query.rootReviewId ? 'members' : 'overview')
const drawerMember = ref<{ project_id: number; employee_no: string; root_review_id?: number } | null>(null)
const drawerOpen = ref(false)
const drawerActiveTab = ref(String(route.query.activeTab || ''))
const memberDetailLoader = computed(() => {
  const member = drawerMember.value
  return member ? () => projectManagementApi.memberDetail(member.project_id, member.employee_no, member.root_review_id) : undefined
})
function memberQuery() {
  return { ...route.query, member_project_id: String(drawerMember.value?.project_id || ''), employee_no: drawerMember.value?.employee_no, rootReviewId: String(drawerMember.value?.root_review_id || ''), activeTab: drawerActiveTab.value || undefined }
}
async function openMember(member: ProjectMember) {
  if (!member.can_view_detail) return
  drawerMember.value = { project_id: member.project_id || memberProjectId.value, employee_no: member.employee_no, root_review_id: member.root_review_id }
  drawerActiveTab.value = ''
  drawerOpen.value = true
  await router.replace({ query: memberQuery() })
}
async function updateMemberTab(tab: string) {
  drawerActiveTab.value = tab
  if (drawerOpen.value) await router.replace({ query: memberQuery() })
}
async function closeMember() {
  drawerOpen.value = false
  const { rootReviewId: _root, activeTab: _tab, employee_no: _employee, member_project_id: _project, ...query } = route.query
  await router.replace({ query })
}
function finishClosingMember() { if (!drawerOpen.value) drawerMember.value = null }
async function fillFromDrawer(payload: { task_id: string | number; employee_no: string; node_id?: string }) {
  const member = drawerMember.value
  const projectId = member?.project_id ?? Number(route.query.member_project_id)
  if (!member || !Number.isFinite(projectId) || projectId <= 0) return
  const path = '/performance/review/template-task'
  const query: Record<string, string> = {
    task_id: String(payload.task_id),
    project_id: String(projectId),
    node: payload.node_id || '',
    employee_no: payload.employee_no,
  }
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
  activeTab.value = 'members'
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
const reminderMode = ref<'remind' | 'open-result'>('remind')
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

function delegationCompleted() {
  delegationOpen.value = false
  delegationTasks.value = []
  selectedDelegationMembers.value = []
  void loadOverview(activeCycleId.value ?? undefined)
}

function handleEvaluateRemind(payload: { member: ProjectMember; pendingCount: number }) {
  const cycle = activeCycle.value
  if (!cycle || !payload.pendingCount) return
  // 弹窗催办：打开该成员 360° 评估的未完成评估人浮层（review-360 走自愿评估 node）
  reminderMode.value = 'remind'
  reminderContext.value = {
    projectId: Number(payload.member.project_id || memberProjectId.value),
    cycleId: cycle.cycle_id,
    nodeId: 'review-360',
    nodeType: 'review',
    reviewType: 'review',
    title: `${payload.member.display_name} · 360° 评估催办`,
    sectionTitle: '未完成的评估人',
    description: `仅展示 ${payload.member.display_name} 尚未完成 360° 评估的评估人`,
  }
  reminderOpen.value = true
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

const menuNodes = computed<PerformanceReviewNode[]>(() => [
  { node_id: OVERVIEW_NODE_ID, node_name: '周期概览', node_type: 'cycle_overview', executor_label: '', status: 'pending', start_at: null, end_at: null, action_url: '' } as PerformanceReviewNode,
  ...(overview.value?.projects || []).map(project => ({
    node_id: `project-${project.project_id}`,
    node_name: project.project_name,
    node_type: 'project',
    executor_label: '',
    status: 'pending',
    start_at: null,
    end_at: null,
    action_url: '',
  }) as PerformanceReviewNode),
])

const categories = computed<PerformanceReviewCategory[]>(() => {
  const label = overview.value?.category?.label || '项目管理员'
  return [{ key: 'admin', label, nodes: menuNodes.value }]
})

const activeCycle = computed(() => overview.value?.active_cycle || null)
const selectedNode = computed(() => menuNodes.value.find(node => node.node_id === selectedKey.value) || null)
const selectedProject = computed(() => {
  if (!selectedNode.value || selectedNode.value.node_type !== 'project') return null
  const projectId = Number(selectedNode.value.node_id.replace('project-', ''))
  return overview.value?.projects.find(project => project.project_id === projectId) || null
})

const memberProjectId = computed(() => selectedProject.value?.project_id ?? overview.value?.projects[0]?.project_id ?? 0)

const revieweeAddOpen = ref(false)
const viewRefreshKey = ref(0)
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
  void loadOverview(currentCycleId)
}

function applyOverview(loaded: ProjectManagementOverview) {
  overview.value = loaded
  if (loaded.active_cycle) projectContext.setActiveCycleId(loaded.active_cycle.cycle_id)
  if (!menuNodes.value.some(node => node.node_id === selectedKey.value)) {
    selectedKey.value = OVERVIEW_NODE_ID
  }
}

async function loadOverview(cycleId?: number | null) {
  loading.value = true
  error.value = ''
  try {
    const loaded = await projectManagementApi.overview(cycleId ?? undefined)
    applyOverview(loaded)
  } catch {
    error.value = '项目管理加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

async function selectCycle(rawCycleId: number | string) {
  const cycleId = Number(rawCycleId)
  if (!Number.isFinite(cycleId) || cycleId <= 0 || cycleId === activeCycleId.value) return
  selectedKey.value = OVERVIEW_NODE_ID
  drawerOpen.value = false
  drawerMember.value = null
  loading.value = true
  try {
    const navigation = await projectContext.selectCycle(cycleId)
    if (projectContext.activeCycleId !== cycleId) return
    if (!navigation.can_manage) { await router.replace('/performance/workbench'); return }
    await router.replace({ query: { cycle_id: String(cycleId) } })
    await loadOverview(cycleId)
  } catch { error.value = '项目管理加载失败，请稍后重试' }
  finally { loading.value = false }
}

async function selectNode(node: PerformanceReviewNode) {
  selectedKey.value = node.node_id
  const query: Record<string, string> = { ...(route.query as Record<string, string>) }
  if (activeCycleId.value) query.cycle_id = String(activeCycleId.value)
  if (node.node_id === OVERVIEW_NODE_ID) delete query.project_id
  else query.project_id = node.node_id.replace('project-', '')
  await router.replace({ query })
}

async function handleCompletionAction(payload: { action: 'remind' | 'enable-result'; nodeKey: string; title: string; description?: string; departmentPath?: string }) {
  emit('completion-action', payload)
  if (payload.action === 'enable-result' && activeCycle.value) {
    reminderMode.value = 'open-result'
    reminderContext.value = {
      projectId: 0, cycleId: activeCycle.value.cycle_id, nodeId: 'result-view', nodeType: 'result_view',
      reviewType: 'result_opening', title: '开通绩效结果', sectionTitle: '未开通的被评估人',
      description: '仅可选择当前周期内符合开通条件的被评估人',
    }
    reminderOpen.value = true
    return
  }
  if (payload.action !== 'remind' || !activeCycle.value) return
  const match = payload.description?.match(/完成率：([\d.]+)%[　\s]*\|[　\s]*完成情况：(\d+)\/(\d+)/)
  await router.push({
    name: 'PerformanceProjectReminder',
    query: {
      cycle_id: String(activeCycle.value.cycle_id),
      node_key: payload.nodeKey,
      department: payload.departmentPath || '',
      view: overviewViewMode.value,
      ...(match ? { completion_rate: match[1], completed: match[2], total: match[3] } : {}),
    },
  })
}

async function handleAuthorizationView(item: AuthorizationItem) {
  if (!activeCycle.value) return
  await router.push({ name: item.key === 'calibration-auth' ? 'PerformanceCalibrationAuthorization' : 'PerformanceAuthorizationRecords', query: { cycle_id: String(activeCycle.value.cycle_id) } })
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
    await loadOverview(cycleId)
    restoreMember()
  } catch { error.value = '项目管理加载失败，请稍后重试'; loading.value = false }
})
</script>

<style scoped>
:where(.project-management-page, .project-reminder-page, .authorization-records, .calibration-authorization) { font-family: 'Helvetica Neue', Tahoma, 'PingFang SC', 'Microsoft Yahei', Arial, 'Hiragino Sans GB', sans-serif; }

.project-management-page { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex: 1; overflow: hidden; background: var(--performance-page-surface); }
.management-content { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; overflow-y: auto; padding: var(--performance-review-surface-inset) var(--performance-review-surface-inset) 24px; background: var(--performance-line-tabs-surface); }
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
