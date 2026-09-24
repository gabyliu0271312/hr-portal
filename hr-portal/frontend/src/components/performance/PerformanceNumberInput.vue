<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: string | number
  placeholder?: string
  ariaLabel?: string
  size?: 'compact' | 'wide' | 'interval'
  width?: string
  controlHeight?: string
  inputLineHeight?: string
  stepperWidth?: string
  step?: number
  precision?: number
  min?: number
  max?: number
  allowNegative?: boolean
  disabled?: boolean
  readonly?: boolean
  required?: boolean
  invalid?: boolean
}>(), {
  modelValue: '',
  placeholder: '',
  ariaLabel: '数字输入',
  size: 'wide',
  width: undefined,
  controlHeight: '32px',
  inputLineHeight: '22px',
  stepperWidth: '32px',
  step: undefined,
  precision: undefined,
  min: 0,
  max: undefined,
  allowNegative: false,
  disabled: false,
  readonly: false,
  required: false,
  invalid: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const inputValue = computed(() => String(props.modelValue ?? ''))
const effectiveStep = computed(() => props.step ?? (props.precision === undefined ? 1 : 10 ** -props.precision))
const effectivePrecision = computed(() => props.precision ?? decimalPlaces(effectiveStep.value))
const hasNumericValue = computed(() => inputValue.value !== '' && inputValue.value !== '.' && Number.isFinite(Number(inputValue.value)))
const effectiveMin = computed(() => props.allowNegative ? Number.NEGATIVE_INFINITY : props.min)
const atMinimum = computed(() => hasNumericValue.value && Number(inputValue.value) <= effectiveMin.value)
const atMaximum = computed(() => hasNumericValue.value && props.max !== undefined && Number(inputValue.value) >= props.max)
const effectiveControlHeight = computed(() => props.size === 'interval' && props.controlHeight === '32px' ? '31px' : props.controlHeight)
const controlStyle = computed(() => ({
  '--number-input-width': props.width ?? (props.size === 'compact' ? '112px' : props.size === 'interval' ? '98px' : '100%'),
  '--number-input-control-height': effectiveControlHeight.value,
  '--number-input-line-height': props.inputLineHeight,
  '--number-input-stepper-width': props.stepperWidth,
}))

function decimalPlaces(value: number) {
  const text = String(value)
  return text.includes('.') ? text.split('.')[1].length : 0
}

function formatValue(value: number) {
  return effectivePrecision.value > 0 ? value.toFixed(effectivePrecision.value) : String(Math.round(value))
}

function update(value: string) {
  const pattern = props.allowNegative ? /^-?\d*(\.\d*)?$/ : /^\d*(\.\d*)?$/
  if (!pattern.test(value)) return
  if (value === '' || value === '.' || value === '-' || value === '-.') {
    emit('update:modelValue', value)
    return
  }
  const numericValue = Number(value)
  const boundedValue = Math.min(props.max ?? Number.POSITIVE_INFINITY, Math.max(effectiveMin.value, numericValue))
  emit('update:modelValue', boundedValue !== numericValue ? formatValue(boundedValue) : value)
}

function formatInput() {
  if (props.disabled || props.readonly || inputValue.value === '' || inputValue.value === '.') return
  const numericValue = Number(inputValue.value)
  if (!Number.isFinite(numericValue)) return
  const boundedValue = Math.max(effectiveMin.value, props.max === undefined ? numericValue : Math.min(props.max, numericValue))
  const formattedValue = formatValue(boundedValue)
  if (formattedValue !== inputValue.value) emit('update:modelValue', formattedValue)
}

function adjust(delta: number) {
  const current = Number(inputValue.value)
  const baseValue = Number.isFinite(current) ? current : (props.allowNegative ? 0 : effectiveMin.value)
  const next = baseValue + delta * effectiveStep.value
  const boundedMin = Math.max(effectiveMin.value, next)
  const boundedValue = props.max === undefined ? boundedMin : Math.min(props.max, boundedMin)
  emit('update:modelValue', formatValue(boundedValue))
}
</script>

<template>
  <div
    class="performance-number-input"
    :class="{ 'is-disabled': disabled, 'is-readonly': readonly, 'is-invalid': invalid }"
    :data-size="size"
    :data-min="min"
    :data-step="effectiveStep"
    :style="controlStyle"
  >
    <div class="number-input-wrap">
      <input
        :value="inputValue"
        inputmode="decimal"
        :min="allowNegative ? undefined : min"
        :max="max"
        :step="effectiveStep"
        :placeholder="placeholder"
        :disabled="disabled"
        :readonly="readonly"
        :required="required"
        :aria-label="ariaLabel"
        :aria-readonly="readonly"
        @input="update(($event.target as HTMLInputElement).value)"
        @blur="formatInput"
      />
    </div>
    <div class="number-stepper">
      <button type="button" :aria-label="`${ariaLabel}增加`" :disabled="disabled || readonly || atMaximum" @click="adjust(1)">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" data-icon="UpBoldOutlined" aria-hidden="true">
          <path d="m20.385 16.914.707-.707a1 1 0 0 0 0-1.414l-7.778-7.778a2 2 0 0 0-2.829 0l-7.778 7.778a1 1 0 0 0 0 1.414l.707.707a1 1 0 0 0 1.414 0l7.071-7.07 7.071 7.07a1 1 0 0 0 1.415 0Z" fill="currentColor" />
        </svg>
      </button>
      <button type="button" :aria-label="`${ariaLabel}减少`" :disabled="disabled || readonly || atMinimum" @click="adjust(-1)">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" data-icon="DownBoldOutlined" aria-hidden="true">
          <path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.performance-number-input { position: relative; display: flex; width: var(--number-input-width); height: var(--number-input-control-height); box-sizing: border-box; overflow: hidden; border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); background: var(--color-bg-card); color: var(--color-text-primary); }
