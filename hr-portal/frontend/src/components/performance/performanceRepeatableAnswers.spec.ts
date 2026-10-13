import { describe, expect, it } from 'vitest'
import type { SelfSummarySection } from '@/api/performance'
import { selfSummaryAddedInstance, selfSummaryFieldValue, selfSummaryInstanceCount, selfSummaryRemovedInstance, selfSummaryUpdatedFieldValue } from './performanceRepeatableAnswers'

const section: SelfSummarySection = {
  id: 'summary',
  name: '工作总结',
  allow_multiple: true,
  fields: [
    { id: 'work', type: 'rich_text', label: '总结' },
    { id: 'rating', type: 'rating', label: '评级' },
  ],
}

describe('performanceRepeatableAnswers', () => {
  it('upgrades legacy scalar answers and keeps fields aligned by instance index', () => {
    const answers = { work: '原总结', rating: 'one' }
    const added = { ...answers, ...selfSummaryAddedInstance(section, answers) }
    expect(added).toEqual({ work: ['原总结', ''], rating: ['one', ''] })
    expect(selfSummaryAddedInstance(section, {})).toEqual({ work: ['', ''], rating: ['', ''] })
    expect(selfSummaryInstanceCount(section, added)).toBe(2)

    const updated = { ...added, work: selfSummaryUpdatedFieldValue(section, section.fields[0], 1, '第二条', added) }
    expect(selfSummaryFieldValue(section, section.fields[0], 1, updated)).toBe('第二条')
    expect(selfSummaryRemovedInstance(section, 1, updated)).toEqual({ work: ['原总结'], rating: ['one'] })
  })

  it('keeps non-repeatable answers as scalar values', () => {
    const single = { ...section, allow_multiple: false }
    expect(selfSummaryUpdatedFieldValue(single, single.fields[0], 0, '更新', { work: '原总结' })).toBe('更新')
    expect(selfSummaryInstanceCount(single, { work: '原总结' })).toBe(1)
  })
})
