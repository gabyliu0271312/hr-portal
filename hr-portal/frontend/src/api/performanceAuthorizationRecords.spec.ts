import axios from 'axios'
import { describe, expect, it, vi } from 'vitest'
import { api } from './client'
import { projectManagementApi } from './performance'

describe('authorizationRecords filters', () => {
  it('maps the four filter fields to the API query contract', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { cycle_id: 1, authorization_records: [], transfer_records: [] } } as never)
    await projectManagementApi.authorizationRecords(1, { from_ids: ['E1', 'E2'], to_ids: ['M1'], reviewee_user_ids: ['T1'], status: 'revoked' })
    const [url, config] = get.mock.calls[0] as [string, { params: unknown; paramsSerializer?: unknown }]
    expect(url).toBe('/performance/project-management/authorization-records')
    expect(config.params).toEqual({ cycle_id: 1, from_ids: ['E1', 'E2'], to_ids: ['M1'], reviewee_user_ids: ['T1'], authorization_status: 'revoked' })
    expect(config.paramsSerializer).toEqual({ indexes: null })
    const uri = axios.getUri({ url, params: config.params as Record<string, unknown>, paramsSerializer: config.paramsSerializer as never })
    expect(uri).toContain('from_ids=E1&from_ids=E2')
    expect(uri).toContain('authorization_status=revoked')
    expect(uri).not.toContain('from_ids%5B%5D')
    get.mockRestore()
  })

  it('keeps the original single-argument request when no filter is applied', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { cycle_id: 1, authorization_records: [], transfer_records: [] } } as never)
    await projectManagementApi.authorizationRecords(1)
    const [, config] = get.mock.calls[0] as [string, { params: unknown; paramsSerializer?: unknown }]
    expect(config.params).toEqual({ cycle_id: 1 })
    expect(config.paramsSerializer).toBeUndefined()
    get.mockRestore()
  })
})
