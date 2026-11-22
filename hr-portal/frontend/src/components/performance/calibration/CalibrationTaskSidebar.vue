<script setup lang="ts">
import { computed } from 'vue'
import { formatDisplayDateTime } from '@/utils/datetime'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import type { PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import PerformanceTaskStatus from '../PerformanceTaskStatus.vue'
import CalibrationScopeLink from './CalibrationScopeLink.vue'
const props = defineProps<{ tasks: PerformanceCalibrationTaskScope[]; selected: string; cycleId: number }>()
const emit = defineEmits<{ select: [key: string] }>()
const groups = computed(() => {
  const map = new Map<number, PerformanceCalibrationTaskScope[]>()
  props.tasks.forEach(task => map.set(task.project_id, [...(map.get(task.project_id) || []), task]))
  return [...map.values()]
})
const context = usePerformanceProjectContextStore()
const cycleName = computed(() => context.cycles.find(cycle => cycle.cycle_id === props.cycleId)?.cycle_name || (context.navigation?.active_cycle?.cycle_id === props.cycleId ? context.navigation.active_cycle.cycle_name : ''))
const date = (value: string | null) => value ? `${formatDisplayDateTime(value, '--')}（GMT+8）` : '--'
</script>
<template>
  <aside class="calibration-task-nav" aria-label="校准任务导航">
    <button class="calibration-task-nav__all" :class="{ selected: selected === '__all__' }" type="button" :aria-current="selected === '__all__' ? 'page' : undefined" @click="emit('select', '__all__')">全部被校准人</button>
    <p v-if="cycleName" class="calibration-task-nav__cycle">{{ cycleName }}</p>
    <section v-for="tasksInProject in groups" :key="tasksInProject[0].project_id">
      <h3>{{ tasksInProject[0].project_name }}</h3>
      <div v-for="task in tasksInProject" :key="task.scope_key" class="calibration-task-nav__task" :class="{ selected: selected === task.scope_key }" :aria-current="selected === task.scope_key ? 'page' : undefined">
        <div class="calibration-task-nav__row">
          <div class="calibration-task-nav__range"><span>{{ task.task_number }}</span><CalibrationScopeLink :scope="task" snapshot @select="emit('select', task.scope_key)" /></div>
          <div class="calibration-task-nav__meta"><PerformanceTaskStatus :status="task.status" /><span>{{ task.status === 'completed' ? '已校准' : task.status === 'overdue' ? '已逾期' : '待校准' }}</span></div>
        </div>
        <small>截止时间：{{ date(task.end_at) }}</small>
      </div>
    </section>
  </aside>
</template>
<style scoped>
.calibration-task-nav { min-width: 0; overflow: auto; border-right: var(--ui-control-border-width) solid var(--color-line-divider); padding: var(--spacing-4) var(--spacing-3); background: var(--color-bg-card); }
.calibration-task-nav__all { width: 100%; border: 0; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.calibration-task-nav__all, .calibration-task-nav__task { padding: var(--spacing-3); border-radius: var(--radius-md); }
.selected { background: var(--color-primary-light); }
h3, .calibration-task-nav__cycle { margin: var(--spacing-5) var(--spacing-3) var(--spacing-2); color: var(--color-text-secondary); font: inherit; }
.calibration-task-nav__task { margin-bottom: var(--spacing-1); }
.calibration-task-nav__row, .calibration-task-nav__range, .calibration-task-nav__meta { display: flex; align-items: center; gap: var(--spacing-2); }
.calibration-task-nav__row { justify-content: space-between; }
.calibration-task-nav__range { min-width: 0; flex: 1; }
.calibration-task-nav__range > span { flex: none; color: var(--color-text-secondary); }
.calibration-task-nav__meta { flex: none; white-space: nowrap; }
.calibration-task-nav__meta :deep(.performance-task-status > span:last-child) { display: none; }
.calibration-task-nav__meta :deep(.performance-task-status) { min-width: 0; }
small { display: block; margin-top: var(--spacing-1); color: var(--color-text-secondary); font-size: var(--font-size-sm); }
</style>
