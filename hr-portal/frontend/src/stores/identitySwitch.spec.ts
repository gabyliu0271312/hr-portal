import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, AxiosHeaders, type AxiosAdapter } from 'axios'
import { api } from '@/api/client'
import { clearEmployeeSwitch, employeeSwitchEpoch, employeeSwitchRequests, employeeSwitchSession, setEmployeeSwitch } from './identitySwitch'

describe('employee identity session isolation', () => {
  beforeEach(() => { clearEmployeeSwitch(); localStorage.clear() })
  it('drops normal identity responses that finish after a switch starts', async () => {
    let release!: () => void
    const entered = vi.fn()
    const request = api.get('/performance/navigation', { adapter: config => {
      entered()
      return new Promise(resolve => { release = () => resolve({ config, data: {}, status: 200, statusText: 'OK', headers: new AxiosHeaders() }) })
    } })
    const rejected = expect(request).rejects.toMatchObject({ code: 'ERR_CANCELED' })
    await vi.waitFor(() => expect(entered).toHaveBeenCalledOnce())
    clearEmployeeSwitch()
    release()
    await rejected
  })

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

  it.each([
    '/performance/auth/context',
    '/performance/identity-switch/session',
    '/performance/identity-switch/capability',
    '/identity-switch/control',
  ])('revalidates cached identity responses for %s', async url => {
    await api.get(url, { adapter: async config => {
      expect(config.headers.get('Cache-Control')).toBe('no-cache')
      expect(config.headers.get('Pragma')).toBe('no-cache')
      return { config, data: {}, status: 200, statusText: 'OK', headers: new AxiosHeaders() }
    } })
  })

  it('does not change cache policy for unrelated Portal requests', async () => {
    await api.get('/users', { adapter: async config => {
      expect(config.headers.has('Cache-Control')).toBe(false)
      return { config, data: {}, status: 200, statusText: 'OK', headers: new AxiosHeaders() }
    } })
  })

  it('keeps a replacement session after the previous 410 using the real interceptors', async () => {
    const session = (id: string) => ({ session_id: id, session_token: `secret-${id}`, expires_at: '2099-01-01', effective_identity: { employee_no: 'E001', display_name: 'Employee' }, mode: 'TARGET_POLICY' as const })
    const adapter: AxiosAdapter = async config => {
      expect(config.headers.get('Cache-Control')).toBe('no-cache')
      const expired = config.headers.get('X-App-Switch-Session') === 'secret-old'
      const response = { config, data: expired ? { detail: { code: 'SWITCH_SESSION_EXPIRED', message: '身份切换已到期，请恢复本人' } } : { employee_no: 'E001' }, status: expired ? 410 : 200, statusText: expired ? 'Gone' : 'OK', headers: new AxiosHeaders() }
      if (expired) throw new AxiosError('expired', 'ERR_BAD_REQUEST', config, undefined, response)
      return response
    }
    setEmployeeSwitch(session('old'))
    await expect(api.get('/performance/auth/context', { adapter })).rejects.toThrow('expired')
    expect(employeeSwitchSession.value).toBeNull()
    setEmployeeSwitch(session('new'))
    const response = await api.get('/performance/auth/context', { adapter })
    expect(response.status).toBe(200)
    expect(employeeSwitchSession.value?.session_id).toBe('new')
  })
})
