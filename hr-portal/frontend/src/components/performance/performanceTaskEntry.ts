import type { PerformanceReviewNode } from '@/api/performance'

export function performanceTaskEntryRoute(node: PerformanceReviewNode, projectId: number | undefined) {
  if (node.entry_mode !== 'template_task' || !node.task_id) return null
  const routes: Record<string, string> = {
    work_summary: '/performance/review/self-summary',
    evaluation: '/performance/review/template-task',
  }
  const path = node.task_kind ? routes[node.task_kind] : undefined
  return path ? `${path}?task_id=${encodeURIComponent(String(node.task_id))}&project_id=${encodeURIComponent(String(projectId || ''))}` : null
}
