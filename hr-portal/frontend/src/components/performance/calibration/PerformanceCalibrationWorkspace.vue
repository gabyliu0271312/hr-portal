<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { PerformanceReviewMemberContext, PerformanceReviewNode } from '@/api/performance'
import { performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import UiDialogShell from '@/components/ui/UiDialogShell.vue'
import UiButton from '@/components/ui/UiButton.vue'
import SpaceLeftOutlinedIcon from '../SpaceLeftOutlinedIcon.vue'
import CalibrationSingleTask from './CalibrationSingleTask.vue'
import CalibrationTaskHome from './CalibrationTaskHome.vue'
import CalibrationTaskSidebar from './CalibrationTaskSidebar.vue'
import CalibrationScopeContent from './CalibrationScopeContent.vue'
import CalibrationContentSurface from './CalibrationContentSurface.vue'
import PerformanceLineTabs from '../PerformanceLineTabs.vue'
import CalibrationState from './CalibrationState.vue'
const props = defineProps<{ cycleId: number; nodeId?: string }>()
const emit = defineEmits<{
  'open-member': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext }]
  'remind-evaluate': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext; pendingCount: number }]
}>()
const route = useRoute(), router = useRouter()
const tasks = ref<PerformanceCalibrationTaskScope[]>([]), pendingMemberCount = ref<number | null>(null), loading = ref(true), error = ref('')
const home = ref<HTMLElement>(), fullScreenLoading = ref(false)
let sequence = 0, returnFocus: HTMLElement | null = null, scrollContainer: HTMLElement | null = null, scrollTop = 0, openedHere = false
const scalar = (value: unknown) => typeof value === 'string' ? value : ''
const filter = computed(() => ['pending', 'completed', 'overdue'].includes(scalar(route.query.calibration_filter)) ? scalar(route.query.calibration_filter) : 'all')
const selectedKey = computed(() => scalar(route.query.calibration_scope))
const tab = computed<'members' | 'matrix' | 'report'>(() => route.query.calibration_tab === 'matrix' ? 'matrix' : route.query.calibration_tab === 'report' ? 'report' : 'members')
const tabs = [{ key: 'members', label: '成员列表' }, { key: 'matrix', label: '矩阵分析' }, { key: 'report', label: '统计报表' }]
const requestedFullScreen = computed(() => route.query.calibration_open === '1')
const invalidRequestedScope = computed(() => requestedFullScreen.value && selectedKey.value !== '__all__' && !tasks.value.some(task => task.scope_key === selectedKey.value))
const singleTask = computed(() => !error.value && tasks.value.length === 1 && !invalidRequestedScope.value ? tasks.value[0] : null)
const fullScreen = computed(() => requestedFullScreen.value && !singleTask.value)
const selected = computed(() => tasks.value.find(task => task.scope_key === selectedKey.value))
async function query(patch: Record<string, string | undefined>, push = false) {
  const target = { query: { ...route.query, ...patch } }
  await (push ? router.push(target) : router.replace(target))
}
async function load(reset = false) {
  const request = ++sequence; loading.value = true; error.value = ''
  if (reset) { tasks.value = []; pendingMemberCount.value = null }
  try {
    const result = await performanceCalibrationApi.tasks(props.cycleId)
    if (request !== sequence) return
    tasks.value = result.tasks; pendingMemberCount.value = result.pending_member_count
  } catch (cause: any) {
    if (request === sequence) error.value = cause?.response?.status === 403 ? '你没有校准任务的访问权限。' : '校准任务加载失败，请重试。'
  } finally { if (request === sequence) loading.value = false }
}
function selectScope(key: string) {
  if (!fullScreen.value) {
    returnFocus = document.activeElement as HTMLElement; openedHere = true
    scrollContainer = home.value || null
    while (scrollContainer?.parentElement && scrollContainer.scrollHeight <= scrollContainer.clientHeight) scrollContainer = scrollContainer.parentElement
    scrollTop = scrollContainer?.scrollTop || 0
  }
  query({ calibration_scope: key, calibration_tab: 'members', calibration_open: '1' }, !fullScreen.value)
}
async function close() {
  if (fullScreenLoading.value) return
  if (openedHere) { openedHere = false; router.back() }
  else await query({ calibration_open: undefined })
}
watch(fullScreen, async open => { if (!open) { await nextTick(); if (scrollContainer) scrollContainer.scrollTop = scrollTop; returnFocus?.focus() } })
watch([() => props.cycleId, employeeSwitchEpoch], () => { void load(true) }, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { ++sequence })
defineExpose({ selected, refresh: load })
</script>
<template>
  <CalibrationSingleTask v-if="singleTask" :scope="singleTask" :cycle-id="cycleId" @completed="load()" @open-member="emit('open-member', $event)" @remind-evaluate="emit('remind-evaluate', $event)" />
  <div v-else-if="loading && !tasks.length && !fullScreen" class="calibration-workspace"><CalibrationState loading /></div>
  <div v-else ref="home" v-show="!fullScreen" class="calibration-workspace">
    <CalibrationTaskHome :tasks="tasks" :pending-member-count="pendingMemberCount" :filter="filter" :loading="loading" :error="error" @update:filter="query({ calibration_filter: $event })" @select="selectScope($event.scope_key)" @retry="load()" />
  </div>
  <UiDialogShell :model-value="fullScreen" title="完成团队的绩效校准" fullscreen :loading="fullScreenLoading" overlay-class="calibration-workspace-overlay" @close="close">
    <template #header-start><UiButton variant="text" :disabled="fullScreenLoading" @click="close"><SpaceLeftOutlinedIcon class="calibration-back-icon" /><span>返回</span></UiButton></template>
    <div class="calibration-fullscreen">
      <CalibrationTaskSidebar :tasks="tasks" :selected="selectedKey" :cycle-id="cycleId" @select="selectScope" />
      <CalibrationState v-if="loading || error" :loading="loading" :error="error" @retry="load()" />
      <CalibrationContentSurface v-else-if="selectedKey === '__all__'" class="calibration-all-people" aria-label="全部被校准人"><PerformanceLineTabs :model-value="tab" :tabs="tabs" flush sticky embedded @update:model-value="query({ calibration_tab: $event })"><slot name="all-people" :tasks="tasks" :cycleId="cycleId" :tab="tab"><p role="status">全部被校准人聚合视图尚未接入。</p></slot></PerformanceLineTabs></CalibrationContentSurface>
      <CalibrationScopeContent v-else-if="selected" :key="`${employeeSwitchEpoch}:${cycleId}:${selected.scope_key}`" :scope="selected" :cycle-id="cycleId" :tab="tab" @update:tab="query({ calibration_tab: $event })" @completed="load()" @busy="fullScreenLoading = $event" @open-member="emit('open-member', $event)" @remind-evaluate="emit('remind-evaluate', $event)">
        <template v-if="$slots.matrix" #matrix="slotProps"><slot name="matrix" v-bind="slotProps" /></template>
        <template v-if="$slots.report" #report="slotProps"><slot name="report" v-bind="slotProps" /></template>
      </CalibrationScopeContent>
      <div v-else class="calibration-all-people" role="alert"><p>此校准任务已失效或你没有访问权限。</p><button type="button" @click="close">返回校准首页</button></div>
    </div>
  </UiDialogShell>
