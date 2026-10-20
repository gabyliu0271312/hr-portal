import { describe, expect, it } from 'vitest'
import { defaultTodoNotificationRule, todoNotificationSummary } from './performanceTodoNotificationRule'

describe('todoNotificationSummary', () => {
  it('formats daily, weekly and specified rules without dropping selections', () => {
    expect(todoNotificationSummary().time).toContain('每 1 天的 10:00')
    expect(todoNotificationSummary({ ...defaultTodoNotificationRule(), frequency: 'weekly', interval: 2, weekdays: [1, 5] }).time).toContain('每 2 周的星期一、星期五')
    const summary = todoNotificationSummary({ ...defaultTodoNotificationRule(), frequency: 'specified', days_before: [0, 3], suppress_non_working_days: true })
    expect(summary.time).toContain('截止当天、第 3 天')
    expect(summary.holidayPolicy).toBe('屏蔽')
  })
  it('does not share default array references', () => {
    const first = defaultTodoNotificationRule()
    first.days_before.push(1)
    expect(defaultTodoNotificationRule().days_before).toEqual([])
  })
})
