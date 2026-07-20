import { describe, expect, it } from 'vitest'
import type { ReportColumnDependencyState } from './reportColumnDependencies'
import { dependencyCount, removeReportColumnInstance } from './reportColumnDependencies'

const state: ReportColumnDependencyState = {
  selectedCodes: ['salary.amount', 'salary.amount#2', 'allocation.headcount'],
  columnSettings: {
    'salary.amount': { split_mode: 'custom', split_factors: ['allocation.headcount'] },
    'allocation.headcount': { aggregation: 'sum', hidden: true },
  },
  defaultSplitRule: { enabled: true, factors: ['allocation.headcount'] },
  sorts: [{ column: 'allocation.headcount', order: 'desc' }],
  aggregations: { 'allocation.headcount': 'sum', 'salary.amount#2': 'count' },
  roundingGroupBy: ['allocation.headcount'],
}

describe('removeReportColumnInstance', () => {
  it('cleans instance references and keeps a duplicate instance unchanged', () => {
    const result = removeReportColumnInstance(state, 'allocation.headcount')

    expect(result.state.selectedCodes).toEqual(['salary.amount', 'salary.amount#2'])
    expect(result.state.columnSettings).toEqual({ 'salary.amount': { split_mode: 'none' } })
    expect(result.state.defaultSplitRule).toEqual({ enabled: false, factors: [] })
    expect(result.state.sorts).toEqual([])
    expect(result.state.aggregations).toEqual({ 'salary.amount#2': 'count' })
    expect(result.state.roundingGroupBy).toEqual([])
    expect(dependencyCount(result.dependencies)).toBeGreaterThan(0)
  })

  it('only removes the selected duplicate instance', () => {
    const result = removeReportColumnInstance(state, 'salary.amount#2')

    expect(result.state.selectedCodes).toEqual(['salary.amount', 'allocation.headcount'])
    expect(result.state.aggregations).toEqual({ 'allocation.headcount': 'sum' })
    expect(result.state.columnSettings['salary.amount']).toBeDefined()
  })
})
