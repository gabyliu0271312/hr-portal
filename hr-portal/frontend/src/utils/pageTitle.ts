import type { RouteLocationNormalized } from 'vue-router'

/** 前端绩效应用页签标题 */
const PERFORMANCE_APP_TITLE = '创梦绩效'

/**
 * 根据路由解析浏览器页签标题。
 * - 绩效后台（/performance/settings）：与左侧菜单名一致（取路由 meta.label）
 * - 绩效前端应用（/performance/*）：固定创梦绩效
 * - 其余页面：返回空串，保留静态 <title> 不覆盖
 */
export function resolvePageTitle(to: RouteLocationNormalized): string {
  if (to.path.startsWith('/performance/settings')) {
    return (to.meta.label as string | undefined) || PERFORMANCE_APP_TITLE
  }
  if (to.path.startsWith('/performance/')) return PERFORMANCE_APP_TITLE
  return ''
}
