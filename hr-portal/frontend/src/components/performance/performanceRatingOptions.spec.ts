import { describe, expect, it } from 'vitest'
import { mergeRatingOptions } from './performanceRatingOptions'

describe('mergeRatingOptions', () => {
  const defaults = [
    { id: 'one', code: '1星', name: '不合格', label: '不合格', description: '交付结果低于预期', color: 'rgb(251, 191, 188)' },
    { id: 'five', code: '5星', name: '卓越', label: '卓越', description: '显著超出预期', color: 'rgb(183, 237, 177)' },
  ]

  it('fills missing grade metadata for legacy options without replacing local values', () => {
    const local = [{ id: 'one', label: '本地不合格', color: 'rgb(1, 2, 3)' }]
    expect(mergeRatingOptions(local, defaults)).toEqual([
      { id: 'one', label: '本地不合格', color: 'rgb(1, 2, 3)', code: '1星', name: '不合格', description: '交付结果低于预期' },
    ])
  })

  it('matches legacy options by grade code and keeps explicit empty descriptions', () => {
    const local = [{ id: 'grade-a', code: '5星', label: '卓越', description: '' }]
    expect(mergeRatingOptions(local, defaults)).toEqual([
      { id: 'grade-a', code: '5星', label: '卓越', description: '', name: '卓越', color: 'rgb(183, 237, 177)' },
    ])
  })

  it('uses defaults when the item has no local options and leaves unknown ids untouched', () => {
    expect(mergeRatingOptions(undefined, defaults)).toEqual(defaults)
    expect(mergeRatingOptions([{ id: 'custom', label: '自建等级' }], defaults)).toEqual([{ id: 'custom', label: '自建等级' }])
  })

  it('reads the legacy level_description field before falling back to defaults', () => {
    expect(mergeRatingOptions([{ id: 'one', label: '不合格', level_description: '旧描述' } as never], defaults)[0].description).toBe('旧描述')
  })
})
