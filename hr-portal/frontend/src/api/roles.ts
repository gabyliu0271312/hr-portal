import { api } from './client'

export interface RoleMenuItem {
  menu_id: number
  scope_dimension: 'cost_center' | 'org' | 'none'
  can_view: boolean
  can_create: boolean
  can_update: boolean
  can_delete: boolean
  can_export: boolean
}

export interface RoleListItem {
  id: number
  name: string
  description: string | null
  is_active: boolean
  user_count: number
  menu_count: number
  created_at: string
}

export interface RoleDetail {
  id: number
  name: string
  description: string | null
  is_active: boolean
  user_count: number
  menus: RoleMenuItem[]
}

export interface MenuNode {
  id: number
  code: string
  label: string
  parent_id: number | null
  order: number
  icon: string | null
}

export const rolesApi = {
  list: () =>
    api.get<{ items: RoleListItem[]; total: number }>('/roles').then((r) => r.data),
  get: (id: number) => api.get<RoleDetail>(`/roles/${id}`).then((r) => r.data),
  create: (body: { name: string; description?: string; menus?: RoleMenuItem[] }) =>
    api.post<RoleDetail>('/roles', body).then((r) => r.data),
  update: (
    id: number,
    body: {
      name?: string
      description?: string
      is_active?: boolean
      menus?: RoleMenuItem[]
    }
  ) => api.put<RoleDetail>(`/roles/${id}`, body).then((r) => r.data),
  activate: (id: number) => api.post(`/roles/${id}/activate`).then((r) => r.data),
  deactivate: (id: number) =>
    api.post(`/roles/${id}/deactivate`).then((r) => r.data),
}

export const menusApi = {
  list: () => api.get<MenuNode[]>('/menus').then((r) => r.data),
}