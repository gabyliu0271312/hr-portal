import { api } from './client'

export interface FieldCategory {
  id: number
  name: string
  description: string | null
  is_sensitive: boolean
  field_count: number
}

export interface Assignment {
  table_name: string
  column_name: string
}

export const fieldCategoriesApi = {
  list: () => api.get<FieldCategory[]>('/field-categories').then((r) => r.data),
  create: (body: { name: string; description?: string; is_sensitive?: boolean }) =>
    api.post<FieldCategory>('/field-categories', body).then((r) => r.data),
  update: (
    id: number,
    body: { name: string; description?: string; is_sensitive?: boolean }
  ) =>
    api.put<FieldCategory>(`/field-categories/${id}`, body).then((r) => r.data),
  remove: (id: number) =>
    api.delete(`/field-categories/${id}`).then((r) => r.data),
  getAssignments: (id: number) =>
    api
      .get<Assignment[]>(`/field-categories/${id}/assignments`)
      .then((r) => r.data),
  setAssignments: (id: number, items: Assignment[]) =>
    api
      .put<Assignment[]>(`/field-categories/${id}/assignments`, { items })
      .then((r) => r.data),

  // 角色 ↔ 可见分类
  getRoleVisible: (role_id: number) =>
    api.get<number[]>(`/field-categories/_role/${role_id}`).then((r) => r.data),
  setRoleVisible: (role_id: number, category_ids: number[]) =>
    api
      .put<{ ok: boolean; count: number }>(`/field-categories/_role/${role_id}`, { category_ids })
      .then((r) => r.data),

  // 用户 ↔ 可见分类（额外授权）
  getUserVisible: (user_id: number) =>
    api.get<number[]>(`/field-categories/_user/${user_id}`).then((r) => r.data),
  setUserVisible: (user_id: number, category_ids: number[]) =>
    api
      .put<{ ok: boolean; count: number }>(`/field-categories/_user/${user_id}`, { category_ids })
      .then((r) => r.data),
}