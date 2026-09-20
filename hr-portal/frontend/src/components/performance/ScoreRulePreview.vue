<template>
  <div class="score-rule-preview">
    <PerformanceNumberInput v-if="method === '在分数上下限内输入评分'" v-model="previewValue" :placeholder="`${minimum} - ${maximum}`" width="240px" :precision="precision" :min="Number(minimum)" :max="Number(maximum)" aria-label="预览评分" />
    <FixedScorePreviewNavigator v-else :options="fixedOptions" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import FixedScorePreviewNavigator from './FixedScorePreviewNavigator.vue'

const props = withDefaults(defineProps<{
  method: string
  minimum: string
  maximum: string
  precision?: number
  fixedOptions: Array<{ id: string; value: string }>
}>(), { precision: 0 })

const previewValue = ref('')
</script>

<style scoped>
.score-rule-preview { display: flex; align-items: flex-start; width: 552px; height: 38px; padding-top: 4px; box-sizing: border-box; }
.score-rule-preview :deep(.performance-number-input) { position: relative; flex: 0 0 240px; width: 240px; height: 32px; }
.score-rule-preview :deep(.performance-number-input .number-input-wrap) { position: static; }
.score-rule-preview :deep(.performance-number-input input) { position: absolute; top: 0.667px; left: 11.667px; width: 216.667px; height: 22px; flex: none; }
.score-rule-preview :deep(.performance-number-input .number-stepper) { position: absolute; top: 0; right: 0; width: 32px; height: 30px; }
</style>
