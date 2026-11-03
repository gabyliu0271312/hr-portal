import type { RouteLocationNormalized } from 'vue-router'

/** Portal 平台页签标题（与 index.html 静态 <title> 一致） */
const PORTAL_APP_TITLE = 'HR 提效工具'
/** 前端绩效应用页签标题 */
const PERFORMANCE_APP_TITLE = '创梦绩效'
/** 前端人力应用页签标题 */
const PEOPLE_APP_TITLE = '创梦人力'
/** 前端人力后台页签标题（无 meta.label 时兜底） */
const PEOPLE_ADMIN_TITLE = '创梦人力后台'

/**
 * 根据路由解析浏览器页签标题，始终返回确定值以覆盖残留标题。
 * - 绩效/人力后台（/performance/settings、/people/settings）：与左侧菜单名一致（取路由 meta.label）
 * - 绩效前端应用（/performance/*）：固定创梦绩效
 * - 人力前端应用（/people/*）：固定创梦人力
 * - 其余页面：Portal 平台标题，跟随系统切换不再残留
 */
export function resolvePageTitle(to: RouteLocationNormalized): string {
  if (to.path.startsWith('/performance/settings')) {
    return (to.meta.label as string | undefined) || PERFORMANCE_APP_TITLE
  }
  if (to.path.startsWith('/performance/')) return PERFORMANCE_APP_TITLE
  if (to.path.startsWith('/people/settings')) {
    return (to.meta.label as string | undefined) || PEOPLE_ADMIN_TITLE
  }
  if (to.path.startsWith('/people/')) return PEOPLE_APP_TITLE
  return PORTAL_APP_TITLE
}
