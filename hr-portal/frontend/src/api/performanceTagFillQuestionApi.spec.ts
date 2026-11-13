import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('./client', () => ({ api, getToken: () => localStorage.getItem('hr_portal.token') }))

import { clearPerformanceInFlightRequests, performanceNavigationApi, performanceReviewApi, performanceWorkbenchApi, performanceTagFillQuestionApi } from './performance'
import { clearEmployeeSwitch } from '@/stores/identitySwitch'

const wire = {
  id: 301,
  language: 'zh-CN',
  name: '价值贡献',
  description: '说明',
  creator: '管理员',
  created_at: '2026-09-20T03:00:00Z',
  updated_at: '2026-09-20T03:00:00Z',
  remark: '',
  tags: [{ id: 'tag-1', name: '做得好的', description: '', prompt: '填写亮点' }],
}

describe('performanceTagFillQuestionApi', () => {
  beforeEach(() => { vi.clearAllMocks(); clearPerformanceInFlightRequests(); localStorage.clear() })

  it('merges concurrent people calls but reloads after completion and preserves parameter boundaries', async () => {
    let resolve!: (value: { data: unknown }) => void
    api.get.mockImplementation(() => new Promise(done => { resolve = done }))
    const load = (node = 'manager', page = 1, keyword?: string) => performanceWorkbenchApi.taskPeople(29, node, 'all', keyword, undefined, page, 50)
    const calls = [load(), load(), load()]
    expect(api.get).toHaveBeenCalledTimes(1)
    resolve({ data: { items: [], total: 0, rating_columns: [] } })
    await Promise.all(calls)
    api.get.mockResolvedValue({ data: {} })
    await Promise.all([load(), load('other'), load('manager', 2), load('manager', 1, 'a&phase_id=b'), load('manager', 1, 'a')])
    expect(api.get).toHaveBeenCalledTimes(6)
  })

  it('merges overview and navigation separately and evicts failed requests for retry', async () => {
    let reject!: (error: Error) => void
    api.get.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
    const first = performanceReviewApi.overview(29, undefined, 9)
    const duplicate = performanceReviewApi.overview(29, undefined, 9)
    expect(api.get).toHaveBeenCalledTimes(1)
    const failures = Promise.allSettled([first, duplicate])
    reject(new Error('retry'))
    await failures
    api.get.mockResolvedValue({ data: {} })
    await Promise.all([performanceReviewApi.overview(29, undefined, 9), performanceReviewApi.overview(29, undefined, 9), performanceNavigationApi.get(9), performanceNavigationApi.get(9)])
    expect(api.get).toHaveBeenCalledTimes(3)
  })

  it('never shares an inflight response across identity, login or explicit invalidation', async () => {
    const resolves: Array<(value: { data: unknown }) => void> = []
    api.get.mockImplementation(() => new Promise(done => { resolves.push(done) }))
    const load = () => performanceWorkbenchApi.taskPeople(29, 'manager', 'all', undefined, undefined, 1, 50)
    const first = load()
    clearEmployeeSwitch()
    const next = load()
    resolves[0]({ data: {} })
    await first
    const duplicate = load()
    expect(api.get).toHaveBeenCalledTimes(2)
    localStorage.setItem('hr_portal.token', 'replacement')
    const login = load()
    clearPerformanceInFlightRequests()
    const invalidated = load()
    expect(api.get).toHaveBeenCalledTimes(4)
    resolves.slice(1).forEach(done => done({ data: {} }))
    await Promise.all([next, duplicate, login, invalidated])
  })

  it('uses the captured tag_text list and options parameters', async () => {
    api.get.mockResolvedValueOnce({ data: { items: [wire], total: 1 } })
    const list = await performanceTagFillQuestionApi.list('价值', 2, 10)

    expect(api.get).toHaveBeenNthCalledWith(1, '/performance/tagged-fill-in-questions', {
      params: { offset: 10, limit: 10, question_type: 'tag_text', keyword: '价值' },
    })
    expect(list.items[0]).toMatchObject({ id: '301', name: '价值贡献', createdAt: wire.created_at })

    api.get.mockResolvedValueOnce({ data: { items: [{ id: wire.id, name: wire.name, description: wire.description, tags: wire.tags }] } })
    const options = await performanceTagFillQuestionApi.options()

    expect(api.get).toHaveBeenNthCalledWith(2, '/performance/tagged-fill-in-questions/options', {
      params: { question_type: 'tag_text' },
    })
    expect(options[0]).toMatchObject({ id: '301', name: '价值贡献' })
  })

  it('persists create, update and delete through the independent resource', async () => {
    const payload = { language: 'zh-CN' as const, name: wire.name, description: wire.description, remark: '', tags: wire.tags }
    api.post.mockResolvedValue({ data: wire })
    api.put.mockResolvedValue({ data: wire })
    api.delete.mockResolvedValue({})

    await performanceTagFillQuestionApi.create(payload)
    await performanceTagFillQuestionApi.update('301', payload)
    await performanceTagFillQuestionApi.remove('301')

    expect(api.post).toHaveBeenCalledWith('/performance/tagged-fill-in-questions', payload)
    expect(api.put).toHaveBeenCalledWith('/performance/tagged-fill-in-questions/301', payload)
    expect(api.delete).toHaveBeenCalledWith('/performance/tagged-fill-in-questions/301')
  })
})
