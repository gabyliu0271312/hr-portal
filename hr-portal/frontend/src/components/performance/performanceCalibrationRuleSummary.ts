import type { PerformanceCalibrationCondition, PerformanceHrbpOrganizationNode, PerformanceProjectFlowRule } from '@/api/performance'
import { CALIBRATOR_RELATION_OPTIONS, HIRE_DATE_OPERATOR_OPTIONS } from './performanceConditionFields'

export type CalibrationSummaryPersonOption = { value: string; label: string; display_name?: string; avatar_url?: string }
export type CalibrationRuleSummaryOptions = { subject?: boolean; peopleOptions?: CalibrationSummaryPersonOption[]; organizationTree?: PerformanceHrbpOrganizationNode[] }
export type CalibrationSummaryValue = { value: string; label: string; avatarUrl?: string; person: boolean; available: boolean }
export type CalibrationSummaryCondition = { field: PerformanceCalibrationCondition['field']; label: string; operator: string; values: CalibrationSummaryValue[] }
export type CalibrationRuleSummary = { kind: 'all' | 'empty' | 'conditions'; label: string; groups: Array<{ conditions: CalibrationSummaryCondition[] }> }

export function normalizeCalibrationPersonLabel(person?: Pick<CalibrationSummaryPersonOption, 'value' | 'label' | 'display_name'>) {
  if (!person) return '人员信息不可用'
  let label = (person.display_name?.trim() || person.label).trim()
  const suffix = `（${person.value}）`
  const asciiSuffix = `(${person.value})`
  if (label.endsWith(suffix)) label = label.slice(0, -suffix.length).trim()
  else if (label.endsWith(asciiSuffix)) label = label.slice(0, -asciiSuffix.length).trim()
  return label && label !== person.value ? label : '人员信息不可用'
}

export function parseCalibrationRule(rule: PerformanceProjectFlowRule, options: CalibrationRuleSummaryOptions = {}): CalibrationRuleSummary {
  if (!options.subject && rule.scope === 'PROJECT_ALL') return { kind: 'all', label: '项目全员', groups: [] }
  const source = options.subject ? rule.subject_groups : rule.scope_groups
  if (!source?.length) return { kind: 'empty', label: '暂未配置', groups: [] }
  const people = new Map(options.peopleOptions?.map(person => [person.value, person]) || [])
  const departments = new Map<string, string>()
  function visit(nodes: PerformanceHrbpOrganizationNode[]) {
    nodes.forEach(node => { departments.set(node.value, node.label); visit(node.children || []) })
  }
  visit(options.organizationTree || [])
  const labels = { employee: '人员', department: '部门', hire_date: '入职日期', calibrator_relation: '与校准人关系' }
  const operators: Record<string, string> = { INCLUDE: '包含', EXCLUDE: '不包含', ...Object.fromEntries(HIRE_DATE_OPERATOR_OPTIONS.map(option => [option.value, option.label])) }
  const relations = new Map(CALIBRATOR_RELATION_OPTIONS.map(option => [option.value, option.label]))
  const groups = source.map(group => ({ conditions: group.conditions.map(condition => ({
    field: condition.field,
    label: labels[condition.field] || '未知字段',
    operator: operators[condition.operator] || '未知操作符',
    values: condition.values.map(value => {
      const person = people.get(value)
      const label = condition.field === 'employee' ? normalizeCalibrationPersonLabel(person) : condition.field === 'department' ? departments.get(value) || value : condition.field === 'calibrator_relation' ? relations.get(value) || '关系信息不可用' : value
      return { value, label, person: condition.field === 'employee', available: condition.field !== 'employee' || label !== '人员信息不可用', avatarUrl: person?.avatar_url }
    }),
  })) }))
  if (!groups.some(group => group.conditions.length)) return { kind: 'empty', label: '暂未配置', groups: [] }
  return { kind: 'conditions', label: '', groups }
}

export function summarizeCalibrationRule(rule: PerformanceProjectFlowRule, options: CalibrationRuleSummaryOptions = {}) {
  const summary = parseCalibrationRule(rule, options)
  if (summary.kind !== 'conditions') return summary.label
  return summary.groups.map(group => {
    const text = group.conditions.map(condition => `${condition.label} ${condition.operator} ${condition.values.map(value => value.label).join('、') || '暂未配置'}`).join(' 且 ')
    return summary.groups.length > 1 ? `（${text || '暂未配置'}）` : text
  }).join(' 或 ')
}
