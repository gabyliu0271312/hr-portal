<template>
  <div class="calibration-condition-group">
    <div class="calibration-condition-group__heading">
      <span>{{ title }}</span>
      <span class="calibration-condition-group__count">{{ countText }}</span>
      <PerformanceIconButton v-if="removable" icon="DeleteTrashOutlined" :label="`删除${fieldLabel}${title}`" @click="emit('remove')" />
    </div>
    <PerformanceConditionLogicGroup :count="modelValue.conditions.length" operator="且">
      <template #default="{ index }">
      <div class="calibration-condition-group__row">
        <div class="calibration-condition-group__fields">
        <div class="calibration-select"><PerformanceSearchSelect :model-value="modelValue.conditions[index].field" :options="optionFields" selection-style="plain" :aria-label="`${fieldLabel}类型`" @update:model-value="updateField(index, $event)" /></div>
        <div class="calibration-select calibration-select--operator"><PerformanceSearchSelect :model-value="modelValue.conditions[index].operator" :options="operatorOptions(modelValue.conditions[index].field)" selection-style="plain" aria-label="操作" @update:model-value="updateOperator(index, $event)" /></div>
        <div class="calibration-value-select">
          <PerformanceOrganizationSelect
            v-if="modelValue.conditions[index].field === 'department'"
            :model-value="modelValue.conditions[index].values"
            :nodes="organizationTree"
            :aria-label="`${fieldLabel}条件值`"
            @open="emit('open-options')"
            @update:model-value="updateValues(index, $event)"
          />
          <PerformanceSearchSelect
            v-else-if="modelValue.conditions[index].field === 'calibrator_relation'"
            :model-value="modelValue.conditions[index].values"
            :options="conditionValueOptions('calibrator_relation', {})"
            multiple
            placeholder="请选择与校准人的关系"
            :aria-label="`${fieldLabel}条件值`"
            @update:model-value="updateValues(index, $event)"
          />
          <PerformanceDateTimeField
            v-else-if="modelValue.conditions[index].field === 'hire_date'"
            :model-value="modelValue.conditions[index].values[0] || ''"
            date-only
            :initial-date="hireDateRange?.min || hireDateRange?.max || undefined"
            placeholder="请选择日期"
            :aria-label="`${fieldLabel}条件值`"
            @open="emit('open-options')"
            @update:model-value="updateValues(index, $event ? [$event] : [])"
          />
          <PerformancePersonSelect
            v-else
            :model-value="modelValue.conditions[index].values"
            :options="conditionValueOptions('employee', { people: valueOptions })"
            multiple
            placeholder="请输入"
            :aria-label="`${fieldLabel}条件值`"
            @open="emit('open-options')"
            @update:model-value="updateValues(index, $event)"
          />
        </div>
        </div>
        <PerformanceIconButton v-if="modelValue.conditions.length > 1" icon="DeleteTrashOutlined" :label="`删除${fieldLabel}条件 ${index + 1}`" @click="removeCondition(index)" />
      </div>
      </template>
    </PerformanceConditionLogicGroup>
    <button type="button" class="calibration-condition-group__add" @click="addCondition">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.709 4.058C12.595 4 12.445 4 12.147 4h-.294c-.298 0-.448 0-.562.058a.534.534 0 0 0-.233.233C11 4.405 11 4.555 11 4.853V11H4.853c-.298 0-.448 0-.562.058a.534.534 0 0 0-.233.233C4 11.405 4 11.555 4 11.853v.294c0 .298 0 .448.058.562.051.1.133.182.233.233.114.058.264.058.562.058H11v6.147c0 .298 0 .448.058.562.051.1.133.182.233.233.114.058.264.058.562.058h.294c.298 0 .448 0 .562-.058a.535.535 0 0 0 .233-.233c.058-.114.058-.264.058-.562V13h6.147c.298 0 .448 0 .562-.058a.535.535 0 0 0 .233-.233c.058-.114.058-.264.058-.562v-.294c0-.298 0-.448-.058-.562a.535.535 0 0 0-.233-.233C19.595 11 19.445 11 19.147 11H13V4.853c0-.298 0-.448-.058-.562a.534.534 0 0 0-.233-.233Z" fill="currentColor" /></svg>
      <span>添加条件</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceHrbpOrganizationNode, PerformanceCalibrationCondition, PerformanceCalibrationConditionGroup } from '@/api/performance'
