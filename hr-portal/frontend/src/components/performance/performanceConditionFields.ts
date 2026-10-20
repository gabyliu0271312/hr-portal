import type { PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'

export type PerformanceConditionField = 'department' | 'employee_type' | 'hire_date' | 'employee' | 'calibrator_relation'
export type PerformanceConditionValueSource = 'organization' | 'people' | 'employee_types' | 'hire_date' | 'fixed'

export const HIRE_DATE_OPERATOR_OPTIONS: PerformanceSearchSelectOption[] = [
  { value: 'before', label: '早于' },
  { value: 'not_before', label: '不早于' },
  { value: 'after', label: '晚于' },
  { value: 'not_after', label: '不晚于' },
]

export function validHireDateCondition(operator: string, values: string[]) {
  if (!HIRE_DATE_OPERATOR_OPTIONS.some(option => option.value === operator) || values.length !== 1) return false
  const value = values[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.slice(0, 4) === '0000') return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export const CALIBRATOR_RELATION_OPTIONS: PerformanceSearchSelectOption[] = [
  { value: 'ALL_SUBORDINATES', label: '校准人的全部下级' },
  { value: 'DIRECT_SUBORDINATES', label: '校准人的直属下级' },
  { value: 'INDIRECT_SUBORDINATES', label: '校准人的隔级下级' },
]

export const PERFORMANCE_CONDITION_FIELDS: Record<PerformanceConditionField, {
  label: string
  valueSource: PerformanceConditionValueSource
  options?: PerformanceSearchSelectOption[]
}> = {
  department: { label: '部门', valueSource: 'organization' },
  employee_type: { label: '人员类型', valueSource: 'employee_types' },
  hire_date: { label: '入职日期', valueSource: 'hire_date' },
  employee: { label: '员工', valueSource: 'people' },
  calibrator_relation: { label: '与校准人关系', valueSource: 'fixed', options: CALIBRATOR_RELATION_OPTIONS },
}

export function conditionValueOptions(field: PerformanceConditionField, sources: {
  people?: PerformanceSearchSelectOption[]
  employeeTypes?: PerformanceSearchSelectOption[]
}) {
  const definition = PERFORMANCE_CONDITION_FIELDS[field]
  if (definition.valueSource === 'people') return sources.people || []
  if (definition.valueSource === 'employee_types') return sources.employeeTypes || []
  return definition.options || []
}
