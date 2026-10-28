<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { PerformanceDistributionAssessmentOption, PerformanceDistributionCondition, PerformanceDistributionRule } from '@/api/performance'
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import PerformanceDistributionRuleRow from './PerformanceDistributionRuleRow.vue'
import PerformanceDrawerFooter from './PerformanceDrawerFooter.vue'
import PerformanceDrawerShell from './PerformanceDrawerShell.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import AddOutlinedIcon from './AddOutlinedIcon.vue'

const props = withDefaults(defineProps<{
  modelValue: boolean
  assessmentOptions?: PerformanceDistributionAssessmentOption[]
  usedAssessmentIds?: string[]
  initialValue?: PerformanceDistributionRule | null
  saving?: boolean
  saveError?: string
}>(), { assessmentOptions: () => [], usedAssessmentIds: () => [], initialValue: null, saving: false, saveError: '' })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; confirm: [value: PerformanceDistributionRule]; cancel: [] }>()
const open = computed({ get: () => props.modelValue, set: value => emit('update:modelValue', value) })
const submitted = ref(false)
const draft = reactive<PerformanceDistributionRule>(emptyRule())
const roundingOptions = [
  { value: 'ROUND', label: '四舍五入' },
  { value: 'CEIL', label: '向上取整' },
  { value: 'FLOOR', label: '向下取整' },
]
const selectableAssessments = computed(() => props.assessmentOptions.map(option => ({
  id: option.id,
  label: option.label,
  description: option.description,
  disabled: props.usedAssessmentIds.includes(option.id) && option.id !== props.initialValue?.assessment_item_id,
  disabledReason: '该评估项已配置分布规则',
})))
const selectedAssessment = computed(() => props.assessmentOptions.find(option => option.id === draft.assessment_item_id))
const gradeOptions = computed(() => selectedAssessment.value?.grade_options || [])
const ruleInvalid = computed(() => submitted.value && draft.conditions.some(condition => !condition.grade_codes.length || condition.value <= 0 || (condition.unit === 'PERCENT' && condition.value > 100)))

function emptyCondition(): PerformanceDistributionCondition {
  return { control_mode: 'HARD', grade_codes: [], operator: 'GTE', value: 0, unit: 'PERCENT' }
}
function emptyRule(): PerformanceDistributionRule {
  return { assessment_item_id: '', min_people_count: 0, conditions: [emptyCondition()], rounding_method: 'ROUND' }
}
function cloneRule(value: PerformanceDistributionRule) { return JSON.parse(JSON.stringify(value)) as PerformanceDistributionRule }
function reset() {
  Object.assign(draft, props.initialValue ? cloneRule(props.initialValue) : emptyRule())
  submitted.value = false
}
function setAssessment(value: string) {
  if (draft.assessment_item_id === value) return
  draft.assessment_item_id = value
  draft.conditions.forEach(condition => { condition.grade_codes = [] })
}
function addCondition() { draft.conditions.push(emptyCondition()) }
function removeCondition(index: number) { if (draft.conditions.length > 1) draft.conditions.splice(index, 1) }
function cancel() { reset(); emit('cancel'); open.value = false }
function submit() {
  submitted.value = true
  if (!draft.assessment_item_id || draft.min_people_count < 0 || ruleInvalid.value || !draft.conditions.length) return
  emit('confirm', cloneRule(draft))
}
watch(() => props.modelValue, value => { if (value) reset() })
</script>

<template>
  <PerformanceDrawerShell v-model="open" title="添加分布规则" width="680px" variant="captured" body-class="performance-distribution-rule-drawer__body" @close="cancel">
    <form class="distribution-rule-form" novalidate @submit.prevent="submit">
      <PerformanceFormItem label="评估项" required :invalid="submitted && !draft.assessment_item_id" error-message="评估项为必填">
        <PerformanceAssessmentSelect :model-value="draft.assessment_item_id" label="" aria-label="分布评估项" placeholder="请选择" :options="selectableAssessments" :invalid="submitted && !draft.assessment_item_id" empty-text="暂无可配置的评级评估项" @update:model-value="setAssessment" />
      </PerformanceFormItem>

      <PerformanceFormItem label="适用人数" required :invalid="submitted && draft.min_people_count < 0" error-message="适用人数不合法">
        <div class="distribution-applicable-count"><span>大于等于</span><PerformanceNumberInput :model-value="String(draft.min_people_count)" width="160px" :min="0" suffix="人" aria-label="分布适用人数" @update:model-value="draft.min_people_count = Number($event) || 0" /></div>
      </PerformanceFormItem>

      <PerformanceFormItem label="分布规则" required :invalid="ruleInvalid" error-message="请完善分布规则">
        <template #label-extra><PerformanceInfoPopover content="请注意避免分布规则间发生冲突，否则会导致校准任务无法完成" :width="360" /></template>
        <template #description>请注意避免分布规则间发生冲突，否则会导致校准任务无法完成</template>
        <div class="distribution-condition-list">
          <PerformanceDistributionRuleRow v-for="(condition,index) in draft.conditions" :key="index" :model-value="condition" :grade-options="gradeOptions" :removable="draft.conditions.length > 1" :invalid="submitted && (!condition.grade_codes.length || condition.value <= 0 || (condition.unit === 'PERCENT' && condition.value > 100))" @update:model-value="draft.conditions[index] = $event" @remove="removeCondition(index)" />
        </div>
        <PerformanceTextButton label="添加规则" @click="addCondition"><template #icon><AddOutlinedIcon /></template></PerformanceTextButton>
      </PerformanceFormItem>

      <PerformanceFormItem label="取整方式" required>
        <template #description>当基于比例计算所得的强制/建议人数值为小数时，可以选择数据取整方式。（取整方式会展示给校准人）</template>
        <PerformanceRadioGroup v-model="draft.rounding_method" name="distribution-rounding" :options="roundingOptions" aria-label="分布取整方式" />
      </PerformanceFormItem>
      <p v-if="saveError" class="distribution-save-error" role="alert">{{ saveError }}</p>
    </form>
    <template #footer><PerformanceDrawerFooter variant="captured" :confirm-disabled="saving" @confirm="submit" @cancel="cancel" /></template>
  </PerformanceDrawerShell>
</template>

<style scoped>
.distribution-rule-form{display:flex;flex-direction:column;width:100%;min-width:0;padding:var(--spacing-5) var(--spacing-6);box-sizing:border-box;overflow:auto;color:var(--color-text-primary)}
.distribution-applicable-count{display:flex;align-items:center;gap:var(--spacing-2);width:288px}
.distribution-applicable-count>span{flex:0 0 120px;height:var(--performance-control-height);padding:4px var(--performance-select-padding-x);box-sizing:border-box;border:1px solid var(--performance-field-border);border-radius:var(--performance-control-radius);background:var(--color-bg-card);font-size:var(--font-size-md);line-height:22px}
.distribution-condition-list{display:flex;flex-direction:column;gap:var(--spacing-2);margin-bottom:var(--spacing-2)}
.distribution-rule-form :deep(.performance-form-item__label){gap:var(--spacing-1)}
.distribution-rule-form :deep(.performance-form-item__description){font-size:var(--font-size-md);line-height:20px}
.distribution-save-error{margin:0;color:var(--performance-field-error-color);font-size:var(--performance-field-error-font-size);line-height:var(--performance-field-error-line-height)}
@media(max-width:720px){.performance-distribution-rule-drawer__body{overflow-x:auto!important}.distribution-rule-form{min-width:640px}}
</style>
