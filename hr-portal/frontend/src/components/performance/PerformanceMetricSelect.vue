<template>
  <div ref="root" class="performance-metric-select" :class="{ 'is-open': open, 'is-invalid': invalid, 'is-disabled': disabled }">
    <button
      class="performance-metric-select__trigger"
      type="button"
      role="combobox"
      :aria-label="ariaLabel"
      :aria-expanded="open"
      :aria-invalid="invalid || undefined"
      :disabled="disabled"
      @click="toggle"
      @keydown.esc="close"
    >
      <span :class="{ 'is-placeholder': !selectedLabel }">{{ selectedLabel || placeholder }}</span>
      <svg class="performance-metric-select__arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0-1.414-1.414l-7.071 7.071-7.071-7.071a1 1 0 0 0-1.414 0Z" fill="currentColor" />
      </svg>
    </button>
    <div v-if="open" class="performance-metric-select__menu" role="listbox" :aria-label="`${ariaLabel}选项`">
      <button
        v-for="option in options"
        :key="option.value"
        class="performance-metric-select__option"
        :class="{ 'is-selected': option.value === modelValue }"
        type="button"
        role="option"
        :aria-selected="option.value === modelValue"
        @click="select(option.value)"
      >
        <span>{{ option.label }}</span>
        <svg v-if="option.value === modelValue" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <p v-if="!options.length" class="performance-metric-select__empty">{{ emptyText }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export interface PerformanceMetricSelectOption {
  value: string
  label: string
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: PerformanceMetricSelectOption[]
  placeholder?: string
  ariaLabel: string
  invalid?: boolean
  disabled?: boolean
  emptyText?: string
}>(), {
  placeholder: '请选择',
  invalid: false,
  disabled: false,
  emptyText: '暂无可选项',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const root = ref<HTMLElement | null>(null)
const open = ref(false)
const selectedLabel = computed(() => props.options.find(option => option.value === props.modelValue)?.label || '')

function toggle() {
  if (!props.disabled) open.value = !open.value
}
function close() { open.value = false }
function select(value: string) {
  emit('update:modelValue', value)
  close()
}
function onOutside(event: PointerEvent) {
  const target = event.target
  if (target instanceof Node && !root.value?.contains(target)) close()
}
onMounted(() => document.addEventListener('pointerdown', onOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside))
</script>

<style scoped>
.performance-metric-select { position: relative; width: 100%; min-width: 0; }
.performance-metric-select__trigger { display: flex; align-items: center; justify-content: space-between; width: 100%; height: var(--performance-input-height); padding: var(--performance-input-padding-y) var(--performance-input-padding-x); box-sizing: border-box; border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); outline: none; background: var(--color-bg-card); color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); text-align: left; cursor: pointer; transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard); }
.performance-metric-select__trigger:hover, .performance-metric-select.is-open .performance-metric-select__trigger { border-color: var(--performance-field-border-focus); }
.performance-metric-select__trigger:focus-visible { border-color: var(--performance-field-border-focus); box-shadow: var(--performance-field-focus-ring); }
.performance-metric-select.is-invalid .performance-metric-select__trigger { border-color: var(--performance-field-border-invalid); }
.performance-metric-select.is-disabled .performance-metric-select__trigger { background: var(--performance-field-disabled-background); color: var(--performance-field-disabled-text); cursor: not-allowed; }
.performance-metric-select__trigger .is-placeholder { color: var(--color-text-placeholder); }
.performance-metric-select__arrow { flex: 0 0 12px; margin-left: var(--spacing-2); color: var(--color-text-secondary); }
.performance-metric-select__menu { position: absolute; top: calc(100% + var(--spacing-1)); right: 0; left: 0; z-index: 10; max-height: 220px; overflow: auto; padding: var(--spacing-1) 0; box-sizing: border-box; border: 1px solid var(--color-border-light); border-radius: var(--performance-control-radius); background: var(--color-bg-card); box-shadow: var(--shadow-popover); }
.performance-metric-select__option { display: flex; align-items: center; justify-content: space-between; width: 100%; min-height: var(--performance-input-height); padding: 5px var(--performance-input-padding-x); border: 0; background: var(--color-bg-card); color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); text-align: left; cursor: pointer; }
.performance-metric-select__option:hover, .performance-metric-select__option.is-selected { background: var(--color-surface-disabled); }
.performance-metric-select__option svg { color: var(--color-primary-hover); }
.performance-metric-select__empty { margin: 0; padding: var(--spacing-2) var(--performance-input-padding-x); color: var(--color-text-placeholder); font: 400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); }
</style>
