<template>
  <section class="calibration-scope-analysis" :aria-busy="loading">
    <p v-if="loading" class="analysis-state" role="status">正在加载当前校准范围的分析数据…</p>
    <div v-else-if="error" class="analysis-state" role="alert"><p>{{ error }}</p><button type="button" @click="load">重新加载</button></div>
    <p v-else-if="data?.rating_conflict" class="analysis-state" role="status">{{ data.rating_conflict_reason }}</p>
    <p v-else-if="data && (!data.items.length || !indicators.length)" class="analysis-state" role="status">当前合法校准范围暂无可用分析数据</p>
    <template v-else-if="data">
      <p v-if="props.scopes" class="analysis-observed-notice">按当前可见评级值统计，仅展示已出现的评级选项。</p>
      <template v-if="tab === 'matrix'">
        <label v-if="indicators.length > 1" class="analysis-indicator">评估维度
          <PerformanceSearchSelect :model-value="indicatorKey ?? null" :options="indicators.map(indicator => ({ value: indicator.key, label: indicator.label }))" selection-style="plain" aria-label="校准矩阵评估维度" @update:model-value="selectIndicator" />
        </label>
        <ProjectPerformanceMatrix :key="`${generation}:${indicatorKey}`" :project-id="projectId" :cycle-id="cycleId" :scope-key="scopeKey" :provider="matrixProvider" readonly @open-member="openMember" />
      </template>
      <ProjectStatisticsReportPanel v-else :key="generation" :cycle-id="cycleId" :provider="scopeStatsProvider" :comparison-provider="scopeComparisonProvider" :allow-examples="false" @filter="emit('filter')" />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { api } from '@/api/client'
import type { PerformanceReviewNode, PerformanceWorkbenchTaskPeoplePage } from '@/api/performance'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import ProjectPerformanceMatrix from '../ProjectPerformanceMatrix.vue'
import ProjectStatisticsReportPanel from '../ProjectStatisticsReportPanel.vue'
import PerformanceSearchSelect from '../PerformanceSearchSelect.vue'
import type { ProjectReportComparisonProvider, ProjectReportProvider } from '../projectStatisticsReport'
import { calibrationAnalysisIndicators, calibrationMemberKey, calibrationScopeComparison, calibrationScopeMatrix, calibrationScopeStatistics, loadCalibrationScopeAnalysis, loadCalibrationScopesAnalysis, uniqueCalibrationMembers, type CalibrationAnalysisMember, type CalibrationAnalysisScope, type CalibrationScopeAnalysisData } from './calibrationScopeAnalysis'

const props = defineProps<{ scope?: CalibrationAnalysisScope; scopes?: CalibrationAnalysisScope[]; cycleId: number; tab: 'matrix' | 'report' }>()
const emit = defineEmits<{ 'open-member': [payload: { node: PerformanceReviewNode; member: CalibrationAnalysisMember }]; filter: [] }>()
const data = shallowRef<CalibrationScopeAnalysisData | null>(null)
const loading = ref(false)
const error = ref('')
const indicatorKey = ref<string>()
const generation = ref(0)
const indicators = computed(() => data.value ? calibrationAnalysisIndicators(data.value) : [])
const scopes = computed(() => props.scopes ?? (props.scope ? [props.scope] : []))
const projectId = computed(() => props.scopes ? 0 : props.scope?.project_id ?? 0)
const scopeKey = computed(() => props.scopes ? JSON.stringify(scopes.value.map(scope => [scope.project_id, scope.scope_key, scope.node_id, scope.phase_id])) : props.scope?.scope_key)
let controller: AbortController | undefined

