<template>
  <section class="result-view-page" aria-live="polite">
    <div v-if="loading" class="result-view-state">正在加载绩效结果…</div>
    <div v-else-if="error" class="result-view-state result-view-state--error"><p>{{ error }}</p><button type="button" @click="load">重新加载</button></div>
    <template v-else-if="overview">
      <PerformancePageTitle :title="title" />
      <PerformanceLineTabs :model-value="activeTab" sticky :tabs="tabs" @update:model-value="selectTab">
        <CompletionRatePanel v-if="activeTab === 'overview'" :nodes="completionNodes" @action="handleCompletionAction" />
        <ProjectMemberListPanel v-else-if="activeTab === 'members'" :project-id="0" :cycle-id="cycleId" readonly :provider="memberProvider" @select-member="openMember" />
        <ProjectPerformanceMatrix v-else-if="activeTab === 'matrix'" :project-id="0" :cycle-name="overview.cycle.cycle_name" readonly :provider="matrixProvider" @open-member="openMember" />
        <ProjectStatisticsReportPanel v-else :cycle-id="cycleId" :cycle-name="overview.cycle.cycle_name" :provider="statisticsProvider" :self-final-provider="selfFinalProvider" />
      </PerformanceLineTabs>
    </template>
    <PerformanceReviewEvaluationDrawer
      v-if="drawerMember"
      v-model="drawerOpen"
      :employee-no="drawerMember.employee_no"
      :project-id="drawerMember.project_id"
      :detail-loader="detailLoader"
      :active-tab="drawerTab"
      :member="drawerMember"
      readonly
      @update:active-tab="drawerTab = $event"
      @close="drawerOpen = false"
      @closed="drawerMember = null"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { resultViewApi, type PerformanceResultViewOverview, type ProjectMember } from '@/api/performance'
import type { ProjectReportDimension } from '@/components/performance/projectStatisticsReport'
import PerformancePageTitle from '@/components/performance/PerformancePageTitle.vue'
import PerformanceLineTabs, { type PerformanceLineTab } from '@/components/performance/PerformanceLineTabs.vue'
import CompletionRatePanel from '@/components/performance/CompletionRatePanel.vue'
import type { CompletionNode } from '@/components/performance/CompletionNodeCard.vue'
import ProjectMemberListPanel from '@/components/performance/ProjectMemberListPanel.vue'
import ProjectPerformanceMatrix from '@/components/performance/ProjectPerformanceMatrix.vue'
import ProjectStatisticsReportPanel from '@/components/performance/ProjectStatisticsReportPanel.vue'
import PerformanceReviewEvaluationDrawer from '@/components/performance/PerformanceReviewEvaluationDrawer.vue'

const props = defineProps<{ kind: 'team' | 'focus'; cycleId: number }>()
const router = useRouter()
const route = useRoute()
const overview = ref<PerformanceResultViewOverview | null>(null)
const loading = ref(false)
const error = ref('')
const activeTab = computed(() => tabs.value.some(tab => tab.key === route.query.tab) ? String(route.query.tab) : props.kind === 'team' ? 'overview' : 'members')
function selectTab(tab: string) {
  if (!tabs.value.some(item => item.key === tab)) return
  void router.push({ query: { cycle_id: String(props.cycleId), node: props.kind === 'team' ? '__team-results__' : '__focus-results__', tab } })
}
const title = computed(() => props.kind === 'team' ? '查看团队绩效结果' : '关注人员的绩效结果')
const tabs = computed<PerformanceLineTab[]>(() => [
  ...(props.kind === 'team' ? [{ key: 'overview', label: '总览' }] : []),
  { key: 'members', label: '成员列表' },
  { key: 'matrix', label: '矩阵分析' },
  { key: 'reports', label: '统计报表' },
])
const completionNodes = computed<CompletionNode[]>(() => (overview.value?.completion_nodes || []).map(node => ({
  key: node.key,
  title: node.title,
  status: node.status,
  progress: node.completion_rate == null ? '--' : `${node.completion_rate.toFixed(2)}%`,
  completionStatus: `${node.completed_count}/${node.total_count}`,
  deadline: node.deadline_at,
  canRemind: node.can_remind,
  canOpenResult: false,
  openableCount: 0,
  openedProgress: node.completion_rate == null ? '--' : `${node.completion_rate.toFixed(2)}%`,
  openedCompletionStatus: `${node.completed_count}/${node.total_count}`,
  reconsideredProgress: `${(node.completed_count ? (node.reconsidered_count || 0) / node.completed_count * 100 : 0).toFixed(2)}%`,
  reconsideredCompletionStatus: `${node.reconsidered_count || 0}/${node.completed_count}`,
  reminderTitle: node.reminder_title,
  reminderDescription: node.reminder_description,
})))

