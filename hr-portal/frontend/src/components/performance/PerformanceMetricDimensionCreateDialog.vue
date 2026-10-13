<template>
  <PerformanceDialogShell v-model="open" title="添加指标维度" width="600px" :loading="saving">
    <form id="metric-dimension-create-form" @submit.prevent="submit">
      <PerformanceLocalizedInput
        v-model="form.name"
        label="维度名称"
        input-id="metric-dimension-name"
        placeholder="请输入中文维度名称"
        required
        :disabled="saving"
        :invalid="Boolean(nameError)"
        :error-message="nameError"
        add-language-label=""
        @add-language="languageNotice = '添加英文功能暂未接入'"
      />

      <PerformanceFormItem label="维度描述">
        <div class="metric-dimension-textarea-wrap">
          <PerformanceTextField
            v-model="form.description"
            type="textarea"
            input-id="metric-dimension-description"
            aria-label="维度描述"
            :disabled="saving"
          />
          <span class="metric-dimension-language">中文</span>
        </div>
        <PerformanceTextButton class="metric-dimension-language-button" label="添加英文" :disabled="saving" @click="languageNotice = '添加英文功能暂未接入'">
          <template #icon><AddOutlinedIcon /></template>
        </PerformanceTextButton>
      </PerformanceFormItem>

      <div class="metric-dimension-switch-row">
        <span>需设置维度权重</span>
        <PerformanceSwitch v-model="form.need_weight" :disabled="saving" aria-label="需设置维度权重" @update:model-value="setNeedWeight" />
      </div>
      <PerformanceFormItem v-if="form.need_weight" label="维度权重" required :invalid="Boolean(weightError)" :error-message="weightError">
        <div class="metric-dimension-weight">
          <input
            id="metric-dimension-weight"
            :value="form.weight ?? ''"
            type="number"
            min="0"
            max="100"
            step="0.01"
            :disabled="saving"
            :aria-label="'维度权重百分比'"
            :aria-invalid="Boolean(weightError)"
            @input="updateWeight"
          />
          <span>%</span>
        </div>
      </PerformanceFormItem>

      <PerformanceFormItem label="可添加的指标类型" required :invalid="Boolean(metricTypeError)" :error-message="metricTypeError">
        <div class="metric-dimension-checkbox-group" aria-label="可添加的指标类型">
          <PerformanceCheckbox
            v-for="option in metricTypeOptions"
            :key="option.id"
            :model-value="form.metric_type_ids.includes(option.id)"
            :label="option.name"
            :disabled="saving"
            @update:model-value="toggleMetricType(option.id, $event)"
          />
          <span v-if="!metricTypeOptions.length" class="metric-dimension-empty">暂无可用指标类型</span>
        </div>
      </PerformanceFormItem>

      <div class="metric-dimension-switch-row metric-dimension-switch-row--spaced">
        <span>允许被评估人添加指标</span>
        <PerformanceSwitch v-model="form.allow_reviewee_add_metrics" :disabled="saving" aria-label="允许被评估人添加指标" />
      </div>
      <PerformanceMetricRevieweeSettings v-if="form.allow_reviewee_add_metrics" v-model="revieweeSettings" :disabled="saving" />

      <PerformanceFormItem label="各指标的评估规则" required :invalid="Boolean(reviewRuleError)" :error-message="reviewRuleError">
        <PerformanceRadioGroup
          v-model="form.review_rule_mode"
          name="metric-dimension-review-rule-mode"
          direction="vertical"
          class="metric-dimension-rule-group"
          :gap="16"
          aria-label="各指标的评估规则"
          :disabled="saving"
          :options="reviewRuleModeOptions"
          @update:model-value="reviewRuleError = ''"
        >
          <template #after-option="{ option }">
            <PerformanceAssessmentSelect
              v-if="option.value === 'same' && form.review_rule_mode === 'same'"
              v-model="reviewRuleValue"
              class="metric-dimension-review-rule-select"
              label="评估规则"
              placeholder="请选择评分或评级"
              :options="reviewRuleOptions"
              :disabled="saving"
              :invalid="Boolean(reviewRuleError)"
              empty-text="暂无可用评估规则"
            />
          </template>
        </PerformanceRadioGroup>
      </PerformanceFormItem>
      <p v-if="languageNotice" class="metric-dimension-notice" role="status">{{ languageNotice }}</p>
      <p v-if="errorMessage" class="metric-dimension-error" role="alert">{{ errorMessage }}</p>
    </form>
    <template #footer>
      <div class="metric-dimension-footer">
        <PerformanceButton variant="primary" :loading="saving" @click="submit">确定</PerformanceButton>
        <PerformanceButton variant="secondary" :disabled="saving" @click="close">取消</PerformanceButton>
      </div>
    </template>
  </PerformanceDialogShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { PerformanceMetricTemplateDimension } from '@/api/performance'
