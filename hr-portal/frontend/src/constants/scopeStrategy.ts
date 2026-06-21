export type ScopeStrategy = 'person_first' | 'cc_first' | 'cross_filter'

export const SCOPE_STRATEGY_OPTIONS: { label: string; value: ScopeStrategy; hint: string }[] = [
  {
    label: '人员优先',
    value: 'person_first',
    hint: '按组织/人员范围看数据，适合花名册、工资等人员明细。',
  },
  {
    label: '成本中心优先',
    value: 'cc_first',
    hint: '按成本中心/项目范围看数据，适合项目分摊报表。',
  },
  {
    label: '全部标签',
    value: 'cross_filter',
    hint: '兼容旧行为，用户所有管理单元标签取并集。',
  },
]

export function scopeStrategyLabel(value?: string | null) {
  return SCOPE_STRATEGY_OPTIONS.find((item) => item.value === value)?.label || '继承默认'
}
