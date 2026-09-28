import { describe, expect, it } from 'vitest'
import { canManagePerformanceSettings } from './performanceSettingsAccess'

const context = (permissions: string[]) => ({
  subject_type: 'PORTAL_USER' as const,
  subject_id: 8,
  display_name: '绩效管理员',
  account_type: null,
  portal_entry_permissions: ['performance.app', 'performance.admin'],
  permission_codes: permissions,
})

describe('canManagePerformanceSettings', () => {
  it('allows the Portal performance admin entry without an internal permission code', () => {
    expect(canManagePerformanceSettings(['performance.admin'], context([]))).toBe(true)
    expect(canManagePerformanceSettings(['performance.app'], context([]))).toBe(false)
    expect(canManagePerformanceSettings(['performance.admin'], {
      ...context([]),
      portal_entry_permissions: ['performance.app'],
    })).toBe(false)
  })
})
