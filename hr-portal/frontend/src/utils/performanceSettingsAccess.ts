import type { PerformanceAccessContext } from '@/api/performance'

/* 进入「绩效设置」需同时满足：路由菜单含 performance.admin（Portal 后端入口），
   且账号至少持有一项内部配置权限。 */
const PERFORMANCE_CONFIGURATION_PERMISSIONS = new Set([
  'performance.authorization.manage',
  'performance.configuration.manage',
  'performance.cycles.manage',
  'performance.projects.manage',
])

export function canManagePerformanceSettings(
  menuCodes: Iterable<string>,
  context: PerformanceAccessContext | null,
): boolean {
  if (!context || !new Set(menuCodes).has('performance.admin')) return false
  return context.permission_codes.some(permission => PERFORMANCE_CONFIGURATION_PERMISSIONS.has(permission))
}
