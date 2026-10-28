import { beforeEach, describe, expect, it } from 'vitest'
import { clearEmployeeSwitch, employeeSwitchEpoch, employeeSwitchRequests, employeeSwitchSession, setEmployeeSwitch } from './identitySwitch'

describe('employee identity session isolation', () => {
  beforeEach(() => { clearEmployeeSwitch(); localStorage.clear() })
  it('keeps the Portal token and never persists the employee session', () => {
    localStorage.setItem('hr_portal.token', 'original-portal-token')
    setEmployeeSwitch({ session_id: 's', session_token: 'private-switch-token', expires_at: '2099-01-01', effective_identity: { employee_no: 'E001', display_name: 'Employee' }, mode: 'TARGET_POLICY' })
    expect(localStorage.getItem('hr_portal.token')).toBe('original-portal-token')
    expect(JSON.stringify(localStorage)).not.toContain('private-switch-token')
    expect(employeeSwitchSession.value?.effective_identity.employee_no).toBe('E001')
  })
  it('cancels old requests and advances the identity boundary on restore', () => {
    const controller = new AbortController()
    employeeSwitchRequests.add(controller)
    const before = employeeSwitchEpoch.value
    clearEmployeeSwitch('session revoked')
    expect(controller.signal.aborted).toBe(true)
    expect(employeeSwitchEpoch.value).toBeGreaterThan(before)
    expect(employeeSwitchSession.value).toBeNull()
  })
})
