<template>
  <div class="calibration-condition-group">
    <div class="calibration-condition-group__heading">
      <span>{{ title }}</span>
      <span class="calibration-condition-group__count">{{ countText }}</span>
    </div>
    <div v-for="(condition, index) in modelValue.conditions" :key="index" class="calibration-condition-group__row">
      <div class="calibration-condition-group__fields">
        <label class="calibration-select">
          <span class="sr-only">{{ fieldLabel }}类型</span>
          <select :value="condition.field" @change="updateField(index, ($event.target as HTMLSelectElement).value)">
            <option v-for="option in fieldOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor" /></svg>
        </label>
        <label class="calibration-select calibration-select--operator">
          <span class="sr-only">操作</span>
          <select :value="condition.operator" @change="updateOperator(index, ($event.target as HTMLSelectElement).value)">
            <option v-for="option in operatorOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.414 7.086-.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor" /></svg>
        </label>
        <div class="calibration-value-select">
          <PerformancePersonSelect
            :model-value="condition.values"
            :options="valueOptions"
            multiple
            placeholder="请输入"
            :aria-label="`${fieldLabel}条件值`"
            @update:model-value="updateValues(index, $event)"
          />
        </div>
      </div>
    </div>
    <button type="button" class="calibration-condition-group__add" @click="addCondition">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.709 4.058C12.595 4 12.445 4 12.147 4h-.294c-.298 0-.448 0-.562.058a.534.534 0 0 0-.233.233C11 4.405 11 4.555 11 4.853V11H4.853c-.298 0-.448 0-.562.058a.534.534 0 0 0-.233.233C4 11.405 4 11.555 4 11.853v.294c0 .298 0 .448.058.562.051.1.133.182.233.233.114.058.264.058.562.058H11v6.147c0 .298 0 .448.058.562.051.1.133.182.233.233.114.058.264.058.562.058h.294c.298 0 .448 0 .562-.058a.535.535 0 0 0 .233-.233c.058-.114.058-.264.058-.562V13h6.147c.298 0 .448 0 .562-.058a.535.535 0 0 0 .233-.233c.058-.114.058-.264.058-.562v-.294c0-.298 0-.448-.058-.562a.535.535 0 0 0-.233-.233C19.595 11 19.445 11 19.147 11H13V4.853c0-.298 0-.448-.058-.562a.534.534 0 0 0-.233-.233Z" fill="currentColor" /></svg>
      <span>添加条件</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'

type CalibrationCondition = {
  field: 'department' | 'employee_type' | 'employee' | 'calibrator_relation'
  operator: 'INCLUDE' | 'EXCLUDE'
  values: string[]
}
type CalibrationConditionGroup = { conditions: CalibrationCondition[] }

type Option = { value: string; label: string }
const props = withDefaults(defineProps<{
  modelValue: CalibrationConditionGroup
  title: string
  fieldLabel: string
  fieldOptions: Option[]
  valueOptions?: Option[]
  count?: number
  countSuffix?: string
}>(), { valueOptions: () => [], count: 0, countSuffix: '' })
const emit = defineEmits<{ 'update:modelValue': [value: CalibrationConditionGroup] }>()
const operatorOptions = [{ value: 'INCLUDE', label: '包含' }, { value: 'EXCLUDE', label: '不包含' }]
const countText = computed(() => `共 ${props.count} 人${props.countSuffix}`)
function updateCondition(index: number, patch: Partial<CalibrationCondition>) {
  const conditions = props.modelValue.conditions.map((condition, conditionIndex) => conditionIndex === index ? { ...condition, ...patch } : condition)
  emit('update:modelValue', { ...props.modelValue, conditions })
}
function updateField(index: number, value: string | string[] | null) {
  updateCondition(index, { field: String(value || 'employee') as CalibrationCondition['field'] })
}
function updateOperator(index: number, value: string | string[] | null) {
  updateCondition(index, { operator: String(value || 'INCLUDE') as CalibrationCondition['operator'] })
}
function updateValues(index: number, value: string | string[] | null) {
  updateCondition(index, { values: Array.isArray(value) ? value : value ? [value] : [] })
}
function addCondition() {
  const first = props.modelValue.conditions[0] || { field: props.fieldOptions[0]?.value || 'employee', operator: 'INCLUDE' as const, values: [] }
  emit('update:modelValue', { conditions: [...props.modelValue.conditions, { ...first, values: [] }] })
}
</script>

<style scoped>
.calibration-condition-group{display:flex;flex-direction:column;min-width:0;padding:16px 20px;border-radius:8px;background:#f5f6f7;box-sizing:border-box;color:#1f2329}.calibration-condition-group__heading{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;font:600 14px/22px var(--font-sans)}.calibration-condition-group__count{color:#646a73;font-weight:400}.calibration-condition-group__row{display:flex;align-items:flex-start;margin-top:8px}.calibration-condition-group__row:first-of-type{margin-top:0}.calibration-condition-group__fields{display:flex;flex:1;min-width:0;align-items:center}.calibration-select,.calibration-value-select{position:relative;display:flex;align-items:center;min-width:0;height:32px;margin:0 8px;box-sizing:border-box}.calibration-select{flex:0 0 112px}.calibration-select--operator{flex:0 0 96px}.calibration-select select{width:100%;height:32px;padding:1px 28px 1px 11px;border:1px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:400 14px/22px var(--font-sans);appearance:none}.calibration-select svg{position:absolute;right:10px;width:12px;height:12px;color:#646a73;pointer-events:none}.calibration-value-select{flex:1;margin-right:0}.calibration-value-select :deep(.performance-select-shell){width:100%}.calibration-condition-group__add{display:inline-flex;align-items:center;width:max-content;margin-top:8px;padding:0;border:0;background:transparent;color:#3370ff;font:400 14px/22px var(--font-sans);cursor:pointer}.calibration-condition-group__add svg{width:16px;height:16px;margin-right:4px}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
