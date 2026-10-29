import { api } from './client'
import type { EmployeeSwitchSession } from '@/stores/identitySwitch'

export interface SwitchCapability {
  can_switch: boolean
  can_manage_control: boolean
  others_enabled: boolean
  generation: number
  test_delivery_enabled: boolean
}
export interface SwitchControl {
  app_code: string
  system_name: string
  description: string
  others_enabled: boolean
  generation: number
  revision: number
  test_delivery_enabled: boolean
  test_receiver_user_id: number | null
}
export interface SwitchPerson { employee_no: string; display_name: string; organization_label?: string }
export interface NotificationTestRun {
  id: string
  source: string
  environment: string
  target_employee_no: string
  created_at: string
  planned_count: number
  error_count: number
  original_delivery_count: number
  sample_status: string
  summary_status: string
  delivery_error: string | null
  can_deliver: boolean
  items: { title: string; content: string; receiver_count: number; errors?: unknown[] }[]
}

export function switchRequestId() {
  return globalThis.crypto.randomUUID?.() || Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('')
}

export const identitySwitchApi = {
  capability: () => api.get<SwitchCapability>('/performance/identity-switch/capability').then(r => r.data),
  control: () => api.get<SwitchControl>('/identity-switch/control').then(r => r.data),
  updateControl: (value: Partial<Pick<SwitchControl, 'others_enabled' | 'test_delivery_enabled' | 'test_receiver_user_id'>> & { expected_revision: number; request_id: string; confirm_clear?: boolean }) =>
    api.patch<SwitchControl>('/identity-switch/control', value).then(r => r.data),
  people: (q: string, page = 1) => api.get<{ items: SwitchPerson[]; total: number }>('/performance/identity-switch/people', { params: { q, page, page_size: 50 } }).then(r => r.data),
  favorites: () => api.get<{ items: SwitchPerson[] }>('/performance/identity-switch/favorites').then(r => r.data.items),
  addFavorite: (employeeNo: string) => api.post<SwitchPerson>('/performance/identity-switch/favorites', { employee_no: employeeNo }).then(r => r.data),
  removeFavorite: (employeeNo: string) => api.delete(`/performance/identity-switch/favorites/${encodeURIComponent(employeeNo)}`),
  create: (employee_no: string, expected_generation: number) => api.post<EmployeeSwitchSession>('/performance/identity-switch/sessions', { employee_no, expected_generation, request_id: switchRequestId() }).then(r => r.data),
  end: (id: string) => api.delete(`/performance/identity-switch/sessions/${id}`),
  runs: () => api.get<{ items: NotificationTestRun[] }>('/performance/identity-switch/notification-tests').then(r => r.data),
  deliver: (id: string, verify_style: boolean) => api.post<NotificationTestRun>(`/performance/identity-switch/notification-tests/${id}/deliver`, { verify_style }).then(r => r.data),
}
