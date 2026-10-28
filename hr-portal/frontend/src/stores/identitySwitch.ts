import { ref, shallowRef } from 'vue'

export interface EmployeeSwitchSession {
  session_id: string
  session_token: string
  expires_at: string
  effective_identity: { employee_no: string; display_name: string }
  mode: 'TARGET_POLICY'
}

export const employeeSwitchSession = shallowRef<EmployeeSwitchSession | null>(null)
export const employeeSwitchEpoch = ref(0)
export const employeeSwitchNotice = ref('')
export const employeeSwitchRequests = new Set<AbortController>()

export function clearEmployeeSwitch(message = '') {
  employeeSwitchEpoch.value += 1
  employeeSwitchSession.value = null
  employeeSwitchNotice.value = message
  for (const controller of employeeSwitchRequests) controller.abort()
  employeeSwitchRequests.clear()
}

export function setEmployeeSwitch(session: EmployeeSwitchSession) {
  clearEmployeeSwitch()
  employeeSwitchSession.value = session
}
