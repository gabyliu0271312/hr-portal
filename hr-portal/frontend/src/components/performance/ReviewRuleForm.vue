<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import AsteriskOutlinedIcon from './AsteriskOutlinedIcon.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceSwitch from './PerformanceSwitch.vue'
import ReviewTypeRadioGroup from './ReviewTypeRadioGroup.vue'
import LevelConfigEditor from './LevelConfigEditor.vue'
import InfoOutlinedIcon from './InfoOutlinedIcon.vue'
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue'
import PerformanceTextField from './PerformanceTextField.vue'
import ScoreConfig from './ScoreConfig.vue'
import ScoreMappingConfig from './ScoreMappingConfig.vue'
import type { FixedScoreError } from './fixedScoreValidation'
import { getFixedScoreErrors } from './fixedScoreValidation'

export type ReviewRuleType = '评级' | '评分' | '评分映射等级型'

export interface ReviewRuleLevel {
  id?: string
  color: string
  code: string
  name: string
  quantifiedScore: string
  value: string
}

export interface ReviewRuleInterval {
  lower: string
  upper: string
  code: string
  name: string
}

export interface ReviewRuleFormValue {
  languages: { chinese: boolean; english: boolean }
  name: string
  reviewType: ReviewRuleType
  gradeParticipatesInCalculation: boolean
  levels: ReviewRuleLevel[]
  score: { method: string; min: string; max: string; precision: string; fixedOptions: Array<{ id: string; value: string }> }
  mapping: { method: string; min: string; max: string; rule: string; intervals: ReviewRuleInterval[]; precision: string }
  remark: string
}

export type ReviewRulePreviewPayload = Readonly<ReviewRuleFormValue>

interface ReviewRulePreviewErrors {
  name: boolean
  gradeCodes: boolean[]
  levelCount: boolean
  quantifiedScores: boolean[]
  scoreBounds: boolean
  fixedOptions: Array<FixedScoreError | undefined>
  mappingBounds: boolean
  mappingIntervals: boolean[]
  mappingCodes: boolean[]
}

const props = withDefaults(defineProps<{
  mode: 'create' | 'edit'
  isUsed?: boolean
  modelValue?: Partial<ReviewRuleFormValue>
}>(), {
  isUsed: false,
  modelValue: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: ReviewRuleFormValue]
  submit: [value: ReviewRuleFormValue]
  preview: [value: ReviewRuleFormValue]
  cancel: []
}>()

const form = reactive<ReviewRuleFormValue>({
  languages: { chinese: true, english: false },
  name: '',
  reviewType: '评级',
  gradeParticipatesInCalculation: false,
  levels: [
    { id: 'review-level-1', color: 'rgb(251, 191, 188)', code: '', name: '', quantifiedScore: '', value: '' },
    { id: 'review-level-2', color: 'rgb(254, 212, 164)', code: '', name: '', quantifiedScore: '', value: '' },
    { id: 'review-level-3', color: 'rgb(248, 230, 171)', code: '', name: '', quantifiedScore: '', value: '' },
  ],
  score: {
    method: '在分数上下限内输入评分',
    min: '',
    max: '',
    precision: '不保留小数',
    fixedOptions: [{ id: 'fixed-score-1', value: '' }, { id: 'fixed-score-2', value: '' }],
  },
  mapping: {
    method: '在分数上下限内输入评分',
    min: '',
    max: '',
    rule: 'a ≤ 分数 < b',
    intervals: [
      { lower: '', upper: '', code: '', name: '' },
      { lower: '', upper: '', code: '', name: '' },
    ],
    precision: '不保留小数',
  },
  remark: '',
})

const submitted = ref(false)
const previewRequested = ref(false)
const usedEdit = computed(() => props.mode === 'edit' && props.isUsed)
const validationActive = computed(() => submitted.value || previewRequested.value)
const nameError = computed(() => validationActive.value && !form.name.trim())
const gradeCodeErrors = computed(() => form.reviewType === '评级' && validationActive.value
  ? form.levels.map((level) => !level.code.trim())
  : form.levels.map(() => false))
const gradeLevelCountError = computed(() => form.reviewType === '评级' && previewRequested.value && form.levels.length < 2)
const quantifiedScoreErrors = computed(() => form.reviewType === '评级' && form.gradeParticipatesInCalculation && validationActive.value
  ? form.levels.map((level) => String(level.quantifiedScore ?? '').trim() === '')
  : form.levels.map(() => false))
