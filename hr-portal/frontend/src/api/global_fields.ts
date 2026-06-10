import { api } from './client'

export interface GlobalField {
  id: number
  code: string
  label: string
  data_type: string
  agg_role: string
  scope_role: string | null
  category_id: number | null
  category_name: string | null
  description: string | null
  claimed_count: number
  created_at: string
  updated_at: string
}

export interface GlobalFieldPayload {
  code: string
  label: string
  data_type: string
  agg_role: string
  scope_role: string | null
  category_id: number | null
  description?: string | null
}

export interface ToolOption {
  key: string
  label: string
}

export const globalFieldsApi = {
  list: () => api.get<GlobalField[]>('/global-fields').then((r) => r.data),
  tools: () => api.get<ToolOption[]>('/global-fields/tools').then((r) => r.data),
  create: (body: GlobalFieldPayload) =>
    api.post<GlobalField>('/global-fields', body).then((r) => r.data),
  update: (id: number, body: GlobalFieldPayload) =>
    api.put<GlobalField>(`/global-fields/${id}`, body).then((r) => r.data),
  remove: (id: number) =>
    api.delete<{ ok: boolean }>(`/global-fields/${id}`).then((r) => r.data),
  getWhitelist: (categoryId: number) =>
    api
      .get<{ category_id: number; tool_keys: string[] }>(
        `/global-fields/categories/${categoryId}/whitelist`,
      )
      .then((r) => r.data),
  setWhitelist: (categoryId: number, toolKeys: string[]) =>
    api
      .put<{ category_id: number; tool_keys: string[] }>(
        `/global-fields/categories/${categoryId}/whitelist`,
        { tool_keys: toolKeys },
      )
      .then((r) => r.data),
}
