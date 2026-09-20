<script setup lang="ts">
import { computed } from 'vue'
import type { ReviewRuleOption } from './reviewQuestionTypes'

const props = defineProps<{
  modelValue: number | null
  options: ReviewRuleOption[]
  loading?: boolean
  error?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const selectedOption = computed(() => props.options.find((option) => option.id === props.modelValue) ?? null)
function ruleSummary(option: ReviewRuleOption): string {
  if (option.review_type === '评级') {
    const min = Number(option.config_summary.quantified_score_min)
    const max = Number(option.config_summary.quantified_score_max)
    if (Boolean(option.config_summary.grade_participates_in_calculation) && Number.isFinite(min) && Number.isFinite(max)) return `评级（量化分: ${min}-${max} 分）`
  }
  return option.review_type
}
</script>

<template>
  <div class="review-rule-select-wrap">
    <el-select
      class="review-rule-select"
      :model-value="modelValue"
      placeholder="请选择"
      style="width: 100%"
      :loading="loading"
      :disabled="loading"
      popper-class="review-rule-select-popper"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template v-if="selectedOption" #label>
        <span class="selected-rule-name">{{ selectedOption.name }}</span>
      </template>
      <el-option v-for="option in options" :key="option.id" :label="option.name" :value="option.id">
        <div class="rule-option-content"><span>{{ option.name }}</span><span class="rule-option-summary">{{ ruleSummary(option) }}</span></div>
      </el-option>
    </el-select>
    <span v-if="error" class="review-rule-select-error" role="alert">{{ error }}</span>
  </div>
</template>

<style scoped>
.review-rule-select-wrap { width: 100%; }
.selected-rule-name { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 28px; }
.rule-option-content { display: flex; flex-direction: column; min-width: 0; min-height: 40px; }
:global(.review-rule-select-popper .el-select-dropdown__item) { height: 50px; padding: 4px 20px; box-sizing: border-box; line-height: 22px; white-space: normal; }
.selected-rule-summary, .rule-option-summary { color: #646a73; font-size: 12px; line-height: 20px; }
.review-rule-select-error { display: block; margin-top: 6px; color: #f54a45; font-size: 12px; line-height: 18px; }
</style>
