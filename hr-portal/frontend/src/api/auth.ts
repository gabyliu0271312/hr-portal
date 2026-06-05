import { api } from './client'

export interface LoginResp {
  access_token: string
  token_type: string
  expires_at: string
}

export interface UserInfo {
  id: number
  login_name: string
  display_name: string
  email: string | null
  is_active: boolean
}

export interface MenuItem {
  id: number
  code: string
  label: string
  parent_id: number | null
  order: number
  icon: string | null
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_export: boolean
  scope_dimension: string
}

export interface MeResp {
  user: UserInfo
  roles: string[]
  menus: MenuItem[]
}

export const authApi = {
  login: (login_name: string, password: string) =>
    api.post<LoginResp>('/auth/login', { login_name, password }).then((r) => r.data),
  me: () => api.get<MeResp>('/auth/me').then((r) => r.data),
  logout: () => api.post('/auth/logout').then((r) => r.data),
  changePassword: (old_password: string, new_password: string) =>
    api
      .post('/auth/change-password', { old_password, new_password })
      .then((r) => r.data),
}