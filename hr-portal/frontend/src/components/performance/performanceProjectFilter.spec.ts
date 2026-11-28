import { describe, expect, it } from 'vitest'
import type { PerformanceCycleProjectShell } from '@/api/performance'
import { filterPerformanceProjects, performanceProjectStatusKey } from './performanceProjectFilter'

function project(overrides: Partial<PerformanceCycleProjectShell>): PerformanceCycleProjectShell {
  return {
    id: 1,
    project_ref: 'P1',
    name: '项目一',
    description: null,
    administrators: [],
    status: 'DRAFT',
    evaluated_count: 0,
    configuration_completed: false,
    ...overrides,
  }
}

describe('performanceProjectStatusKey', () => {
  it('maps the four project states to the shared filter keys', () => {
    expect(performanceProjectStatusKey(project({ status: 'STARTED' }))).toBe('enabled')
    expect(performanceProjectStatusKey(project({ status: 'ARCHIVED' }))).toBe('finished')
    expect(performanceProjectStatusKey(project({ status: 'DRAFT', configuration_completed: true }))).toBe('unable')
    expect(performanceProjectStatusKey(project({ status: 'DRAFT', configuration_completed: false }))).toBe('configurable')
  })
})

describe('filterPerformanceProjects', () => {
  const projects = [
    project({ id: 1, name: '销售项目', status: 'STARTED', administrators: ['张三'] }),
    project({ id: 2, name: '研发项目', status: 'DRAFT', configuration_completed: true, administrators: ['李四'] }),
    project({ id: 3, name: '财务项目', status: 'ARCHIVED', administrators: ['张三', '李四'] }),
    project({ id: 4, name: '招聘项目', status: 'DRAFT', administrators: [] }),
  ]

  it('returns all projects without filters', () => {
    expect(filterPerformanceProjects(projects, {})).toHaveLength(4)
  })

  it('filters by project name keyword', () => {
    expect(filterPerformanceProjects(projects, { keyword: '研发' }).map(item => item.id)).toEqual([2])
  })

  it('filters by multiple statuses', () => {
    expect(filterPerformanceProjects(projects, { statuses: ['configurable', 'finished'] }).map(item => item.id)).toEqual([3, 4])
  })

  it('filters by administrator display name', () => {
    expect(filterPerformanceProjects(projects, { managers: ['张三'] }).map(item => item.id)).toEqual([1, 3])
  })

  it('combines keyword, status and manager filters', () => {
    expect(filterPerformanceProjects(projects, { keyword: '项目', statuses: ['enabled', 'finished'], managers: ['张三'] }).map(item => item.id)).toEqual([1, 3])
    expect(filterPerformanceProjects(projects, { keyword: '销售', statuses: ['finished'] })).toEqual([])
  })
})
