export type PerformanceTaskStatus = 'pending' | 'completed' | 'overdue' | 'rejected'

export function normalizePerformanceTaskStatus(status?: string | null, dueAt?: string | null, allowRejected = false): PerformanceTaskStatus {
  if (allowRejected && status === 'rejected') return 'rejected'
  if (status === 'completed') return 'completed'
  if (status === 'overdue') return 'overdue'
  if (status === 'pending' && dueAt) {
    const due = new Date(dueAt).getTime()
    if (Number.isFinite(due) && due < Date.now()) return 'overdue'
  }
  return 'pending'
}

export function performanceTaskStatusLabel(status: PerformanceTaskStatus): string {
  return { pending: '待完成', completed: '已完成', overdue: '已逾期', rejected: '已拒绝' }[status]
}
