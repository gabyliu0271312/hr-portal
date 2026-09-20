<script setup lang="ts">
import { computed } from 'vue'
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'

export interface ScoreInterval {
  lower: string
  upper: string
  code: string
  name: string
}

const props = withDefaults(defineProps<{
  intervals: ScoreInterval[]
  rule: string
  lowerBound?: string
  upperBound?: string
  precision?: number
  boundaryErrors?: boolean[]
  codeErrors?: boolean[]
  structureLocked?: boolean
}>(), {
  intervals: () => [
    { lower: '', upper: '', code: '', name: '' },
    { lower: '', upper: '', code: '', name: '' },
  ],
  rule: 'a ≤ 分数 < b',
  lowerBound: '',
  upperBound: '',
  precision: 0,
  boundaryErrors: () => [],
  codeErrors: () => [],
  structureLocked: false,
})

const emit = defineEmits<{
  'update:intervals': [intervals: ScoreInterval[]]
  add: []
  remove: [index: number]
}>()

const selectedOperator = computed(() => props.rule.startsWith('a ≤')
  ? { left: '≤', right: '<' }
  : { left: '<', right: '≤' })
const visibleIntervals = computed(() => normalizeIntervals(props.intervals))
const hasDelete = computed(() => props.intervals.length > 2)

function operatorParts(index: number) {
  return {
    left: index === 0 ? '≤' : selectedOperator.value.left,
    right: index === visibleIntervals.value.length - 1 ? '≤' : selectedOperator.value.right,
  }
}

function normalizeIntervals(intervals: ScoreInterval[]) {
  return intervals.map((interval, index) => ({
    ...interval,
    lower: index === 0 ? props.lowerBound : intervals[index - 1].upper,
    upper: index === intervals.length - 1 ? props.upperBound : interval.upper,
  }))
}

function updateInterval(index: number, patch: Partial<ScoreInterval>) {
  const intervals = props.intervals.map((interval, intervalIndex) => intervalIndex === index ? { ...interval, ...patch } : interval)
  emit('update:intervals', normalizeIntervals(intervals))
}

function addInterval() {
  emit('add')
  const index = Math.max(1, props.intervals.length - 1)
  const intervals = [...props.intervals]
  intervals.splice(index, 0, { lower: '', upper: '', code: '', name: '' })
  emit('update:intervals', normalizeIntervals(intervals))
}

function removeInterval(index: number) {
  if (props.intervals.length <= 2) return
  emit('remove', index)
  emit('update:intervals', normalizeIntervals(props.intervals.filter((_, intervalIndex) => intervalIndex !== index)))
}
</script>

<template>
  <div class="score-interval-editor" aria-label="分数子区间编辑器">
    <div v-for="(interval, index) in visibleIntervals" :key="index" class="interval-row" :class="{ 'has-delete': hasDelete }">
      <div class="interval-bounds">
        <PerformanceNumberInput
          :model-value="interval.lower"
          :disabled="index === 0"
          readonly
          placeholder="请输入分数下限"
          :aria-label="`第${index + 1}个区间分数下限`"
          size="interval"
          :precision="precision"
          :min="0"
          @update:model-value="(lower) => updateInterval(index, { lower })"
        />
        <div class="interval-operator" aria-hidden="true">
          <span class="interval-operator__sign">{{ operatorParts(index).left }}</span>
          <span class="interval-operator__score">分数</span>
          <span class="interval-operator__sign">{{ operatorParts(index).right }}</span>
        </div>
        <PerformanceNumberInput
          :model-value="interval.upper"
          :disabled="index === visibleIntervals.length - 1"
          placeholder="请输入分数上限"
          :aria-label="`第${index + 1}个区间分数上限`"
          size="interval"
          :precision="precision"
          :min="0"
          :invalid="boundaryErrors[index] && index < visibleIntervals.length - 1"
          @update:model-value="(upper) => updateInterval(index, { upper })"
        />
      </div>
      <input class="interval-code-input" :class="{ error: codeErrors[index] }" :value="interval.code" placeholder="请输入等级代号" maxlength="12" @input="updateInterval(index, { code: ($event.target as HTMLInputElement).value })" />
      <input class="interval-name-input" :value="interval.name" placeholder="请输入等级名称" maxlength="40" @input="updateInterval(index, { name: ($event.target as HTMLInputElement).value })" />
      <PerformanceIconButton v-if="hasDelete && !structureLocked" icon="DeleteTrashOutlined" :label="`删除第${index + 1}个分数子区间`" @click="removeInterval(index)" />
      <span v-if="boundaryErrors[index]" class="interval-error interval-boundary-error">分数子区间的上下限必须在评分上下限范围内</span>
      <span v-if="codeErrors[index]" class="interval-error interval-code-error">等级代号为必填</span>
    </div>
    <button v-if="!structureLocked" class="add-interval-button" type="button" @click="addInterval"><AddOutlinedIcon />添加分数子区间</button>
  </div>
</template>

<style scoped>
.score-interval-editor { width: 100%; }
.interval-row { display: grid; grid-template-columns: 276px 4px minmax(0, 1fr) 8px minmax(0, 1fr); align-items: start; margin-bottom: 12px; }
.interval-row:last-of-type { margin-bottom: 8px; }
.interval-row.has-delete { grid-template-columns: 276px 4px minmax(0, 1fr) 8px minmax(0, 1fr) 4px 24px; }
.interval-bounds { display: grid; grid-column: 1; grid-row: 1; grid-template-columns: 98px 80px 98px; align-items: center; width: 276px; }
.interval-code-input { grid-column: 3; grid-row: 1; }
.interval-name-input { grid-column: 5; grid-row: 1; }
.interval-row > :deep(.performance-icon-button) { grid-column: 7; grid-row: 1; align-self: center; }
.interval-operator { display: grid; width: 80px; height: 31px; padding: 0 4px; grid-template-columns: 18px 36px 18px; align-items: center; box-sizing: border-box; color: #1f2329; font-size: 14px; }
.interval-operator > span { display: flex; align-items: center; height: 100%; padding: 0 4px; box-sizing: border-box; white-space: nowrap; }
.interval-operator__sign { line-height: 22px; }
.interval-operator__score { line-height: 18.6667px; }
.interval-row > input { width: 100%; height: 32px; padding: 4px 11px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; outline: none; color: #1f2329; font: 400 14px/22px inherit; }
.interval-row > input:focus { border-color: #1456f0; }
.interval-row > input.error { border-color: #f54a45; }
.interval-error { display: block; grid-row: 2; margin-top: 4px; color: #f54a45; font-size: 12px; line-height: 18px; }
.interval-boundary-error { grid-column: 1; }
.interval-code-error { grid-column: 3; }
.add-interval-button { display: inline-flex; align-items: center; height: 22px; padding: 0; border: 0; background: transparent; color: #3370ff; font-size: 14px; line-height: 22px; cursor: pointer; }
.add-interval-button :deep(svg) { width: 14px; height: 14px; margin-right: 4px; }
</style>
