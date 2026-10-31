import { onMounted, onUnmounted } from 'vue'
import { api } from '@/api/client'
import { employeeSwitchSession, clearEmployeeSwitch } from '@/stores/identitySwitch'

export function usePerformanceIdentityHeartbeat() {
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let heartbeatSession: typeof employeeSwitchSession.value = null
  async function checkSwitchSession() {
    const session = employeeSwitchSession.value
    if (!session || heartbeatSession === session) return
    heartbeatSession = session
    try {
      const response = await api.get('/performance/identity-switch/session', { headers: { 'X-App-Switch-Session': session.session_token } })
      if (employeeSwitchSession.value === session && response.data?.expires_at) session.expires_at = response.data.expires_at
    } catch (error: any) {
      if (employeeSwitchSession.value !== session) return
      const status = error?.response?.status
      // 断网、超时、网关或服务端 5xx 是瞬时故障，保留会话等下一轮心跳；只有服务端明确判定会话无效才结束
      if (!status || status >= 500) return
      const detail = error?.response?.data?.detail
      clearEmployeeSwitch(typeof detail === 'string' && detail ? detail : '身份切换已失效，请恢复本人或重新申请授权')
    } finally {
      if (heartbeatSession === session) heartbeatSession = null
    }
  }
  function checkSwitchSessionOnResume() {
    if (document.visibilityState === 'visible') void checkSwitchSession()
  }
  onMounted(() => {
    document.addEventListener('visibilitychange', checkSwitchSessionOnResume)
    window.addEventListener('focus', checkSwitchSessionOnResume)
    heartbeat = setInterval(() => void checkSwitchSession(), 15000)
  })
  onUnmounted(() => {
    if (heartbeat) clearInterval(heartbeat)
    document.removeEventListener('visibilitychange', checkSwitchSessionOnResume)
    window.removeEventListener('focus', checkSwitchSessionOnResume)
  })
}
