<template>
  <div class="performance-audience-rule-editor" :class="{ 'is-disabled': disabled, 'is-scope': scopeMode, 'is-embedded': embedded }">
    <div v-if="scopeMode && showScopeHeading" class="performance-audience-rule-editor__scope-heading">
      <span>人员范围</span>
      <span>满足以下任一条件</span>
    </div>
    <div v-if="loading" class="performance-audience-rule-editor__state" role="status">正在加载范围选项...</div>
    <div v-else>
      <div class="performance-audience-rule-editor__groups">
        <PerformanceConditionLogicGroup v-if="scopeMode && modelValue.length > 1" rail-only :count="modelValue.length" operator="或" class="performance-audience-rule-editor__scope-or" />
        <div class="performance-audience-rule-editor__main">
          <div class="performance-audience-rule-editor__rows">
          <template v-if="scopeMode">
          <div v-for="(group, groupIndex) in modelValue" :key="groupIndex" class="performance-audience-rule-editor__group">
            <div v-for="(condition, conditionIndex) in group.conditions" :key="conditionIndex" class="performance-audience-rule-editor__condition" :class="{ 'has-delete': modelValue.length > 1 }">
              <PerformanceSearchSelect :model-value="condition.field || null" :options="fieldOptions" selection-style="plain" disabled-surface="white" aria-label="范围字段" placeholder="请选择范围" :disabled="disabled" @update:model-value="updateField(groupIndex, conditionIndex, String($event || ''))" />
              <PerformanceSearchSelect :model-value="condition.operator" :options="operatorOptions" selection-style="plain" disabled-surface="white" aria-label="范围操作" :disabled="disabled || operatorDisabled || !condition.field" @update:model-value="updateOperator(groupIndex, conditionIndex, String($event || 'include'))" />
              <PerformanceOrganizationSelect v-if="condition.field === 'department'" :model-value="condition.values" :nodes="organizationTree" aria-label="部门范围" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, $event)" />
              <component :is="customField(condition.field)?.component" v-else-if="customField(condition.field)" :model-value="condition.values" :options="customField(condition.field)?.options" :multiple="true" :aria-label="`${fieldLabel(condition.field)}范围`" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, normalizeValues($event))" />
              <PerformancePersonSelect v-else-if="condition.field === 'employee'" :model-value="condition.values" :options="conditionValueOptions('employee', { people: personOptions })" multiple aria-label="员工范围" placeholder="请选择员工" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, normalizeValues($event))" />
              <PerformanceSearchSelect v-else-if="condition.field === 'employee_type'" :model-value="condition.values" :options="conditionValueOptions('employee_type', { employeeTypes: employeeTypeOptions })" multiple aria-label="人员类型范围" placeholder="请选择人员类型" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, normalizeValues($event))" />
              <PerformancePositionLevelSelect v-else-if="condition.field === 'position_level'" :model-value="condition.values" :options="positionLevelOptions" multiple aria-label="职级范围" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, normalizeValues($event))" />
              <PerformanceSearchSelect v-else :model-value="[]" :options="[]" multiple aria-label="范围条件值" placeholder="请选择" disabled disabled-surface="white" />
              <PerformanceIconButton v-if="modelValue.length > 1" icon="DeleteTrashOutlined" :label="`删除范围 ${groupIndex + 1}`" :disabled="disabled" @click="removeGroup(groupIndex)" />
            </div>
          </div>
          </template>
          <template v-else>
            <div v-for="(group, groupIndex) in modelValue" :key="groupIndex" class="performance-audience-rule-editor__group">
                <div class="performance-audience-rule-editor__group-heading">
                  <span>范围 {{ groupIndex + 1 }}</span>
                  <div class="performance-audience-rule-editor__group-heading-actions">
                    <span class="performance-audience-rule-editor__group-count">同时满足以下条件：<button class="performance-audience-rule-editor__count-link" type="button" :disabled="disabled || groupCounts[groupIndex] == null" @click="emit('open-preview', groupIndex)">{{ groupCounts[groupIndex] ?? 0 }}</button></span>
                    <PerformanceIconButton v-if="modelValue.length > 1" icon="DeleteTrashOutlined" :label="`删除范围 ${groupIndex + 1}`" :disabled="disabled" @click="removeGroup(groupIndex)" />
                  </div>
                </div>
                <PerformanceConditionLogicGroup :count="modelValue[groupIndex].conditions.length" operator="且">
                  <template #default="{ index: conditionIndex }">
                    <div class="performance-audience-rule-editor__condition" :class="{ 'has-delete': modelValue[groupIndex].conditions.length > 1 }">
                      <PerformanceSearchSelect :model-value="modelValue[groupIndex].conditions[conditionIndex].field || null" :options="fieldOptions" selection-style="plain" disabled-surface="white" aria-label="范围字段" placeholder="请选择范围" :disabled="disabled" @update:model-value="updateField(groupIndex, conditionIndex, String($event || ''))" />
                      <PerformanceSearchSelect :model-value="modelValue[groupIndex].conditions[conditionIndex].operator" :options="isDateConditionField(modelValue[groupIndex].conditions[conditionIndex].field) ? HIRE_DATE_OPERATOR_OPTIONS : operatorOptions" selection-style="plain" disabled-surface="white" aria-label="范围操作" :disabled="disabled || !modelValue[groupIndex].conditions[conditionIndex].field" @update:model-value="updateOperator(groupIndex, conditionIndex, String($event || 'include'))" />
                      <PerformanceOrganizationSelect v-if="modelValue[groupIndex].conditions[conditionIndex].field === 'department'" :model-value="modelValue[groupIndex].conditions[conditionIndex].values" :nodes="organizationTree" aria-label="部门范围" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, $event)" />
                      <PerformancePersonSelect v-else-if="modelValue[groupIndex].conditions[conditionIndex].field === 'employee'" :model-value="modelValue[groupIndex].conditions[conditionIndex].values" :options="conditionValueOptions('employee', { people: personOptions })" multiple aria-label="员工范围" placeholder="请选择员工" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, normalizeValues($event))" />
                      <PerformanceDepartureDateSelect v-else-if="modelValue[groupIndex].conditions[conditionIndex].field === 'departure_date'" :model-value="modelValue[groupIndex].conditions[conditionIndex].values.length === 1 ? modelValue[groupIndex].conditions[conditionIndex].values[0] : ''" :date-range="snapshotOptions?.departure_date_range ?? { min: null, max: null }" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, $event ? [$event] : [])" />
                      <PerformanceDateTimeField v-else-if="modelValue[groupIndex].conditions[conditionIndex].field === 'hire_date'" :model-value="modelValue[groupIndex].conditions[conditionIndex].values.length === 1 ? modelValue[groupIndex].conditions[conditionIndex].values[0] : ''" date-only :initial-date="initialDate(modelValue[groupIndex].conditions[conditionIndex].field)" aria-label="入职日期" placeholder="请选择日期" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, $event ? [$event] : [])" />
                      <component :is="snapshotFieldComponents[modelValue[groupIndex].conditions[conditionIndex].field]" v-else-if="snapshotFieldComponents[modelValue[groupIndex].conditions[conditionIndex].field]" :model-value="modelValue[groupIndex].conditions[conditionIndex].values" :options="valueOptions(modelValue[groupIndex].conditions[conditionIndex].field)" :aria-label="`${fieldLabel(modelValue[groupIndex].conditions[conditionIndex].field)}范围`" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, normalizeValues($event))" />
                      <PerformanceSearchSelect v-else-if="modelValue[groupIndex].conditions[conditionIndex].field" :model-value="modelValue[groupIndex].conditions[conditionIndex].values" :options="valueOptions(modelValue[groupIndex].conditions[conditionIndex].field)" multiple :aria-label="`${fieldLabel(modelValue[groupIndex].conditions[conditionIndex].field)}范围`" :placeholder="`请选择${fieldLabel(modelValue[groupIndex].conditions[conditionIndex].field)}`" :disabled="disabled" @open="emit('open-options')" @update:model-value="updateValues(groupIndex, conditionIndex, normalizeValues($event))" />
                      <PerformanceSearchSelect v-else :model-value="[]" :options="[]" multiple aria-label="范围条件值" placeholder="请选择" disabled disabled-surface="white" />
                      <PerformanceIconButton v-if="modelValue[groupIndex].conditions.length > 1" icon="DeleteTrashOutlined" :label="`删除范围 ${groupIndex + 1} 条件 ${conditionIndex + 1}`" :disabled="disabled" @click="removeCondition(groupIndex, conditionIndex)" />
                    </div>
                  </template>
                </PerformanceConditionLogicGroup>
                <PerformanceTextButton v-if="allowMultipleConditions" label="＋ 添加条件" :disabled="disabled" @click="addCondition(groupIndex)" />
                <div v-if="groupIndex < modelValue.length - 1" class="performance-audience-rule-editor__or">或</div>
              </div>
            </template>
      </div>
      </div>
      </div>
      <div class="performance-audience-rule-editor__scope-tools">
        <PerformanceTextButton
          v-if="scopeMode"
          class="performance-audience-rule-editor__scope-add"
          label="添加条件"
          aria-label="添加条件"
          :disabled="disabled"
          @click="addGroup"
        >
          <template #icon>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a1 1 0 0 1 1 1v8h8a1 1 0 1 1 0 2h-8v8a1 1 0 1 1-2 0v-8H3a1 1 0 1 1 0-2h8V3a1 1 0 0 1 1-1Z" fill="currentColor" /></svg>
          </template>
        </PerformanceTextButton>
        <PerformanceTextButton v-else label="＋ 添加人员范围" :disabled="disabled" @click="addGroup" />
      </div>
      <p v-if="error" class="performance-audience-rule-editor__error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import type { PerformanceAudienceCondition, PerformanceAudienceField, PerformanceAudienceGroup, PerformanceAudienceOperator, PerformanceEvaluatorOptions, PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceConditionLogicGroup from './PerformanceConditionLogicGroup.vue'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'
