export type PerformanceSortOrder = 'asc' | 'desc' | ''

export function nextPerformanceSort(
  currentKey: string,
  currentOrder: PerformanceSortOrder,
  key: string,
): { key: string; order: PerformanceSortOrder } {
  if (currentKey !== key) return { key, order: 'desc' }
  if (currentOrder === 'desc') return { key, order: 'asc' }
  return { key: '', order: '' }
}

/** 空值始终排在末尾，数字按数值比较，其余按中文排序。 */
export function comparePerformanceSortValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'zh-CN')
}

export function sortPerformanceRows<T>(
  rows: readonly T[],
  key: string,
  order: PerformanceSortOrder,
  getValue: (row: T, key: string) => unknown,
): T[] {
  if (!key || !order) return [...rows]
  const direction = order === 'asc' ? 1 : -1
  return [...rows].sort((left, right) => {
    const leftValue = getValue(left, key)
    const rightValue = getValue(right, key)
    const leftEmpty = leftValue === null || leftValue === undefined || leftValue === ''
    const rightEmpty = rightValue === null || rightValue === undefined || rightValue === ''
    const result = comparePerformanceSortValues(leftValue, rightValue)
    return leftEmpty || rightEmpty ? result : result * direction
  })
}
