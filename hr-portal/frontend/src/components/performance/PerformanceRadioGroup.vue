<script setup lang="ts">
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import { PERFORMANCE_INFO_PLACEHOLDER } from './performanceInfoPlaceholder'

export interface PerformanceRadioOption {
  value: string
  label: string
  description?: string | null
  disabled?: boolean
  showInfo?: boolean
  info?: string | string[]
}

withDefaults(defineProps<{
  modelValue: string
  options: PerformanceRadioOption[]
  name?: string
  disabled?: boolean
  gap?: number
  direction?: 'horizontal' | 'vertical'
  ariaLabel?: string
  variant?: 'default' | 'card'
}>(), {
  name: 'performance-radio',
  disabled: false,
  gap: 24,
  direction: 'horizontal',
  ariaLabel: '',
  variant: 'default',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="performance-radio-group" :class="[`performance-radio-group--${direction}`, { 'performance-radio-group--card': variant === 'card' }]" role="radiogroup" :aria-label="ariaLabel" :style="{ gap: `${gap}px` }">
    <div v-for="option in options" :key="option.value" class="performance-radio-entry" :class="{ checked: modelValue === option.value }">
      <label class="performance-radio-option" :class="{ checked: modelValue === option.value, disabled: disabled || option.disabled }">
        <input type="radio" :name="name" :value="option.value" :checked="modelValue === option.value" :disabled="disabled || option.disabled" @change="emit('update:modelValue', option.value)" />
        <span class="radio-wallpaper" aria-hidden="true"></span>
        <span class="radio-label"><slot name="label" :option="option">{{ option.label }}</slot></span>
        <PerformanceInfoPopover v-if="option.showInfo || option.info" class="info-icon" :content="option.info || PERFORMANCE_INFO_PLACEHOLDER" @click.prevent.stop />
      </label>
      <slot name="after-option" :option="option" />
    </div>
  </div>
</template>

<style scoped>
.performance-radio-group { display: inline-flex; align-items: center; min-width: 0; min-height: 22px; }
.performance-radio-group--vertical { flex-direction: column; align-items: flex-start; }
.performance-radio-option { position: relative; display: inline-flex; flex: 0 0 auto; align-items: center; height: 22px; color: var(--color-text-primary); font-size: var(--font-size-md); line-height: 22px; cursor: pointer; }
.performance-radio-option input { position: absolute; width: var(--performance-workbench-editor-radio-size); height: var(--performance-workbench-editor-radio-size); margin: 0; opacity: 0; cursor: pointer; }
.radio-wallpaper { pointer-events: none; flex: 0 0 var(--performance-workbench-editor-radio-size); width: var(--performance-workbench-editor-radio-size); height: var(--performance-workbench-editor-radio-size); margin-right: var(--performance-field-label-gap); box-sizing: border-box; border: 1px solid #8f959e; border-radius: 50%; background: var(--color-bg-card); }
.performance-radio-option.checked .radio-wallpaper { border: 5px solid var(--color-primary-hover); }
.performance-radio-option input:focus-visible + .radio-wallpaper { outline: 2px solid var(--color-primary-hover); outline-offset: 2px; }
.performance-radio-option.disabled { color: var(--color-border); cursor: not-allowed; }
.performance-radio-option.disabled .radio-wallpaper { border: 1px solid var(--color-border); background: var(--color-surface-disabled); }
.performance-radio-option.disabled.checked .radio-wallpaper { border: 5px solid var(--color-border); }
.performance-radio-option.disabled input { cursor: not-allowed; }
.radio-label { white-space: nowrap; }
.info-icon { display:inline-flex; flex: 0 0 var(--performance-info-icon-size); width: var(--performance-info-icon-size); height: var(--performance-info-icon-size); margin-left: var(--performance-info-icon-gap); color: var(--performance-info-icon-color); }
.performance-radio-entry { display: contents; }
.performance-radio-group--card { display: flex; width: 100%; }
.performance-radio-group--card .performance-radio-entry { display: flex; align-items: center; width: 100%; min-width: 0; padding: var(--spacing-4); box-sizing: border-box; border: 1px solid var(--performance-template-option-border); border-radius: var(--radius-lg); }
.performance-radio-group--card .performance-radio-entry.checked { border-color: var(--color-primary); }
.performance-radio-group--card .performance-radio-option { flex: 1; min-width: 0; height: auto; align-items: baseline; margin-right: var(--spacing-6); }
.performance-radio-group--card .radio-wallpaper { position: relative; top: 2px; }
.performance-radio-group--card .radio-label { min-width: 0; white-space: normal; }
</style>
