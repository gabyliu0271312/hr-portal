import type { PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'

export type PerformanceConditionField = 'department' | 'employee_type' | 'hire_date' | 'employee' | 'employment_status' | 'departure_date' | 'job_family' | 'job_category' | 'position_level' | 'standard_position' | 'calibrator_relation'
export type PerformanceConditionValueSource = 'organization' | 'people' | 'employee_types' | 'hire_date' | 'employment_statuses' | 'departure_date' | 'job_families' | 'job_categories' | 'position_levels' | 'standard_positions' | 'fixed'

export const REVIEWEE_CONDITION_FIELDS = ['department', 'employee_type', 'hire_date', 'employee', 'employment_status', 'departure_date', 'job_family', 'job_category', 'position_level', 'standard_position'] as const

export function isDateConditionField(field: string) {
  return field === 'hire_date' || field === 'departure_date'
}

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
  employment_status: { label: '在职状态', valueSource: 'employment_statuses' },
  departure_date: { label: '离职日期', valueSource: 'departure_date' },
  job_family: { label: '职位族', valueSource: 'job_families' },
  job_category: { label: '职位类', valueSource: 'job_categories' },
  position_level: { label: '职级', valueSource: 'position_levels' },
  standard_position: { label: '标准职位', valueSource: 'standard_positions' },
  calibrator_relation: { label: '与校准人关系', valueSource: 'fixed', options: CALIBRATOR_RELATION_OPTIONS },
}

export function conditionValueOptions(field: PerformanceConditionField, sources: {
  people?: PerformanceSearchSelectOption[]
  employeeTypes?: PerformanceSearchSelectOption[]
  employment_statuses?: PerformanceSearchSelectOption[]
  job_families?: PerformanceSearchSelectOption[]
  job_categories?: PerformanceSearchSelectOption[]
  position_levels?: PerformanceSearchSelectOption[]
  standard_positions?: PerformanceSearchSelectOption[]
}) {
  const definition = PERFORMANCE_CONDITION_FIELDS[field]
  if (definition.valueSource === 'people') return sources.people || []
  if (definition.valueSource === 'employee_types') return sources.employeeTypes || []
  if (definition.valueSource in sources) return sources[definition.valueSource as keyof typeof sources] || []
  return definition.options || []
}
