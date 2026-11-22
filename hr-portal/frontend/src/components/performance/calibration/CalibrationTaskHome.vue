<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDisplayDateTime } from '@/utils/datetime'
import type { PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import UiTable from '@/components/ui/UiTable.vue'
import PerformanceSegmentedControl from '../PerformanceSegmentedControl.vue'
import PerformanceSurfaceCard from '../PerformanceSurfaceCard.vue'
import PerformanceExpandButton from '../PerformanceExpandButton.vue'
import PerformanceTaskStatus from '../PerformanceTaskStatus.vue'
import CalibrationScopeLink from './CalibrationScopeLink.vue'
import CalibrationState from './CalibrationState.vue'
const props = defineProps<{ tasks: PerformanceCalibrationTaskScope[]; pendingMemberCount: number | null; filter: string; loading: boolean; error: string }>()
const emit = defineEmits<{ 'update:filter': [value: string]; select: [scope: PerformanceCalibrationTaskScope]; retry: [] }>()
const collapsed = ref(new Set<number>())
const labels = { all: '全部', pending: '待校准', completed: '已校准', overdue: '已逾期' }
const filters = computed(() => Object.entries(labels).map(([value, label]) => ({ value, label: `${label} (${props.tasks.filter(task => value === 'all' || task.status === value).length})` })))
const filtered = computed(() => props.tasks.filter(task => props.filter === 'all' || task.status === props.filter))
const rows = computed(() => {
  const groups = new Map<number, PerformanceCalibrationTaskScope[]>()
  filtered.value.forEach(task => groups.set(task.project_id, [...(groups.get(task.project_id) || []), task]))
  return [...groups].flatMap(([projectId, tasks]) => [{ id: `project:${projectId}`, group: true, projectId, name: tasks[0].project_name, task: tasks[0] }, ...(collapsed.value.has(projectId) ? [] : tasks.map(task => ({ id: task.scope_key, group: false, projectId, name: task.scope_label, task })))])
})
function toggle(id: number) { const next = new Set(collapsed.value); next.has(id) ? next.delete(id) : next.add(id); collapsed.value = next }
const columns = [{ key: 'scope', label: '校准范围', minWidth: 260 }, { key: 'status', label: '评估状态', minWidth: 140 }, { key: 'start', label: '开始时间', minWidth: 210 }, { key: 'end', label: '截止时间', minWidth: 210 }]
const date = (value: string | null) => value ? `${formatDisplayDateTime(value, '--')}（GMT+8）` : '--'
const endAt = computed(() => props.tasks.reduce<string | null>((end, task) => task.end_at && (!end || task.end_at > end) ? task.end_at : end, null))
</script>
<template>
  <section class="calibration-home">
    <h1>绩效校准</h1>
    <p class="calibration-home__summary">截止时间：{{ date(endAt) }}　待校准：{{ pendingMemberCount === null ? '--' : pendingMemberCount }} 人</p>
    <PerformanceSurfaceCard class="calibration-home__surface">
      <PerformanceSegmentedControl variant="calibration" aria-label="校准任务状态" :options="filters" :model-value="filter" @update:model-value="emit('update:filter', $event)" />
      <CalibrationState v-if="error" :error="error" @retry="emit('retry')" />
      <UiTable v-else :columns="columns" :rows="rows" row-key="id" :loading="loading" aria-label="校准任务">
        <template #row="{ row }">
          <tr v-if="row.group" class="calibration-home__project"><td :colspan="columns.length" class="ui-table__cell"><div class="calibration-home__project-heading"><PerformanceExpandButton variant="table" :label="`${collapsed.has(row.projectId) ? '展开' : '收起'}${row.name}`" :expanded="!collapsed.has(row.projectId)" @toggle="toggle(row.projectId)" /><span>{{ row.name }}</span></div></td></tr>
          <tr v-else class="ui-table__row calibration-home__task" :data-scope="row.task.scope_key" @click="emit('select', row.task)">
            <td class="ui-table__cell"><div class="calibration-home__range"><span>{{ row.task.task_number }}</span><CalibrationScopeLink :scope="row.task" @select="emit('select', row.task)" /></div></td>
            <td class="ui-table__cell"><PerformanceTaskStatus :status="row.task.status" /><span class="calibration-home__status-label">{{ labels[row.task.status as keyof typeof labels] }}</span></td>
            <td class="ui-table__cell">{{ date(row.task.start_at) }}</td><td class="ui-table__cell">{{ date(row.task.end_at) }}</td>
          </tr>
        </template>
        <template #empty><CalibrationState :loading="loading" /></template>
      </UiTable>
    </PerformanceSurfaceCard>
  </section>
</template>
<style scoped>
.calibration-home { min-width: 0; }
h1 { margin: 0; font-size: var(--performance-page-title-size); font-weight: var(--performance-page-title-weight); line-height: var(--performance-page-title-line-height); }
.calibration-home__summary { margin: var(--spacing-2) 0 var(--performance-calibration-home-heading-gap); color: var(--color-text-secondary); }
.calibration-home__surface { gap: var(--performance-calibration-home-filter-gap); align-items: stretch; }
.calibration-home__surface > :deep(.segmented-control) { align-self: flex-start; }
.calibration-home__project > td, .calibration-home__task > td { height: var(--performance-calibration-task-row-height); padding: var(--ui-table-cell-padding-inline); box-sizing: border-box; border-bottom: var(--ui-control-border-width) solid var(--ui-table-border-color); background: var(--ui-surface-background); color: var(--ui-table-text-color); font-size: var(--ui-table-font-size); line-height: var(--ui-table-line-height); vertical-align: middle; white-space: nowrap; }
.calibration-home__project > td { height: var(--performance-calibration-project-row-height); background: var(--color-bg-subtle); padding-block: var(--spacing-2); }
.calibration-home__task { cursor: pointer; }
.calibration-home__task:hover > td { background: var(--ui-table-row-hover-background); }
.calibration-home__task .calibration-home__range, .calibration-home__task .calibration-home__range :deep(.rule-summary) { cursor: pointer; }
.calibration-home__project-heading { display: flex; align-items: center; color: var(--color-text-secondary); }
.calibration-home__range { display: flex; gap: var(--spacing-3); align-items: center; }
.calibration-home__range > span { color: var(--color-text-secondary); flex: none; }
.calibration-home__status-label { margin-left: var(--spacing-2); }
.calibration-home :deep(.performance-task-status > span:last-child) { display: none; }
.calibration-home :deep(.performance-task-status) { min-width: 0; }
</style>
