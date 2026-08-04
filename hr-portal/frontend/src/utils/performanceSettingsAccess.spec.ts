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
  it('requires both the Portal backend entry and an internal configuration permission', () => {
    expect(canManagePerformanceSettings(['performance.admin'], context(['performance.cycles.manage']))).toBe(true)
    expect(canManagePerformanceSettings(['performance.app'], context(['performance.cycles.manage']))).toBe(false)
    expect(canManagePerformanceSettings(['performance.admin'], context([]))).toBe(false)
  })
})