const scoreBoundsError = computed(() => form.reviewType === '评分' && previewRequested.value
  && form.score.method === '在分数上下限内输入评分'
  && !validBounds(form.score.min, form.score.max))
const fixedScoreValidationErrors = computed(() => form.reviewType === '评分'
  && form.score.method === '在固定分值选项内选择评分'
  ? getFixedScoreErrors(form.score.fixedOptions || [])
  : (form.score.fixedOptions || []).map(() => undefined))
const fixedOptionErrors = computed(() => validationActive.value
  ? fixedScoreValidationErrors.value
  : fixedScoreValidationErrors.value.map(() => undefined))
const mappingBoundsError = computed(() => form.reviewType === '评分映射等级型' && previewRequested.value
  && !validBounds(form.mapping.min, form.mapping.max))
const mappingCodeErrors = computed(() => form.reviewType === '评分映射等级型' && previewRequested.value
  ? form.mapping.intervals.map((interval) => !interval.code.trim())
  : form.mapping.intervals.map(() => false))
const mappingIntervalErrors = computed(() => {
  if (form.reviewType !== '评分映射等级型' || !previewRequested.value) return form.mapping.intervals.map(() => false)
  const minimum = Number(form.mapping.min)
  const maximum = Number(form.mapping.max)
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum) return form.mapping.intervals.map(() => true)
  return form.mapping.intervals.map((interval, index) => {
    const lower = index === 0 ? minimum : Number(form.mapping.intervals[index - 1].upper)
    const upper = index === form.mapping.intervals.length - 1 ? maximum : Number(interval.upper)
    return !Number.isFinite(lower) || !Number.isFinite(upper) || lower < minimum || upper > maximum || upper <= lower
  })
})
const previewErrors = computed<ReviewRulePreviewErrors>(() => ({
  name: nameError.value,
  gradeCodes: gradeCodeErrors.value,
  levelCount: gradeLevelCountError.value,
  quantifiedScores: quantifiedScoreErrors.value,
  scoreBounds: scoreBoundsError.value,
  fixedOptions: fixedOptionErrors.value,
  mappingBounds: mappingBoundsError.value,
  mappingIntervals: mappingIntervalErrors.value,
  mappingCodes: mappingCodeErrors.value,
}))

watch(() => props.modelValue, (value) => {
  if (!value) return
  Object.assign(form, value)
  if (value.languages) form.languages = { ...form.languages, ...value.languages }
  if (value.levels) form.levels = value.levels.map((level, index) => ({ ...level, id: level.id ?? `review-level-${index + 1}`, quantifiedScore: level.quantifiedScore ?? '' }))
  if (value.score) form.score = { ...form.score, ...value.score }
  if (value.mapping) {
    form.mapping = { ...form.mapping, ...value.mapping }
    if (value.mapping.intervals) form.mapping.intervals = value.mapping.intervals.map((interval) => ({ ...interval }))
  }
}, { immediate: true, deep: true })

function validBounds(minimum: string, maximum: string) {
  if (String(minimum).trim() === '' || String(maximum).trim() === '') return false
  const minValue = Number(minimum)
  const maxValue = Number(maximum)
  return Number.isFinite(minValue) && Number.isFinite(maxValue) && maxValue > minValue
}

function emitValue() {
  emit('update:modelValue', JSON.parse(JSON.stringify(form)))
}

function updateReviewType(value: string) {
  form.reviewType = value as ReviewRuleType
  previewRequested.value = false
  emitValue()
}

function submit() {
  submitted.value = true
  if (nameError.value || gradeCodeErrors.value.some(Boolean) || quantifiedScoreErrors.value.some(Boolean) || fixedScoreValidationErrors.value.some(Boolean)) return
  emit('submit', JSON.parse(JSON.stringify(form)))
}

function preview() {
  previewRequested.value = true
  const errors = previewErrors.value
  const invalid = errors.name
    || errors.gradeCodes.some(Boolean)
    || errors.levelCount
    || errors.quantifiedScores.some(Boolean)
    || errors.scoreBounds
    || errors.fixedOptions.some(Boolean)
    || errors.mappingBounds
    || errors.mappingIntervals.some(Boolean)
    || errors.mappingCodes.some(Boolean)
  if (invalid) return
  emit('preview', JSON.parse(JSON.stringify(form)) as ReviewRulePreviewPayload)
}

