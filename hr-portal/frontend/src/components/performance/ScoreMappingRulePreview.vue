<template>
  <div class="score-mapping-rule-preview">
    <PerformanceNumberInput :model-value="modelValue" :placeholder="`${formatValue(minimum)} - ${formatValue(maximum)}`" width="240px" :precision="precision" :min="Number(minimum) || 0" :max="Number(maximum) || undefined" aria-label="预览分数" @update:model-value="$emit('update:modelValue', $event)" />
    <div class="mapping-scale">
      <div v-if="activeInterval" class="mapping-scale__cursor" :class="{ 'is-min': isAtMinimum, 'is-max': isAtMaximum }" :style="cursorStyle">
        <div class="mapping-scale__bubble" :class="`is-${activeIntervalIndex % 2 ? 'purple' : 'red'}`">{{ formatValue(modelValue) }}分 | {{ activeInterval.code }}</div>
        <svg width="7" height="28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path fill="#373C43" d="M3 4h1v24H3z" />
          <path fill="#fff" d="M4 4h1v24H4zM2 4h1v24H2z" />
          <path d="M0 0h7L4 4H3L0 0z" fill="#373C43" />
        </svg>
      </div>
      <div class="mapping-scale__bar">
        <div v-for="(interval, index) in normalizedIntervals" :key="`${interval.code}-${index}`" class="mapping-scale__segment" :class="`is-${index % 2 ? 'purple' : 'red'}`">{{ interval.code }}</div>
      </div>
      <div class="mapping-scale__ticks"><span>{{ formatValue(minimum) }}</span><span v-for="interval in normalizedIntervals.slice(0, -1)" :key="interval.upper">{{ formatValue(interval.upper) }}</span><span>{{ formatValue(maximum) }}</span></div>
    </div>
    <div class="mapping-level-list">
      <article v-for="(interval, index) in normalizedIntervals" :key="`detail-${interval.code}-${index}`" class="mapping-level-item">
        <div><span class="mapping-level-code" :class="`is-${index % 2 ? 'purple' : 'red'}`">{{ interval.code }}</span><strong>{{ interval.name }}</strong></div>
        <p>更多描述在评估项配置中完成</p>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import type { ReviewRuleInterval } from './ReviewRuleForm.vue'

const props = withDefaults(defineProps<{ modelValue: string; minimum: string; maximum: string; precision?: number; intervals: ReviewRuleInterval[] }>(), { precision: 0 })
defineEmits<{ 'update:modelValue': [value: string] }>()

const normalizedIntervals = computed(() => {
  const min = Number(props.minimum)
  const max = Number(props.maximum)
  return props.intervals.map((interval, index) => {
    const lower = index === 0 ? min : Number(props.intervals[index - 1].upper)
    const upper = index === props.intervals.length - 1 ? max : Number(interval.upper)
    return { ...interval, lower, upper }
  })
})
const activeInterval = computed(() => {
  if (props.modelValue === '') return null
  const value = Number(props.modelValue)
  return normalizedIntervals.value.find((interval, index) => value >= interval.lower && (index === normalizedIntervals.value.length - 1 ? value <= interval.upper : value < interval.upper)) || null
})
const activeIntervalIndex = computed(() => activeInterval.value ? normalizedIntervals.value.indexOf(activeInterval.value) : -1)
const isAtMinimum = computed(() => props.modelValue !== '' && Number(props.modelValue) <= Number(props.minimum))
const isAtMaximum = computed(() => props.modelValue !== '' && Number(props.modelValue) >= Number(props.maximum))
const cursorStyle = computed(() => {
  const interval = activeInterval.value
  const intervalCount = normalizedIntervals.value.length
  if (!interval || intervalCount === 0) return undefined
  const segmentWidth = (552 - Math.max(0, intervalCount - 1) * 2) / intervalCount
  const intervalRange = interval.upper - interval.lower
  const intervalRatio = intervalRange > 0 ? Math.max(0, Math.min(1, (Number(props.modelValue) - interval.lower) / intervalRange)) : 0
  const position = activeIntervalIndex.value * (segmentWidth + 2) + intervalRatio * segmentWidth
  return { left: `${position}px` }
})

function formatValue(value: string | number) {
  if (value === '' || value === '.') return String(value)
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return String(value)
  return props.precision > 0 ? numericValue.toFixed(props.precision) : String(Math.round(numericValue))
}
</script>

<style scoped>
.score-mapping-rule-preview { width: 552px; min-height: 262.667px; height: auto; }
.score-mapping-rule-preview :deep(.performance-number-input) { position: relative; flex: 0 0 240px; width: 240px; height: 32px; }
.score-mapping-rule-preview :deep(.performance-number-input .number-input-wrap) { position: static; }
.score-mapping-rule-preview :deep(.performance-number-input input) { position: absolute; top: 4.667px; left: 11.667px; width: 216.667px; height: 22px; flex: none; }
.score-mapping-rule-preview :deep(.performance-number-input .number-stepper) { position: absolute; top: 0; right: 0; width: 32px; height: 30px; }
.mapping-scale { position: relative; width: 552px; height: 88px; padding-top: 33px; box-sizing: border-box; }
.mapping-scale__cursor { position: absolute; top: 26px; z-index: 2; width: 0; height: 28px; }
.mapping-scale__cursor > svg { position: absolute; top: 0; left: -3px; display: block; overflow: visible; }
.mapping-scale__bubble { position: absolute; bottom: 28px; left: 0; transform: translateX(-50%); height: 22px; padding: 1px 8px; border-radius: 4px; font-size: 12px; line-height: 20px; white-space: nowrap; box-shadow: 0 1px 4px rgba(31,35,41,.12); }
.mapping-scale__bubble.is-red { background: #fde2e2; color: #8f3d3a; }
.mapping-scale__bubble.is-purple { background: #eee5ff; color: #5b3b8c; }
.mapping-scale__cursor.is-min > svg { left: 0; }
.mapping-scale__cursor.is-min .mapping-scale__bubble { transform: none; }
.mapping-scale__cursor.is-max > svg { left: -7px; }
.mapping-scale__cursor.is-max .mapping-scale__bubble { transform: translateX(-100%); }
.mapping-scale__bar { display: flex; gap: 2px; width: 552px; height: 20px; }
.mapping-scale__segment { display: flex; flex: 1 1 0; align-items: center; justify-content: center; min-width: 0; height: 20px; font-size: 12px; line-height: 20px; }
.mapping-scale__segment.is-red { background: #fde2e2; color: #8f3d3a; }
.mapping-scale__segment.is-purple { background: #eee5ff; color: #5b3b8c; }
.mapping-scale__ticks { display: flex; justify-content: space-between; height: 18px; color: #646a73; font-size: 12px; line-height: 18px; }
.mapping-level-list { width: 552px; }
.mapping-level-item { min-height: 70.667px; padding: 10px 8px; box-sizing: border-box; border-bottom: 1px solid #dee0e3; }
.mapping-level-item:last-child { border-bottom: 0; }
.mapping-level-item > div { display: flex; align-items: center; height: 24px; gap: 4px; }
.mapping-level-item strong { font-size: 14px; font-weight: 400; line-height: 18px; }
.mapping-level-code { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; height: 24px; padding: 1px 12px; box-sizing: border-box; border-radius: 999px; font-size: 14px; line-height: 22px; }
.mapping-level-code.is-red { background: #fde2e2; color: #8f3d3a; }
.mapping-level-code.is-purple { background: #eee5ff; color: #5b3b8c; }
.mapping-level-item p { margin: 4px 0 0; color: #8f959e; font-size: 14px; line-height: 22px; }
</style>
