import type { PerformanceCycleProjectShell } from '@/api/performance'

export type PerformanceProjectStatusKey = 'configurable' | 'unable' | 'enabled' | 'finished'

export const PERFORMANCE_PROJECT_STATUS_META: Record<PerformanceProjectStatusKey, { label: string; color: string }> = {
  configurable: { label: '待完成配置', color: 'var(--performance-project-status-wait-config)' },
  unable: { label: '待启动', color: 'var(--performance-project-status-wait-start)' },
  enabled: { label: '已启动', color: 'var(--performance-project-status-started)' },
  finished: { label: '已结束', color: 'var(--performance-project-status-ended)' },
}

export const PERFORMANCE_PROJECT_STATUS_OPTIONS = (Object.keys(PERFORMANCE_PROJECT_STATUS_META) as PerformanceProjectStatusKey[])
  .map(value => ({ value, label: PERFORMANCE_PROJECT_STATUS_META[value].label }))

export function performanceProjectStatusKey(project: PerformanceCycleProjectShell): PerformanceProjectStatusKey {
  if (project.status === 'STARTED') return 'enabled'
  if (project.status === 'ARCHIVED') return 'finished'
  if (project.configuration_completed) return 'unable'
  return 'configurable'
}

export function filterPerformanceProjects(
  projects: PerformanceCycleProjectShell[],
  filters: { keyword?: string; statuses?: string[]; managers?: string[] },
) {
  const keyword = (filters.keyword || '').trim().toLowerCase()
  const statuses = new Set(filters.statuses || [])
  const managers = filters.managers || []
  return projects.filter(project => {
    if (keyword && !project.name.toLowerCase().includes(keyword)) return false
    if (statuses.size > 0 && !statuses.has(performanceProjectStatusKey(project))) return false
    if (managers.length > 0 && !managers.some(name => (project.administrators || []).includes(name))) return false
    return true
  })
}
