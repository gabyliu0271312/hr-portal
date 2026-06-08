export const REPORT_AGG_FUNCS = [
  { value: 'sum', label: '求和' },
  { value: 'count', label: '计数' },
  { value: 'count_distinct', label: '去重计数' },
  { value: 'avg', label: '平均值' },
  { value: 'max', label: '最大值' },
  { value: 'min', label: '最小值' },
] as const

export type ReportAggFunc = (typeof REPORT_AGG_FUNCS)[number]['value']

export function reportAggLabel(value?: string) {
  return REPORT_AGG_FUNCS.find((item) => item.value === value)?.label || '求和'
}
