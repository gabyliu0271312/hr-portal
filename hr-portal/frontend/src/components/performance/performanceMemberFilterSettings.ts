import type { PerformanceMemberFilterCondition, PerformanceMemberFilterField } from '@/api/performance'
import type { PerformanceFilterCondition } from './performanceFieldSettings'

export const MEMBER_FILTER_KEY_BY_SETTING_KEY: Record<string, string> = {
  directLeader: 'direct_supervisor',
  hrbp: 'hrbp',
  departments: 'department_path',
  directDepartment: 'department',
  level: 'position_level',
  allCategories: 'job_sequence_descendants',
  directCategory: 'job_sequence',
  userId: 'name',
  joinDate: 'hire_date',
  employeeType: 'employee_type',
  activity: 'project_name',
}

const LEGACY_DEFAULT_KEYS = ['direct_supervisor', 'supervisors', 'department_path', 'department', 'position_level', 'job_sequence_descendants', 'job_sequence', 'name']

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function memberFilterSettingKeys(settings: PerformanceFilterCondition[] | null): { ordered: string[]; defaults: string[] } {
  if (!settings) return { ordered: LEGACY_DEFAULT_KEYS, defaults: LEGACY_DEFAULT_KEYS }
  return {
    ordered: unique(settings.map(item => MEMBER_FILTER_KEY_BY_SETTING_KEY[item.filter_key]).filter(Boolean)),
    defaults: unique(settings.filter(item => item.default).map(item => MEMBER_FILTER_KEY_BY_SETTING_KEY[item.filter_key]).filter(Boolean)),
  }
}

export function orderMemberFilterFields<T extends { key: string }>(fields: T[], ordered: string[]): T[] {
  const rank = new Map(ordered.map((key, index) => [key, index]))
  return fields
    .map((field, index) => ({ field, index }))
    .sort((left, right) => {
      const leftRank = rank.get(left.field.key)
      const rightRank = rank.get(right.field.key)
      if (leftRank === undefined && rightRank === undefined) return left.index - right.index
      if (leftRank === undefined) return 1
      if (rightRank === undefined) return -1
      return leftRank - rightRank
    })
    .map(item => item.field)
}

export function defaultMemberFilterRows(fields: PerformanceMemberFilterField[], keys: string[]): PerformanceMemberFilterCondition[] {
  const hasDescendants = keys.includes('job_sequence_descendants') && fields.some(field => field.key === 'job_sequence_descendants')
  return keys
    .filter(key => !(key === 'job_sequence' && hasDescendants))
    .flatMap(key => {
      const field = fields.find(item => item.key === key)
      return field ? [{ key, op: field.operators[0].value, values: [] }] : []
    })
}
