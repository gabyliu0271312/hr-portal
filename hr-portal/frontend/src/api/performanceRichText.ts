import { api, getToken } from './client'
import { employeeSwitchSession } from '@/stores/identitySwitch'

export const performanceRichTextApi = {
  async title(url: string): Promise<string | null> {
    const token = getToken()
    if (!token || employeeSwitchSession.value) return null
    try {
      const { data } = await api.post<{ title: string | null }>('/performance/rich-text/link-title', { url }, { timeout: 5000, validateStatus: () => true })
      if (getToken() !== token || employeeSwitchSession.value) return null
      return typeof data.title === 'string' && data.title.trim() ? data.title.trim().slice(0, 500) : null
    } catch { return null }
  },
}