defineExpose({ submit, preview, form })
</script>

<template>
  <div class="review-rule-form-surface">
    <form class="review-rule-form" novalidate @submit.prevent="submit">
    <section class="form-card basic-info-card">
      <h2>基本信息</h2>
      <div class="form-row">
        <div class="field-label"><PerformanceRequiredLabel label="语言" /></div>
        <div class="field-control language-control">
          <PerformanceCheckbox v-model="form.languages.chinese" label="中文" disabled @update:model-value="emitValue" />
          <PerformanceCheckbox v-model="form.languages.english" label="英文" :disabled="usedEdit" @update:model-value="emitValue" />
        </div>
      </div>
      <div class="form-row">
        <div class="field-label"><PerformanceRequiredLabel label="名称" /></div>
        <div class="field-control">
          <input v-model="form.name" class="native-input" :class="{ error: nameError }" placeholder="请输入名称" @input="emitValue" />
          <span v-if="nameError" class="error-text">名称为必填</span>
        </div>
      </div>
      <div class="form-row type-row">
        <div class="field-label"><PerformanceRequiredLabel label="评估类型" /></div>
        <div class="field-control">
          <ReviewTypeRadioGroup :model-value="form.reviewType" :disabled="usedEdit" @update:model-value="updateReviewType" />
        </div>
      </div>
    </section>

    <section class="form-card config-card">
      <div v-if="form.reviewType === '评级'" class="rating-config" aria-label="评级设置">
        <h2>评级设置</h2>
        <div class="rating-switch-row">
          <span class="strong-label">评级可参与计算</span>
          <PerformanceSwitch v-model="form.gradeParticipatesInCalculation" aria-label="评级可参与计算" :disabled="usedEdit" @update:model-value="emitValue" />
        </div>
        <p class="helper-text">开启后，等级需配置量化分，使用该评估规则的评估题以量化分参与计算。</p>
        <div class="rating-preview" aria-label="配置等级">
          <h3>配置等级</h3>
          <div class="info-banner"><InfoOutlinedIcon class="info-banner-icon" />请将各等级按「代号 - 名称」的格式配置，例如：D - 不及格、C - 略低于预期；并按最差到最好的顺序从上向下排列。</div>
          <div class="level-header" :class="{ quantified: form.gradeParticipatesInCalculation }">
            <span class="level-header-handle" aria-hidden="true"></span>
            <div class="level-header-content" :class="{ quantified: form.gradeParticipatesInCalculation }">
              <span aria-hidden="true"></span>
              <PerformanceRequiredLabel label="颜色与等级" />
              <span>名称</span>
              <span v-if="form.gradeParticipatesInCalculation" class="quantified-score-header"><span>量化分</span><AsteriskOutlinedIcon /><InfoOutlinedIcon /></span>
              <span class="value-header"><span>量化值</span><InfoOutlinedIcon class="value-info-icon" /></span>
            </div>
            <span class="level-header-delete" aria-hidden="true"></span>
          </div>
          <LevelConfigEditor v-model:levels="form.levels" :quantified="form.gradeParticipatesInCalculation" :structure-locked="usedEdit" :quantified-score-disabled="usedEdit" :errors="gradeCodeErrors" :quantified-errors="quantifiedScoreErrors" :minimum-error="gradeLevelCountError" />
        </div>
      </div>
      <ScoreConfig v-else-if="form.reviewType === '评分'" v-model="form.score" :disabled="usedEdit" :errors="{ bounds: scoreBoundsError, fixedOptions: fixedOptionErrors }" @update:model-value="emitValue" />
      <ScoreMappingConfig v-else v-model="form.mapping" :bounds-disabled="usedEdit" :structure-locked="usedEdit" :errors="{ bounds: mappingBoundsError, intervalBounds: mappingIntervalErrors, intervalCodes: mappingCodeErrors }" @update:model-value="emitValue" />
    </section>

    <section class="form-card remark-card">
      <h2>备注信息</h2>
      <div class="form-row">
        <div class="field-label">备注</div>
        <div class="field-control textarea-wrap">
          <PerformanceTextField v-model="form.remark" type="textarea" :maxlength="2000" show-count :disabled="usedEdit" placeholder="将用于帮助管理员理解评估规则，仅展示在飞书绩效管理后台" @update:model-value="emitValue" />
        </div>
      </div>
    </section>
    </form>
  </div>