.performance-number-input[data-size="interval"] { display: block; padding: 4px 11px; border-width: 0.666667px; }
.performance-number-input:focus-within { border-color: var(--performance-field-border-focus); box-shadow: var(--performance-field-focus-ring); }
.performance-number-input.is-invalid { border-color: var(--performance-field-border-invalid); box-shadow: none; }
.number-input-wrap { display: flex; flex: 1 1 auto; align-items: center; min-width: 0; min-height: 0; box-sizing: border-box; }
.performance-number-input input { min-width: 0; flex: 1; width: 100%; height: 100%; padding: 4px 8px; box-sizing: border-box; border: 0; outline: 0; background: transparent; color: inherit; font: 400 14px/var(--number-input-line-height) inherit; }
.performance-number-input[data-size="interval"] input { flex: 0 0 auto; width: 75.0729px; height: 22px; padding: 0 32px 0 0; line-height: 0; }
.performance-number-input input::placeholder { color: var(--color-text-placeholder); }
.performance-number-input[data-size="interval"] .number-stepper { position: absolute; top: 0; left: 65.0729px; right: auto; width: 32px; height: 30px; }
.number-stepper { display: flex; flex: 0 0 var(--number-input-stepper-width); flex-direction: column; border-left: 1px solid var(--performance-field-border); }
.number-stepper button { display: grid; flex: 1; min-height: 0; place-items: center; padding: 0; border: 0; background: var(--color-bg-card); color: var(--color-text-secondary); cursor: pointer; }
.number-stepper button + button { border-top: 1px solid var(--performance-field-border); }
.number-stepper button:hover:not(:disabled), .number-stepper button:focus-visible { background: var(--color-surface-disabled); color: var(--color-primary); outline: 0; }
.performance-number-input.is-disabled, .performance-number-input.is-readonly { border-color: var(--performance-field-border); background: var(--performance-field-disabled-background); color: var(--performance-field-disabled-text); }
.performance-number-input.is-disabled { cursor: not-allowed; }
.performance-number-input[data-size="interval"].is-disabled input { cursor: default; }
.performance-number-input.is-disabled .number-stepper, .performance-number-input.is-readonly .number-stepper, .performance-number-input.is-disabled .number-stepper button + button, .performance-number-input.is-readonly .number-stepper button + button { border-color: var(--performance-field-border); }
.performance-number-input.is-disabled .number-stepper button, .performance-number-input.is-readonly .number-stepper button { background: var(--performance-field-disabled-background); color: var(--performance-field-disabled-text); }
.performance-number-input.is-disabled .number-stepper button { cursor: not-allowed; }
.performance-number-input.is-readonly .number-stepper button:disabled { cursor: default; }
.performance-number-input input:disabled { color: #8f959e; cursor: not-allowed; }
.performance-number-input input[readonly] { cursor: default; }
</style>
