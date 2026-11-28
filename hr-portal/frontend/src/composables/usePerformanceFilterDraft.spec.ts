import { describe, expect, it } from 'vitest'
import { usePerformanceFilterDraft } from './usePerformanceFilterDraft'

function createDraft() {
  return usePerformanceFilterDraft(() => ({ status: [] as string[], manager: [] as string[] }))
}

describe('usePerformanceFilterDraft', () => {
  it('applies the draft only on confirm and discards it on cancel', () => {
    const filters = createDraft()
    filters.open()
    filters.draft.value.status.push('enabled')
    expect(filters.applied.value.status).toEqual([])
    expect(filters.activeCount.value).toBe(0)

    filters.confirm()
    expect(filters.applied.value.status).toEqual(['enabled'])
    expect(filters.activeCount.value).toBe(1)

    filters.open()
    filters.draft.value.status.push('finished')
    filters.cancel()
    expect(filters.draft.value.status).toEqual(['enabled'])
    expect(filters.applied.value.status).toEqual(['enabled'])
  })

  it('clears only the draft and counts active fields rather than selected values', () => {
    const filters = createDraft()
    filters.open()
    filters.draft.value.status.push('enabled', 'finished')
    filters.draft.value.manager.push('张三')
    filters.confirm()
    expect(filters.activeCount.value).toBe(2)

    filters.open()
    filters.clear()
    expect(filters.draft.value).toEqual({ status: [], manager: [] })
    expect(filters.applied.value).toEqual({ status: ['enabled', 'finished'], manager: ['张三'] })
    expect(filters.activeCount.value).toBe(2)

    filters.confirm()
    expect(filters.applied.value).toEqual({ status: [], manager: [] })
    expect(filters.activeCount.value).toBe(0)
  })

  it('keeps applied and draft independent from the initial factory result', () => {
    const filters = createDraft()
    filters.open()
    filters.draft.value.manager.push('李四')
    filters.confirm()
    expect(filters.applied.value.manager).toEqual(['李四'])

    const next = createDraft()
    expect(next.applied.value).toEqual({ status: [], manager: [] })
  })
})
