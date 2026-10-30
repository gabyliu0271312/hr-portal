/** 绩效表格列宽标准（对齐飞书采集值），页面与公共表格共用。 */
export const PERFORMANCE_COLUMN_WIDTHS: Record<string, number> = {
  selection: 40,
  name: 224,
  status: 144,
  source_label: 144,
  relationship: 144,
  due_at: 168,
  rating: 144,
  completion: 144,
  direct_supervisor: 144,
  job_sequence: 104,
  position_level: 124,
  hire_date: 134,
  department: 224,
}

export function performanceColumnWidth(key: string): number {
  return PERFORMANCE_COLUMN_WIDTHS[key] ?? 120
}
