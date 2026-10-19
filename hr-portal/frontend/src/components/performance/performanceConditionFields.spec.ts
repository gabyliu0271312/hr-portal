import { describe, expect, it } from 'vitest'
import { CALIBRATOR_RELATION_OPTIONS, PERFORMANCE_CONDITION_FIELDS, conditionValueOptions } from './performanceConditionFields'

describe('performanceConditionFields', () => {
  it('maps each field to its value source without adding API endpoints', () => {
    expect(PERFORMANCE_CONDITION_FIELDS.department.valueSource).toBe('organization')
    expect(PERFORMANCE_CONDITION_FIELDS.employee.valueSource).toBe('people')
    expect(PERFORMANCE_CONDITION_FIELDS.employee_type.valueSource).toBe('employee_types')
    expect(PERFORMANCE_CONDITION_FIELDS.calibrator_relation.valueSource).toBe('fixed')
    expect(conditionValueOptions('employee', { people: [{ value: 'E1', label: '员工 E1' }] })).toEqual([{ value: 'E1', label: '员工 E1' }])
    expect(conditionValueOptions('employee_type', { employeeTypes: [{ value: 'FULL', label: '正式' }] })).toEqual([{ value: 'FULL', label: '正式' }])
  })

  it('defines the three ordered subordinate options with disjoint direct and indirect meanings', () => {
    expect(CALIBRATOR_RELATION_OPTIONS).toEqual([
      { value: 'ALL_SUBORDINATES', label: '校准人的全部下级' },
      { value: 'DIRECT_SUBORDINATES', label: '校准人的直属下级' },
      { value: 'INDIRECT_SUBORDINATES', label: '校准人的隔级下级' },
    ])
    expect(conditionValueOptions('calibrator_relation', {})).toBe(CALIBRATOR_RELATION_OPTIONS)
  })
})
