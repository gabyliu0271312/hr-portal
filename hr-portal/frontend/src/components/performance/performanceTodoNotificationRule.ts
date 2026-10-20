import type { PerformanceTodoNotificationRule } from '@/api/performance'

export const notificationFrequencyOptions = [
  { value: 'specified', label: '指定时间' },
  { value: 'daily', label: '以天为单位重复' },
  { value: 'weekly', label: '以周为单位重复' },
]
export const notificationWeekdayOptions = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
  .map((label, index) => ({ value: String(index + 1), label }))
export const notificationTimezoneOptions = [
  { value: 'person', label: '人员所在时区' },
  { value: 'Asia/Shanghai', label: '北京时间（Asia/Shanghai）' },
  { value: 'Asia/Hong_Kong', label: '香港时间（Asia/Hong_Kong）' },
  { value: 'Asia/Tokyo', label: '东京时间（Asia/Tokyo）' },
  { value: 'America/Los_Angeles', label: '洛杉矶时间（America/Los_Angeles）' },
  { value: 'Europe/London', label: '伦敦时间（Europe/London）' },
]

export function defaultTodoNotificationRule(): PerformanceTodoNotificationRule {
  return {
    frequency: 'daily', interval: 1, days_before: [], day_kind: 'calendar_day', weekdays: [],
    time: '10:00', timezone: 'person', suppress_non_working_days: false,
  }
}

export function defaultProgressDailyNotificationRule(): PerformanceTodoNotificationRule {
  return { ...defaultTodoNotificationRule(), time: '18:00' }
}

export function todoNotificationSummary(rule = defaultTodoNotificationRule()) {
  const frequency = notificationFrequencyOptions.find(option => option.value === rule.frequency)?.label || rule.frequency
  const zone = notificationTimezoneOptions.find(option => option.value === rule.timezone)?.label || rule.timezone
  const dayKind = rule.day_kind === 'working_day' ? '工作日' : '自然日'
  const days = rule.days_before.map(day => day === 0 ? '截止当天' : `第 ${day} 个${dayKind}`).join('、')
  const weekdays = rule.weekdays.map(day => notificationWeekdayOptions[day - 1]?.label).filter(Boolean).join('、')
  const schedule = rule.frequency === 'specified'
    ? `环节截止前 ${days}`
    : rule.frequency === 'weekly' ? `环节截止前每 ${rule.interval} 周的${weekdays}` : `环节截止前每 ${rule.interval} 天`
  return {
    frequency,
    time: `${schedule}的 ${rule.time}（${zone}）`,
    holidayPolicy: rule.suppress_non_working_days ? '屏蔽' : '不屏蔽',
  }
}
