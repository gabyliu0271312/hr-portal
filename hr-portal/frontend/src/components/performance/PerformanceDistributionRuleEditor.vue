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
          <ScopeRuleGroup
            title="部门"
            type="DEPARTMENT"
            :rows="scopeRows('DEPARTMENT')"
            :organization-tree="organizationTree"
            :disabled="disabled"
            @update="updateScopeRow"
            @add="addScopeRow('DEPARTMENT')"
            @remove="removeScopeRow"
            @open="emit('open-options')"
          />
          <ScopeRuleGroup
            title="部门等级"
            type="DEPARTMENT_LEVEL"
            :rows="scopeRows('DEPARTMENT_LEVEL')"
            :disabled="disabled"
            @update="updateScopeRow"
            @add="addScopeRow('DEPARTMENT_LEVEL')"
            @remove="removeScopeRow"
            @open="emit('open-options')"
          />
        </div>
        <PerformanceCheckbox :model-value="scope.other_dimension" label="指定其他维度内执行分布" @update:model-value="setScopeEnabled('other_dimension', $event)" />
        <div v-if="scope.other_dimension" class="distribution-scope-group">
          <ScopeRuleGroup
            title="职级"
            type="POSITION_LEVEL"
            :rows="scopeRows('POSITION_LEVEL')"
            :position-level-options="positionLevelOptions"
            :disabled="disabled"
            @update="updateScopeRow"
            @add="addScopeRow('POSITION_LEVEL')"
            @remove="removeScopeRow"
            @open="emit('open-options')"
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
import { computed, defineComponent, h, type PropType } from 'vue'
import type { PerformanceDistributionAssessmentOption, PerformanceDistributionCondition, PerformanceDistributionExecutionScope, PerformanceDistributionRule, PerformanceDistributionRounding, PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceDistributionRuleRow from './PerformanceDistributionRuleRow.vue'
import PerformanceFormItem from './PerformanceFormItem.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import PerformanceNumberInput from './PerformanceNumberInput.vue'
import PerformanceOrganizationLevelSelect from './PerformanceOrganizationLevelSelect.vue'
import PerformanceOrganizationSelect from './PerformanceOrganizationSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformancePositionLevelSelect from './PerformancePositionLevelSelect.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import AddOutlinedIcon from './AddOutlinedIcon.vue'

export type DistributionScopeRuleType = 'DEPARTMENT' | 'DEPARTMENT_LEVEL' | 'POSITION_LEVEL'
export type DistributionScopeRow = { type: DistributionScopeRuleType; values: string[] }

const ScopeRuleGroup = defineComponent({
  name: 'ScopeRuleGroup',
  props: {
    title: { type: String, required: true },
    type: { type: String as PropType<DistributionScopeRuleType>, required: true },
    rows: { type: Array as PropType<DistributionScopeRow[]>, required: true },
    organizationTree: { type: Array as PropType<PerformanceHrbpOrganizationNode[]>, default: () => [] },
    positionLevelOptions: { type: Array as PropType<PerformanceSearchSelectOption[]>, default: () => [] },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update', 'add', 'remove', 'open'],
  setup(props, { emit }) {
    return () => h('div', { class: 'distribution-scope-rule-group' }, [
      h('div', { class: 'distribution-scope-rule-group__title' }, props.title),
      ...props.rows.map((row, index) => h('div', { class: 'distribution-scope-row', key: `${row.type}-${index}` }, [
        row.type === 'DEPARTMENT'
          ? h(PerformanceOrganizationSelect, { modelValue: row.values, nodes: props.organizationTree, disabled: props.disabled, ariaLabel: '部门范围', onOpen: () => emit('open'), 'onUpdate:modelValue': (value: string[]) => emit('update', index, value) })
          : row.type === 'DEPARTMENT_LEVEL'
            ? h(PerformanceOrganizationLevelSelect, { modelValue: row.values, disabled: props.disabled, onOpen: () => emit('open'), 'onUpdate:modelValue': (value: string | string[] | null) => emit('update', index, Array.isArray(value) ? value : value ? [value] : []) })
            : h(PerformancePositionLevelSelect, { modelValue: row.values, options: props.positionLevelOptions, multiple: true, disabled: props.disabled, onOpen: () => emit('open'), 'onUpdate:modelValue': (value: string | string[] | null) => emit('update', index, Array.isArray(value) ? value : value ? [value] : []) }),
        h(PerformanceIconButton, { icon: 'DeleteTrashOutlined', label: `删除${props.title}规则 ${index + 1}`, disabled: props.disabled || props.rows.length <= 1, onClick: () => emit('remove', props.type, index) }),
      ])),
      h(PerformanceTextButton, { label: '添加规则', disabled: props.disabled, onClick: () => emit('add') }, { icon: () => h(AddOutlinedIcon) }),
    ])
  },
})

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
const ruleInvalid = computed(() => !props.modelValue.conditions.length || props.modelValue.conditions.some(invalidCondition))
const scopeValid = computed(() => {
  if (!props.showExecutionScope) return true
  if (!scope.value.calibration_scope && !scope.value.department && !scope.value.other_dimension) return false
  if (scope.value.department && !scopeRows('DEPARTMENT').every(row => row.values.length) ) return false
  if (scope.value.department && !scopeRows('DEPARTMENT_LEVEL').every(row => row.values.length)) return false
  if (scope.value.other_dimension && !scopeRows('POSITION_LEVEL').every(row => row.values.length)) return false
  return true
})
const valid = computed(() => Boolean(props.modelValue.assessment_item_id) && props.modelValue.min_people_count >= 0 && !ruleInvalid.value && scopeValid.value)

function emptyScope(): PerformanceDistributionExecutionScope { return { calibration_scope: false, department: false, other_dimension: false, rules: [] } }
function emptyRule(type: DistributionScopeRuleType): DistributionScopeRow { return { type, values: [] } }
function scopeRows(type: DistributionScopeRuleType) { return scope.value.rules.filter(row => row.type === type) }
function update(value: Partial<PerformanceDistributionRule>) { emit('update:modelValue', { ...props.modelValue, ...value }) }
function updateCondition(index: number, value: PerformanceDistributionCondition) { const conditions = props.modelValue.conditions.map((condition, conditionIndex) => conditionIndex === index ? value : condition); update({ conditions }) }
function invalidCondition(condition: PerformanceDistributionCondition) { return !condition.grade_codes.length || condition.value <= 0 || (condition.unit === 'PERCENT' && condition.value > 100) }
function setAssessment(value: string) { if (props.modelValue.assessment_item_id === value) return; update({ assessment_item_id: value, conditions: props.modelValue.conditions.map(condition => ({ ...condition, grade_codes: [] })) }) }
function addCondition() { update({ conditions: [...props.modelValue.conditions, { control_mode: 'HARD', grade_codes: [], operator: 'GTE', value: 0, unit: 'PERCENT' }] }) }
function removeCondition(index: number) { if (props.modelValue.conditions.length > 1) update({ conditions: props.modelValue.conditions.filter((_, conditionIndex) => conditionIndex !== index) }) }
function setScopeEnabled(key: 'calibration_scope' | 'department' | 'other_dimension', value: boolean) {
  const next = { ...scope.value, [key]: value, rules: [...scope.value.rules] }
  if (value && key === 'department') {
    if (!next.rules.some(row => row.type === 'DEPARTMENT')) next.rules.push(emptyRule('DEPARTMENT'))
    if (!next.rules.some(row => row.type === 'DEPARTMENT_LEVEL')) next.rules.push(emptyRule('DEPARTMENT_LEVEL'))
  }
  if (value && key === 'other_dimension' && !next.rules.some(row => row.type === 'POSITION_LEVEL')) next.rules.push(emptyRule('POSITION_LEVEL'))
  update({ execution_scope: next })
}
function addScopeRow(type: DistributionScopeRuleType) { update({ execution_scope: { ...scope.value, rules: [...scope.value.rules, emptyRule(type)] } }) }
function updateScopeRow(type: DistributionScopeRuleType, index: number, values: string[]) {
  let position = -1
  let seen = 0
  scope.value.rules.forEach((row, rowIndex) => { if (row.type === type) { if (seen === index) position = rowIndex; seen += 1 } })
  if (position < 0) return
  const rules = scope.value.rules.map((row, rowIndex) => rowIndex === position ? { ...row, values } : row)
  update({ execution_scope: { ...scope.value, rules } })
}
function removeScopeRow(type: DistributionScopeRuleType, index: number) {
  const rows = scopeRows(type)
  if (rows.length <= 1) return
  let seen = 0
  const rules = scope.value.rules.filter(row => row.type !== type || seen++ !== index)
  update({ execution_scope: { ...scope.value, rules } })
}
</script>

<style scoped>
.distribution-rule-editor{display:flex;flex-direction:column;gap:var(--spacing-5);min-width:0;color:var(--color-text-primary)}
.distribution-assessment-summary{display:flex;align-items:center;flex-wrap:wrap;gap:var(--spacing-1);margin:var(--spacing-2) 0 0;color:var(--color-text-secondary);font-size:var(--font-size-md);line-height:22px}.distribution-assessment-summary span{display:inline-flex;align-items:center;min-height:24px;padding:1px 6px;border-radius:var(--radius-sm);background:var(--performance-select-tag-background);color:var(--performance-select-tag-text)}
.distribution-applicable-count{display:flex;align-items:center;gap:var(--spacing-2);width:288px}.distribution-applicable-count>span{flex:0 0 120px;height:var(--performance-control-height);padding:4px var(--performance-select-padding-x);box-sizing:border-box;border:1px solid var(--performance-field-border);border-radius:var(--performance-control-radius);background:var(--color-bg-card);font-size:var(--font-size-md);line-height:22px}
.distribution-condition-list{display:flex;flex-direction:column;gap:var(--spacing-2);margin-bottom:var(--spacing-2)}.distribution-rule-editor :deep(.performance-form-item__label){gap:var(--spacing-1)}.distribution-rule-editor :deep(.performance-form-item__description){font-size:var(--font-size-md);line-height:20px}
.distribution-scope-options{display:flex;flex-direction:column;gap:var(--spacing-2)}.distribution-scope-group{display:flex;flex-direction:column;gap:var(--spacing-3);margin:0 0 var(--spacing-2) var(--spacing-6);padding:var(--spacing-3) var(--spacing-4);border-radius:var(--radius-sm);background:var(--performance-review-readonly-surface)}.distribution-scope-rule-group{display:flex;flex-direction:column;gap:var(--spacing-2)}.distribution-scope-rule-group__title{font-weight:600;line-height:22px}.distribution-scope-row{display:grid;grid-template-columns:minmax(0,1fr) 24px;gap:var(--spacing-2);align-items:start}.distribution-scope-row :deep(.performance-select-shell),.distribution-scope-row :deep(.performance-snapshot-field-select){min-width:0}.distribution-scope-row :deep(.performance-icon-button){--performance-icon-button-size:24px;margin-top:4px}.distribution-rule-error{margin:0;color:var(--performance-field-error-color);font-size:var(--performance-field-error-font-size);line-height:var(--performance-field-error-line-height)}
@media(max-width:720px){.distribution-rule-editor{min-width:640px}.distribution-scope-group{margin-left:0}}
</style>
