import type { PerformanceAccessContext } from '@/api/performance'

export function canManagePerformanceSettings(
  menuCodes: Iterable<string>,
  context: PerformanceAccessContext | null,
): boolean {
  if (!context || !new Set(menuCodes).has('performance.admin')) return false
  return context.portal_entry_permissions.includes('performance.admin')
}
