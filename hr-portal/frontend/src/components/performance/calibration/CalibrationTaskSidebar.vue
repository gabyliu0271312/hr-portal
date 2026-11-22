<script setup lang="ts">
import { computed } from 'vue'
import { formatDisplayDateTime } from '@/utils/datetime'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import type { PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
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
    <button class="calibration-task-nav__all" :class="{ selected: selected === '__all__' }" type="button" :aria-current="selected === '__all__' ? 'page' : undefined" @click="emit('select', '__all__')"><span>全部被校准人</span><small v-if="cycleName">{{ cycleName }}</small></button>
    <section v-for="tasksInProject in groups" :key="tasksInProject[0].project_id">
      <h3>{{ tasksInProject[0].project_name }}</h3>
      <div v-for="task in tasksInProject" :key="task.scope_key" class="calibration-task-nav__task" :class="{ selected: selected === task.scope_key }" role="button" tabindex="0" :aria-label="`校准 ${task.task_number}：${task.scope_label}`" :aria-current="selected === task.scope_key ? 'page' : undefined" @click="emit('select', task.scope_key)" @keydown.enter.self.prevent="emit('select', task.scope_key)" @keydown.space.self.prevent="emit('select', task.scope_key)">
        <div class="calibration-task-nav__row">
          <div class="calibration-task-nav__range"><span class="calibration-task-nav__number">{{ task.task_number }}</span><CalibrationScopeLink :scope="task" snapshot @select="emit('select', task.scope_key)" /></div>
          <span class="calibration-task-nav__status" :class="`is-${task.status}`">{{ task.status === 'completed' ? '已校准' : task.status === 'overdue' ? '已逾期' : '待校准' }}</span>
        </div>
        <small>截止时间: {{ date(task.end_at) }}</small>
      </div>
    </section>
  </aside>
</template>
<style scoped>
.calibration-task-nav { min-width: 0; overflow: auto; padding: var(--spacing-5); background: var(--performance-page-surface); }
.calibration-task-nav__all, .calibration-task-nav__task { display: block; position: relative; width: 100%; box-sizing: border-box; padding: var(--performance-calibration-nav-padding); border: 0 solid var(--color-bg-card); border-left-width: var(--performance-calibration-nav-rail-width); border-radius: var(--radius-sm); background: var(--color-bg-card); color: var(--color-text-primary); font: inherit; text-align: left; cursor: pointer; }
.calibration-task-nav__all { margin-bottom: var(--spacing-3); }
.calibration-task-nav__all > span { display: block; }
.calibration-task-nav__task { min-height: var(--performance-calibration-nav-item-height); margin-bottom: var(--spacing-2); }
.calibration-task-nav__all:hover, .calibration-task-nav__task:hover, .selected { border-left-color: var(--color-primary); }
.calibration-task-nav__all:focus-visible, .calibration-task-nav__task:focus-visible { outline: var(--performance-rule-summary-focus-width) solid var(--color-primary); outline-offset: var(--performance-rule-summary-focus-offset); }
h3 { margin: 0; padding: var(--spacing-2) var(--spacing-4); color: var(--color-text-secondary); font: inherit; }
.calibration-task-nav__row, .calibration-task-nav__range { display: flex; align-items: center; gap: var(--spacing-1); min-width: 0; }
.calibration-task-nav__row { justify-content: space-between; height: var(--performance-calibration-nav-number-size); margin-bottom: var(--spacing-1); }
.calibration-task-nav__range { flex: 1; }
.calibration-task-nav__number { display: inline-flex; flex: none; align-items: center; justify-content: center; width: var(--performance-calibration-nav-number-size); height: var(--performance-calibration-nav-number-size); border-radius: var(--radius-pill); background: var(--color-bg-subtle); color: var(--color-text-secondary); }
.calibration-task-nav__status { flex: none; margin-left: var(--spacing-2); color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.calibration-task-nav__status.is-pending { color: var(--performance-task-status-pending); }
.calibration-task-nav__status.is-overdue { color: var(--performance-task-status-overdue); }
.calibration-task-nav__status.is-completed { color: var(--performance-task-status-completed); }
small { display: block; overflow: hidden; color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: var(--performance-calibration-nav-number-size); text-overflow: ellipsis; white-space: nowrap; }
.calibration-task-nav__all small { line-height: var(--ui-table-line-height); }
</style>
