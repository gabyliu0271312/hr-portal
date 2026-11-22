import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { api } from '@/api/client'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import CalibrationScopeAnalysis from './CalibrationScopeAnalysis.vue'
vi.mock('@/api/client', () => ({ api: { get: vi.fn() } }))
import type { PerformanceWorkbenchTaskPeoplePage } from '@/api/performance'
import { calibrationAnalysisIndicators, calibrationMemberKey, calibrationScopeComparison, calibrationScopeMatrix, calibrationScopeStatistics, loadCalibrationScopeAnalysis, uniqueCalibrationMembers, type CalibrationAnalysisMember, type CalibrationScopeAnalysisData } from './calibrationScopeAnalysis'

const columns = [{ key: 'rating:impact', label: '业务贡献' }, { key: 'rating:collaboration', label: '协作能力' }]
function member(employeeNo: string, values: Partial<CalibrationAnalysisMember> = {}): CalibrationAnalysisMember {
  return { employee_no: employeeNo, display_name: employeeNo, task_id: Number(employeeNo) || 1, status: 'pending', due_at: null, job_family: null, job_category: null, job_sequence: null, position_level: null, hire_date: null, department: null, employee_type: null, employment_status: null, ...values }
}
function dataset(items: CalibrationAnalysisMember[]): CalibrationScopeAnalysisData { return { items, rating_columns: columns } }
function page(items: CalibrationAnalysisMember[], total = items.length): PerformanceWorkbenchTaskPeoplePage { return { items, total, rating_columns: columns } }

describe('calibration scope analysis adapters', () => {
  it('deduplicates repeated member tasks while preserving the same employee in different projects', () => {
    const first = member('1', { project_id: 10, task_id: 101, ratings: { 'rating:impact': { label: '超预期' } } })
    const duplicate = { ...first, task_id: 102 }
    const otherProject = member('1', { project_id: 20, task_id: 201, ratings: { 'rating:impact': { label: '达预期' } } })
    const data = dataset([first, duplicate, otherProject])
    expect(uniqueCalibrationMembers(data, 10)).toEqual([duplicate, otherProject])
    const matrix = calibrationScopeMatrix(data, 10)
    expect(matrix.total).toBe(2)
    expect(matrix.completed_count).toBe(2)
    expect(matrix.completed_rows[0].total).toBe(2)
    expect(matrix.completed_rows[0].cells['达预期'].people[0]).toMatchObject({ employee_no: '1', project_id: 20, task_id: 201 })
    expect(calibrationMemberKey(first, 10)).not.toBe(calibrationMemberKey(otherProject, 10))
    expect(calibrationScopeStatistics(data, 10).totalParticipants).toBe(2)
  })

  it('uses real dynamic indicators and observed rating values without inserting predefined grades', () => {
    const data = dataset([
      member('1', { ratings: { 'rating:impact': { label: '特别突出', color: '#123456' }, 'rating:collaboration': { label: '符合要求' } } }),
      member('2', { ratings: { 'rating:impact': { label: '符合要求' }, 'rating:collaboration': null } }),
      member('3', { rating: '不允许猜成业务贡献', ratings: {} }),
    ])
    expect(calibrationAnalysisIndicators(data)).toEqual(columns)
    expect(calibrationScopeMatrix(data, 1).ratings).toEqual([{ key: '特别突出', label: '特别突出', color: '#123456' }, { key: '符合要求', label: '符合要求', color: null }])
    const matrix = calibrationScopeMatrix(data, 1, 'rating:collaboration')
    expect(matrix.completed_count).toBe(1)
    expect(matrix.pending_count).toBe(2)
    expect(matrix.ratings.map(rating => rating.label)).toEqual(['符合要求'])
    const report = calibrationScopeStatistics(data, 1, 'department', 'rating:collaboration')
    expect(report.source).toBe('api')
    expect(report.distribution).toEqual({ 符合要求: 1 })
    expect(report.totalParticipants).toBe(3)
    expect(() => calibrationScopeStatistics(data, 1, 'level', 'unknown')).toThrow('UNKNOWN_SCOPE_INDICATOR')
  })

  it('never reconstructs permission-hidden profile fields from residual values', () => {
    const data = dataset([member('1', { position_level: '禁止展示职级', department: '禁止展示部门', direct_supervisor: '禁止展示上级', hire_date: '2000-01-01', visible_profile_fields: [], ratings: { 'rating:impact': { label: '达预期' } } })])
    expect(calibrationScopeMatrix(data, 1).completed_rows[0].level).toBe('职级未提供')
    for (const dimension of ['department', 'team', 'sequence', 'level', 'tenure'] as const) {
      const report = calibrationScopeStatistics(data, 1, dimension)
      expect(report.departments).toHaveLength(1)
      expect(report.departments[0].name).toMatch(/未提供$/)
      expect(JSON.stringify(report)).not.toMatch(/禁止展示|2000-01-01/)
      expect(Object.values(report.distribution)).toEqual([1])
    }
  })

  it('derives tenure only from a visible valid hire date using the existing month boundaries', () => {
    const data = dataset([
      member('1', { hire_date: '2023-11-23', ratings: { 'rating:impact': { label: '达预期' } } }),
      member('2', { hire_date: '2023-11-22', ratings: { 'rating:impact': { label: '达预期' } } }),
      member('3', { hire_date: '2026-02-31', ratings: { 'rating:impact': { label: '达预期' } } }),
    ])
    expect(calibrationScopeStatistics(data, 1, 'tenure', undefined, new Date(2026, 10, 22)).departments.map(row => row.name)).toEqual(['1-3年内（不含3年）', '3年以上', '司龄未提供'])
  })

  it('compares only paired real dimensions and counts members rather than duplicated task rows', () => {
    const paired = member('1', { ratings: { 'rating:impact': { label: '优' }, 'rating:collaboration': { label: '好' } } })
    const missing = member('2', { ratings: { 'rating:impact': { label: '优' } } })
    const data = dataset([paired, { ...paired, task_id: 20 }, missing])
    const comparison = calibrationScopeComparison(data, 1, { kind: 'dimension' })
    expect(comparison.source).toBe('api')
    expect(comparison.total).toBe(1)
    expect(comparison.counts).toEqual([[1]])
    expect(comparison.xRatings?.[0].label).toBe('优')
    expect(comparison.yRatings?.[0].label).toBe('好')
    expect(calibrationScopeComparison(data, 1, { kind: 'dimension', xKey: columns[0].key, yKey: columns[0].key }).emptyReason).toBeTruthy()
  })

  it('returns explicit unavailable reasons instead of fabricated self-review, history or missing dimensions', () => {
    const data = { items: [member('1')], rating_columns: [] }
    for (const kind of ['self-final', 'history', 'dimension'] as const) {
      const comparison = calibrationScopeComparison(data, 1, { kind })
      expect(comparison.source).toBe('api')
      expect(comparison.total).toBe(0)
      expect(comparison.emptyReason).toBeTruthy()
      expect(comparison.counts).toEqual([])
      expect(comparison.ratings).toEqual([])
    }
  })

  it('retains rating labels that match object prototype property names as real values', () => {
    const data = dataset([member('1', { ratings: { 'rating:impact': { label: '__proto__' } } })])
    expect(calibrationScopeMatrix(data, 1).completed_rows[0].cells['__proto__'].count).toBe(1)
    expect(calibrationScopeStatistics(data, 1).distribution['__proto__']).toBe(1)
  })
})