</template>
<style scoped>
:global(.calibration-workspace-overlay) { z-index: var(--z-index-drawer); }
.calibration-workspace { flex: 1; min-width: 0; min-height: 0; overflow: auto; box-sizing: border-box; padding: var(--performance-review-surface-inset); background: var(--performance-review-page-bg); }
.calibration-fullscreen { display: grid; grid-template-columns: var(--performance-calibration-sidebar-width) minmax(0, 1fr); min-width: 0; min-height: 0; flex: 1; padding-top: var(--performance-calibration-content-inset); box-sizing: border-box; background: var(--performance-calibration-workspace-background); }
.calibration-fullscreen > :deep(.calibration-task-nav) { padding-top: 0; padding-right: 0; background: transparent; }
.calibration-fullscreen > div.calibration-all-people { min-width: 0; padding: var(--spacing-6); overflow: auto; }
h1 { margin: 0 0 var(--spacing-5); font-size: var(--font-size-xl); }
.calibration-back-icon { width: var(--performance-header-icon-size); height: var(--performance-header-icon-size); margin-right: var(--spacing-2); }
@media (max-width: 760px) { .calibration-fullscreen { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); } .calibration-fullscreen :deep(.calibration-task-nav) { max-height: var(--performance-calibration-mobile-nav-height); border-right: 0; border-bottom: var(--ui-control-border-width) solid var(--color-line-divider); } }
</style>
