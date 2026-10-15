<template>
  <PerformanceDrawerShell
    v-model="open"
    title="添加需对比的环节"
    width="680px"
    variant="captured"
    body-class="performance-comparison-rule-drawer__body"
    @close="cancel"
  >
    <form class="comparison-rule-form" novalidate @submit.prevent="submit">
      <section class="comparison-rule-section" aria-labelledby="comparison-stages-title">
        <h3 id="comparison-stages-title" class="comparison-rule-section__title">需对比的评估环节</h3>
        <div class="comparison-stage-row">
          <PerformanceAssessmentSelect
            v-model="draft.firstStageId"
            label=""
            aria-label="第一个评估环节"
            placeholder="请选择评估环节"
            :options="stageOptions"
            :invalid="submitted && !draft.firstStageId"
            empty-text="暂无可选评估环节"
          />
          <span class="comparison-stage-row__operator">与</span>
          <PerformanceAssessmentSelect
            v-model="draft.secondStageId"
            label=""
            aria-label="第二个评估环节"
            placeholder="请选择评估环节"
            :options="secondStageOptions"
            :invalid="submitted && (!draft.secondStageId || draft.secondStageId === draft.firstStageId)"
            empty-text="暂无可选评估环节"
          />
        </div>
        <p v-if="stageError" class="comparison-rule-error" role="alert">{{ stageError }}</p>
      </section>

      <section class="comparison-rule-section" aria-labelledby="difference-rules-title">
        <h3 id="difference-rules-title" class="comparison-rule-section__title">评估项差异规则</h3>
        <p class="comparison-rule-section__description">若所选环节的执行人有权限查看对应环节的评估项（在绩效模板的参考内容中配置查看权限），则当两个评估环节的评估项之间发生以下差异时，会触发差异提示</p>
        <div class="comparison-condition-list">
          <div v-for="(rule, index) in draft.rules" :key="rule.id" class="comparison-condition-row">
            <PerformanceAssessmentSelect
              v-model="rule.itemId"
              label=""
              aria-label="评估项"
              placeholder="请选择评估项"
              :options="availableItemOptions"
              :invalid="submitted && !rule.itemId"
              empty-text="暂无可选评估项"
            />
            <span class="comparison-condition-row__operator">相差</span>
            <PerformanceMetricSelect
              v-model="rule.differenceType"
              ariaLabel="差异类型"
              placeholder="请选择"
              :options="differenceTypeOptions"
              :invalid="submitted && !rule.differenceType"
              empty-text="暂无差异类型"
            />
            <div class="comparison-threshold">
              <PerformanceNumberInput
                v-model="rule.threshold"
                width="109px"
                size="compact"
                aria-label="差异阈值"
                :min="1"
                :step="1"
                :invalid="submitted && !isPositiveInteger(rule.threshold)"
                placeholder="请输入数字"
              />
              <span class="comparison-threshold__suffix">档</span>
            </div>
            <button
              class="comparison-condition-row__delete"
              type="button"
              :disabled="draft.rules.length === 1"
              :aria-label="`删除第${index + 1}条差异规则`"
              @click="removeRule(index)"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2h5a1 1 0 1 1 0 2h-1v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6H3a1 1 0 1 1 0-2h5Zm-2 2v14h12V6H6Zm4 3a1 1 0 1 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Zm4 0a1 1 0 1 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z" fill="currentColor" /></svg>
            </button>
          </div>
        </div>
        <p v-if="ruleError" class="comparison-rule-error" role="alert">{{ ruleError }}</p>
        <PerformanceButton class="comparison-condition-add" variant="text" @click="addRule">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2a1 1 0 0 0-1 1v8H3a1 1 0 1 0 0 2h8v8a1 1 0 1 0 2 0v-8h8a1 1 0 1 0 0-2h-8V3a1 1 0 0 0-1-1Z" fill="currentColor" /></svg>
          <span>添加规则</span>
        </PerformanceButton>
      </section>

      <section class="comparison-rule-section" aria-labelledby="prompt-methods-title">
        <h3 id="prompt-methods-title" class="comparison-rule-section__title">发生差异时的提示方式</h3>
        <p class="comparison-rule-section__description">当此环节被其它查看人参考查看时，若其它查看人有两个对比环节的评估项查看权限，则在人员详情页也能看到相应的差异提示。</p>
        <div class="comparison-prompt-list" role="group" aria-label="发生差异时的提示方式">
          <div v-for="option in promptOptions" :key="option.value" class="comparison-prompt-row">
            <PerformanceCheckbox
              :model-value="draft.promptModes.includes(option.value)"
              :label="option.label"
              @update:model-value="togglePromptMode(option.value, $event)"
            />
            <PerformanceInfoPopover :content="option.label" :width="360" />
          </div>
        </div>
        <p v-if="promptError" class="comparison-rule-error" role="alert">{{ promptError }}</p>
      </section>
    </form>

    <template #footer>
      <PerformanceDrawerFooter variant="captured" confirm-text="提交" cancel-text="取消" @confirm="submit" @cancel="cancel" />
    </template>
  </PerformanceDrawerShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import PerformanceAssessmentSelect, { type PerformanceAssessmentSelectOption } from './PerformanceAssessmentSelect.vue'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceDrawerFooter from './PerformanceDrawerFooter.vue'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import PerformanceMetricSelect, { type PerformanceMetricSelectOption } from './PerformanceMetricSelect.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'

