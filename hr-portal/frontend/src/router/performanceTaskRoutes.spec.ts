import { describe, expect, it } from 'vitest'
import router from './index'

describe('performance task workspace routes', () => {
  it.each([
    ['/performance/review/self-summary?task_id=11&project_id=2', 'PerformanceSelfSummary'],
    ['/performance/review/template-task?task_id=12&project_id=2&employee_no=E001', 'PerformanceTemplateTaskStandalone'],
  ])('resolves %s to a single standalone workspace', (url, name) => {
    const route = router.resolve(url)
    expect(route.name).toBe(name)
    expect(route.matched).toHaveLength(1)
    expect(route.meta.fullScreenWorkspace).toBe(true)
    expect(route.meta.menuCode).toBeNull()
    expect(route.query.project_id).toBe('2')
  })

  it('has exactly one work-summary path and keeps the named entry compatible', () => {
    const matches = router.getRoutes().filter(route => route.path === '/performance/review/self-summary')
    expect(matches).toHaveLength(1)
    expect(router.resolve({ name: 'PerformanceSelfSummary', query: { task_id: '11' } }).fullPath).toBe('/performance/review/self-summary?task_id=11')
  })
})
