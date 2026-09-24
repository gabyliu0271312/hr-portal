import { describe, expect, it } from 'vitest'
import { defaultReminderColumns, reminderColumnsForVisibility } from './performanceReminder'

const row = {
  task_id: 1,
  employee_no: 'E001',
  display_name: '员工一',
  job_family: null,
  job_category: null,
  job_sequence: null,
  position_level: null,
  hire_date: null,
  department: '研发中心',
  employee_type: null,
  employment_status: null,
  status: 'pending',
  due_at: null,
}

describe('reminderColumnsForVisibility', () => {
  it('keeps legacy columns when the backend does not return visibility data', () => {
    expect(reminderColumnsForVisibility([row])).toBe(defaultReminderColumns)
  })

  it('keeps business columns and only configured profile columns', () => {
    const columns = reminderColumnsForVisibility([{ ...row, visible_profile_fields: ['department', 'employee_type'] }])
    const keys = columns.map(column => column.key)

    expect(keys).toEqual(['display_name', 'reminder_target', 'status', 'completion', 'hrbp', 'department', 'employee_type'])
    expect(keys).not.toContain('position_level')
    expect(keys).not.toContain('direct_supervisor')
  })
})
