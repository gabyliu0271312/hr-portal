import axios, { type AxiosInstance, type InternalAxiosRequestConfig, AxiosError } from 'axios'
import { ElMessage } from 'element-plus'

const TOKEN_KEY = 'hr_portal.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string | null) {
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
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
  if (typeof d === 'object') return JSON.stringify(d)
  return fallback
}

api.interceptors.response.use(
  (resp) => resp,
  (error: AxiosError<any>) => {
    const status = error.response?.status
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