import type { PerformanceMetricType } from '@/api/performanceMetricTypes'
import type { PerformanceReviewRuleOption } from '@/api/performance'
import AddOutlinedIcon from './AddOutlinedIcon.vue'
import PerformanceAssessmentSelect, { type PerformanceAssessmentSelectOption } from './PerformanceAssessmentSelect.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceLocalizedInput from './PerformanceLocalizedInput.vue'
import PerformanceMetricRevieweeSettings, { type MetricRevieweeSettings } from './PerformanceMetricRevieweeSettings.vue'
import PerformanceRadioGroup, { type PerformanceRadioOption } from './PerformanceRadioGroup.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import PerformanceTextField from './PerformanceTextField.vue'

export type MetricDimensionDraft = Omit<PerformanceMetricTemplateDimension, 'id'> & { id?: string }

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode?: 'create' | 'edit'
  initialValue?: MetricDimensionDraft | null
  metricTypeOptions?: PerformanceMetricType[]
  reviewRuleOptions?: PerformanceReviewRuleOption[]
  saving?: boolean
  errorMessage?: string
}>(), {
  mode: 'create',
  initialValue: null,
  metricTypeOptions: () => [],
  reviewRuleOptions: () => [],
  saving: false,
  errorMessage: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: MetricDimensionDraft]
}>()

const open = computed({ get: () => props.modelValue, set: value => { if (!props.saving) emit('update:modelValue', value) } })
const form = reactive<MetricDimensionDraft>({
  name: '', description: '', need_weight: false, weight: null, metric_type_ids: [],
  allow_reviewee_add_metrics: false, reviewee_add_method: 'library_or_custom',
  reviewee_scoring_method: 'manual', reviewee_min_one_metric: true, review_rule_mode: 'same', review_rule_id: null,
})
const nameError = ref('')
const weightError = ref('')
const metricTypeError = ref('')
const reviewRuleError = ref('')
const languageNotice = ref('')
const revieweeSettings = computed<MetricRevieweeSettings>({
  get: () => ({
    reviewee_add_method: form.reviewee_add_method,
    reviewee_scoring_method: form.reviewee_scoring_method,
    reviewee_min_one_metric: form.reviewee_min_one_metric,
  }),
  set: value => {
    form.reviewee_add_method = value.reviewee_add_method
    form.reviewee_scoring_method = value.reviewee_scoring_method
    form.reviewee_min_one_metric = value.reviewee_min_one_metric
  },
})

const metricTypeOptions = computed(() => props.metricTypeOptions)
const reviewRuleOptions = computed<PerformanceAssessmentSelectOption[]>(() => props.reviewRuleOptions.map(rule => ({
  id: String(rule.id), label: rule.name, description: rule.review_type,
})))
const reviewRuleModeOptions: PerformanceRadioOption[] = [
  { value: 'same', label: '使用相同规则' },
  { value: 'different', label: '使用不同规则', showInfo: true },
]
const reviewRuleValue = computed({
  get: () => form.review_rule_id ? String(form.review_rule_id) : '',
  set: value => { form.review_rule_id = value ? Number(value) : null; reviewRuleError.value = '' },
})

function reset(value: MetricDimensionDraft | null = null) {
  form.id = value?.id
  form.name = value?.name || ''
  form.description = value?.description || ''
  form.need_weight = value?.need_weight || false
  form.weight = form.need_weight ? (value?.weight ?? null) : null
  form.metric_type_ids = value?.metric_type_ids?.slice() || []
  form.allow_reviewee_add_metrics = value?.allow_reviewee_add_metrics || false
  form.reviewee_add_method = value?.reviewee_add_method || 'library_or_custom'
  form.reviewee_scoring_method = value?.reviewee_scoring_method || 'manual'
  form.reviewee_min_one_metric = value?.reviewee_min_one_metric ?? true
  form.review_rule_mode = value?.review_rule_mode || 'same'
  form.review_rule_id = value?.review_rule_id || null
  nameError.value = ''
  weightError.value = ''
  metricTypeError.value = ''
  reviewRuleError.value = ''
  languageNotice.value = ''
}

function close() {
  if (props.saving) return
  open.value = false
  reset()
}

function setNeedWeight(enabled: boolean) {
  if (!enabled) form.weight = null
  weightError.value = ''
}

function updateWeight(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  form.weight = raw === '' ? null : Number(raw)
  weightError.value = ''
}

function toggleMetricType(id: number, checked: boolean) {
  if (checked && !form.metric_type_ids.includes(id)) form.metric_type_ids.push(id)
  if (!checked) form.metric_type_ids = form.metric_type_ids.filter(value => value !== id)
  metricTypeError.value = ''
}