async function load() {
  controller?.abort()
  const abort = new AbortController()
  controller = abort
  const request = ++generation.value
  const requestedScopes = scopes.value.map(scope => ({ ...scope }))
  data.value = null
  indicatorKey.value = undefined
  error.value = ''
  loading.value = true
  try {
    const loader = async (scope: CalibrationAnalysisScope, page: number, pageSize: number) => {
      const { data: pageData } = await api.get<PerformanceWorkbenchTaskPeoplePage>(`/performance/workbench/tasks/${encodeURIComponent(scope.node_id)}/people`, {
        params: { project_id: scope.project_id, phase_id: scope.phase_id, scope_key: scope.scope_key, state: 'all', page, page_size: pageSize }, signal: abort.signal,
      })
      return pageData
    }
    const result = props.scopes
      ? await loadCalibrationScopesAnalysis(requestedScopes, loader, abort.signal)
      : requestedScopes[0] ? await loadCalibrationScopeAnalysis((page, pageSize) => loader(requestedScopes[0], page, pageSize), abort.signal) : { items: [], rating_columns: [] }
    if (request !== generation.value || abort.signal.aborted) return
    data.value = result
    indicatorKey.value = calibrationAnalysisIndicators(result)[0]?.key
  } catch (cause) {
    if (request !== generation.value || abort.signal.aborted) return
    const status = (cause as { response?: { status?: number } }).response?.status
    error.value = status === 403 ? '无权查看当前校准范围的分析数据' : '当前校准范围的分析数据加载失败，请重新加载'
  } finally {
    if (request === generation.value) loading.value = false
  }
}
const matrixProvider = computed(() => {
  const snapshot = data.value
  const fallbackProjectId = projectId.value
  const indicator = indicatorKey.value
  return async () => {
    if (!snapshot) throw new Error('SCOPE_NOT_LOADED')
    return calibrationScopeMatrix(snapshot, fallbackProjectId, indicator)
  }
})
const scopeStatsProvider = computed<ProjectReportProvider>(() => {
  const snapshot = data.value
  const fallbackProjectId = projectId.value
  return async ({ dimension, indicatorKey: indicator }) => {
    if (!snapshot) throw new Error('SCOPE_NOT_LOADED')
    return calibrationScopeStatistics(snapshot, fallbackProjectId, dimension, indicator)
  }
})
const scopeComparisonProvider = computed<ProjectReportComparisonProvider>(() => {
  const snapshot = data.value
  const fallbackProjectId = projectId.value
  return async query => {
    if (!snapshot) throw new Error('SCOPE_NOT_LOADED')
    return calibrationScopeComparison(snapshot, fallbackProjectId, query)
  }
})
function selectIndicator(value: string | string[] | null) {
  if (typeof value === 'string' && indicators.value.some(indicator => indicator.key === value)) indicatorKey.value = value
}
function openMember(selected: { project_id?: number; employee_no: string }) {
  const fallback = projectId.value
  const member = data.value && uniqueCalibrationMembers(data.value, fallback).find(item => calibrationMemberKey(item, fallback) === JSON.stringify([selected.project_id ?? fallback, selected.employee_no]))
  if (!member || member.can_view_detail === false) return
  const scope = props.scopes ? scopes.value.find(scope => scope.project_id === member.project_id && scope.scope_key === member.scope_key && scope.node_id === member.node_id && scope.phase_id === member.phase_id) : props.scope
  if (!scope) return
  const node: PerformanceReviewNode = { project_id: member.project_id ?? scope.project_id, scope_key: scope.scope_key, node_id: scope.node_id, phase_id: member.phase_id ?? scope.phase_id, node_type: 'calibration', node_name: '绩效校准', executor_label: '', status: 'pending', start_at: null, end_at: null, action_url: '' }
  emit('open-member', { node, member })
}
watch(() => JSON.stringify([scopes.value.map(scope => [scope.scope_key, scope.project_id, scope.node_id, scope.phase_id, scope.cycle_id]), props.cycleId, employeeSwitchEpoch.value]), () => void load(), { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { generation.value++; controller?.abort() })
</script>

<style scoped>
.calibration-scope-analysis { min-width: 0; }
.analysis-observed-notice { margin: 0; padding: 12px 20px; color: var(--color-text-secondary); font-size: 12px; }
.analysis-state { display: flex; min-height: 220px; flex-direction: column; align-items: center; justify-content: center; color: var(--color-text-secondary); }
.analysis-state button { padding: 6px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-card); color: var(--color-primary); font: inherit; cursor: pointer; }
.analysis-indicator { display: flex; align-items: center; gap: 12px; padding: 12px 20px; color: var(--color-text-secondary); }
.analysis-indicator :deep(.perf-search-select) { max-width: 280px; }
</style>
