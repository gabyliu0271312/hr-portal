import type { PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'

export type PerformanceConditionField = 'department' | 'employee_type' | 'employee' | 'calibrator_relation'
export type PerformanceConditionValueSource = 'organization' | 'people' | 'employee_types' | 'fixed'

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
