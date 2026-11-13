import type { PerformanceWorkbenchTaskPerson, ProjectMemberTaskOption } from '@/api/performance'
import { normalizePerformanceTaskStatus, performanceTaskStatusLabel } from './performanceTaskStatus'

export type ReminderContext = {
  projectId: number
  cycleId: number
  nodeId: string
  nodeType: string
  reviewType: string
  title: string
  sectionTitle: string
  employeeNo?: string
  targetKind?: 'reviewer_360'
  reminderTarget?: string
  sourceTaskId?: number
  targetTaskId?: number
  departmentPath?: string
}

export type ReminderPerson = Omit<PerformanceWorkbenchTaskPerson, 'task_id'> & { task_id: number | string; selectable?: boolean; unavailable_reason?: string | null; project_name?: string; project_id?: number; can_authorize?: boolean; task_map?: ProjectMemberTaskOption[]; rating?: string | null; organization_path?: string | null }

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
  { key: 'display_name', label: '姓名', locked: true, visibleByDefault: true, minWidth: 224 },
  { key: 'reminder_target', label: '催办对象', visibleByDefault: true, minWidth: 184 },
  { key: 'status', label: '状态', visibleByDefault: true, minWidth: 144 },
  { key: 'rating', label: '绩效评级', visibleByDefault: false, minWidth: 144 },
  { key: 'completion', label: '360° 评估率', visibleByDefault: true, minWidth: 144 },
  { key: 'direct_supervisor', label: '直属上级', visibleByDefault: true, minWidth: 144 },
  { key: 'hrbp', label: 'HRBP', visibleByDefault: true, minWidth: 184 },
  { key: 'job_sequence', label: '序列', visibleByDefault: true, minWidth: 104 },
  { key: 'job_category', label: '子序列', visibleByDefault: false, minWidth: 104 },
  { key: 'position_level', label: '职级', visibleByDefault: true, minWidth: 124 },
  { key: 'previous_position_level', label: '上期职级', visibleByDefault: false, minWidth: 124 },
  { key: 'hire_date', label: '入职日期', visibleByDefault: true, minWidth: 134 },
  { key: 'department', label: '所属部门', visibleByDefault: true, minWidth: 224 },
  { key: 'organization_path', label: '部门全路径', visibleByDefault: false, minWidth: 240 },
  { key: 'project_name', label: '所属项目', visibleByDefault: false, minWidth: 184 },
  { key: 'employee_type', label: '人员类型', visibleByDefault: false, minWidth: 120 },
]

const profileColumnKeys: Record<string, string> = {
  department: 'department',
  position_level: 'position_level',
  job_sequence: 'job_sequence',
  direct_supervisor: 'direct_supervisor',
  hire_date: 'hire_date',
  employee_type: 'employee_type',
  job_category: 'job_sequence',
  organization_path: 'department',
  previous_position_level: 'position_level',
}
const configurableProfileColumns = new Set(Object.keys(profileColumnKeys))

export function reminderColumnsForVisibility(rows: ReminderPerson[]) {
  const configuredRows = rows.filter(row => Array.isArray(row.visible_profile_fields))
  if (!configuredRows.length) return defaultReminderColumns
  const visible = new Set(configuredRows.flatMap(row => row.visible_profile_fields || []))
  return defaultReminderColumns.filter(column => !configurableProfileColumns.has(column.key) || visible.has(profileColumnKeys[column.key]))
}

export function reminderCellValue(person: ReminderPerson, key: string) {
  if (key === 'status') {
    return performanceTaskStatusLabel(normalizePerformanceTaskStatus(person.status, person.due_at))
  }
  if (key === 'unavailable_reason') {
    const reasons: Record<string, string> = { MANUAL_OPENING_DISABLED: '仅按流程自动开通', RESULT_VIEW_NOT_STARTED: '尚未到结果查看开始时间', RESULT_NOT_READY: '最终结果尚未生成' }
    return person.unavailable_reason ? reasons[person.unavailable_reason] || '暂不可开通' : '可开通'
  }
  if (key === 'due_at') {
    return person.due_at ? new Date(person.due_at).toLocaleString('zh-CN', { hour12: false }) : '--'
  }
  return (person[key as keyof ReminderPerson] as string | null | undefined) || '--'
}
