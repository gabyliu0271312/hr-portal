<script setup lang="ts">
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'

const props = withDefaults(defineProps<{
  modelValue: { min: string; max: string }
  label?: string
  minPlaceholder?: string
  maxPlaceholder?: string
  required?: boolean
  precision?: number
  min?: number
  controlHeight?: string
  inputLineHeight?: string
  stepperWidth?: string
  invalid?: boolean
  disabled?: boolean
  errorMessage?: string
}>(), {
  label: '评分上下限',
  minPlaceholder: '请输入分数下限',
  maxPlaceholder: '请输入分数上限',
  required: true,
  precision: undefined,
  min: 0,
  controlHeight: '32px',
  inputLineHeight: '22px',
  stepperWidth: '32px',
  invalid: false,
  disabled: false,
  errorMessage: '评分上下限为必填',
})

const emit = defineEmits<{ 'update:modelValue': [value: typeof props.modelValue] }>()

function update(patch: Partial<typeof props.modelValue>) {
  emit('update:modelValue', { ...props.modelValue, ...patch })
}
</script>

<template>
  <div class="score-bounds-field">
    <div class="field-label"><PerformanceRequiredLabel v-if="required" :label="label" /><span v-else>{{ label }}</span></div>
    <div class="bounds-control">
      <PerformanceNumberInput
        :model-value="modelValue.min"
        :placeholder="minPlaceholder"
        aria-label="分数下限"
        size="wide"
        :precision="precision"
        :allow-negative="true"
        :disabled="disabled"
        :control-height="controlHeight"
        :input-line-height="inputLineHeight"
        :stepper-width="stepperWidth"
        :invalid="invalid"
        @update:model-value="(min) => update({ min })"
      />
      <span class="range-dash">-</span>
      <PerformanceNumberInput
        :model-value="modelValue.max"
        :placeholder="maxPlaceholder"
        aria-label="分数上限"
        size="wide"
        :precision="precision"
        :allow-negative="true"
        :disabled="disabled"
        :control-height="controlHeight"
        :input-line-height="inputLineHeight"
        :stepper-width="stepperWidth"
        :invalid="invalid"
        @update:model-value="(max) => update({ max })"
      />
    </div>
    <span v-if="invalid" class="bounds-error">{{ errorMessage }}</span>
  </div>
</template>

<style scoped>
.score-bounds-field { margin-bottom: 20px; color: #1f2329; }
.field-label { min-height: 22px; margin-bottom: 8px; font-size: 14px; font-weight: 600; line-height: 22px; }
.bounds-control { display: flex; align-items: center; gap: 24px; width: 100%; }
.bounds-control :deep(.performance-number-input) { min-width: 0; flex: 1; }
.range-dash { flex: none; color: #1f2329; font-size: 14px; line-height: 22px; }
.bounds-error { display: block; margin-top: 4px; color: #f54a45; font-size: 12px; line-height: 18px; }
</style>
