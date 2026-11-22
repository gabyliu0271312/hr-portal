<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatDisplayDateTime } from '@/utils/datetime'
import type { PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import UiTable from '@/components/ui/UiTable.vue'
import PerformanceLineTabs from '../PerformanceLineTabs.vue'
import PerformanceTaskStatus from '../PerformanceTaskStatus.vue'
import CalibrationScopeLink from './CalibrationScopeLink.vue'
import CalibrationState from './CalibrationState.vue'
const props = defineProps<{ tasks: PerformanceCalibrationTaskScope[]; pendingMemberCount: number | null; filter: string; loading: boolean; error: string }>()
const emit = defineEmits<{ 'update:filter': [value: string]; select: [scope: PerformanceCalibrationTaskScope]; retry: [] }>()
const collapsed = ref(new Set<number>())
const labels = { all: '全部', pending: '待校准', completed: '已校准', overdue: '已逾期' }
const tabs = computed(() => Object.entries(labels).map(([key, label]) => ({ key, label: `${label} (${props.tasks.filter(task => key === 'all' || task.status === key).length})` })))
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
    <PerformanceLineTabs class="calibration-home__tabs" flush :tabs="tabs" :model-value="filter" @update:model-value="emit('update:filter', $event)">
      <CalibrationState v-if="error" :error="error" @retry="emit('retry')" />
      <UiTable v-else :columns="columns" :rows="rows" row-key="id" :loading="loading" aria-label="校准任务">
        <template #row="{ row }">
          <tr v-if="row.group" class="calibration-home__project"><td :colspan="columns.length" class="ui-table__cell"><button type="button" :aria-expanded="!collapsed.has(row.projectId)" @click="toggle(row.projectId)">{{ collapsed.has(row.projectId) ? '▸' : '▾' }}　{{ row.name }}</button></td></tr>
          <tr v-else class="ui-table__row" :data-scope="row.task.scope_key">
            <td class="ui-table__cell"><div class="calibration-home__range"><span>{{ row.task.task_number }}</span><CalibrationScopeLink :scope="row.task" @select="emit('select', row.task)" /></div></td>
            <td class="ui-table__cell"><PerformanceTaskStatus :status="row.task.status" /><span class="calibration-home__status-label">{{ labels[row.task.status as keyof typeof labels] }}</span></td>
            <td class="ui-table__cell">{{ date(row.task.start_at) }}</td><td class="ui-table__cell">{{ date(row.task.end_at) }}</td>
          </tr>
        </template>
        <template #empty><CalibrationState :loading="loading" /></template>
      </UiTable>
    </PerformanceLineTabs>
  </section>
</template>
<style scoped>
.calibration-home { min-width: 0; }
h1 { margin: 0; font-size: var(--performance-page-title-size); font-weight: var(--performance-page-title-weight); line-height: var(--performance-page-title-line-height); }
.calibration-home__summary { margin: var(--spacing-2) 0 var(--spacing-5); color: var(--color-text-secondary); }
.calibration-home__tabs { --ui-tabs-font-size: var(--ui-tabs-compact-font-size); --ui-tabs-line-height: var(--ui-tabs-compact-line-height); --ui-tabs-tab-padding: var(--ui-tabs-compact-padding); --ui-tabs-ink-top: var(--ui-tabs-compact-ink-top); --ui-tabs-divider-top: var(--ui-tabs-compact-divider-top); }
.calibration-home__project { background: var(--color-bg-subtle); }
.calibration-home__project button { border: 0; padding: 0; background: transparent; color: var(--color-text-secondary); font: inherit; cursor: pointer; }
.calibration-home__range { display: flex; gap: var(--spacing-3); align-items: center; }
.calibration-home__range > span { color: var(--color-text-secondary); flex: none; }
.calibration-home__status-label { margin-left: var(--spacing-2); }
.calibration-home :deep(.performance-task-status > span:last-child) { display: none; }
.calibration-home :deep(.performance-task-status) { min-width: 0; }
</style>
