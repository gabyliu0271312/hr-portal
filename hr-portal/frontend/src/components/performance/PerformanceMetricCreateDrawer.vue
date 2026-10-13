<template>
  <PerformanceDrawerShell
    v-model="open"
    :title="mode === 'edit' ? '编辑指标' : '新建指标'"
    aria-label="新建指标"
    width="536px"
    variant="captured"
    @close="cancel"
  >
    <div class="performance-metric-form" aria-label="指标表单">
      <section class="metric-form-section" aria-labelledby="metric-type-title">
        <div class="metric-section-heading"><span class="metric-section-heading__bar" aria-hidden="true"></span><h3 id="metric-type-title">指标类型</h3></div>
        <PerformanceMetricSelect v-model="draft.metricType" ariaLabel="指标类型" :options="metricTypeOptions" />
      </section>

      <section class="metric-form-section" aria-labelledby="metric-settings-title">
        <div class="metric-section-heading"><span class="metric-section-heading__bar" aria-hidden="true"></span><h3 id="metric-settings-title">指标设置</h3></div>
        <p class="metric-form-help">可设定各字段的预置内容及填写权限，供各成员在后续添加指标时直接选用。选用后，成员对各字段进行内容修改时，不影响指标库中的内容。</p>
        <div class="metric-form-fields">
          <div class="metric-field-label"><svg class="metric-field-label__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.437 4.898 5.447 13h6.063L8.437 4.898Zm6.025 15.881L12.269 15h-7.56l-2.131 5.78a1 1 0 1 1-1.873-.703L7.02 2.982c.491-1.31 2.344-1.31 2.835 0l6.48 17.095a1 1 0 1 1-1.872.702ZM15.056 5a1 1 0 1 0 0 2H23a1 1 0 1 0 0-2h-7.944Zm1.055 7a1 1 0 0 1 1-1H23a1 1 0 1 1 0 2h-5.89a1 1 0 1 1 0-2Zm3.056 5a1 1 0 1 0 0 2H23a1 1 0 0 0 0-2h-3.833Z" fill="currentColor" /></svg><span>指标</span><span class="metric-field-label__required" aria-hidden="true">*</span></div>
          <PerformanceTextField v-model="draft.metric" aria-label="指标" :invalid="Boolean(errors.metric)" @update:model-value="clearError('metric')" />
          <span v-if="errors.metric" class="field-error">{{ errors.metric }}</span>

          <div class="metric-field-label"><svg class="metric-field-label__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17.841 2.799a1 1 0 0 1 1.598 1.203l-13.24 17.57a1 1 0 0 1-1.597-1.203l13.24-17.57ZM7.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-2a2 2 0 1 1 0-4 2 2 0 0 1 0 4ZM21 17.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm-2 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z" fill="currentColor" /></svg><span>权重</span></div>
          <div class="metric-input-addon"><input v-model="draft.weight" class="metric-native-input" type="text" inputmode="decimal" aria-label="权重" @input="clearError('weight')" /><span class="metric-input-addon__suffix">%</span></div>
          <span v-if="errors.weight" class="field-error">{{ errors.weight }}</span>

          <div class="metric-field-label"><svg class="metric-field-label__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.437 4.898 5.447 13h6.063L8.437 4.898Zm6.025 15.881L12.269 15h-7.56l-2.131 5.78a1 1 0 1 1-1.873-.703L7.02 2.982c.491-1.31 2.344-1.31 2.835 0l6.48 17.095a1 1 0 1 1-1.872.702ZM15.056 5a1 1 0 1 0 0 2H23a1 1 0 1 0 0-2h-7.944Zm1.055 7a1 1 0 0 1 1-1H23a1 1 0 1 1 0 2h-5.89a1 1 0 1 1 0-2Zm3.056 5a1 1 0 1 0 0 2H23a1 1 0 0 0 0-2h-3.833Z" fill="currentColor" /></svg><span>指标单位</span></div>
          <PerformanceTextField v-model="draft.unit" aria-label="指标单位" />

          <div class="metric-field-label"><svg class="metric-field-label__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.774 2.14a1 1 0 0 1 .85 1.129L9.242 6h6.98l.423-3.01a1 1 0 1 1 1.98.279L18.242 6H22a1 1 0 1 1 0 2h-4.04l-.984 7H20a1 1 0 1 1 0 2h-3.305l-.575 4.093a1 1 0 1 1-1.98-.278L14.674 17h-6.98l-.575 4.093a1 1 0 1 1-1.98-.278L5.674 17H2a1 1 0 1 1 0-2h3.956l.984-7H4a1 1 0 1 1 0-2h3.221l.423-3.01a1 1 0 0 1 1.13-.85ZM14.956 15l.984-7H8.96l-.984 7h6.98Z" fill="currentColor" /></svg><span>目标值</span><span class="metric-field-label__required" aria-hidden="true">*</span></div>
          <PerformanceMetricSelect v-model="draft.targetWriteMode" ariaLabel="目标值" :options="writeModeOptions" :invalid="Boolean(errors.targetWriteMode)" />
          <span v-if="errors.targetWriteMode" class="field-error">{{ errors.targetWriteMode }}</span>

          <div class="metric-field-label"><svg class="metric-field-label__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8.774 2.14a1 1 0 0 1 .85 1.129L9.242 6h6.98l.423-3.01a1 1 0 1 1 1.98.279L18.242 6H22a1 1 0 1 1 0 2h-4.04l-.984 7H20a1 1 0 1 1 0 2h-3.305l-.575 4.093a1 1 0 1 1-1.98-.278L14.674 17h-6.98l-.575 4.093a1 1 0 1 1-1.98-.278L5.674 17H2a1 1 0 1 1 0-2h3.956l.984-7H4a1 1 0 1 1 0-2h3.221l.423-3.01a1 1 0 0 1 1.13-.85ZM14.956 15l.984-7H8.96l-.984 7h6.98Z" fill="currentColor" /></svg><span>完成值</span><span class="metric-field-label__required" aria-hidden="true">*</span></div>
          <PerformanceMetricSelect v-model="draft.completionWriteMode" ariaLabel="完成值" :options="writeModeOptions" :invalid="Boolean(errors.completionWriteMode)" />
          <span v-if="errors.completionWriteMode" class="field-error">{{ errors.completionWriteMode }}</span>

          <div class="metric-field-label"><svg class="metric-field-label__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 6.5C11 4.011 13.028 2 15.51 2 17.98 2 20 4.002 20 6.48v.02a1 1 0 1 1-2 0v-.02A2.489 2.489 0 0 0 15.51 4 2.508 2.508 0 0 0 13 6.5V10h4a1 1 0 1 1 0 2h-4v5.5c0 2.489-2.028 4.5-4.51 4.5A4.489 4.489 0 0 1 4 17.52v-.02a1 1 0 1 1 2 0v.02A2.489 2.489 0 0 0 8.49 20 2.508 2.508 0 0 0 11 17.5V12H8a1 1 0 1 1 0-2h3V6.5Z" fill="currentColor" /></svg><span>评分方式</span><span class="metric-field-label__required" aria-hidden="true">*</span></div>
          <PerformanceMetricSelect v-model="draft.scoringMethod" ariaLabel="评分方式" placeholder="请选择" :options="scoringMethodOptions" :invalid="Boolean(errors.scoringMethod)" />
          <span v-if="errors.scoringMethod" class="field-error">{{ errors.scoringMethod }}</span>
        </div>
      </section>

      <section class="metric-form-section" aria-labelledby="metric-tags-title">
        <div class="metric-section-heading"><span class="metric-section-heading__bar" aria-hidden="true"></span><h3 id="metric-tags-title">标签</h3></div>
        <p class="metric-form-help">可为指标添加多个标签，在制定指标时，可以通过标签信息筛选合适的指标。</p>
        <div class="metric-tags-control" :class="{ 'is-focused': tagInputFocused }" @click="focusTagInput">
          <span v-for="tag in draft.tags" :key="tag" class="metric-tag">{{ tag }}<button type="button" :aria-label="`移除${tag}`" @click.stop="removeTag(tag)">×</button></span>
          <input ref="tagInputRef" v-model="tagInput" class="metric-tags-control__input" type="text" aria-label="标签" placeholder="请选择" @focus="tagInputFocused = true" @blur="tagInputFocused = false" @keydown.enter.prevent="addTag" />
          <svg class="metric-tags-control__arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0-1.414-1.414l-7.071 7.071-7.071-7.071a1 1 0 0 0-1.414 0Z" fill="currentColor" /></svg>
        </div>
      </section>

      <section class="metric-form-section" aria-labelledby="metric-range-title">
        <div class="metric-section-heading"><span class="metric-section-heading__bar" aria-hidden="true"></span><h3 id="metric-range-title">可用范围</h3></div>
        <PerformanceRadioGroup v-model="draft.usableRange" name="metric-usable-range" direction="vertical" aria-label="可用范围" :options="usableRangeOptions" :gap="8" />
        <span v-if="errors.usableRange" class="field-error">{{ errors.usableRange }}</span>
      </section>
    </div>

    <template #footer>
      <PerformanceDrawerFooter variant="captured" continue-text="确定并继续添加" @confirm="submit('confirm')" @continue="submit('continue')" @cancel="cancel" />
    </template>
  </PerformanceDrawerShell>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import PerformanceDrawerFooter from './PerformanceDrawerFooter.vue'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import PerformanceMetricSelect, { type PerformanceMetricSelectOption } from './PerformanceMetricSelect.vue'
