<script setup lang="ts">
export interface PerformanceRadioOption {
  value: string
  label: string
  showInfo?: boolean
}

withDefaults(defineProps<{
  modelValue: string
  options: PerformanceRadioOption[]
  name?: string
  disabled?: boolean
  gap?: number
  ariaLabel?: string
}>(), {
  name: 'performance-radio',
  disabled: false,
  gap: 24,
  ariaLabel: '',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="performance-radio-group" role="radiogroup" :aria-label="ariaLabel" :style="{ gap: `${gap}px` }">
    <label v-for="option in options" :key="option.value" class="performance-radio-option" :class="{ checked: modelValue === option.value, disabled }">
      <input type="radio" :name="name" :value="option.value" :checked="modelValue === option.value" :disabled="disabled" @change="emit('update:modelValue', option.value)" />
      <span class="radio-wallpaper" aria-hidden="true"></span>
      <span class="radio-label">{{ option.label }}</span>
      <svg v-if="option.showInfo" class="info-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="InfoOutlined" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" fill="currentColor" /></svg>
    </label>
  </div>
</template>

<style scoped>
.performance-radio-group { display: inline-flex; align-items: center; min-width: 0; min-height: 22px; }
.performance-radio-option { position: relative; display: inline-flex; flex: 0 0 auto; align-items: center; height: 22px; color: #1f2329; font-size: 14px; line-height: 22px; cursor: pointer; }
.performance-radio-option input { position: absolute; width: 16px; height: 16px; margin: 0; opacity: 0; cursor: pointer; }
.radio-wallpaper { flex: 0 0 16px; width: 16px; height: 16px; margin-right: 8px; box-sizing: border-box; border: 1px solid #8f959e; border-radius: 50%; background: #fff; }
.performance-radio-option.checked .radio-wallpaper { border: 5px solid #1456f0; }
.performance-radio-option input:focus-visible + .radio-wallpaper { outline: 2px solid #1456f0; outline-offset: 2px; }
.performance-radio-option.disabled { color: #8f959e; cursor: not-allowed; }
.performance-radio-option.disabled input { cursor: not-allowed; }
.radio-label { white-space: nowrap; }
.info-icon { flex: 0 0 16px; width: 16px; height: 16px; margin-left: 2px; color: #646a73; }
</style>
