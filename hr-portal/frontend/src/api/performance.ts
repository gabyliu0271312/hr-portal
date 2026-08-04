import { api } from './client'

export interface PerformanceAccessContext {
  subject_type: 'PORTAL_USER' | 'SYSTEM_ACCOUNT'
  subject_id: number
  display_name: string
  account_type: string | null
  portal_entry_permissions: string[]
  permission_codes: string[]
}

export const performanceApi = {
  async getAccessContext(): Promise<PerformanceAccessContext> {
    const { data } = await api.get<PerformanceAccessContext>('/performance/auth/context')
    return data
  },
}