</template>

<style scoped>
.review-rule-form-surface { width: 100%; min-height: 100%; padding: 20px 0 48px; box-sizing: border-box; background: #f2f3f5; }
.review-rule-form { width: var(--performance-form-surface-width); margin: 0 auto; color: #1f2329; }
.form-card { width: var(--performance-form-surface-width); margin: 0 0 16px; padding: 20px 20px 0; box-sizing: border-box; border: 0.666667px solid rgba(0, 0, 0, 0); border-radius: 8px; background: #fff; box-shadow: 0 1px 4px rgba(31, 35, 41, 0.05); }
.form-card h2 { margin: 0 0 16px; font-size: 16px; font-weight: 600; line-height: 24px; }
.form-row { display: block; margin-bottom: 20px; }
.type-row { margin-bottom: 20px; }
.field-label { min-height: 22px; margin-bottom: 8px; font-size: 14px; font-weight: 600; line-height: 22px; }
.field-control { min-width: 0; }
.language-control { display: flex; align-items: center; gap: 24px; }
.language-control :deep(.performance-checkbox) { width: auto; }
.native-input { width: 100%; height: 32px; padding: 4px 11px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; outline: none; color: #1f2329; font: 400 14px/22px inherit; }
.native-input:focus { border-color: #1456f0; }
.native-input.error { border-color: #f54a45; }
.native-textarea { display: block; width: 100%; height: auto; min-height: 49px; padding: 4px 11px 22px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; outline: none; field-sizing: content; resize: none; overflow-y: hidden; color: #1f2329; font: 400 14px/22px inherit; }
.native-textarea:focus { border-color: #1456f0; }
.native-textarea:disabled { background: #f5f6f7; color: #8f959e; cursor: not-allowed; }
.textarea-wrap { position: relative; }
.count { position: absolute; right: 8px; bottom: 8px; padding: 0 4px; border-radius: 4px; background: #eff0f1; color: #646a73; font-size: 10px; line-height: 16px; }
.error-text { display: block; margin-top: 4px; color: #f54a45; font-size: 12px; line-height: 18px; }
.rating-switch-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.strong-label { font-size: 14px; font-weight: 600; line-height: 22px; }
.helper-text { margin: 0 0 12px; color: #646a73; font-size: 14px; line-height: 22px; }
.rating-preview { margin-bottom: 20px; }
.rating-preview h3 { margin: 0 0 4px; font-size: 14px; font-weight: 600; line-height: 22px; }
.info-banner { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 8px; padding: 8px 12px; border-radius: 6px; background: #eef2ff; color: #1f2329; font-size: 14px; line-height: 22px; }
.info-banner-icon { flex: 0 0 16px; width: 16px; height: 16px; margin-top: 3px; color: #3370ff; }
.value-info-icon { display: block; flex: 0 0 16px; width: 16px; height: 16px; color: #646a73; }
.level-header { display: flex; align-items: center; width: 100%; height: 30px; margin-bottom: 0; color: #646a73; font-size: 14px; line-height: 22px; }
.level-header-handle { flex: 0 0 16px; width: 16px; height: 30px; margin-right: 4px; }
.level-header-content { display: grid; min-width: 0; flex: 1 1 auto; grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr) 135px; gap: 8px; align-items: center; }
.level-header-content.quantified { grid-template-columns: 24px minmax(0, 1fr) minmax(0, 1fr) 112px 112px; }
.level-header-delete { flex: 0 0 24px; width: 24px; height: 24px; margin-left: 4px; }
.quantified-score-header, .value-header { display: inline-flex; min-width: 0; align-items: center; gap: 4px; white-space: nowrap; }
.quantified-score-header :deep([data-icon="AsteriskOutlined"]) { flex: 0 0 8px; width: 8px; height: 8px; color: #f54a45; }
.quantified-score-header :deep([data-icon="InfoOutlined"]), .value-header :deep([data-icon="InfoOutlined"]) { flex: 0 0 16px; width: 16px; height: 16px; color: #646a73; }
</style>
