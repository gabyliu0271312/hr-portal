import type { ColumnSetting, DefaultSplitRule, SortCond } from '@/api/reports'

export interface ReportColumnDependencyState {
  selectedCodes: string[]
  columnSettings: Record<string, ColumnSetting>
  defaultSplitRule: DefaultSplitRule
  sorts: SortCond[]
  aggregations: Record<string, string>
  roundingGroupBy: string[]
}

export interface RemovedColumnDependencies {
  columnSettings: number
  splitFactors: number
  defaultSplitFactors: number
  sorts: number
  aggregations: number
  roundingGroupBy: number
}

export interface RemoveColumnInstanceResult {
  state: ReportColumnDependencyState
  dependencies: RemovedColumnDependencies
}

const removeFromList = (values: string[] | undefined, instanceId: string) =>
  (values || []).filter((value) => value !== instanceId)

export function removeReportColumnInstance(
  current: ReportColumnDependencyState,
  instanceId: string,
): RemoveColumnInstanceResult {
  const dependencies: RemovedColumnDependencies = {
    columnSettings: 0,
    splitFactors: 0,
    defaultSplitFactors: 0,
    sorts: 0,
    aggregations: 0,
    roundingGroupBy: 0,
  }
  const columnSettings: Record<string, ColumnSetting> = {}

  for (const [key, setting] of Object.entries(current.columnSettings)) {
    if (key === instanceId) {
      dependencies.columnSettings += 1
      continue
    }
    const next = { ...setting }
    const factors = removeFromList(next.split_factors, instanceId)
    dependencies.splitFactors += (next.split_factors || []).length - factors.length
    if (factors.length) next.split_factors = factors
    else delete next.split_factors
    if (next.split_factor === instanceId) {
      dependencies.splitFactors += 1
      delete next.split_factor
    }
    if (next.split_mode === 'custom' && !next.split_factors?.length && !next.split_factor) {
      next.split_mode = 'none'
    }
    columnSettings[key] = next
  }

  const defaultFactors = removeFromList(current.defaultSplitRule.factors, instanceId)
  dependencies.defaultSplitFactors = (current.defaultSplitRule.factors || []).length - defaultFactors.length
  const defaultSplitRule: DefaultSplitRule = { ...current.defaultSplitRule, factors: defaultFactors }
  if (defaultSplitRule.factor === instanceId) {
    dependencies.defaultSplitFactors += 1
    delete defaultSplitRule.factor
  }
  if (!defaultSplitRule.factors?.length && !defaultSplitRule.factor) defaultSplitRule.enabled = false

  const sorts = current.sorts.filter((sort) => sort.column !== instanceId)
  dependencies.sorts = current.sorts.length - sorts.length
  const aggregations = { ...current.aggregations }
  if (instanceId in aggregations) {
    dependencies.aggregations = 1
    delete aggregations[instanceId]
  }
  const roundingGroupBy = removeFromList(current.roundingGroupBy, instanceId)
  dependencies.roundingGroupBy = current.roundingGroupBy.length - roundingGroupBy.length

  return {
    state: {
      selectedCodes: current.selectedCodes.filter((code) => code !== instanceId),
      columnSettings,
      defaultSplitRule,
      sorts,
      aggregations,
      roundingGroupBy,
    },
    dependencies,
  }
}

export function dependencyCount(dependencies: RemovedColumnDependencies): number {
  return Object.values(dependencies).reduce((total, value) => total + value, 0)
}
