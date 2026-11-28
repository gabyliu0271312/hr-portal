import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPerformanceEmployeeTypes, getPerformanceFilterConditions, getPerformanceManagerStandard, savePerformanceFilterConditions, savePerformanceManagerStandard } from './performanceFieldSettings'

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('./client', () => ({ api }))
beforeEach(() => vi.clearAllMocks())

describe('管理者标准 API 字符串契约', () => {
  it('loads the setting and the realtime employee type options', async () => {
    const value = { manager_standard: 'inservice_direct_underling', specific_employee_types: [] }
    api.get.mockResolvedValueOnce({ data: value }).mockResolvedValueOnce({ data: [{ value: '正式员工', label: '正式员工' }] })
    expect(await getPerformanceManagerStandard()).toEqual(value)
    expect(await getPerformanceEmployeeTypes()).toEqual([{ value: '正式员工', label: '正式员工' }])
    expect(api.get.mock.calls).toEqual([
      ['/performance/system-settings/fields/manager-standard'],
      ['/performance/system-settings/fields/employee-types'],
    ])
  })
  it('saves actual local workforce keys without Feishu numeric IDs', async () => {
    const value = { manager_standard: 'specific_employee_type_underling' as const, specific_employee_types: ['正式员工', '实习员工'] }
    api.put.mockResolvedValueOnce({ data: value })
    expect(await savePerformanceManagerStandard(value)).toEqual(value)
    expect(api.put).toHaveBeenCalledWith('/performance/system-settings/fields/manager-standard', value)
  })
})

describe('筛选条件 API 键契约', () => {
  it('loads and saves the ordered key/default list', async () => {
    const loaded = [{ filter_key: 'directLeader', label: '直属上级', default: true, disable_set_default: false }]
    api.get.mockResolvedValueOnce({ data: { filter_conditions: loaded } })
    expect(await getPerformanceFilterConditions()).toEqual(loaded)
    expect(api.get).toHaveBeenCalledWith('/performance/system-settings/fields/filter-conditions')
    const payload = [{ filter_key: 'directLeader', default: false }]
    const saved = [{ filter_key: 'directLeader', label: '直属上级', default: false, disable_set_default: false }]
    api.put.mockResolvedValueOnce({ data: { filter_conditions: saved } })
    expect(await savePerformanceFilterConditions(payload)).toEqual(saved)
    expect(api.put).toHaveBeenCalledWith('/performance/system-settings/fields/filter-conditions', { filter_conditions: payload })
  })
})
