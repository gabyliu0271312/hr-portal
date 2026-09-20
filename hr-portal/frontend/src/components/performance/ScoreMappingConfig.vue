<script setup lang="ts">
import { computed, watch } from 'vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import IntervalHeader from './IntervalHeader.vue'
import ScoreBoundsField from './ScoreBoundsField.vue'
import ScoreIntervalEditor from './ScoreIntervalEditor.vue'

interface ScoreMappingValue {
  method: string
  min: string
  max: string
  rule: string
  intervals: Array<{ lower: string; upper: string; code: string; name: string }>
  precision: string
}

const props = withDefaults(defineProps<{
  modelValue: ScoreMappingValue
  errors?: { bounds?: boolean; intervalBounds?: boolean[]; intervalCodes?: boolean[] }
  boundsDisabled?: boolean
  structureLocked?: boolean
}>(), {
  modelValue: () => ({
    method: '在分数上下限内输入评分',
    min: '',
    max: '',
    rule: 'a ≤ 分数 < b',
    intervals: [
      { lower: '', upper: '', code: '', name: '' },
      { lower: '', upper: '', code: '', name: '' },
    ],
    precision: '不保留小数',
  }),
  errors: () => ({}),
  boundsDisabled: false,
  structureLocked: false,
})
const emit = defineEmits<{ 'update:modelValue': [value: ScoreMappingValue] }>()
const value = computed(() => props.modelValue)
const methodOptions = [{ value: '在分数上下限内输入评分', label: '在分数上下限内输入评分' }]
const ruleOptions = ['a ≤ 分数 < b', 'a < 分数 ≤ b']
const precisionOptions = ['不保留小数', '保留 1 位小数', '保留 2 位小数']
const precisionDigits = computed(() => value.value.precision === '保留 1 位小数' ? 1 : value.value.precision === '保留 2 位小数' ? 2 : 0)

function normalizeIntervals(intervals: ScoreMappingValue['intervals']) {
  return intervals.map((interval, index) => ({
    ...interval,
    lower: index === 0 ? value.value.min : intervals[index - 1].upper,
    upper: index === intervals.length - 1 ? value.value.max : interval.upper,
  }))
}

watch(
  () => [value.value.min, value.value.max, JSON.stringify(value.value.intervals)],
  () => {
    const intervals = normalizeIntervals(value.value.intervals)
    if (JSON.stringify(intervals) !== JSON.stringify(value.value.intervals)) update({ intervals })
  },
  { immediate: true },
)

function update(patch: Partial<ScoreMappingValue>) {
  emit('update:modelValue', { ...value.value, ...patch })
}

function formatValue(raw: string, digits: number) {
  if (raw === '' || raw === '.') return raw
  const numericValue = Number(raw)
  if (!Number.isFinite(numericValue)) return raw
  return digits > 0 ? numericValue.toFixed(digits) : String(Math.round(numericValue))
}

function updatePrecision(precision: string) {
  const digits = precision === '保留 1 位小数' ? 1 : precision === '保留 2 位小数' ? 2 : 0
  const intervals = value.value.intervals.map((interval) => ({ ...interval, upper: formatValue(interval.upper, digits) }))
  update({
    precision,
    min: formatValue(value.value.min, digits),
    max: formatValue(value.value.max, digits),
    intervals,
  })
}
</script>

<template>
  <section class="mapping-config" aria-label="评分映射等级型设置">
    <h3>评级设置</h3>
    <div class="form-row">
      <div class="field-label">评分方式</div>
      <div class="field-control">
        <PerformanceRadioGroup :model-value="value.method" :options="methodOptions" name="mapping-method" aria-label="评分方式" @update:model-value="(method) => update({ method })" />
      </div>
    </div>
    <ScoreBoundsField :model-value="{ min: value.min, max: value.max }" :precision="precisionDigits" :invalid="!!errors?.bounds" :disabled="boundsDisabled" @update:model-value="update" />
    <div class="form-row">
      <div class="field-label"><PerformanceRequiredLabel label="分数子区间规则" /></div>
      <div class="field-control">
        <label v-for="option in ruleOptions" :key="option" class="solid-radio">
          <input type="radio" name="mapping-rule" :checked="value.rule === option" @change="update({ rule: option })" />
          <span>{{ option }}</span>
        </label>
      </div>
    </div>
    <div class="form-row interval-preview-row">
      <div class="field-control interval-preview">
        <IntervalHeader :show-delete="value.intervals.length > 2" />
        <ScoreIntervalEditor :intervals="value.intervals" :rule="value.rule" :lower-bound="value.min" :upper-bound="value.max" :precision="precisionDigits" :structure-locked="structureLocked" :boundary-errors="errors?.intervalBounds" :code-errors="errors?.intervalCodes" @update:intervals="(intervals) => update({ intervals })" />
      </div>
    </div>
    <div class="form-row">
      <div class="field-label"><PerformanceRequiredLabel label="小数位数设置" /></div>
      <div class="field-control">
        <label v-for="option in precisionOptions" :key="option" class="solid-radio">
          <input type="radio" name="mapping-precision" :checked="value.precision === option" @change="updatePrecision(option)" />
          <span>{{ option }}</span>
        </label>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mapping-config { color: #1f2329; }
.mapping-config h3 { margin: 0 0 16px; font-size: 16px; font-weight: 600; line-height: 24px; }
.form-row { display: block; margin-bottom: 20px; }
.field-label { min-height: 22px; margin-bottom: 8px; font-size: 14px; font-weight: 600; line-height: 22px; }
.field-control { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 24px; min-width: 0; }
.solid-radio { display: inline-flex; align-items: center; height: 22px; gap: 8px; font-size: 14px; line-height: 22px; cursor: pointer; }
.solid-radio input { width: 16px; height: 16px; margin: 0; accent-color: #3370ff; }
.interval-preview { display: block; width: 100%; }
.interval-row { margin-bottom: 8px; }
.interval-row input { width: 100%; height: 32px; padding: 4px 11px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; outline: none; color: #1f2329; font: inherit; }
.interval-row input:disabled { background: #eff0f1; }
.t05-note { display: block; margin-top: 4px; color: #8f959e; font-size: 12px; }
</style>
