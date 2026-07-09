import { api } from './client'

export interface ApiServiceOut {
  id: number
  name: string
  description: string | null
  source_type: string
  source_id: string
  source_label: string | null
  source_layer: string | null
  field_whitelist: { field: string; alias?: string; sensitive?: boolean }[]
  filter_fields: string[]
  default_sort: string | null
  page_size_max: number
  auth_policy: Record<string, any>
  rate_limit: number | null
  timeout_seconds: number
  status: string
  is_active: boolean
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface ApiServiceIn {
  name: string
  description?: string | null
  source_type: string
  source_id: string
  source_label?: string | null
  source_layer?: string | null
  field_whitelist: { field: string; alias?: string; sensitive?: boolean }[]
  filter_fields?: string[]
  default_sort?: string | null
  page_size_max?: number
  auth_policy?: Record<string, any>
  rate_limit?: number | null
  timeout_seconds?: number
  is_active?: boolean
}

export const apiServicesApi = {
  list: (params?: { source_type?: string; status?: string }) =>
    api.get<ApiServiceOut[]>('/api-services', { params }).then(r => r.data),

  get: (id: number) =>
    api.get<ApiServiceOut>(`/api-services/${id}`).then(r => r.data),

  create: (data: ApiServiceIn) =>
    api.post<ApiServiceOut>('/api-services', data).then(r => r.data),

  update: (id: number, data: Partial<ApiServiceIn>) =>
    api.put<ApiServiceOut>(`/api-services/${id}`, data).then(r => r.data),

  remove: (id: number) =>
    api.delete(`/api-services/${id}`).then(r => r.data),

  toggle: (id: number) =>
    api.post<ApiServiceOut>(`/api-services/${id}/toggle`).then(r => r.data),
}
