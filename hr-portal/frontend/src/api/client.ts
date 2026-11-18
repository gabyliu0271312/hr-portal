import axios, { CanceledError, type AxiosInstance, type InternalAxiosRequestConfig, AxiosError } from 'axios'
import { employeeSwitchSession, employeeSwitchEpoch, employeeSwitchRequests, clearEmployeeSwitch } from '@/stores/identitySwitch'

type SwitchRequestConfig = InternalAxiosRequestConfig & { switchEpoch?: number; switchAbort?: AbortController; managementContextKey?: string }
import { ElMessage } from 'element-plus'

const TOKEN_KEY = 'hr_portal.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string | null) {
  if (!t) clearEmployeeSwitch()
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

function managementRouteContext() {
  if (!window.location.pathname.startsWith('/performance/')) return null
  const query = new URLSearchParams(window.location.search)
  const role = query.get('management_role')
  if (!role) return null
  return { management_role: role, cycle_id: query.get('cycle_id') || undefined, project_id: query.get('project_id') || undefined }
}

function managementContextKey() {
  return JSON.stringify(managementRouteContext())
}

export const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 15000,
})

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getToken()
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  const isPerformanceRequest = config.url?.startsWith('/performance/')
  const session = employeeSwitchSession.value
  if (isPerformanceRequest) {
    const tracked = config as SwitchRequestConfig
    const management = managementRouteContext()
    const scopedRequest = /^\/performance\/(project-management(?:\/|$)|projects(?:\/|$)|cycles\/\d+\/result-opening(?:\/|$)|tasks\/)/.test(config.url || '')
    if (management && scopedRequest) {
      config.params = { ...management, ...config.params }
      tracked.managementContextKey = managementContextKey()
    }
    tracked.switchEpoch = employeeSwitchEpoch.value
    if (!config.signal) {
      tracked.switchAbort = new AbortController()
      config.signal = tracked.switchAbort.signal
      employeeSwitchRequests.add(tracked.switchAbort)
    }
    if (session && !config.url?.startsWith('/performance/identity-switch/')) {
      config.headers.set('X-App-Switch-Session', session.session_token)
      if (!config.headers.has('X-App-Switch-Request')) config.headers.set('X-App-Switch-Request', `${Date.now()}-${Math.random().toString(36).slice(2)}`)
    }
  }
  if (isPerformanceRequest || config.url?.startsWith('/identity-switch/')) {
    config.headers = config.headers || {}
    config.headers.set('Cache-Control', 'no-cache')
    config.headers.set('Pragma', 'no-cache')
  }
  return config
})

let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

function formatDetail(data: any, fallback: string): string {
  if (!data) return fallback
  const d = data.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    // FastAPI/Pydantic 422：[{loc, msg, type}, ...]
    return d
      .map((it: any) => {
        const loc = Array.isArray(it.loc) ? it.loc.filter((x: any) => x !== 'body').join('.') : ''
        const msg = it.msg || it.message || JSON.stringify(it)
        return loc ? `${loc}: ${msg}` : msg
      })
      .join('；')
  }
  if (typeof d === 'object') return d.message || JSON.stringify(d)
  return fallback
}

api.interceptors.response.use(
  (resp) => {
    const config = resp.config as SwitchRequestConfig
    if (config.switchAbort) employeeSwitchRequests.delete(config.switchAbort)
    if (config.switchEpoch !== undefined && config.switchEpoch !== employeeSwitchEpoch.value) throw new CanceledError('旧身份响应已丢弃')
    if (config.managementContextKey !== undefined && config.managementContextKey !== managementContextKey()) throw new CanceledError('旧管理范围响应已丢弃')
    return resp
  },
  (error: AxiosError<any>) => {
    const config = error.config as SwitchRequestConfig | undefined
    if (config?.switchAbort) employeeSwitchRequests.delete(config.switchAbort)
    if (axios.isCancel(error) || (config?.switchEpoch !== undefined && config.switchEpoch !== employeeSwitchEpoch.value) || (config?.managementContextKey !== undefined && config.managementContextKey !== managementContextKey())) return Promise.reject(new CanceledError('身份或管理范围已变化'))
    const rawDetail = (error.response?.data as any)?.detail
    const status = error.response?.status
    // 5xx 属于服务端瞬时故障，不能据此结束切换会话；只有明确拒绝才作废
    if (config?.switchEpoch !== undefined && status && status < 500 && rawDetail?.code?.startsWith('SWITCH_')) clearEmployeeSwitch(rawDetail.message || '身份切换已失效，请恢复本人')
    const detail = formatDetail(error.response?.data, error.message || '网络异常')

    // 把格式化后的字符串挂回 response.data.detail，方便业务页面统一读
    if (error.response) {
      if (error.response.data && typeof error.response.data === 'object') {
        ;(error.response.data as any).detail = detail
      } else {
        error.response.data = { detail } as any
      }
    }

    if (status === 401) {
      setToken(null)
      if (onUnauthorized) onUnauthorized()
    } else if (status === 403) {
      ElMessage.error(`无权限：${detail}`)
    } else if (status === 422) {
      ElMessage.error(`参数校验失败：${detail}`)
    } else if (status === 423) {
      ElMessage.error(detail)
    } else if (status && status >= 500) {
      ElMessage.error(`服务器错误：${detail}`)
    }
    return Promise.reject(error)
  }
)