import { api } from './client'

export interface UserListItem {
  id: number
  login_name: string
  display_name: string
  email: string | null
  is_active: boolean
  last_login_at: string | null
  locked_until: string | null
  role_names: string[]
  org_scope_names: string[]
  cost_center_scope_names: string[]
}

export interface UserDetail {
  id: number
  login_name: string
  display_name: string
  email: string | null
  is_active: boolean
  last_login_at: string | null
  failed_login_count: number
  locked_until: string | null
  role_ids: number[]
  role_names: string[]
  org_scope_names: string[]
  cost_center_scope_names: string[]
}

export interface UserListResp {
  items: UserListItem[]
  total: number
  page: number
  page_size: number
}

export interface UserListQuery {
  q?: string
  is_active?: boolean
  role_id?: number
  page?: number
  page_size?: number
}

export const usersApi = {
  list: (params: UserListQuery = {}) =>
    api.get<UserListResp>('/users', { params }).then((r) => r.data),
  get: (id: number) => api.get<UserDetail>(`/users/${id}`).then((r) => r.data),
  create: (body: {
    login_name: string
    display_name: string
    email?: string | null
    password: string
    role_ids?: number[]
  }) => api.post<UserDetail>('/users', body).then((r) => r.data),
  update: (id: number, body: { display_name?: string; email?: string | null }) =>
    api.put<UserDetail>(`/users/${id}`, body).then((r) => r.data),
  activate: (id: number) => api.post(`/users/${id}/activate`).then((r) => r.data),
  deactivate: (id: number) =>
    api.post(`/users/${id}/deactivate`).then((r) => r.data),
  resetPassword: (id: number, new_password: string) =>
    api
      .post(`/users/${id}/reset-password`, { new_password })
      .then((r) => r.data),
  setRoles: (id: number, role_ids: number[]) =>
    api.put<UserDetail>(`/users/${id}/roles`, { role_ids }).then((r) => r.data),
}
