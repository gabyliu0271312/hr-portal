<template>
  <div class="segmented-control" :class="`size-${size}`" role="radiogroup" :aria-label="ariaLabel">
    <button
      v-for="(option, index) in options"
      :key="option.value"
      type="button"
      class="segment"
      :class="{ checked: modelValue === option.value, first: index === 0, last: index === options.length - 1 }"
      role="radio"
      :aria-checked="modelValue === option.value"
      @click="select(option)"
    >
      <span v-if="option.icon" class="segment-icon"><component :is="option.icon" /></span>
      <span class="segment-label">{{ option.label }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue'

export interface PerformanceSegmentedOption {
  value: string
  label: string
  icon?: Component
}

const props = withDefaults(defineProps<{
  modelValue: string
  options: PerformanceSegmentedOption[]
  size?: 'md' | 'sm'
  ariaLabel?: string
}>(), {
  size: 'md',
  ariaLabel: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function select(option: PerformanceSegmentedOption) {
  if (option.value !== props.modelValue) emit('update:modelValue', option.value)
}
</script>

<style scoped>
.segmented-control { display: inline-flex; flex-wrap: wrap; min-width: 0; background: #fff; border-radius: 6px; }
.segment { display: inline-flex; position: relative; align-items: center; box-sizing: border-box; border: 1px solid #bbbfc4; background: #fff; color: #1f2329; cursor: pointer; font-family: inherit; line-height: 22px; white-space: nowrap; transition: color 0.1s ease-in, background-color 0.1s ease-in, border-color 0.1s ease-in; }
.segment.first { border-radius: 6px 0 0 6px; }
.segment.last { border-radius: 0 6px 6px 0; }
.segment + .segment { margin-left: -1px; }
.segmented-control.size-md .segment { padding: 4px 20px; font-size: 14px; font-weight: 400; }
.segmented-control.size-sm .segment { padding: 2px 8px; font-size: 12px; font-weight: 500; line-height: 20px; }
.segment:hover { background: #e1eaff; border-color: #3370ff; color: #3370ff; }
.segment:active { background: #bacefd; border-color: #3370ff; color: #3370ff; }
.segment.checked { border-color: #3370ff; color: #1456f0; font-weight: 500; }
.segment.checked:hover { background: #e1eaff; border-color: #3370ff; color: #1456f0; }
.segment-icon { display: inline-flex; flex: 0 0 auto; margin-right: 4px; }
.segmented-control.size-md .segment-icon { width: 14px; height: 14px; }
.segmented-control.size-sm .segment-icon { width: 12px; height: 12px; }
.segment-icon :deep(svg) { width: 100%; height: 100%; }
.segment-label { min-width: 0; overflow: hidden; max-width: 240px; text-overflow: ellipsis; word-break: keep-all; }
</style>