import PerformanceDepartureDateSelect from './PerformanceDepartureDateSelect.vue'
import PerformanceEmploymentStatusSelect from './PerformanceEmploymentStatusSelect.vue'
import PerformanceJobFamilySelect from './PerformanceJobFamilySelect.vue'
import PerformanceJobCategorySelect from './PerformanceJobCategorySelect.vue'
import PerformancePositionLevelSelect from './PerformancePositionLevelSelect.vue'
import PerformanceStandardPositionSelect from './PerformanceStandardPositionSelect.vue'
import { HIRE_DATE_OPERATOR_OPTIONS, PERFORMANCE_CONDITION_FIELDS, conditionValueOptions, isDateConditionField, type PerformanceConditionField } from './performanceConditionFields'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceOrganizationSelect from './PerformanceOrganizationSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'

export type { PerformanceAudienceCondition, PerformanceAudienceField, PerformanceAudienceGroup, PerformanceAudienceOperator } from '@/api/performance'

export type PerformanceAudienceCustomField = {
  value: string
  label: string
  component: Component
  options?: PerformanceSearchSelectOption[]
}

const props = withDefaults(defineProps<{
  modelValue: PerformanceAudienceGroup[]
  allowedFields: PerformanceAudienceField[]
  customFields?: PerformanceAudienceCustomField[]
  organizationTree?: PerformanceHrbpOrganizationNode[]
  personOptions?: PerformanceSearchSelectOption[]
  employeeTypeOptions?: PerformanceSearchSelectOption[]
  positionLevelOptions?: PerformanceSearchSelectOption[]
  hireDateRange?: { min: string | null; max: string | null }
  snapshotOptions?: PerformanceEvaluatorOptions
  scopeMode?: boolean
  embedded?: boolean
  showScopeHeading?: boolean
  operatorDisabled?: boolean
  defaultField?: string
  disabled?: boolean
  loading?: boolean
  error?: string
  groupCounts?: number[]
}>(), {
  organizationTree: () => [],
  personOptions: () => [],
  employeeTypeOptions: () => [],
  scopeMode: false,
  embedded: false,
  showScopeHeading: true,
  operatorDisabled: false,
  defaultField: '',
  disabled: false,
  loading: false,
  error: '',
  groupCounts: () => [],
})
const emit = defineEmits<{ 'update:modelValue': [value: PerformanceAudienceGroup[]]; 'open-options': []; 'open-preview': [groupIndex: number] }>()
const operatorOptions: PerformanceSearchSelectOption[] = [
  { value: 'include', label: '包含' },
  { value: 'exclude', label: '不包含' },
]
const snapshotFieldComponents: Partial<Record<PerformanceAudienceField, Component>> = {
  employment_status: PerformanceEmploymentStatusSelect,
  job_family: PerformanceJobFamilySelect,
  job_category: PerformanceJobCategorySelect,
  position_level: PerformancePositionLevelSelect,
  standard_position: PerformanceStandardPositionSelect,
}
const fieldOptions = computed(() => [
  ...props.allowedFields.map(value => ({ value, label: value ? PERFORMANCE_CONDITION_FIELDS[value].label : '请选择范围' })),
  ...(props.customFields || []).map(({ value, label }) => ({ value, label })),
])
const allowMultipleConditions = computed(() => !props.scopeMode)

