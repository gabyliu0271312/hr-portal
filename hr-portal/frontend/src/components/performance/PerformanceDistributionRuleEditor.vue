<template>
  <div class="distribution-rule-editor">
    <PerformanceFormItem label="评估项" required :invalid="submitted && !modelValue.assessment_item_id" error-message="评估项为必填">
      <PerformanceAssessmentSelect :model-value="modelValue.assessment_item_id" label="" aria-label="分布评估项" placeholder="请选择" :options="selectableAssessments" :invalid="submitted && !modelValue.assessment_item_id" empty-text="暂无可配置的评级评估项" @update:model-value="setAssessment" />
      <p v-if="selectedAssessment" class="distribution-assessment-summary">{{ selectedAssessment.label }}共{{ gradeCodes.length }}个评级结果：<span v-for="code in gradeCodes" :key="code">{{ code }}</span></p>
    </PerformanceFormItem>

    <PerformanceFormItem v-if="showExecutionScope" label="执行范围" required :invalid="submitted && !scopeValid" error-message="请完善执行范围">
      <div class="distribution-scope-options">
        <PerformanceCheckbox :model-value="scope.calibration_scope" label="校准范围内整体执行" @update:model-value="setScopeEnabled('calibration_scope', $event)" />
        <PerformanceCheckbox :model-value="scope.department" label="指定部门内执行分布" @update:model-value="setScopeEnabled('department', $event)" />
        <div v-if="scope.department" class="distribution-scope-group">
          <PerformanceAudienceRuleEditor
            v-model="departmentGroups"
            :allowed-fields="['department']"
            :custom-fields="departmentCustomFields"
            scope-mode
            :show-scope-heading="false"
            operator-disabled
            default-field="department"
            :organization-tree="organizationTree"
            :disabled="disabled"
            @open-options="emit('open-options')"
          />
        </div>
        <PerformanceCheckbox :model-value="scope.other_dimension" label="指定其他维度内执行分布" @update:model-value="setScopeEnabled('other_dimension', $event)" />
        <div v-if="scope.other_dimension" class="distribution-scope-group">
          <PerformanceAudienceRuleEditor
            v-model="otherDimensionGroups"
            :allowed-fields="['position_level']"
            scope-mode
            :show-scope-heading="false"
            operator-disabled
            default-field="position_level"
            :position-level-options="positionLevelOptions"
            :disabled="disabled"
            @open-options="emit('open-options')"
          />
        </div>
      </div>
    </PerformanceFormItem>

    <PerformanceFormItem label="适用人数" required :invalid="submitted && modelValue.min_people_count < 0" error-message="适用人数不合法">
      <div class="distribution-applicable-count"><span>大于等于</span><PerformanceNumberInput :model-value="String(modelValue.min_people_count)" width="160px" :min="0" suffix="人" aria-label="分布适用人数" :disabled="disabled" @update:model-value="update({ min_people_count: Number($event) || 0 })" /></div>
    </PerformanceFormItem>

    <PerformanceFormItem label="分布规则" required :invalid="submitted && ruleInvalid" error-message="请完善分布规则">
      <template #label-extra><PerformanceInfoPopover content="请注意避免分布规则间发生冲突，否则会导致校准任务无法完成" :width="360" /></template>
      <template #description>请注意避免分布规则间发生冲突，否则会导致校准任务无法完成</template>
      <div class="distribution-condition-list">
        <PerformanceDistributionRuleRow v-for="(condition,index) in modelValue.conditions" :key="index" :model-value="condition" :grade-options="gradeOptions" :removable="modelValue.conditions.length > 1" :invalid="submitted && invalidCondition(condition)" @update:model-value="updateCondition(index, $event)" @remove="removeCondition(index)" />
      </div>
      <PerformanceTextButton label="添加规则" :disabled="disabled" @click="addCondition"><template #icon><AddOutlinedIcon /></template></PerformanceTextButton>
    </PerformanceFormItem>

    <PerformanceFormItem label="取整方式" required>
      <template #description>当基于比例计算所得的强制/建议人数值为小数时，可以选择数据取整方式。（取整方式会展示给校准人）</template>
      <PerformanceRadioGroup :model-value="modelValue.rounding_method" name="distribution-rounding" :options="roundingOptions" aria-label="分布取整方式" :disabled="disabled" @update:model-value="update({ rounding_method: $event as PerformanceDistributionRounding })">
        <template #after-option="{ option }"><PerformanceInfoPopover v-if="option.value === 'NONE'" :content="noRoundingHelp" :width="420" preserve-newlines /></template>
      </PerformanceRadioGroup>
    </PerformanceFormItem>
    <p v-if="submitted && !valid" class="distribution-rule-error" role="alert">请完善分布规则</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceAudienceGroup, PerformanceDistributionAssessmentOption, PerformanceDistributionCondition, PerformanceDistributionExecutionScope, PerformanceDistributionRule, PerformanceDistributionRounding, PerformanceDistributionScopeRuleType, PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceAudienceRuleEditor, { type PerformanceAudienceCustomField } from './PerformanceAudienceRuleEditor.vue'
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceDistributionRuleRow from './PerformanceDistributionRuleRow.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import PerformanceOrganizationLevelSelect from './PerformanceOrganizationLevelSelect.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import type { PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import AddOutlinedIcon from './AddOutlinedIcon.vue'

const departmentCustomFields: PerformanceAudienceCustomField[] = [
  { value: 'department_level', label: '部门等级', component: PerformanceOrganizationLevelSelect },
]

const props = withDefaults(defineProps<{
  modelValue: PerformanceDistributionRule
  assessmentOptions?: PerformanceDistributionAssessmentOption[]
  usedAssessmentIds?: string[]
  showExecutionScope?: boolean
  organizationTree?: PerformanceHrbpOrganizationNode[]
  positionLevelOptions?: PerformanceSearchSelectOption[]
  disabled?: boolean
  submitted?: boolean
}>(), { assessmentOptions: () => [], usedAssessmentIds: () => [], showExecutionScope: false, organizationTree: () => [], positionLevelOptions: () => [], disabled: false, submitted: false })
const emit = defineEmits<{ 'update:modelValue': [value: PerformanceDistributionRule]; 'open-options': [] }>()
const noRoundingHelp = '强制/建议的人数值计算得小数值时，实际人数会与此小数值直接对比。\n举例：S 小于等于 20%，D 大于等于 10%。某团队人数为 33 人，则：\nS ≤ 6.6 人（S 实际最大可为 6 人）\nD ≥ 3.3 人（D 实际最小可为 4 人 ）'
const roundingOptions = [
  { value: 'ROUND', label: '四舍五入' },
  { value: 'CEIL', label: '向上取整' },
  { value: 'FLOOR', label: '向下取整' },
  { value: 'NONE', label: '不强制取整' },
]
const scope = computed<PerformanceDistributionExecutionScope>(() => ({ calibration_scope: false, department: false, other_dimension: false, rules: [], ...props.modelValue.execution_scope }))
const selectableAssessments = computed(() => props.assessmentOptions.map(option => ({ id: option.id, label: option.label, description: option.description, disabled: props.usedAssessmentIds.includes(option.id) && option.id !== props.modelValue.assessment_item_id, disabledReason: '该评估项已配置分布规则' })))
const selectedAssessment = computed(() => props.assessmentOptions.find(option => option.id === props.modelValue.assessment_item_id))
const gradeOptions = computed(() => selectedAssessment.value?.grade_options.map(option => ({ value: option.value, label: option.value })) || [])
const gradeCodes = computed(() => selectedAssessment.value?.grade_options.map(option => option.value) || [])
const departmentGroups = computed<PerformanceAudienceGroup[]>({ get: () => groupsForTypes(['DEPARTMENT', 'DEPARTMENT_LEVEL']), set: groups => updateScopeGroups(['DEPARTMENT', 'DEPARTMENT_LEVEL'], groups) })
const otherDimensionGroups = computed<PerformanceAudienceGroup[]>({ get: () => groupsForTypes(['POSITION_LEVEL']), set: groups => updateScopeGroups(['POSITION_LEVEL'], groups) })
const ruleInvalid = computed(() => !props.modelValue.conditions.length || props.modelValue.conditions.some(invalidCondition))
const scopeValid = computed(() => {
  if (!props.showExecutionScope) return true
  if (!scope.value.calibration_scope && !scope.value.department && !scope.value.other_dimension) return false
  if (scope.value.department && (!departmentGroups.value.length || !departmentGroups.value.every(group => group.conditions.length === 1 && group.conditions[0].values.length))) return false
  if (scope.value.department && (!scopeRows('DEPARTMENT').length || !scopeRows('DEPARTMENT_LEVEL').length)) return false
  if (scope.value.other_dimension && (!otherDimensionGroups.value.length || !otherDimensionGroups.value.every(group => group.conditions.length === 1 && group.conditions[0].values.length))) return false
  return true
})
const valid = computed(() => Boolean(props.modelValue.assessment_item_id) && props.modelValue.min_people_count >= 0 && !ruleInvalid.value && scopeValid.value)

function update(value: Partial<PerformanceDistributionRule>) { emit('update:modelValue', { ...props.modelValue, ...value }) }
function updateCondition(index: number, value: PerformanceDistributionCondition) { const conditions = props.modelValue.conditions.map((condition, conditionIndex) => conditionIndex === index ? value : condition); update({ conditions }) }
function invalidCondition(condition: PerformanceDistributionCondition) { return !condition.grade_codes.length || condition.value <= 0 || (condition.unit === 'PERCENT' && condition.value > 100) }
function setAssessment(value: string) { if (props.modelValue.assessment_item_id === value) return; update({ assessment_item_id: value, conditions: props.modelValue.conditions.map(condition => ({ ...condition, grade_codes: [] })) }) }
function addCondition() { update({ conditions: [...props.modelValue.conditions, { control_mode: 'HARD', grade_codes: [], operator: 'GTE', value: 0, unit: 'PERCENT' }] }) }
function removeCondition(index: number) { if (props.modelValue.conditions.length > 1) update({ conditions: props.modelValue.conditions.filter((_, conditionIndex) => conditionIndex !== index) }) }
function emptyScopeRule(type: 'DEPARTMENT' | 'DEPARTMENT_LEVEL' | 'POSITION_LEVEL') { return { type, values: [] } }
function emptyGroup(field: string, values: string[] = []): PerformanceAudienceGroup { return { conditions: [{ field: field as never, operator: 'include', values: [...values] }] } }
function fieldForType(type: 'DEPARTMENT' | 'DEPARTMENT_LEVEL' | 'POSITION_LEVEL') { return type === 'DEPARTMENT' ? 'department' : type === 'DEPARTMENT_LEVEL' ? 'department_level' : 'position_level' }
function typeForField(field: string): PerformanceDistributionScopeRuleType { return field === 'department' ? 'DEPARTMENT' : field === 'department_level' ? 'DEPARTMENT_LEVEL' : 'POSITION_LEVEL' }
function groupsForTypes(types: PerformanceDistributionScopeRuleType[]) {
  return scope.value.rules.filter(rule => types.includes(rule.type)).map(rule => emptyGroup(fieldForType(rule.type), rule.values))
}
function updateScopeGroups(types: PerformanceDistributionScopeRuleType[], groups: PerformanceAudienceGroup[]) {
  const replacements: Array<{ type: PerformanceDistributionScopeRuleType; values: string[] }> = groups.map(group => ({ type: typeForField(String(group.conditions[0]?.field || '')), values: [...(group.conditions[0]?.values || [])] })).filter(rule => types.includes(rule.type))
  const retained = scope.value.rules.filter(rule => !types.includes(rule.type))
  update({ execution_scope: { ...scope.value, rules: [...retained, ...replacements] } })
}
function scopeRows(type: 'DEPARTMENT' | 'DEPARTMENT_LEVEL' | 'POSITION_LEVEL') { return scope.value.rules.filter(row => row.type === type) }
function setScopeEnabled(key: 'calibration_scope' | 'department' | 'other_dimension', value: boolean) {
  const rules = [...scope.value.rules]
  if (value && key === 'department') {
    if (!rules.some(row => row.type === 'DEPARTMENT')) rules.push(emptyScopeRule('DEPARTMENT'))
    if (!rules.some(row => row.type === 'DEPARTMENT_LEVEL')) rules.push(emptyScopeRule('DEPARTMENT_LEVEL'))
  }
  if (value && key === 'other_dimension' && !rules.some(row => row.type === 'POSITION_LEVEL')) rules.push(emptyScopeRule('POSITION_LEVEL'))
  update({ execution_scope: { ...scope.value, [key]: value, rules } })
}
</script>

<style scoped>
.distribution-rule-editor{display:flex;flex-direction:column;gap:var(--spacing-5);min-width:0;color:var(--color-text-primary)}
.distribution-assessment-summary{display:flex;align-items:center;flex-wrap:wrap;gap:var(--spacing-1);margin:var(--spacing-2) 0 0;color:var(--color-text-secondary);font-size:var(--font-size-md);line-height:22px}.distribution-assessment-summary span{display:inline-flex;align-items:center;min-height:24px;padding:1px 6px;border-radius:var(--radius-sm);background:var(--performance-select-tag-background);color:var(--performance-select-tag-text)}
.distribution-applicable-count{display:flex;align-items:center;gap:var(--spacing-2);width:288px}.distribution-applicable-count>span{flex:0 0 120px;height:var(--performance-control-height);padding:4px var(--performance-select-padding-x);box-sizing:border-box;border:1px solid var(--performance-field-border);border-radius:var(--performance-control-radius);background:var(--color-bg-card);font-size:var(--font-size-md);line-height:22px}
.distribution-condition-list{display:flex;flex-direction:column;gap:var(--spacing-2);margin-bottom:var(--spacing-2)}.distribution-rule-editor :deep(.performance-form-item__label){gap:var(--spacing-1)}.distribution-rule-editor :deep(.performance-form-item__description){font-size:var(--font-size-md);line-height:20px}
.distribution-scope-options{display:flex;flex-direction:column;gap:var(--spacing-2)}.distribution-scope-group{display:flex;flex-direction:column;gap:var(--spacing-3);margin:0 0 var(--spacing-2) var(--spacing-6);padding:var(--spacing-3) var(--spacing-4);border-radius:var(--radius-sm);background:var(--performance-review-readonly-surface)}
.distribution-rule-error{margin:0;color:var(--performance-field-error-color);font-size:var(--performance-field-error-font-size);line-height:var(--performance-field-error-line-height)}
@media(max-width:720px){.distribution-rule-editor{min-width:640px}.distribution-scope-group{margin-left:0}}
</style>
