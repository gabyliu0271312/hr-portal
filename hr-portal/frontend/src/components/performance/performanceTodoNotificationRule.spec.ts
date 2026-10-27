import { describe, expect, it } from 'vitest'
import { defaultProgressDailyNotificationRule, defaultTodoNotificationRule, todoNotificationSummary } from './performanceTodoNotificationRule'

describe('todoNotificationSummary', () => {
  it('formats daily, weekly and specified rules without dropping selections', () => {
    expect(todoNotificationSummary().time).toContain('每 1 天的 10:00')
    expect(todoNotificationSummary({ ...defaultTodoNotificationRule(), frequency: 'weekly', interval: 2, weekdays: [1, 5] }).time).toContain('每 2 周的周一、周五')
    const summary = todoNotificationSummary({ ...defaultTodoNotificationRule(), frequency: 'specified', days_before: [0, 3], suppress_non_working_days: true })
    expect(summary.time).toContain('截止当天、第 3 个自然日')
    expect(summary.holidayPolicy).toBe('屏蔽')
  })
  it('distinguishes specified day kinds independently from holiday suppression', () => {
    for (const suppress of [true, false]) {
      const rule = { ...defaultTodoNotificationRule(), frequency: 'specified' as const, days_before: [0, 3, 100], suppress_non_working_days: suppress }
      expect(todoNotificationSummary(rule).time).toContain('截止当天、第 3 个自然日、第 100 个自然日')
      expect(todoNotificationSummary({ ...rule, day_kind: 'working_day' }).time).toContain('截止当天、第 3 个工作日、第 100 个工作日')
      expect(todoNotificationSummary({ ...rule, day_kind: 'working_day' }).holidayPolicy).toBe(suppress ? '屏蔽' : '不屏蔽')
    }
    for (const frequency of ['daily', 'weekly'] as const) {
      const rule = { ...defaultTodoNotificationRule(), frequency, weekdays: [1] }
      expect(todoNotificationSummary({ ...rule, day_kind: 'working_day' })).toEqual(todoNotificationSummary(rule))
    }
  })

  it('keeps the daily progress default at 18:00 with independent arrays', () => {
    const first = defaultProgressDailyNotificationRule()
    expect(todoNotificationSummary(first).time).toContain('每 1 天的 18:00')
    first.weekdays.push(1)
    expect(defaultProgressDailyNotificationRule().weekdays).toEqual([])
    expect(defaultTodoNotificationRule().time).toBe('10:00')
  })

  it('does not share default array references', () => {
    const first = defaultTodoNotificationRule()
    first.days_before.push(1)
    expect(defaultTodoNotificationRule().days_before).toEqual([])
  })
})
