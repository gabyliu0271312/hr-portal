import { describe, expect, it } from 'vitest'
import { mergeRatingOptions, resolveRatingOptions } from './performanceRatingOptions'

describe('resolveRatingOptions', () => {
  const authority = [
    { id: 'one', code: '1星', name: '不合格', label: '不合格', description: '交付结果低于预期', color: 'rgb(251, 191, 188)' },
    { id: 'five', code: '5星', name: '卓越', label: '卓越', description: '显著超出预期', color: 'rgb(183, 237, 177)' },
  ]

  it('等级定义以评级题库为准，本地快照不再覆盖题库', () => {
    const local = [{ id: 'one', label: '本地不合格', color: 'rgb(1, 2, 3)' }]
    expect(resolveRatingOptions(local, authority)).toEqual(authority)
  })

  it('题库等级的顺序与数量决定最终展示，本地已删除的旧等级不会残留', () => {
    const local = [{ id: 'one', label: '不合格' }, { id: 'legacy', label: '已删除等级' }]
    expect(resolveRatingOptions(local, authority).map(option => option.id)).toEqual(['one', 'five'])
  })

  it('题库缺少该评级项时回退到本地快照', () => {
    expect(resolveRatingOptions(undefined, [])).toEqual([])
    expect(resolveRatingOptions([{ id: 'custom', label: '自建等级' }], [])).toEqual([{ id: 'custom', label: '自建等级' }])
  })

  it('回退到本地快照时兼容历史 level_description 字段', () => {
    expect(resolveRatingOptions([{ id: 'one', label: '不合格', level_description: '旧描述' } as never], [])[0].description).toBe('旧描述')
  })
})

describe('mergeRatingOptions', () => {
  const fallback = [
    { id: 'one', code: '1星', name: '不合格', label: '不合格', description: '交付结果低于预期', color: 'rgb(251, 191, 188)' },
  ]

  it('条目自身的等级优先，仅补齐缺失的代号与描述', () => {
    const local = [{ id: 'one', label: '本地不合格', color: 'rgb(1, 2, 3)' }]
    expect(mergeRatingOptions(local, fallback)).toEqual([
      { id: 'one', label: '本地不合格', color: 'rgb(1, 2, 3)', code: '1星', name: '不合格', description: '交付结果低于预期' },
    ])
  })

  it('条目没有等级时使用兜底等级，显式空数组保持为空', () => {
    expect(mergeRatingOptions(undefined, fallback)).toEqual(fallback)
    expect(mergeRatingOptions([], fallback)).toEqual([])
  })

  it('兼容历史 level_description 字段', () => {
    expect(mergeRatingOptions([{ id: 'one', label: '不合格', level_description: '旧描述' } as never], [])[0].description).toBe('旧描述')
  })
})
