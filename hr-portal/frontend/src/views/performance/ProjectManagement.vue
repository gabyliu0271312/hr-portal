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
          <PerformancePageTitle title="周期概览" />
          <PerformanceLineTabs v-model="activeTab" sticky :tabs="overviewTabs">
            <CompletionRatePanel v-if="activeTab === 'overview'" :nodes="completionNodes" @action="emit('completion-action', $event)" />
            <AuthorizationManagementPanel v-if="activeTab === 'overview'" :authorizations="authorizations" @view="emit('authorization-view', $event)" />
            <ProjectMemberListPanel v-else-if="activeTab === 'members'" :project-id="memberProjectId" @filter="emit('member-filter')" @export="emit('member-export')" />
            <ProjectPerformanceMatrix v-else-if="activeTab === 'matrix'" :project-id="memberProjectId" />
            <ProjectStatisticsReportPanel v-else-if="activeTab === 'reports'" :cycle-id="activeCycle.cycle_id" :cycle-name="activeCycle.cycle_name" />
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  projectManagementApi,
  type PerformanceReviewCategory,
  type PerformanceReviewNode,
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
import type { CompletionNode } from '@/components/performance/CompletionNodeCard.vue'
import type { AuthorizationItem } from '@/components/performance/AuthorizationManagementPanel.vue'

const OVERVIEW_NODE_ID = 'cycle-overview'
const OVERVIEW_TABS: PerformanceLineTab[] = [
  { key: 'overview', label: '总览' },
  { key: 'members', label: '成员列表' },
  { key: 'matrix', label: '矩阵分析' },
  { key: 'reports', label: '统计报表' },
]

const route = useRoute()
const router = useRouter()
const emit = defineEmits<{
  'completion-action': [payload: { action: 'remind' | 'enable-result'; nodeKey: string }]
  'authorization-view': [item: AuthorizationItem]
  'member-filter': []
  'member-export': []
}>()
const overview = ref<ProjectManagementOverview | null>(null)
const activeCycleId = ref<number | null>(null)
const selectedKey = ref('')
const activeTab = ref('overview')
const overviewTabs = OVERVIEW_TABS
const loading = ref(true)
const error = ref('')

// 完成率环节卡：本期静态占位数据（采集快照），完成率 API 契约待后续任务
const completionNodes = ref<CompletionNode[]>([
  { key: 'work-summary', title: '填写工作总结', progress: '--', deadline: null },
  { key: 'self-review', title: '自评', progress: '--', deadline: null },
  { key: 'review-360', title: '360°反馈（自愿评估）', progress: '--', deadline: null },
  { key: 'manager-review', title: '上级评估', progress: '--', deadline: null },
  { key: 'calibration', title: '绩效校准', progress: '--', deadline: null },
  { key: 'communicate', title: '绩效沟通并开通结果', progress: '--', deadline: null },
  { key: 'view-result', title: '查看绩效结果', progress: '--', deadline: null },
  { key: 'result-reconsideration', title: '结果复议处理', progress: '--', deadline: null },
])

// 授权管理卡：本期静态数据（采集快照），查看动作待后续任务
const authorizations = ref<AuthorizationItem[]>([
  { key: 'evaluation-transfer', title: '评估任务授权及转交', description: '查看和管理评估任务授权转交记录' },
  { key: 'calibration-auth', title: '校准任务授权', description: '可协助校准人将任务授权他人校准' },
])

const filterOptions = computed(() =>
  (overview.value?.cycles || []).map(cycle => ({ value: cycle.cycle_id, label: cycle.cycle_name })),
)

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

function applyOverview(loaded: ProjectManagementOverview) {
  overview.value = loaded
  activeCycleId.value = loaded.active_cycle?.cycle_id ?? null
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
  await router.replace({ query: { ...route.query, cycle_id: String(cycleId), node: undefined } })
  await loadOverview(cycleId)
}

async function selectNode(node: PerformanceReviewNode) {
  selectedKey.value = node.node_id
  const query: Record<string, string> = { ...(route.query as Record<string, string>) }
  if (activeCycleId.value) query.cycle_id = String(activeCycleId.value)
  if (node.node_id === OVERVIEW_NODE_ID) delete query.project_id
  else query.project_id = node.node_id.replace('project-', '')
  await router.replace({ query })
}

onMounted(() => {
  const routeCycleId = Number(route.query.cycle_id)
  const routeProjectId = Number(route.query.project_id)
  if (Number.isFinite(routeProjectId) && routeProjectId > 0) selectedKey.value = `project-${routeProjectId}`
  void loadOverview(Number.isFinite(routeCycleId) && routeCycleId > 0 ? routeCycleId : undefined)
})
</script>

<style scoped>
.project-management-page { display: flex; width: 100%; height: 100%; min-width: 0; min-height: 0; flex: 1; overflow: hidden; background: #f4f6f8; }
.management-content { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; overflow-y: auto; padding: var(--performance-review-surface-inset) var(--performance-review-surface-inset) 24px; background: var(--performance-line-tabs-surface); }
.cycle-overview { display: flex; min-width: 0; flex-direction: column; }
.pane-hint { margin: 16px 0 0; color: #8f959e; font-size: 13px; }
.state-message { display: grid; flex: 1; place-content: center; gap: 8px; color: #646a73; font-size: 14px; text-align: center; }
.state-message.error-state { color: #d14343; }
.state-message button { justify-self: center; padding: 6px 18px; border: 0; border-radius: 6px; background: var(--color-primary, #3370ff); color: #fff; cursor: pointer; }
.panel-hint { margin: 4px 0 0; color: #8f959e; font-size: 13px; }
@media (max-width: 720px) { .project-management-page { display: block; overflow: visible; } }
</style>