function customField(field: string) { return props.customFields?.find(option => option.value === field) }
function fieldLabel(field: string) {
  return customField(field)?.label || (field && field in PERFORMANCE_CONDITION_FIELDS ? PERFORMANCE_CONDITION_FIELDS[field as PerformanceConditionField].label : '')
}
function valueOptions(field: PerformanceAudienceField) {
  return field ? conditionValueOptions(field as PerformanceConditionField, { ...props.snapshotOptions, people: props.personOptions, employeeTypes: props.employeeTypeOptions }) : []
}
function initialDate(field: PerformanceAudienceField) {
  const range = field === 'departure_date' ? props.snapshotOptions?.departure_date_range : props.hireDateRange
  return range?.min || range?.max || undefined
}
function normalizeValues(value: string | string[] | null) {
  return Array.isArray(value) ? value : value ? [value] : []
}
function cloneGroups() {
  return props.modelValue.map(group => ({ conditions: group.conditions.map(condition => ({ ...condition, values: [...condition.values] })) }))
}
function updateCondition(groupIndex: number, conditionIndex: number, patch: Partial<PerformanceAudienceCondition>) {
  const groups = cloneGroups()
  groups[groupIndex].conditions[conditionIndex] = { ...groups[groupIndex].conditions[conditionIndex], ...patch }
  emit('update:modelValue', groups)
}
function updateField(groupIndex: number, conditionIndex: number, value: string) {
  const field = props.allowedFields.includes(value as PerformanceAudienceField) || customField(value) ? value as PerformanceAudienceField : ''
  updateCondition(groupIndex, conditionIndex, { field, operator: isDateConditionField(field) ? 'before' : 'include', values: [] })
}
function updateOperator(groupIndex: number, conditionIndex: number, value: string) {
  const field = props.modelValue[groupIndex].conditions[conditionIndex].field
  const options = isDateConditionField(field) ? HIRE_DATE_OPERATOR_OPTIONS : operatorOptions
  if (options.some(option => option.value === value)) updateCondition(groupIndex, conditionIndex, { operator: value as PerformanceAudienceOperator })
}
function updateValues(groupIndex: number, conditionIndex: number, values: string[]) {
  if (!props.modelValue[groupIndex]?.conditions[conditionIndex]?.field) return
  updateCondition(groupIndex, conditionIndex, { values })
}
function addGroup() {
  const field = props.allowedFields.includes(props.defaultField as PerformanceAudienceField) || customField(props.defaultField) ? props.defaultField as PerformanceAudienceField : ''
  emit('update:modelValue', [...cloneGroups(), { conditions: [{ field, operator: 'include', values: [] }] }])
}
function removeGroup(index: number) {
  const groups = cloneGroups()
  groups.splice(index, 1)
  emit('update:modelValue', groups.length ? groups : [{ conditions: [{ field: '', operator: 'include', values: [] }] }])
}
function addCondition(groupIndex: number) {
  const groups = cloneGroups()
  groups[groupIndex].conditions.push({ field: '', operator: 'include', values: [] })
  emit('update:modelValue', groups)
}
function removeCondition(groupIndex: number, conditionIndex: number) {
  const groups = cloneGroups()
  groups[groupIndex].conditions.splice(conditionIndex, 1)
  if (!groups[groupIndex].conditions.length) groups.splice(groupIndex, 1)
  emit('update:modelValue', groups.length ? groups : [{ conditions: [{ field: '', operator: 'include', values: [] }] }])
}
</script>

