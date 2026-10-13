<script setup lang="ts">
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'

export type CalculationRuleOption = { value: string; label: string; showInfo?: boolean }

const props = withDefaults(defineProps<{
  modelValue: string
  options?: CalculationRuleOption[]
}>(), {
  options: () => [
    { value: 'none', label: '不设置规则', showInfo: true },
    { value: 'condition', label: '按条件计算' },
  ],
})
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="calculation-rule-section" data-component="review-question-calculation-rule">
    <div class="additional-label">计算规则<span class="required-mark">*</span></div>
    <PerformanceRadioGroup
      :model-value="props.modelValue"
      :options="props.options"
      name="review-question-calculation-rule"
      aria-label="计算规则"
      :gap="24"
      @update:model-value="emit('update:modelValue', $event)"
    />
  </div>
</template>

<style scoped>
.calculation-rule-section { margin-bottom: 16px; }
.additional-label { height: 22px; margin-bottom: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.required-mark { margin-left: 4px; color: #f54a45; font-family: SimSun, sans-serif; font-weight: 400; }
</style>
