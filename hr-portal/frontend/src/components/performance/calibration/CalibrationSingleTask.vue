<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceReviewMemberContext, PerformanceReviewNode } from '@/api/performance'
import { calibrationReviewNode, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import PerformanceReviewContent from '../PerformanceReviewContent.vue'
import CalibrationTaskCompletion from './CalibrationTaskCompletion.vue'
const props = defineProps<{ scope: PerformanceCalibrationTaskScope; cycleId: number }>()
const emit = defineEmits<{
  completed: []
  'open-member': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext }]
  'remind-evaluate': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext; pendingCount: number }]
}>()
const node = computed(() => calibrationReviewNode(props.scope))
</script>
<template>
  <PerformanceReviewContent :loading="false" error="" template-name="" :node="node" :project-id="scope.project_id" :member-preference-scope="{ cycle_ref: cycleId, scene: 'evaluation', project_id: scope.project_id, node_id: scope.node_id }" @open-member="emit('open-member', $event)" @remind-evaluate="emit('remind-evaluate', $event)">
    <template #heading-actions>
      <CalibrationTaskCompletion :scope="scope" @completed="emit('completed')" />
    </template>
  </PerformanceReviewContent>
</template>
