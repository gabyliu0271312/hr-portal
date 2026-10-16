<template>
  <div class="performance-audience-rule-editor" :class="{ 'is-disabled': disabled }">
    <div v-if="loading" class="performance-audience-rule-editor__state" role="status">正在加载范围选项...</div>
    <div v-else>
      <div v-for="(group, groupIndex) in modelValue" :key="groupIndex" class="performance-audience-rule-editor__group">
        <div class="performance-audience-rule-editor__group-heading">
          <span>范围 {{ groupIndex + 1 }}</span>
          <PerformanceIconButton
            v-if="modelValue.length > 1"
            icon="DeleteTrashOutlined"
            :label="`删除范围 ${groupIndex + 1}`"
            :disabled="disabled"
            @click="removeGroup(groupIndex)"
          />
        </div>
        <div v-for="(condition, conditionIndex) in group.conditions" :key="conditionIndex" class="performance-audience-rule-editor__condition">
          <label class="performance-audience-rule-editor__select">
            <span class="sr-only">范围字段</span>
            <select :value="condition.field" :disabled="disabled" aria-label="范围字段" @change="updateField(groupIndex, conditionIndex, ($event.target as HTMLSelectElement).value)">
              <option v-for="option in fieldOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <span class="performance-audience-rule-editor__select-arrow" aria-hidden="true">⌄</span>
          </label>
          <label class="performance-audience-rule-editor__select">
            <span class="sr-only">范围操作</span>
            <select :value="condition.operator" :disabled="disabled || !condition.field" aria-label="范围操作" @change="updateOperator(groupIndex, conditionIndex, ($event.target as HTMLSelectElement).value)">
              <option v-for="option in operatorOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
            <span class="performance-audience-rule-editor__select-arrow" aria-hidden="true">⌄</span>
          </label>
          <PerformanceOrganizationSelect
            v-if="condition.field === 'department'"
            :model-value="condition.values"
            :nodes="organizationTree"
            aria-label="部门范围"
            :disabled="disabled"
            @open="emit('open-options')"
            @update:model-value="updateValues(groupIndex, conditionIndex, $event)"
          />
          <PerformancePersonSelect
            v-else-if="condition.field === 'employee'"
            :model-value="condition.values"
            :options="personOptions"
            multiple
            aria-label="员工范围"
            placeholder="请选择员工"
            :disabled="disabled"
            @open="emit('open-options')"
            @update:model-value="updateValues(groupIndex, conditionIndex, normalizeValues($event))"
          />
          <PerformanceSearchSelect
            v-else-if="condition.field === 'employee_type'"
            :model-value="condition.values"
            :options="employeeTypeOptions"
            multiple
            aria-label="人员类型范围"
            placeholder="请选择人员类型"
            :disabled="disabled"
            @open="emit('open-options')"
            @update:model-value="updateValues(groupIndex, conditionIndex, normalizeValues($event))"
          />
          <PerformanceSearchSelect
            v-else
            :model-value="[]"
            :options="[]"
            multiple
            aria-label="范围条件值"
            placeholder="请选择"
            disabled
          />
          <PerformanceIconButton
            v-if="group.conditions.length > 1"
            icon="DeleteTrashOutlined"
            :label="`删除范围 ${groupIndex + 1} 条件 ${conditionIndex + 1}`"
            :disabled="disabled"
            @click="removeCondition(groupIndex, conditionIndex)"
          />
        </div>
        <PerformanceTextButton
          v-if="allowMultipleConditions"
          label="＋ 添加条件"
          :disabled="disabled"
          @click="addCondition(groupIndex)"
        />
        <div v-if="groupIndex < modelValue.length - 1" class="performance-audience-rule-editor__or">或</div>
      </div>
      <PerformanceTextButton
        label="＋ 添加人员范围"
        :disabled="disabled"
        @click="addGroup"
      />
      <p v-if="error" class="performance-audience-rule-editor__error" role="alert">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceHrbpOrganizationNode } from '@/api/performance'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceOrganizationSelect from './PerformanceOrganizationSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformanceSearchSelect, { type PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'

export type PerformanceAudienceField = '' | 'department' | 'employee_type' | 'employee'
export type PerformanceAudienceOperator = 'include' | 'exclude'
export type PerformanceAudienceCondition = { field: PerformanceAudienceField; operator: PerformanceAudienceOperator; values: string[] }
export type PerformanceAudienceGroup = { conditions: PerformanceAudienceCondition[] }

const props = withDefaults(defineProps<{
  modelValue: PerformanceAudienceGroup[]
  allowedFields: PerformanceAudienceField[]
  organizationTree?: PerformanceHrbpOrganizationNode[]
  personOptions?: PerformanceSearchSelectOption[]
  employeeTypeOptions?: PerformanceSearchSelectOption[]
  disabled?: boolean
  loading?: boolean
  error?: string
}>(), {
  organizationTree: () => [],
  personOptions: () => [],
  employeeTypeOptions: () => [],
  disabled: false,
  loading: false,
  error: '',
})
const emit = defineEmits<{ 'update:modelValue': [value: PerformanceAudienceGroup[]]; 'open-options': [] }>()
const operatorOptions: PerformanceSearchSelectOption[] = [
  { value: 'include', label: '包含' },
  { value: 'exclude', label: '不包含' },
]
const fieldLabels: Record<PerformanceAudienceField, string> = {
  '': '请选择范围',
  department: '部门',
  employee_type: '人员类型',
  employee: '员工',
}
const fieldOptions = computed(() => [{ value: '', label: '请选择范围' }, ...props.allowedFields.map(value => ({ value, label: fieldLabels[value] }))])
const allowMultipleConditions = computed(() => props.allowedFields.length > 2)

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
  const field = props.allowedFields.includes(value as PerformanceAudienceField) ? value as PerformanceAudienceField : ''
  updateCondition(groupIndex, conditionIndex, { field, values: [] })
}
function updateOperator(groupIndex: number, conditionIndex: number, value: string) {
  updateCondition(groupIndex, conditionIndex, { operator: value === 'exclude' ? 'exclude' : 'include' })
}
function updateValues(groupIndex: number, conditionIndex: number, values: string[]) {
  if (!props.modelValue[groupIndex]?.conditions[conditionIndex]?.field) return
  updateCondition(groupIndex, conditionIndex, { values })
}
function addGroup() {
  emit('update:modelValue', [...cloneGroups(), { conditions: [{ field: '', operator: 'include', values: [] }] }])
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
.performance-audience-rule-editor__group { margin-top: var(--spacing-3); padding: var(--spacing-4); border-radius: var(--radius-lg); background: var(--performance-evaluation-rule-surface); }
.performance-audience-rule-editor__group:first-child { margin-top: 0; }
.performance-audience-rule-editor__group-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--spacing-3); color: var(--color-text-primary); font: 600 var(--font-size-md)/22px var(--font-sans); }
.performance-audience-rule-editor__select { position: relative; display: block; min-width: 0; }
.performance-audience-rule-editor__select select { width: 100%; height: 32px; padding: 1px 28px 1px 11px; border: 1px solid var(--performance-field-border); border-radius: var(--performance-control-radius); background: var(--color-bg-card); color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); appearance: none; }
.performance-audience-rule-editor__select select:focus { border-color: var(--performance-field-border-focus); outline: 0; box-shadow: var(--performance-field-focus-ring); }
.performance-audience-rule-editor__select-arrow { position: absolute; top: 6px; right: 10px; color: var(--color-text-secondary); pointer-events: none; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
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
