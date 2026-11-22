<script setup lang="ts">
import type { PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import PerformanceCalibrationRuleSummary from '../PerformanceCalibrationRuleSummary.vue'
defineProps<{ scope: PerformanceCalibrationTaskScope; snapshot?: boolean }>()
const emit = defineEmits<{ select: [] }>()
const snapshotNote = '备注：以校准任务开始时刻圈定的校准范围为准，后续部门、汇报关系、项目范围的更新不会影响已圈定的校准范围。'
</script>
<template>
  <PerformanceCalibrationRuleSummary class="calibration-range" :rule="scope.rule" :trigger-label="scope.scope_label" scope-title="具体校准范围" :scope-note="snapshot ? snapshotNote : undefined" :history-ambiguous="scope.history_ambiguous" :people-options="(scope.people_options || []).map(person => ({ value: person.employee_no, label: person.display_name }))" @click.stop="emit('select')" @keydown.enter.stop.prevent="emit('select')" @keydown.space.stop.prevent="emit('select')" />
</template>
<style scoped>
.calibration-range { display: inline-flex; width: auto; max-width: 100%; flex: 0 1 auto; cursor: pointer; }
.calibration-range:hover { color: var(--color-primary); }
</style>
