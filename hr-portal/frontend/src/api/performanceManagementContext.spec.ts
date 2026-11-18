import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios'
import { api } from './client'
import { projectManagementApi } from './performance'

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
  it('carries the selected role and project to cycle reads and writes without changing the body', async () => {
    const requests: Parameters<AxiosAdapter>[0][] = []
    api.defaults.adapter = async config => { requests.push(config); return response(config) }
    await projectManagementApi.overview(9)
    await projectManagementApi.openResults(9, ['E1'])
    expect(requests[0].params).toMatchObject({ cycle_id: 9, project_id: '29', management_role: 'hrbp' })
    expect(requests[1].params).toMatchObject({ cycle_id: '9', project_id: '29', management_role: 'hrbp' })
    expect(JSON.parse(requests[1].data)).toEqual({ employee_nos: ['E1'] })
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
