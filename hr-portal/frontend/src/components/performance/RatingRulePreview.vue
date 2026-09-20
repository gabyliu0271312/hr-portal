<template>
  <div class="rating-rule-preview" :data-quantified="quantified">
    <PerformanceOptionNavigator
      :options="navigatorOptions"
      label="评级预览"
      appearance-variant="rating-preview"
      :layout-policy="layoutPolicy"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ReviewRuleLevel } from './ReviewRuleForm.vue'
import PerformanceOptionNavigator, { type PerformanceOptionLayoutPolicy } from './PerformanceOptionNavigator.vue'

const props = defineProps<{ levels: ReviewRuleLevel[]; quantified: boolean }>()

const navigatorOptions = computed(() => props.levels.map((level, index) => ({
  id: level.id || level.code || `rating-level-${index + 1}`,
  label: level.code,
})))
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

<style scoped>
.rating-rule-preview { width: 552px; height: 38px; }
</style>
