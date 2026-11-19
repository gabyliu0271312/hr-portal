const displays = {
  result_communication: { table: 'communication', completedView: 'drawer', completedReadonly: true },
  reviewer_360_confirm: { table: 'taskPeople', completedView: 'drawer', completedReadonly: false },
  calibration: { table: 'manager', completedView: 'drawer', completedReadonly: false },
  result_reconsideration: { table: 'members', completedView: 'drawer', completedReadonly: false },
} as const

export function performanceReviewDisplay(nodeType: string) {
  return displays[nodeType as keyof typeof displays] || null
}

export const reviewer360ConfirmColumns = [
  { key: 'name', label: '姓名', locked: true },
  { key: 'status', label: '360°邀请确认状态' },
  { key: 'due_at', label: '截止时间' },
  { key: 'completion', label: '360°评估率' },
  { key: 'job_sequence', label: '序列' },
  { key: 'position_level', label: '职级' },
]

export const communicationColumns = [
  { key: 'name', label: '姓名', locked: true },
  { key: 'status', label: '状态' },
  { key: 'due_at', label: '截止时间' },
  { key: 'rating', label: '绩效评级' },
  { key: 'completion', label: '360°评估率' },
  { key: 'job_sequence', label: '序列' },
  { key: 'position_level', label: '职级' },
  { key: 'hire_date', label: '入职日期' },
  { key: 'department', label: '所属部门' },
  { key: 'employee_type', label: '员工类型' },
  { key: 'previous_position_level', label: '上期职级' },
]
