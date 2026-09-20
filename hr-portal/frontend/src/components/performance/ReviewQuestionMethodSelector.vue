<script setup lang="ts">
import PerformanceRadioGroup, { type PerformanceRadioOption } from './PerformanceRadioGroup.vue'

defineProps<{
  modelValue: string
  label: string
  options: PerformanceRadioOption[]
  name: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="method-selector" data-component="review-question-method-selector">
    <div class="method-selector-label">{{ label }}<span class="required-mark">*</span></div>
    <PerformanceRadioGroup
      :model-value="modelValue"
      :options="options"
      :name="name"
      :aria-label="label"
      :gap="24"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.method-selector { margin-bottom: 20px; }
.method-selector-label { height: 22px; margin-bottom: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.required-mark { margin-left: 4px; color: #f54a45; font-family: SimSun, sans-serif; font-weight: 400; }
</style>