function submit() {
  if (props.saving) return
  nameError.value = form.name.trim() ? '' : '请输入维度名称'
  weightError.value = !form.need_weight ? '' : form.weight === null ? '请输入维度权重' : !Number.isFinite(form.weight) || form.weight < 0 || form.weight > 100 ? '维度权重须在0到100之间' : ''
  metricTypeError.value = form.metric_type_ids.length ? '' : '请选择可添加的指标类型'
  reviewRuleError.value = form.review_rule_mode === 'same' && !form.review_rule_id ? '请选择评分或评级' : ''
  if (nameError.value || weightError.value || metricTypeError.value || reviewRuleError.value) return
  emit('confirm', {
    id: form.id || crypto.randomUUID(),
    name: form.name.trim(),
    description: form.description.trim(),
    need_weight: form.need_weight,
    weight: form.need_weight ? form.weight : null,
    metric_type_ids: form.metric_type_ids.slice(),
    allow_reviewee_add_metrics: form.allow_reviewee_add_metrics,
    reviewee_add_method: form.reviewee_add_method,
    reviewee_scoring_method: form.reviewee_scoring_method,
    reviewee_min_one_metric: form.reviewee_min_one_metric,
    review_rule_mode: form.review_rule_mode,
    review_rule_id: form.review_rule_mode === 'same' ? form.review_rule_id : null,
  })
}

watch(() => props.modelValue, value => { if (value) reset(props.initialValue) }, { immediate: true })
watch(() => props.initialValue, value => { if (props.modelValue && props.mode === 'edit') reset(value) }, { deep: true })
</script>

<style scoped>
#metric-dimension-create-form { margin: 0; }
.metric-dimension-textarea-wrap { position: relative; }
.metric-dimension-textarea-wrap :deep(.native-textarea) { height: 98px; min-height: 98px; resize: vertical; overflow: auto; }
.metric-dimension-language { position: absolute; right: 9px; bottom: 9px; padding: 0 6px; border-radius: var(--radius-sm); background: var(--performance-workbench-editor-language-tag-bg); color: var(--performance-workbench-editor-language-tag-color); font-size: var(--font-size-xs); line-height: 20px; }
.metric-dimension-language-button { margin-top: var(--spacing-2); }
.metric-dimension-switch-row { display: flex; align-items: center; gap: var(--spacing-2); margin-bottom: var(--spacing-5); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: var(--performance-input-line-height); }
.metric-dimension-switch-row--spaced { margin-top: var(--spacing-2); }
.metric-dimension-weight { display: flex; width: 184px; height: var(--performance-control-height); max-width: 100%; }
.metric-dimension-weight input { width: 150px; min-width: 0; padding: var(--spacing-1) var(--performance-input-padding-x); border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius) 0 0 var(--performance-control-radius); outline: 0; color: var(--color-text-primary); background: var(--color-bg-card); font: 400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); appearance: textfield; }
.metric-dimension-weight input::-webkit-inner-spin-button, .metric-dimension-weight input::-webkit-outer-spin-button { appearance: none; margin: 0; }
.metric-dimension-weight input:focus { border-color: var(--performance-field-border-focus); box-shadow: var(--performance-field-focus-ring); }
.metric-dimension-weight input[aria-invalid="true"] { border-color: var(--performance-field-border-invalid); box-shadow: none; }
.metric-dimension-weight input:disabled { background: var(--performance-field-disabled-background); cursor: not-allowed; }
.metric-dimension-weight span { display: flex; align-items: center; justify-content: center; width: 34px; flex: 0 0 34px; box-sizing: border-box; border: 1px solid var(--performance-field-border); border-left: 0; border-radius: 0 var(--performance-control-radius) var(--performance-control-radius) 0; color: var(--color-text-primary); background: var(--color-surface-disabled); }
.metric-dimension-checkbox-group { display: flex; flex-wrap: wrap; column-gap: var(--spacing-6); row-gap: var(--spacing-2); }
.metric-dimension-checkbox-group :deep(.performance-checkbox) { width: auto; }
.metric-dimension-empty { color: var(--color-text-placeholder); font-size: var(--font-size-sm); line-height: var(--performance-input-line-height); }
.metric-dimension-rule-group { width: 100%; }
.metric-dimension-review-rule-select { width: calc(100% - var(--performance-dialog-padding)); margin-left: var(--performance-dialog-padding); }
.metric-dimension-notice, .metric-dimension-error { margin: var(--spacing-2) 0 0; font-size: var(--font-size-sm); line-height: var(--performance-input-line-height); }
.metric-dimension-notice { color: var(--color-text-secondary); }
.metric-dimension-error { color: var(--performance-field-error-color); }
.metric-dimension-footer { display: flex; flex-direction: row-reverse; gap: var(--spacing-3); }
</style>