export type PerformanceComparisonPromptMode = 'DURING_EVALUATION' | 'ON_SUBMIT' | 'NOTIFY_REVIEWER'
export interface PerformanceComparisonRuleDraft {
  id: number
  itemId: string
  differenceType: string
  threshold: string
}
export interface PerformanceComparisonConfig {
  firstStageId: string
  secondStageId: string
  rules: Array<Omit<PerformanceComparisonRuleDraft, 'id'>>
  promptModes: PerformanceComparisonPromptMode[]
}

const promptOptions: Array<{ value: PerformanceComparisonPromptMode; label: string }> = [
  { value: 'DURING_EVALUATION', label: '评估过程中展示差异提示' },
  { value: 'ON_SUBMIT', label: '评估提交时填写差异理由' },
  { value: 'NOTIFY_REVIEWER', label: '给对应环节的评估人发送通知提醒' },
]

const props = withDefaults(defineProps<{
  modelValue: boolean
  stageOptions?: PerformanceAssessmentSelectOption[]
  itemOptions?: PerformanceAssessmentSelectOption[]
  itemsByStage?: Record<string, PerformanceAssessmentSelectOption[]>
  differenceTypeOptions?: PerformanceMetricSelectOption[]
  initialValue?: PerformanceComparisonConfig | null
}>(), {
  stageOptions: () => [{ id: 'evaluation-self', label: '员工自评' }, { id: 'evaluation-manager', label: '上级评价' }, { id: 'evaluation-project', label: '项目评价' }],
  itemOptions: () => [],
  itemsByStage: () => ({}),
  differenceTypeOptions: () => [{ value: 'EQ', label: '=' }, { value: 'GT', label: '>' }, { value: 'GTE', label: '≥' }, { value: 'LT', label: '<' }, { value: 'LTE', label: '≤' }],
  initialValue: null,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  cancel: []
  submit: [value: PerformanceComparisonConfig]
}>()

const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const submitted = ref(false)
const nextRuleId = ref(1)
const draft = reactive({
  firstStageId: '',
  secondStageId: '',
  rules: [{ id: 1, itemId: '', differenceType: 'EQ', threshold: '' }] as PerformanceComparisonRuleDraft[],
  promptModes: [] as PerformanceComparisonPromptMode[],
})
const stageOptions = computed(() => props.stageOptions)
const secondStageOptions = computed(() => stageOptions.value.filter(option => option.id !== draft.firstStageId))
const availableItemOptions = computed(() => {
  const first = props.itemsByStage[draft.firstStageId] || []
  const second = props.itemsByStage[draft.secondStageId] || []
  if (!first.length || !second.length) return props.itemOptions
  const secondIds = new Set(second.map(option => option.id))
  return first.filter(option => secondIds.has(option.id))
})
const stageError = computed(() => {
  if (!submitted.value) return ''
  if (!draft.firstStageId || !draft.secondStageId) return '请选择需要对比的评估环节'
  if (draft.firstStageId === draft.secondStageId) return '两个评估环节不能相同'
  return ''
})
const ruleError = computed(() => {
  if (!submitted.value) return ''
  if (draft.rules.some(rule => !rule.itemId || !rule.differenceType || !isPositiveInteger(rule.threshold))) return '请完善评估项差异规则'
  return ''
})
const promptError = computed(() => submitted.value && !draft.promptModes.length ? '至少选择一种提示方式' : '')

function isPositiveInteger(value: string) {
  return /^[1-9]\d*$/.test(value)
}
function reset(value: PerformanceComparisonConfig | null = props.initialValue) {
  draft.firstStageId = value?.firstStageId || ''
  draft.secondStageId = value?.secondStageId || ''
  draft.rules = value?.rules?.length
    ? value.rules.map(rule => ({ ...rule, id: nextRuleId.value++ }))
    : [{ id: nextRuleId.value++, itemId: '', differenceType: props.differenceTypeOptions[0]?.value || '', threshold: '' }]
  draft.promptModes = value?.promptModes ? [...value.promptModes] : []
  submitted.value = false
}
function addRule() {
  draft.rules.push({ id: nextRuleId.value++, itemId: '', differenceType: props.differenceTypeOptions[0]?.value || '', threshold: '' })
}
function removeRule(index: number) {
  if (draft.rules.length > 1) draft.rules.splice(index, 1)
}
function togglePromptMode(value: PerformanceComparisonPromptMode, checked: boolean) {
  draft.promptModes = checked ? [...new Set([...draft.promptModes, value])] : draft.promptModes.filter(item => item !== value)
}
function cancel() {
  if (!props.modelValue) return
  submitted.value = false
  emit('cancel')
  open.value = false
}
function submit() {
  submitted.value = true
  if (stageError.value || ruleError.value || promptError.value) return
  emit('submit', {
    firstStageId: draft.firstStageId,
    secondStageId: draft.secondStageId,
    rules: draft.rules.map(({ id, ...rule }) => rule),
    promptModes: [...draft.promptModes],
  })
  open.value = false
}
watch(() => props.modelValue, value => { if (value) reset() })
watch(() => [draft.firstStageId, draft.secondStageId], () => {
  const validIds = new Set(availableItemOptions.value.map(option => option.id))
  draft.rules.forEach(rule => { if (rule.itemId && !validIds.has(rule.itemId)) rule.itemId = '' })
})
</script>

<style scoped>
.comparison-rule-form { display: flex; flex-direction: column; min-width: 0; color: var(--color-text-primary); }
.comparison-rule-section { margin: 0 0 var(--spacing-5); }
.comparison-rule-section:last-child { margin-bottom: 0; }
.comparison-rule-section__title { display: flex; align-items: center; min-height: 22px; margin: 0 0 var(--spacing-2); color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: 600; line-height: 22px; }
.comparison-rule-section__description { margin: 0 0 var(--spacing-2); color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: 22px; }
.comparison-stage-row { display: grid; grid-template-columns: minmax(0, 1fr) 28px minmax(0, 1fr); align-items: start; gap: var(--spacing-2); }
.comparison-stage-row :deep(.performance-assessment-select), .comparison-condition-row > :deep(.performance-assessment-select) { min-width: 0; }
.comparison-stage-row__operator, .comparison-condition-row__operator { display: flex; align-items: center; justify-content: center; min-height: var(--performance-control-height); color: var(--color-text-primary); font-size: var(--font-size-md); line-height: 22px; white-space: nowrap; }
.comparison-condition-list { display: flex; flex-direction: column; gap: var(--spacing-2); }
.comparison-condition-row { display: grid; grid-template-columns: minmax(0, 1fr) 28px 105px 179px 26px; align-items: start; gap: var(--spacing-2); }
.comparison-condition-row > :deep(.performance-assessment-select) { min-width: 0; }
.comparison-condition-row > :deep(.performance-metric-select) { min-width: 0; }
.comparison-condition-row > :deep(.performance-metric-select) .performance-metric-select__trigger { height: var(--performance-control-height); }
.comparison-threshold { display: flex; min-width: 0; height: var(--performance-control-height); }
.comparison-threshold :deep(.performance-number-input) { flex: 1 1 auto; width: 109px; border-radius: var(--performance-control-radius) 0 0 var(--performance-control-radius); }
.comparison-threshold :deep(.performance-number-input input) { padding-inline: var(--spacing-1); }
.comparison-threshold__suffix { display: flex; width: 70px; flex: 0 0 70px; align-items: center; justify-content: center; box-sizing: border-box; border: 1px solid var(--performance-field-border); border-left: 0; border-radius: 0 var(--performance-control-radius) var(--performance-control-radius) 0; background: var(--color-surface-disabled); color: var(--color-text-primary); font-size: var(--font-size-md); line-height: 22px; }
.comparison-condition-row__delete { display: grid; width: 26px; height: 28px; margin-top: 2px; place-items: center; padding: 4px; border: 0; border-radius: var(--performance-button-radius); background: transparent; color: var(--color-text-placeholder); cursor: pointer; }
.comparison-condition-row__delete:hover:not(:disabled), .comparison-condition-row__delete:focus-visible { color: var(--color-danger); background: var(--color-danger-light); outline: 0; }
.comparison-condition-row__delete:disabled { color: var(--color-border); cursor: not-allowed; }
.comparison-condition-row__delete svg { width: 16px; height: 16px; }
.comparison-condition-add { justify-content: flex-start; margin-top: var(--spacing-2); padding-inline: var(--spacing-1); }
.comparison-condition-add :deep(svg) { width: 14px; height: 14px; margin-right: var(--spacing-1); }
.comparison-prompt-list { display: flex; flex-direction: column; gap: var(--spacing-2); margin-top: var(--spacing-2); }
.comparison-prompt-row { display: flex; align-items: center; gap: var(--spacing-2); min-height: 22px; }
.comparison-prompt-row :deep(.performance-checkbox) { width: auto; }
.comparison-rule-error { margin: var(--spacing-1) 0 0; color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
@media (max-width: 720px) {
  .comparison-condition-row { grid-template-columns: minmax(0, 1fr) 28px minmax(105px, .5fr) 179px 26px; min-width: 590px; }
  .performance-comparison-rule-drawer__body { overflow-x: auto !important; }
}
</style>
