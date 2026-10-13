<template>
  <PerformanceOptionNavigator
    :options="navigatorOptions"
    label="固定分值选项预览"
    previous-label="上一组固定分值"
    next-label="下一组固定分值"
    appearance-variant="score-preview"
    :layout-policy="layoutPolicy"
    @next="emit('next')"
    @previous="emit('previous')"
    @hover="emit('hover', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformanceOptionNavigator, { type PerformanceOptionLayoutPolicy } from './PerformanceOptionNavigator.vue'

interface FixedScoreOption {
  id: string
  value: string
}

const props = defineProps<{
  options: FixedScoreOption[]
}>()

const emit = defineEmits<{
  next: []
  previous: []
  hover: [index: number]
}>()

const navigatorOptions = computed(() => props.options.map((option) => ({ id: option.id, label: option.value })))
const layoutPolicy: PerformanceOptionLayoutPolicy = {
  naturalMax: 5,
  distributedMax: 10,
  viewportWidth: 552,
  viewportHeight: 38,
  optionMinWidth: 42,
  optionHeight: 32,
  connectorMinWidth: 12,
  connectorMaxWidth: 88,
  overflowGap: 12,
}
</script>
