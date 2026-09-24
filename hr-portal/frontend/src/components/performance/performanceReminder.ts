import type { PerformanceWorkbenchTaskPerson } from '@/api/performance'

export type ReminderContext = {
  projectId: number
  cycleId: number
  nodeId: string
  nodeType: string
  reviewType: string
  title: string
  sectionTitle: string
}

export type ReminderPerson = PerformanceWorkbenchTaskPerson

export type ReminderColumn = {
  key: string
  label: string
  locked?: boolean
  visibleByDefault?: boolean
  sortable?: boolean
  minWidth?: number
}

export type ReminderCapabilities = {
  canRemind: boolean
  canAuthorize: boolean
  canTransfer: boolean
  canExport: boolean
}

export type ReminderListResult = {
  items: ReminderPerson[]
  total: number
  columns: ReminderColumn[]
  capabilities: ReminderCapabilities
}

export type ReminderListQuery = {
  context: ReminderContext
  keyword: string
  page: number
  pageSize: number
}

export type ReminderProvider = (query: ReminderListQuery) => Promise<ReminderListResult>

export const defaultReminderColumns: ReminderColumn[] = [
  { key: 'display_name', label: '姓名', locked: true, visibleByDefault: true, minWidth: 180 },
  { key: 'reminder_target', label: '催办对象', visibleByDefault: true, minWidth: 180 },
  { key: 'status', label: '状态', visibleByDefault: true, minWidth: 120 },
  { key: 'completion', label: '360° 评估率', visibleByDefault: true, minWidth: 144 },
  { key: 'direct_supervisor', label: '直属上级', visibleByDefault: true, minWidth: 160 },
  { key: 'hrbp', label: 'HRBP', visibleByDefault: true, minWidth: 140 },
  { key: 'job_sequence', label: '序列', visibleByDefault: true, minWidth: 120 },
  { key: 'position_level', label: '职级', visibleByDefault: true, minWidth: 100 },
  { key: 'hire_date', label: '入职日期', visibleByDefault: true, minWidth: 140 },
  { key: 'department', label: '所属部门', visibleByDefault: true, minWidth: 180 },
  { key: 'employee_type', label: '人员类型', visibleByDefault: true, minWidth: 120 },
]

const profileColumnKeys: Record<string, string> = {
  department: 'department',
  position_level: 'position_level',
  job_sequence: 'job_sequence',
  direct_supervisor: 'direct_supervisor',
  hire_date: 'hire_date',
  employee_type: 'employee_type',
}
const configurableProfileColumns = new Set(Object.values(profileColumnKeys))

export function reminderColumnsForVisibility(rows: ReminderPerson[]) {
  const configuredRows = rows.filter(row => Array.isArray(row.visible_profile_fields))
  if (!configuredRows.length) return defaultReminderColumns
  const visible = new Set(configuredRows.flatMap(row => row.visible_profile_fields || []).map(field => profileColumnKeys[field]).filter(Boolean))
  return defaultReminderColumns.filter(column => !configurableProfileColumns.has(column.key) || visible.has(column.key))
}

export function reminderCellValue(person: ReminderPerson, key: string) {
  if (key === 'status') {
    return person.status === 'completed' ? '已完成' : person.status === 'overdue' ? '已逾期' : '待完成'
  }
  if (key === 'due_at') {
    return person.due_at ? new Date(person.due_at).toLocaleString('zh-CN', { hour12: false }) : '--'
  }
  return (person[key as keyof ReminderPerson] as string | null | undefined) || '--'
}
