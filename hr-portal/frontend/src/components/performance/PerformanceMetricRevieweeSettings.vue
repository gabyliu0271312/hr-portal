<template>
  <div class="metric-reviewee-settings" aria-label="被评估人添加指标设置">
    <PerformanceFormItem label="添加指标的方式" required>
      <PerformanceRadioGroup
        :model-value="modelValue.reviewee_add_method"
        :options="addMethodOptions"
        name="reviewee-add-method"
        direction="vertical"
        :gap="8"
        :disabled="disabled"
        aria-label="添加指标的方式"
        @update:model-value="updateAddMethod"
      />
    </PerformanceFormItem>
    <PerformanceFormItem label="评分方式" required>
      <div class="metric-reviewee-scoring">
        <div class="metric-reviewee-scoring__line">
          <span class="metric-reviewee-scoring__dot" aria-hidden="true" />
          <span>指标库的指标：以指标库设定的方式为准</span>
        </div>
        <div v-if="modelValue.reviewee_add_method === 'library_or_custom'" class="metric-reviewee-scoring__custom">
          <div class="metric-reviewee-scoring__line">
            <span class="metric-reviewee-scoring__dot" aria-hidden="true" />
            <span>非指标库的指标</span>
          </div>
          <PerformanceAssessmentSelect
            class="metric-reviewee-scoring__select"
            :model-value="modelValue.reviewee_scoring_method"
            label=""
            aria-label="非指标库的指标评分方式"
            :options="scoringOptions"
            :disabled="disabled"
            @update:model-value="updateScoringMethod"
          />
        </div>
      </div>
    </PerformanceFormItem>
    <PerformanceFormItem label="指标数量设置" class="metric-reviewee-settings__count">
      <PerformanceCheckbox
        :model-value="modelValue.reviewee_min_one_metric"
        label="至少添加 1 条指标"
        :disabled="disabled"
        @update:model-value="updateMinimum"
      />
    </PerformanceFormItem>
  </div>
</template>

<script setup lang="ts">
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceRadioGroup, { type PerformanceRadioOption } from './PerformanceRadioGroup.vue'

export interface MetricRevieweeSettings {
  reviewee_add_method: 'library' | 'library_or_custom'
  reviewee_scoring_method: 'manual'
  reviewee_min_one_metric: boolean
}

const props = defineProps<{ modelValue: MetricRevieweeSettings; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: MetricRevieweeSettings] }>()
const addMethodOptions: PerformanceRadioOption[] = [
  { value: 'library', label: '可选用指标库的指标' },
  { value: 'library_or_custom', label: '可选用指标库的指标或添加自定义指标' },
]
const scoringOptions = [{ id: 'manual', label: '手动评分' }]

function updateAddMethod(value: string) {
  emit('update:modelValue', { ...props.modelValue, reviewee_add_method: value as MetricRevieweeSettings['reviewee_add_method'] })
}
function updateScoringMethod(value: string) {
  emit('update:modelValue', { ...props.modelValue, reviewee_scoring_method: value as MetricRevieweeSettings['reviewee_scoring_method'] })
}
function updateMinimum(value: boolean) {
  emit('update:modelValue', { ...props.modelValue, reviewee_min_one_metric: value })
}
</script>

<style scoped>
.metric-reviewee-settings { display: flex; flex-direction: column; gap: var(--spacing-3); width: calc(100% - var(--spacing-2)); margin: var(--spacing-1) 0 var(--spacing-5) var(--spacing-2); padding: var(--spacing-3); box-sizing: border-box; border-radius: var(--radius-md); background: var(--performance-review-readonly-surface); color: var(--color-text-primary); font-size: var(--font-size-md); }
.metric-reviewee-settings :deep(.performance-form-item) { margin-bottom: 0; }
.metric-reviewee-settings :deep(.performance-radio-group) { display: flex; width: 100%; }
.metric-reviewee-settings :deep(.performance-radio-option) { flex: 0 0 auto; width: 100%; height: auto; min-height: 22px; }
.metric-reviewee-settings :deep(.radio-label) { white-space: normal; }
.metric-reviewee-scoring { display: flex; flex-direction: column; gap: var(--spacing-1); margin-left: var(--spacing-1); }
.metric-reviewee-scoring__custom { display: flex; flex-direction: column; gap: var(--spacing-2); }
.metric-reviewee-scoring__line { display: flex; align-items: flex-start; min-height: 22px; gap: var(--spacing-2); line-height: 22px; }
.metric-reviewee-scoring__dot { flex: 0 0 var(--spacing-1); width: var(--spacing-1); height: var(--spacing-1); margin-top: var(--spacing-2); border-radius: var(--radius-pill); background: var(--color-primary); }
.metric-reviewee-scoring__select { width: calc(100% - var(--spacing-3)); margin-left: var(--spacing-3); }
.metric-reviewee-settings__count { margin-bottom: 0; }
</style>