import PerformanceRadioGroup, { type PerformanceRadioOption } from './PerformanceRadioGroup.vue'
import PerformanceTextField from './PerformanceTextField.vue'

export interface PerformanceMetricDraft {
  metricType: string
  metric: string
  weight: string
  unit: string
  targetWriteMode: string
  completionWriteMode: string
  scoringMethod: string
  tags: string[]
  usableRange: string
}

type ErrorKey = keyof Omit<PerformanceMetricDraft, 'tags' | 'metricType'>
type MetricErrors = Partial<Record<ErrorKey, string>>

const props = withDefaults(defineProps<{
  modelValue: boolean
  mode?: 'create' | 'edit'
  initialValue?: Partial<PerformanceMetricDraft> | null
  metricTypeOptions?: PerformanceMetricSelectOption[]
  writeModeOptions?: PerformanceMetricSelectOption[]
  scoringMethodOptions?: PerformanceMetricSelectOption[]
  usableRangeOptions?: PerformanceRadioOption[]
}>(), {
  mode: 'create',
  initialValue: null,
  metricTypeOptions: () => [{ value: 'quantitative', label: '定量指标' }],
  writeModeOptions: () => [{ value: 'assessed', label: '被评估人填写' }],
  scoringMethodOptions: () => [],
  usableRangeOptions: () => [{ value: 'all', label: '允许管理员下发及被评估人选用指标' }, { value: 'admin', label: '仅允许管理员下发指标' }],
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: [value: PerformanceMetricDraft]
  continue: [value: PerformanceMetricDraft]
  cancel: []
}>()

const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const draft = ref<PerformanceMetricDraft>(createDraft())
const errors = reactive<MetricErrors>({})
const tagInput = ref('')
const tagInputFocused = ref(false)
const tagInputRef = ref<HTMLInputElement | null>(null)

function createDraft(value?: Partial<PerformanceMetricDraft> | null): PerformanceMetricDraft {
  return {
    metricType: value?.metricType || props.metricTypeOptions[0]?.value || '', metric: value?.metric || '', weight: value?.weight || '', unit: value?.unit || '',
    targetWriteMode: value?.targetWriteMode || props.writeModeOptions[0]?.value || '', completionWriteMode: value?.completionWriteMode || props.writeModeOptions[0]?.value || '', scoringMethod: value?.scoringMethod || '', tags: [...(value?.tags || [])], usableRange: value?.usableRange || props.usableRangeOptions[0]?.value || '',
  }
}
function clearErrors() { Object.keys(errors).forEach(key => delete errors[key as ErrorKey]) }
function clearError(key: ErrorKey) { delete errors[key] }
function validate() {
  clearErrors()
  if (!draft.value.metric.trim()) errors.metric = '请输入指标名称'
  if (!draft.value.targetWriteMode) errors.targetWriteMode = '请选择目标值填写方式'
  if (!draft.value.completionWriteMode) errors.completionWriteMode = '请选择完成值填写方式'
  if (!draft.value.scoringMethod) errors.scoringMethod = '请选择评分方式'
  if (!draft.value.usableRange) errors.usableRange = '请选择可用范围'
  return !Object.keys(errors).length
}
function payload() { return { ...draft.value, tags: [...draft.value.tags] } }
function submit(action: 'confirm' | 'continue') {
  if (!validate()) return
  if (action === 'continue') {
    emit('continue', payload())
    draft.value = createDraft()
    tagInput.value = ''
    void nextTick(() => tagInputRef.value?.focus())
  } else {
    emit('confirm', payload())
    open.value = false
  }
}
function cancel() { emit('cancel'); open.value = false }
function addTag() { const tag = tagInput.value.trim(); if (!tag || draft.value.tags.includes(tag)) return; draft.value.tags.push(tag); tagInput.value = '' }
function removeTag(tag: string) { draft.value.tags = draft.value.tags.filter(item => item !== tag) }
function focusTagInput() { tagInputRef.value?.focus() }
watch(() => props.modelValue, value => { if (value) { draft.value = createDraft(props.initialValue); tagInput.value = ''; clearErrors() } })
</script>

<style scoped>
.performance-metric-form { display: flex; flex-direction: column; gap: var(--spacing-7); min-width: 0; color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--line-height-base) var(--font-sans); }
.metric-form-section { display: flex; flex-direction: column; gap: var(--spacing-3); min-width: 0; }
.metric-section-heading { display: flex; align-items: center; gap: var(--spacing-2); min-height: 24px; }
.metric-section-heading__bar { width: 4px; height: 24px; flex: 0 0 4px; border-radius: var(--radius-xs); background: var(--color-primary); }
.metric-section-heading h3 { margin: 0; color: var(--color-text-primary); font-size: var(--font-size-lg); font-weight: 600; line-height: 24px; }
.metric-form-help { margin: -4px 0 0; color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: 21px; }
.metric-form-fields { display: flex; flex-direction: column; gap: var(--spacing-2); min-width: 0; }
.metric-field-label { display: flex; align-items: center; min-height: 22px; margin-top: var(--spacing-1); color: var(--color-text-primary); font-weight: 600; line-height: 22px; }
.metric-field-label__icon { flex: 0 0 14px; margin-right: var(--spacing-1); color: var(--color-text-primary); }
.metric-field-label__required { margin-left: var(--performance-required-mark-gap); color: var(--performance-field-error-color); font-family: SimSun, sans-serif; font-weight: 400; }
.metric-input-addon { display: flex; align-items: stretch; width: 100%; height: var(--performance-input-height); box-sizing: border-box; border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); background: var(--color-bg-card); overflow: hidden; transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard); }
.metric-input-addon:focus-within { border-color: var(--performance-field-border-focus); box-shadow: var(--performance-field-focus-ring); }
.metric-native-input { min-width: 0; flex: 1; height: 100%; padding: var(--performance-input-padding-y) var(--performance-input-padding-x); box-sizing: border-box; border: 0; outline: 0; background: transparent; color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); }
.metric-input-addon__suffix { display: flex; align-items: center; padding: 0 var(--performance-input-padding-x); border-left: 1px solid var(--performance-field-border); background: var(--color-surface-disabled); color: var(--color-text-secondary); line-height: var(--performance-input-height); }
.field-error { display: block; margin-top: -4px; color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
.metric-tags-control { display: flex; flex-wrap: wrap; align-items: center; min-height: var(--performance-input-height); max-height: 188px; overflow: auto; padding: 1px var(--performance-input-padding-x); box-sizing: border-box; border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); background: var(--color-bg-card); transition: border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard); cursor: text; }
.metric-tags-control.is-focused { border-color: var(--performance-field-border-focus); box-shadow: var(--performance-field-focus-ring); }
.metric-tag { display: inline-flex; align-items: center; max-width: 100%; height: 24px; margin: 2px var(--spacing-1) 2px 0; padding: 0 var(--spacing-2); box-sizing: border-box; border-radius: var(--radius-sm); background: var(--color-surface-disabled); color: var(--color-text-primary); line-height: 22px; white-space: nowrap; }
.metric-tag button { margin-left: var(--spacing-1); padding: 0; border: 0; background: transparent; color: var(--color-text-secondary); font-size: var(--font-size-lg); line-height: 16px; cursor: pointer; }
.metric-tags-control__input { min-width: 48px; flex: 1; height: 28px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); }
.metric-tags-control__input::placeholder { color: var(--color-text-placeholder); }
.metric-tags-control__arrow { flex: 0 0 12px; margin-left: var(--spacing-2); color: var(--color-text-secondary); }
:deep(.performance-radio-group) { width: 100%; }
:deep(.performance-radio-option) { height: 22px; }
@media (max-width: 560px) { .performance-metric-form { gap: var(--spacing-6); } }
</style>
