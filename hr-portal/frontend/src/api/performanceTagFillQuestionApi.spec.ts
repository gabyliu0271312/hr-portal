import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('./client', () => ({ api }))

import { performanceTagFillQuestionApi } from './performance'

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
  beforeEach(() => vi.clearAllMocks())

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