<style scoped>
.performance-audience-rule-editor { min-width: 0; }
.performance-audience-rule-editor.is-scope { margin-top: var(--spacing-2); padding: var(--spacing-5); border-radius: var(--radius-lg); background: var(--performance-review-readonly-surface); }
.performance-audience-rule-editor.is-scope.is-embedded { margin-top: 0; padding: 0; border-radius: 0; background: transparent; }
.performance-audience-rule-editor__scope-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-2); margin-bottom: var(--spacing-2); color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); }
.performance-audience-rule-editor__scope-heading span:last-child { color: var(--performance-count-badge-text); }
.performance-audience-rule-editor__groups { min-width: 0; }
.performance-audience-rule-editor.is-scope .performance-audience-rule-editor__groups { display: flex; align-items: stretch; }
.performance-audience-rule-editor.is-scope .performance-audience-rule-editor__scope-add { margin-top: var(--spacing-2); }
.performance-audience-rule-editor.is-scope.is-embedded .performance-audience-rule-editor__group { margin-bottom: var(--spacing-2); }
.performance-audience-rule-editor.is-scope.is-embedded .performance-audience-rule-editor__scope-add { margin-top: 0; }
.performance-audience-rule-editor__main { min-width: 0; flex: 1; }
.performance-audience-rule-editor__rows { min-width: 0; }
.performance-audience-rule-editor__scope-tools { min-width: 0; }
.performance-audience-rule-editor.is-scope .performance-audience-rule-editor__group { margin: 0 0 var(--spacing-2); padding: 0; border-radius: 0; background: transparent; }
.performance-audience-rule-editor.is-scope .performance-audience-rule-editor__condition { grid-template-columns: 128px 88px minmax(0, 1fr); margin: 0; }
.performance-audience-rule-editor.is-scope .performance-audience-rule-editor__scope-heading + .performance-audience-rule-editor__groups { min-width: 0; }
.performance-audience-rule-editor.is-scope .performance-audience-rule-editor__condition.has-delete { grid-template-columns: 128px 88px minmax(0, 1fr) 24px; }
.performance-audience-rule-editor.is-scope .performance-audience-rule-editor__condition > :deep(.performance-icon-button) { --performance-icon-button-size: 24px; margin-top: 4px; }
.performance-audience-rule-editor__scope-or { display: flex; width: 20px; flex: 0 0 20px; flex-direction: column; align-items: center; align-self: stretch; margin: 0 var(--spacing-2) 0 0; padding: 6px 0; box-sizing: border-box; color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); }
.performance-audience-rule-editor__scope-or span:first-child, .performance-audience-rule-editor__scope-or span:last-child { width: 7px; min-height: 0; flex: 1; margin-left: 7px; border-left: 1px solid var(--color-border); }
.performance-audience-rule-editor__scope-or span:nth-child(2) { margin: 2px 0; }
.performance-audience-rule-editor__scope-or span:first-child { border-top: 1px solid var(--color-border); border-radius: var(--radius-xs) 0 0; }
.performance-audience-rule-editor__scope-or span:last-child { border-bottom: 1px solid var(--color-border); border-radius: 0 0 0 var(--radius-xs); }
.performance-audience-rule-editor__scope-add { align-self: flex-start; margin-top: var(--spacing-2); }
.performance-audience-rule-editor__scope-add :deep(.text-button-icon) { width: 14px; height: 14px; }
.performance-audience-rule-editor__group { margin-top: var(--spacing-3); padding: var(--spacing-4); border-radius: var(--radius-lg); background: var(--performance-evaluation-rule-surface); }
.performance-audience-rule-editor__group:first-child { margin-top: 0; }
.performance-audience-rule-editor__group-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-3); color: var(--color-text-secondary); font: 400 var(--font-size-md)/22px var(--font-sans); }
.performance-audience-rule-editor__group-heading-actions { display: flex; align-items: center; gap: var(--spacing-2); }
.performance-audience-rule-editor__group-count { white-space: nowrap; }
.performance-audience-rule-editor__count-link { padding: 0; border: 0; background: transparent; color: var(--performance-button-text-color); cursor: pointer; font: inherit; }
.performance-audience-rule-editor__count-link:disabled { color: var(--performance-button-link-disabled-color); cursor: default; }
.performance-audience-rule-editor__condition { display: grid; grid-template-columns: 112px 96px minmax(0, 1fr) 24px; gap: var(--spacing-2); align-items: start; margin-top: var(--spacing-2); }
.performance-audience-rule-editor__condition:first-child { margin-top: 0; }
.performance-audience-rule-editor__condition > :deep(.performance-select-shell) { min-width: 0; }
.performance-audience-rule-editor__condition > :deep(.performance-organization-tree-select__trigger), .performance-audience-rule-editor__condition > :deep(.performance-search-select__trigger) { min-width: 0; }
.performance-audience-rule-editor__or { margin: var(--spacing-4) calc(var(--spacing-4) * -1) 0; padding-top: var(--spacing-3); border-top: 1px solid var(--color-line-divider); color: var(--color-text-secondary); line-height: 22px; }
.performance-audience-rule-editor__state { padding: var(--spacing-4); color: var(--color-text-secondary); text-align: center; }
.performance-audience-rule-editor__error { margin: var(--spacing-2) 0 0; color: var(--performance-field-error-color); font-size: var(--performance-field-error-font-size); line-height: var(--performance-field-error-line-height); }
.performance-audience-rule-editor.is-disabled { opacity: .65; }
@media (max-width: 720px) { .performance-audience-rule-editor__condition { grid-template-columns: 1fr 1fr 24px; }.performance-audience-rule-editor__condition > :deep(.performance-search-select) { min-width: 0; }.performance-audience-rule-editor__condition > :deep(.performance-select-shell) { grid-column: 1 / -1; }.performance-audience-rule-editor__condition > :deep(.performance-icon-button) { grid-column: 3; grid-row: 1; } }
</style>
