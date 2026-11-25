import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios'
import { api } from './client'
import { performanceWorkbenchApi, projectManagementApi, performanceReview360InviteApi } from './performance'

vi.mock('element-plus', () => ({ ElMessage: { error: vi.fn() } }))

const originalAdapter = api.defaults.adapter
const response = (config: Parameters<AxiosAdapter>[0]) => ({ data: {}, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config })

beforeEach(() => {
  window.history.replaceState({}, '', '/performance/project-management?cycle_id=9&management_role=hrbp&project_id=29')
  localStorage.clear()
})
afterEach(() => {
  api.defaults.adapter = originalAdapter
  window.history.replaceState({}, '', '/')
})

describe('management request scope', () => {
  it('serializes statistics and historical drilldown keys without losing entry permissions', async () => {
    const requests: Parameters<AxiosAdapter>[0][] = []
    api.defaults.adapter = async config => { requests.push(config); return response(config) }
    await projectManagementApi.reportPeople(9, { type: 'statistics', dimension: 'department', rowKey: 'department:集团/研发', indicatorKey: 'contribution', ratingKey: 'A' }, { page: 2, pageSize: 20, keyword: '甲', sortBy: 'name', sortOrder: 'desc' }, { management_role: 'hrbp', project_id: 29 })
    expect(requests[0].url).toBe('/performance/project-management/statistics/members')
    expect(requests[0].params).toMatchObject({ cycle_id: 9, management_role: 'hrbp', project_id: 29, dimension: 'department', row_key: 'department:集团/研发', indicator_key: 'contribution', rating_key: 'A', page: 2, page_size: 20, keyword: '甲', sort_by: 'name', sort_order: 'desc' })
    await projectManagementApi.reportPeople(9, { type: 'comparison', kind: 'history', xKey: 'old', yKey: 'now', historyCycleId: 3, xRatingKey: 'A', yRatingKey: 'B' }, { page: 1, pageSize: 50 }, { result_kind: 'focus' })
    expect(requests[1].url).toBe('/performance/project-management/comparison/members')
    expect(requests[1].params).toMatchObject({ cycle_id: 9, result_kind: 'focus', kind: 'history', x_key: 'old', y_key: 'now', history_cycle_id: 3, x_rating_key: 'A', y_rating_key: 'B' })
  })
  it('submits one scope request and rejects an unsuccessful receipt', async () => {
    const requests: Parameters<AxiosAdapter>[0][] = []
    api.defaults.adapter = async config => {
      requests.push(config)
      return { ...response(config), status: 202, data: { code: 0, success: true, msg: '操作成功', data: { job_id: 7 } } }
    }
    const selection = { is_select_all: true, selected_task_ids: [], deselected_task_ids: [17], keyword: '成员' }
    const receipt = await projectManagementApi.submitCycleReminder(9, 'work-summary', selection, '部门', true, undefined, 'request-1')
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('/performance/project-management/reminder-requests')
    expect(requests[0].params).toMatchObject({ cycle_id: '9', project_id: '29', management_role: 'hrbp' })
    expect(JSON.parse(requests[0].data)).toEqual({ cycle_id: 9, node_key: 'work-summary', selection, department: '部门', skip_recently_reminded: true, request_id: 'request-1' })
    expect(receipt.data.job_id).toBe(7)
    api.defaults.adapter = async config => ({ ...response(config), data: { code: 1, success: false, msg: '未受理', data: {} } })
    await expect(projectManagementApi.submitCycleReminder(9, 'work-summary', selection, undefined, true, undefined, 'request-1')).rejects.toThrow('未受理')
  })
  it('sends reviewer invitation source task in the query and only roster fields in the body', async () => {
    window.history.replaceState({}, '', '/performance/review?project_id=29&node=confirm')
    const requests: Parameters<AxiosAdapter>[0][] = []
    api.defaults.adapter = async config => { requests.push(config); return response(config) }
    await performanceReview360InviteApi.submit(29, ['R1'], 42, 'roster-version')
    expect(requests[0].url).toBe('/performance/review-360/invites/projects/29')
    expect(requests[0].params).toEqual({ source_task_id: 42 })
    expect(JSON.parse(requests[0].data)).toEqual({ employee_nos: ['R1'], reviewer_360_version: 'roster-version' })
  })

  it('loads all workbench project pages while preserving the cycle filter', async () => {
    const requests: Parameters<AxiosAdapter>[0][] = []
    api.defaults.adapter = async config => {
      requests.push(config)
      return { ...response(config), data: config.params.page === 1 ? Array.from({ length: 100 }, (_, index) => ({ project_id: index + 1 })) : [{ project_id: 101, project_started_at: '2026-01-01T00:00:00Z' }] }
    }
    const projects = await performanceWorkbenchApi.listProjects('季度', 9)
    expect(projects).toHaveLength(101)
    expect(projects.at(-1)?.project_id).toBe(101)
    expect(requests.map(request => request.params)).toEqual([
      { keyword: '季度', cycle_id: 9, page: 1, page_size: 100 },
      { keyword: '季度', cycle_id: 9, page: 2, page_size: 100 },
    ])
  })

  it('carries the selected role and project to cycle reads and writes without changing the body', async () => {
    const requests: Parameters<AxiosAdapter>[0][] = []
    api.defaults.adapter = async config => { requests.push(config); return response(config) }
    await projectManagementApi.overview(9)
    await projectManagementApi.openResults(9, ['E1'])
    expect(requests[0].params).toMatchObject({ cycle_id: 9, project_id: '29', management_role: 'hrbp' })
    expect(requests[1].params).toMatchObject({ cycle_id: '9', project_id: '29', management_role: 'hrbp' })
    expect(JSON.parse(requests[1].data)).toEqual({ employee_nos: ['E1'] })
  })

  it('defaults to full statistics and preserves explicit scope on lightweight overview reads', async () => {
    const requests: Parameters<AxiosAdapter>[0][] = []
    api.defaults.adapter = async config => { requests.push(config); return response(config) }
    await projectManagementApi.overview(9)
    await projectManagementApi.overview(9, { management_role: 'project_admin', project_id: 30 }, false)
    await projectManagementApi.overview(9, { management_role: 'project_admin', project_id: 30 }, true)
    expect(requests[0].params).toMatchObject({ cycle_id: 9, project_id: '29', management_role: 'hrbp', include_statistics: true })
    expect(requests[1].params).toEqual({ cycle_id: 9, project_id: 30, management_role: 'project_admin', include_statistics: false })
    expect(requests[2].params).toEqual({ cycle_id: 9, project_id: 30, management_role: 'project_admin', include_statistics: true })
  })

  it('preserves indicator and comparison axes together with management scope', async () => {
    const requests: Parameters<AxiosAdapter>[0][] = []
    api.defaults.adapter = async config => { requests.push(config); return response(config) }
    await projectManagementApi.levelStatistics(9, 'sequence', undefined, 'rating:contribution')
    await projectManagementApi.comparison(9, { kind: 'history', xKey: 'rating:old', yKey: 'rating:current', historyCycleId: 8 })
    expect(requests[0].params).toMatchObject({ cycle_id: 9, project_id: '29', management_role: 'hrbp', dimension: 'sequence', indicator_key: 'rating:contribution' })
    expect(requests[1].params).toMatchObject({ cycle_id: 9, project_id: '29', management_role: 'hrbp', kind: 'history', x_key: 'rating:old', y_key: 'rating:current', history_cycle_id: 8 })
  })

  it('preserves the selected project on object paths so mismatched paths are rejected by the server', async () => {
    const requests: Parameters<AxiosAdapter>[0][] = []
    api.defaults.adapter = async config => { requests.push(config); return response(config) }
    await projectManagementApi.memberDetail(29, 'E1')
    await projectManagementApi.overview(9, { management_role: 'project_admin', project_id: 30 })
    expect(requests[0].params).toMatchObject({ cycle_id: '9', project_id: '29', management_role: 'hrbp' })
    expect(requests[1].params).toMatchObject({ cycle_id: 9, project_id: 30, management_role: 'project_admin' })
  })

  it('does not scope navigation, authentication or ordinary review requests', async () => {
    const requests: Parameters<AxiosAdapter>[0][] = []
    api.defaults.adapter = async config => { requests.push(config); return response(config) }
    await api.get('/performance/navigation')
    await api.get('/performance/review/overview')
    await api.get('/performance/access-context')
    expect(requests.every(config => !config.params?.management_role)).toBe(true)
    window.history.replaceState({}, '', '/performance/review?cycle_id=9&project_id=29')
    await projectManagementApi.memberDetail(29, 'E1')
    expect(requests.at(-1)?.params?.management_role).toBeUndefined()
  })

  it('rejects an old role response after navigation and does not surface old errors', async () => {
    let finish!: () => void
    api.defaults.adapter = config => new Promise(resolve => { finish = () => resolve(response(config)) })
    const pending = projectManagementApi.overview(9)
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
    window.history.replaceState({}, '', '/performance/project-management?cycle_id=9&management_role=project_admin&project_id=29')
    finish()
    await expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' })

    let fail!: () => void
    api.defaults.adapter = config => new Promise((_resolve, reject) => { fail = () => reject(new AxiosError('forbidden', 'ERR_BAD_REQUEST', config, undefined, { ...response(config), status: 403, data: { detail: 'FORBIDDEN' } })) })
    const rejected = projectManagementApi.overview(9)
    await vi.waitFor(() => expect(fail).toBeTypeOf('function'))
    window.history.replaceState({}, '', '/performance/project-management?cycle_id=9&management_role=hrbp&project_id=29')
    fail()
    await expect(rejected).rejects.toMatchObject({ code: 'ERR_CANCELED' })
  })
})