import PerformanceConditionLogicGroup from './PerformanceConditionLogicGroup.vue'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import PerformanceOrganizationSelect from './PerformanceOrganizationSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import { CALIBRATOR_RELATION_OPTIONS, HIRE_DATE_OPERATOR_OPTIONS, conditionValueOptions } from './performanceConditionFields'

type Option = { value: string; label: string }
const props = withDefaults(defineProps<{
  modelValue: PerformanceCalibrationConditionGroup
  title: string
  fieldLabel: string
  fieldOptions: Option[]
  valueOptions?: Option[]
  organizationTree?: PerformanceHrbpOrganizationNode[]
  hireDateRange?: { min: string | null; max: string | null }
  count?: number
  countSuffix?: string
  removable?: boolean
}>(), { valueOptions: () => [], organizationTree: () => [], count: 0, countSuffix: '', removable: false })
const emit = defineEmits<{ 'update:modelValue': [value: PerformanceCalibrationConditionGroup]; remove: []; 'open-options': [] }>()
const includeOperatorOptions = [{ value: 'INCLUDE', label: '包含' }, { value: 'EXCLUDE', label: '不包含' }]
const operatorOptions = (field: PerformanceCalibrationCondition['field']) => field === 'hire_date' ? HIRE_DATE_OPERATOR_OPTIONS : includeOperatorOptions
const countText = computed(() => `共 ${props.count} 人${props.countSuffix}`)
const optionFields = computed(() => props.fieldOptions)
function updateCondition(index: number, patch: Partial<PerformanceCalibrationCondition>) {
  const conditions = props.modelValue.conditions.map((condition, conditionIndex) => conditionIndex === index ? { ...condition, ...patch } : condition)
  emit('update:modelValue', { ...props.modelValue, conditions })
}
function updateField(index: number, value: string | string[] | null) {
  const field = String(value || 'employee') as PerformanceCalibrationCondition['field']
  updateCondition(index, { field, operator: field === 'hire_date' ? 'before' : 'INCLUDE', values: [] })
}
function updateOperator(index: number, value: string | string[] | null) {
  const field = props.modelValue.conditions[index].field
  const operator = String(value || (field === 'hire_date' ? 'before' : 'INCLUDE')) as PerformanceCalibrationCondition['operator']
  if (operatorOptions(field).some(option => option.value === operator)) updateCondition(index, { operator })
}
function updateValues(index: number, value: string | string[] | null) {
  const values = Array.isArray(value) ? value : value ? [value] : []
  updateCondition(index, { values: props.modelValue.conditions[index].field === 'calibrator_relation' ? values.filter(item => CALIBRATOR_RELATION_OPTIONS.some(option => option.value === item)) : values })
}
function removeCondition(index: number) {
  if (props.modelValue.conditions.length <= 1) return
  emit('update:modelValue', { ...props.modelValue, conditions: props.modelValue.conditions.filter((_, i) => i !== index) })
}
function addCondition() {
  const first = props.modelValue.conditions[0] || { field: props.fieldOptions[0]?.value || 'employee', operator: 'INCLUDE' as const, values: [] }
  emit('update:modelValue', { conditions: [...props.modelValue.conditions, { ...first, values: [] }] })
}
</script>

<style scoped>
.calibration-condition-group{display:flex;flex-direction:column;min-width:0;padding:16px 20px;border-radius:8px;background:#f5f6f7;box-sizing:border-box;color:#1f2329}.calibration-condition-group__heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;font:600 14px/22px var(--font-sans)}.calibration-condition-group__count{color:#646a73;font-weight:400}.calibration-condition-group__row>.performance-icon-button{flex:0 0 24px;margin-top:4px}.calibration-condition-group__row:first-child{margin-top:0}.calibration-condition-group__row{display:flex;align-items:flex-start;margin-top:8px}.calibration-condition-group__fields{display:flex;flex:1;min-width:0;align-items:center}.calibration-select,.calibration-value-select{position:relative;display:flex;align-items:center;min-width:0;height:32px;margin:0 8px;box-sizing:border-box}.calibration-select{flex:0 0 112px}.calibration-select--operator{flex:0 0 96px}.calibration-value-select{flex:1;margin-right:0}.calibration-value-select :deep(.performance-select-shell){width:100%}.calibration-condition-group__add{display:inline-flex;align-items:center;width:max-content;margin-top:8px;padding:0;border:0;background:transparent;color:#3370ff;font:400 14px/22px var(--font-sans);cursor:pointer}.calibration-condition-group__add svg{width:16px;height:16px;margin-right:4px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
