import { onBeforeUnmount, ref } from 'vue'
import type { PerformanceComparisonMatch, PerformanceComparisonReason, PerformanceComparisonResult } from '@/api/performance'

export function performanceComparisonGroups(value?: PerformanceComparisonResult | null) {
  return value?.groups !== undefined ? value.groups : value ? [value] : []
}

export function performanceComparisonReasonGroups(value?: PerformanceComparisonResult | null) {
  return performanceComparisonGroups(value).filter(group => group.active !== false && group.matches.length && group.fill_in_diff_reason)
}

export function performanceComparisonContext(value?: PerformanceComparisonResult | null) {
  return value?.groups !== undefined
    ? JSON.stringify(performanceComparisonGroups(value).filter(group => group.active !== false).map(group => [group.rule_id, group.context]).sort((a, b) => a[0].localeCompare(b[0])))
    : value?.context
}

export function performanceComparisonText(match: PerformanceComparisonMatch, nodeId?: number | string, references: Array<{ task_id?: number | string | null; node_name: string }> = []) {
  const otherTaskId = String(match.first_task_id) === String(nodeId) ? match.second_task_id : match.first_task_id
  const name = match.reference_node_name || references.find(reference => String(reference.task_id) === String(otherTaskId))?.node_name
    || (String(match.first_task_id) === String(nodeId) ? match.second_node_name : match.first_node_name) || '另一评估环节'
  const operator = { eq: '=', gt: '>', gte: '≥', lt: '<', lte: '≤' }[match.operator]
  return `「${match.label}」与${name}的评估结果档位相差${operator}${match.threshold}档`
}

export function usePerformanceComparison(preview: () => Promise<{ comparison: PerformanceComparisonResult | null }>) {
  const comparison = ref<PerformanceComparisonResult | null>(null)
  const reason = ref('')
  const reasons = ref<PerformanceComparisonReason[]>([])
  const dialogOpen = ref(false)
  const dialogError = ref('')
  let sequence = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  function invalidate() { ++sequence; clearTimeout(timer) }
  function reset(value: PerformanceComparisonResult | null = null, draftReason?: string | null, draftReasons?: PerformanceComparisonReason[]) {
    invalidate()
    comparison.value = value
    reason.value = draftReason ?? value?.reason ?? ''
    reasons.value = draftReasons ? draftReasons.map(item => ({ ...item })) : performanceComparisonGroups(value).map(group => ({ rule_id: group.rule_id, diff_reason: group.reason, comparison_context: group.context }))
    dialogOpen.value = false
    dialogError.value = ''
  }
  async function refresh() {
    clearTimeout(timer)
    const request = ++sequence
    try {
      const result = await preview()
      if (disposed || request !== sequence) return undefined
      comparison.value = result.comparison
      for (const group of performanceComparisonGroups(result.comparison)) {
        if (!reasons.value.some(item => item.rule_id === group.rule_id)) reasons.value.push({ rule_id: group.rule_id, diff_reason: group.reason, comparison_context: group.context })
      }
      return result.comparison
    } catch (error) {
      if (disposed || request !== sequence) return undefined
      comparison.value = null
      throw error
    }
  }
  function schedule() {
    invalidate()
    timer = setTimeout(() => { void refresh().catch(() => undefined) }, 250)
  }
  onBeforeUnmount(() => { disposed = true; invalidate() })
  return { comparison, reason, reasons, dialogOpen, dialogError, reset, refresh, schedule, invalidate }
}
