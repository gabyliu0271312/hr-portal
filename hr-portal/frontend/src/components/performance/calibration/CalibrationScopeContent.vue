<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PerformanceDistributionTips, PerformanceReviewMemberContext, PerformanceReviewNode } from '@/api/performance'
import { performanceCalibrationApi, calibrationReviewNode, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import UiButton from '@/components/ui/UiButton.vue'
import ProjectMemberListPanel from '../ProjectMemberListPanel.vue'
import PerformanceDistributionTipsPanel from '../PerformanceDistributionTips.vue'
import PerformanceLineTabs from '../PerformanceLineTabs.vue'
import CalibrationScopeLink from './CalibrationScopeLink.vue'
import CalibrationTaskCompletion from './CalibrationTaskCompletion.vue'
import CalibrationContentSurface from './CalibrationContentSurface.vue'
import CalibrationState from './CalibrationState.vue'
const props = defineProps<{ scope: PerformanceCalibrationTaskScope; cycleId: number; tab: string }>()
const emit = defineEmits<{
  'update:tab': [value: string]
  completed: []
  busy: [value: boolean]
  'open-member': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext }]
  'remind-evaluate': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext; pendingCount: number }]
}>()
const tips = ref<PerformanceDistributionTips | null>(null), tipsLoading = ref(false), tipsError = ref(''), memberVersion = ref(0)
let sequence = 0
const node = computed(() => calibrationReviewNode(props.scope))
const provider = computed(() => { const scope = props.scope; return (query: Parameters<typeof performanceCalibrationApi.members>[1]) => performanceCalibrationApi.members(scope, query) })
const tabs = [{ key: 'members', label: '成员列表' }, { key: 'matrix', label: '矩阵分析' }, { key: 'report', label: '统计报表' }]
async function loadTips() {
  const request = ++sequence, scope = props.scope
  tips.value = null; tipsError.value = ''; tipsLoading.value = true
  try { const result = await performanceCalibrationApi.distribution(scope); if (request === sequence) tips.value = result }
  catch (cause: any) { if (request === sequence) tipsError.value = cause?.response?.status === 403 ? '无权查看当前任务的分布。' : '分布提示加载失败，请重试。' }
  finally { if (request === sequence) tipsLoading.value = false }
}
function completed() { ++memberVersion.value; loadTips(); emit('completed') }
watch([() => props.scope.scope_key, employeeSwitchEpoch], loadTips, { immediate: true })
onBeforeUnmount(() => { ++sequence })
</script>
<template>
  <CalibrationContentSurface class="calibration-scope-content">
    <template #heading><header class="calibration-scope-content__header">
      <h1><span>校准 {{ scope.task_number }}：</span><CalibrationScopeLink :scope="scope" snapshot /></h1>
      <CalibrationTaskCompletion :scope="scope" @completed="completed" @busy="emit('busy', $event)" />
    </header></template>
    <p v-if="scope.read_only" class="calibration-scope-content__notice">当前任务只读，不能完成校准。</p>
    <p v-if="tipsLoading" role="status">正在加载分布提示…</p>
    <p v-else-if="tipsError" role="alert">{{ tipsError }} <UiButton variant="text" @click="loadTips">重试</UiButton></p>
    <PerformanceDistributionTipsPanel v-else :tips="tips" />
    <PerformanceLineTabs :model-value="tab" :tabs="tabs" flush sticky embedded @update:model-value="emit('update:tab', $event)">
      <ProjectMemberListPanel v-if="tab === 'members'" :key="`${scope.scope_key}:${memberVersion}`" variant="embedded" :project-id="scope.project_id" :show-export="false" :readonly="scope.read_only" :review-context="{ nodeId: scope.node_id, state: 'all', phaseId: scope.phase_id }" :provider="provider" :preference-scope="{ cycle_ref: cycleId, scene: 'evaluation', project_id: scope.project_id, node_id: scope.node_id, role_key: 'assessment.calibrator' }" @select-member="emit('open-member', { node, member: $event })" @remind-evaluate="emit('remind-evaluate', { node, ...$event })">
        <template #empty><CalibrationState /></template>
      </ProjectMemberListPanel>
      <template v-else-if="tab === 'matrix'"><slot v-if="$slots.matrix" name="matrix" :scope="scope" /><p v-else role="status">矩阵分析尚未接入当前校准任务。</p></template>
      <template v-else-if="tab === 'report'"><slot v-if="$slots.report" name="report" :scope="scope" /><p v-else role="status">统计报表尚未接入当前校准任务。</p></template>
    </PerformanceLineTabs>
  </CalibrationContentSurface>
</template>
<style scoped>
.calibration-scope-content__header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--spacing-4); padding: var(--performance-calibration-content-inset); }
h1 { display: flex; align-items: center; min-width: 0; max-width: 100%; flex: 1; margin: 0; font-size: var(--font-size-xl); line-height: var(--performance-page-title-line-height); }
h1 > span { flex: none; }
.calibration-scope-content__notice { color: var(--color-text-secondary); }
</style>