let request = 0
async function load() {
  const id = ++request
  loading.value = true
  error.value = ''
  try {
    const value = await resultViewApi.overview(props.kind, props.cycleId)
    if (id === request) overview.value = value
  } catch {
    if (id === request) { overview.value = null; error.value = '绩效结果加载失败，请稍后重试' }
  } finally { if (id === request) loading.value = false }
}
const memberProvider = (query: { keyword?: string; page: number; pageSize: number; sortBy?: string; sortOrder?: 'asc' | 'desc' }) => resultViewApi.members(props.kind, props.cycleId, query.keyword, query.page, query.pageSize, query.sortBy, query.sortOrder)
const matrixProvider = () => resultViewApi.matrix(props.kind, props.cycleId)
const statisticsProvider = async ({ dimension = 'department' }: { cycleId: number; dimension?: ProjectReportDimension }) => {
  const report = await resultViewApi.statistics(props.kind, props.cycleId, dimension)
  return { ...report, ratings: report.ratings.map(rating => ({ ...rating, color: rating.color ?? undefined })) }
}
const selfFinalProvider = async () => {
  const report = await resultViewApi.selfFinalComparison(props.kind, props.cycleId)
  return { ...report, ratings: report.ratings.map(rating => ({ ...rating, color: rating.color ?? undefined })) }
}

const drawerMember = ref<(ProjectMember & { project_id: number }) | null>(null)
const drawerOpen = ref(false)
const drawerTab = ref('')
const detailLoader = computed(() => drawerMember.value ? (tab?: string) => resultViewApi.detail(props.kind, props.cycleId, Number(drawerMember.value!.project_id), drawerMember.value!.employee_no, drawerMember.value!.root_review_id, tab ?? '') : undefined)
function openMember(member: ProjectMember | { project_id?: number; employee_no: string; root_review_id?: number; can_view_detail?: boolean }) {
  if (!member.can_view_detail || !member.project_id) return
  drawerMember.value = member as ProjectMember & { project_id: number }
  drawerTab.value = ''
  drawerOpen.value = true
}
function handleCompletionAction(payload: { action: 'remind' | 'enable-result'; nodeKey: string; departmentPath?: string }) {
  if (payload.action !== 'remind') return
  void router.push({ name: 'PerformanceProjectReminder', query: { cycle_id: String(props.cycleId), node_key: payload.nodeKey, department: payload.departmentPath || '', source: 'team-results' } })
}
watch(() => [props.kind, props.cycleId], () => { drawerOpen.value = false; drawerMember.value = null; void load() })
onBeforeUnmount(() => { ++request })
onMounted(load)
</script>

<style scoped>
.result-view-page { display:flex; min-width:0; min-height:0; flex:1; flex-direction:column; overflow-y:auto; padding:40px 24px; background:var(--performance-page-surface); }
.result-view-state { display:grid; min-height:240px; place-items:center; color:var(--color-text-secondary); }
.result-view-state--error { color:var(--color-danger); }
.result-view-state button { border:0; background:transparent; color:var(--color-primary); cursor:pointer; }
</style>
