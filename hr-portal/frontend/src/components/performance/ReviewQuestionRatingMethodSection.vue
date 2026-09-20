<script setup lang="ts">
import type { PerformanceReviewSubQuestionOption } from '@/api/performance'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import ReviewQuestionCalculationRuleSection from './ReviewQuestionCalculationRuleSection.vue'
import ReviewQuestionSubQuestionList, { type ReviewQuestionSubQuestion } from './ReviewQuestionSubQuestionList.vue'

const props = withDefaults(defineProps<{
  modelValue: string
  calculationRule: string
  subQuestions: ReviewQuestionSubQuestion[]
  subQuestionOptions: PerformanceReviewSubQuestionOption[]
  subQuestionOptionsLoading?: boolean
}>(), {
  modelValue: 'direct',
  calculationRule: 'none',
  subQuestions: () => [],
  subQuestionOptions: () => [],
  subQuestionOptionsLoading: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:calculationRule': [value: string]
  'update:subQuestions': [value: ReviewQuestionSubQuestion[]]
}>()

const ratingOptions = [
  { value: 'direct', label: '直接评级' },
  { value: 'sub_items', label: '通过子评估项评级' },
  { value: 'total_score', label: '作为总分项计算评级', showInfo: true },
]

const isSubItems = () => props.modelValue === 'sub_items'
</script>

<template>
  <section class="question-card rating-method-section" :class="{ 'has-sub-items': isSubItems() }" aria-label="评估方式">
    <h2>评估方式</h2>
    <div class="additional-form-row">
      <div class="rating-method-field">
        <div class="additional-label">评级方式<span class="required-mark">*</span></div>
        <div class="radio-options">
          <PerformanceRadioGroup
            :model-value="props.modelValue"
            :options="ratingOptions"
            name="review-question-rating-method"
            aria-label="评级方式"
            :gap="24"
            @update:model-value="emit('update:modelValue', $event)"
          />
        </div>
      </div>
    </div>
    <ReviewQuestionCalculationRuleSection
      v-if="isSubItems()"
      :model-value="props.calculationRule"
      @update:model-value="emit('update:calculationRule', $event)"
    />
    <ReviewQuestionSubQuestionList
      v-if="isSubItems()"
      :model-value="props.subQuestions"
      :calculation-rule="props.calculationRule"
      :options="props.subQuestionOptions"
      :loading="props.subQuestionOptionsLoading"
      @update:model-value="emit('update:subQuestions', $event)"
    />
  </section>
</template>

<style scoped>
.question-card { width: 800px; max-width: 100%; margin-bottom: 16px; padding: 20px 20px 0 21px; box-sizing: border-box; border-radius: 8px; background: #fff; box-shadow: rgba(31,35,41,0.02) 0 1px 2px -2px, rgba(31,35,41,0.02) 0 2px 4px 0, rgba(31,35,41,0.02) 0 2px 8px 2px; }
.rating-method-section { display: flow-root; padding-bottom: 0; }
.question-card h2 { margin: 0 0 16px; color: #1f2329; font-size: 16px; font-weight: 600; line-height: 24px; }
.rating-method-field { margin-bottom: 20px; }
.rating-method-section.has-sub-items .rating-method-field { margin-bottom: 16px; }
.additional-label { height: 22px; margin-bottom: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.required-mark { margin-left: 4px; color: #f54a45; font-family: SimSun, sans-serif; font-weight: 400; }
</style>
