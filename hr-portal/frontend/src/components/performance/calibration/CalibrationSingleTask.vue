<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceReviewMemberContext, PerformanceReviewNode } from '@/api/performance'
import { calibrationReviewNode, performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import CalibrationScopeAnalysis from './CalibrationScopeAnalysis.vue'
import PerformanceReviewContent from '../PerformanceReviewContent.vue'
import CalibrationTaskCompletion from './CalibrationTaskCompletion.vue'
const props = defineProps<{ scope: PerformanceCalibrationTaskScope; cycleId: number }>()
const emit = defineEmits<{
  completed: []
  'open-member': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext }]
  'remind-evaluate': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext; pendingCount: number }]
}>()
const node = computed(() => calibrationReviewNode(props.scope))
const memberProvider = computed(() => { const scope = props.scope; return (query: Parameters<typeof performanceCalibrationApi.members>[1]) => performanceCalibrationApi.members(scope, query) })
</script>
<template>
  <PerformanceReviewContent :loading="false" error="" template-name="" :node="node" :project-id="scope.project_id" :member-provider="memberProvider" :member-preference-scope="{ cycle_ref: cycleId, scene: 'evaluation', project_id: scope.project_id, node_id: scope.node_id }" @open-member="emit('open-member', $event)" @remind-evaluate="emit('remind-evaluate', $event)">
    <template #analysis="{ tab }">
      <CalibrationScopeAnalysis :scope="scope" :cycle-id="cycleId" :tab="tab === 'matrix' ? 'matrix' : 'report'" @open-member="emit('open-member', $event)" />
    </template>
    <template #heading-actions>
      <CalibrationTaskCompletion :scope="scope" @completed="emit('completed')" />
    </template>
  </PerformanceReviewContent>
</template>
