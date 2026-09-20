<script setup lang="ts">
import { computed } from 'vue'
import FixedScoreOptionsEditor, { type FixedScoreOption } from './FixedScoreOptionsEditor.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import ScoreBoundsField from './ScoreBoundsField.vue'
import type { FixedScoreError } from './fixedScoreValidation'

const props = withDefaults(defineProps<{
  modelValue: {
    method: string
    min: string
    max: string
    precision: string
    fixedOptions?: FixedScoreOption[]
  }
  errors?: { bounds?: boolean; fixedOptions?: Array<FixedScoreError | undefined> }
  disabled?: boolean
}>(), {
  modelValue: () => ({
    method: '在分数上下限内输入评分',
    min: '',
    max: '',
    precision: '不保留小数',
    fixedOptions: [{ id: 'fixed-score-1', value: '' }, { id: 'fixed-score-2', value: '' }],
  }),
  errors: () => ({}),
  disabled: false,
})
const emit = defineEmits<{ 'update:modelValue': [value: typeof props.modelValue] }>()

const methodOptions = ['在分数上下限内输入评分', '在固定分值选项内选择评分']
const precisionOptions = ['不保留小数', '保留 1 位小数', '保留 2 位小数']
const value = computed(() => props.modelValue)
const fixedOptions = computed(() => value.value.fixedOptions?.length
  ? value.value.fixedOptions
  : [{ id: 'fixed-score-1', value: '' }, { id: 'fixed-score-2', value: '' }])
const precisionDigits = computed(() => value.value.precision === '保留 1 位小数' ? 1 : value.value.precision === '保留 2 位小数' ? 2 : 0)

function update(patch: Partial<typeof props.modelValue>) {
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
  update({ precision, min: formatValue(value.value.min, digits), max: formatValue(value.value.max, digits) })
}
</script>

<template>
  <section class="score-config" aria-label="评分设置">
    <h3>评分设置</h3>
    <div class="form-row">
      <div class="field-label">评分方式</div>
      <div class="field-control">
        <PerformanceRadioGroup :model-value="value.method" :options="methodOptions.map((label) => ({ value: label, label }))" name="score-method" aria-label="评分方式" :disabled="disabled" @update:model-value="(method) => update({ method })" />
      </div>
    </div>
    <ScoreBoundsField v-if="value.method === '在分数上下限内输入评分'" :model-value="{ min: value.min, max: value.max }" :precision="precisionDigits" :invalid="!!errors?.bounds" :disabled="disabled" @update:model-value="update" />
    <div v-else class="form-row fixed-score-options-row">
      <div class="field-label"><PerformanceRequiredLabel label="配置分值选项" /></div>
      <div class="field-control">
        <FixedScoreOptionsEditor :options="fixedOptions" :errors="errors?.fixedOptions" :disabled="disabled" @update:options="(options) => update({ fixedOptions: options })" />
      </div>
    </div>
    <div class="form-row">
      <div class="field-label"><PerformanceRequiredLabel label="小数位数设置" /></div>
      <div class="field-control">
        <PerformanceRadioGroup :model-value="value.precision" :options="precisionOptions.map((label) => ({ value: label, label }))" name="score-precision" aria-label="小数位数设置" :disabled="disabled" @update:model-value="updatePrecision" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.score-config { color: #1f2329; }
.score-config h3 { margin: 0 0 16px; font-size: 16px; font-weight: 600; line-height: 24px; }
.form-row { display: block; margin-bottom: 20px; }
.field-label { min-height: 22px; margin-bottom: 8px; font-size: 14px; font-weight: 600; line-height: 22px; }
.field-control { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 24px; min-width: 0; }
.fixed-score-options-row .field-control { display: block; width: 100%; }
.solid-radio { display: inline-flex; align-items: center; height: 22px; gap: 8px; font-size: 14px; line-height: 22px; cursor: pointer; }
.solid-radio input { width: 16px; height: 16px; margin: 0; accent-color: #3370ff; }
</style>