describe('calibration scope analysis component boundary', () => {
  const scope = { scope_key: 'rule-A', project_id: 10, node_id: 'calibration/1', phase_id: 'phase-1' }
  const global = { stubs: { ProjectPerformanceMatrix: { name: 'ProjectPerformanceMatrix', props: ['provider'], emits: ['open-member'], template: '<button class="select-member" @click="$emit(\'open-member\', { project_id: 20, employee_no: \'1\' })">选择成员</button>' }, ProjectStatisticsReportPanel: { name: 'ProjectStatisticsReportPanel', props: ['provider', 'comparisonProvider', 'allowExamples'], emits: ['filter'], template: '<button class="scope-report" @click="$emit(\'filter\')">范围报表</button>' } } }
  beforeEach(() => { vi.mocked(api.get).mockReset() })

  it('calls only the scoped member endpoint and emits the original member with node context', async () => {
    const original = member('1', { project_id: 20, task_id: 201, phase_id: 'phase-2', ratings: { 'rating:impact': { label: '好' } } })
    vi.mocked(api.get).mockResolvedValue({ data: page([original]) })
    const wrapper = mount(CalibrationScopeAnalysis, { props: { scope, cycleId: 1, tab: 'matrix' }, global })
    await flushPromises()
    expect(api.get).toHaveBeenCalledTimes(1)
    expect(api.get).toHaveBeenCalledWith('/performance/workbench/tasks/calibration%2F1/people', expect.objectContaining({ params: { project_id: 10, phase_id: 'phase-1', scope_key: 'rule-A', state: 'all', page: 1, page_size: 100 }, signal: expect.any(AbortSignal) }))
    await wrapper.get('.select-member').trigger('click')
    const payload = wrapper.emitted('open-member')![0][0] as { node: { project_id: number; phase_id: string; scope_key: string }; member: CalibrationAnalysisMember }
    expect(payload.member).toBe(original)
    expect(payload.node).toMatchObject({ project_id: 20, phase_id: 'phase-2', scope_key: 'rule-A' })
    await wrapper.setProps({ tab: 'report' })
    expect(wrapper.findComponent({ name: 'ProjectStatisticsReportPanel' }).props('allowExamples')).toBe(false)
    await wrapper.get('.scope-report').trigger('click')
    expect(wrapper.emitted('filter')).toHaveLength(1)
    expect(api.get).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('clears old identity data synchronously, aborts the old scope and ignores its late response', async () => {
    let resolveOld!: (value: { data: PerformanceWorkbenchTaskPeoplePage }) => void
    vi.mocked(api.get).mockImplementationOnce(() => new Promise(done => { resolveOld = done })).mockResolvedValueOnce({ data: page([member('new')]) })
    const wrapper = mount(CalibrationScopeAnalysis, { props: { scope, cycleId: 1, tab: 'matrix' }, global })
    const oldSignal = vi.mocked(api.get).mock.calls[0][1]!.signal!
    employeeSwitchEpoch.value++
    expect(oldSignal.aborted).toBe(true)
    await flushPromises()
    resolveOld({ data: page([member('old')]) })
    await flushPromises()
    const matrixStub = wrapper.findComponent({ name: 'ProjectPerformanceMatrix' })
    expect(matrixStub.exists()).toBe(true)
    const matrix = await matrixStub.props('provider')()
    expect(matrix.pending_rows[0].cells.pending.people[0].employee_no).toBe('new')
    expect(wrapper.find('.select-member').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('加载失败')
    expect(api.get).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('shows retry for failed full pagination and never mounts a partial report', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: page([member('1')], 2) }).mockRejectedValueOnce(new Error('page 2 failed')).mockResolvedValueOnce({ data: page([member('2')]) })
    const wrapper = mount(CalibrationScopeAnalysis, { props: { scope, cycleId: 1, tab: 'report' }, global })
    await flushPromises()
    expect(wrapper.text()).toContain('加载失败')
    expect(wrapper.find('.scope-report').exists()).toBe(false)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.scope-report').exists()).toBe(true)
    expect(api.get).toHaveBeenCalledTimes(3)
    wrapper.unmount()
  })
})

describe('complete calibration scope pagination', () => {
  it('requests every page at most 100 members and uses the actual server total', async () => {
    const rows = Array.from({ length: 205 }, (_, index) => member(String(index)))
    const loader = vi.fn(async (current: number, size: number) => page(rows.slice((current - 1) * size, current * size), rows.length))
    const data = await loadCalibrationScopeAnalysis(loader)
    expect(loader.mock.calls).toEqual([[1, 100], [2, 100], [3, 100]])
    expect(data.items).toHaveLength(205)
    expect(data.items[204]).toBe(rows[204])
    expect(data.rating_columns).toEqual(columns)
  })

  it('propagates a later page failure and exposes no partial analysis result', async () => {
    const failure = new Error('forbidden after identity change')
    const loader = vi.fn().mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, index) => member(String(index))), 101)).mockRejectedValueOnce(failure)
    await expect(loadCalibrationScopeAnalysis(loader)).rejects.toBe(failure)
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('rejects a changed total or truncated pagination rather than manufacturing a scope count', async () => {
    const changed = vi.fn().mockResolvedValueOnce(page([member('1')], 2)).mockResolvedValueOnce(page([member('2')], 3))
    await expect(loadCalibrationScopeAnalysis(changed)).rejects.toThrow('SCOPE_CHANGED_DURING_PAGINATION')
    const truncated = vi.fn().mockResolvedValueOnce(page([member('1')], 2)).mockResolvedValueOnce(page([], 2))
    await expect(loadCalibrationScopeAnalysis(truncated)).rejects.toThrow('INCOMPLETE_SCOPE_PAGE')
    expect((await loadCalibrationScopeAnalysis(async () => page([]))).items).toEqual([])
  })

  it('discards an in-flight page when its identity or scope request was cancelled', async () => {
    const abort = new AbortController()
    let resolve!: (value: PerformanceWorkbenchTaskPeoplePage) => void
    const loader = vi.fn(() => new Promise<PerformanceWorkbenchTaskPeoplePage>(done => { resolve = done }))
    const pending = loadCalibrationScopeAnalysis(loader, abort.signal)
    abort.abort()
    resolve(page([member('old-identity')]))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(loader).toHaveBeenCalledTimes(1)
  })
})
