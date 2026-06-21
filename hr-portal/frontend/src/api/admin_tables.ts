import { api } from './client'
import type { ScopeStrategy } from '@/constants/scopeStrategy'

export interface RegisteredTableOut {
  id: number
  table_name: string
  table_label: string
  description: string | null
  is_period: boolean
  period_col: string
  period_source: string
  is_builtin: boolean
  is_result_table: boolean
  icon: string
  display_order: number
  scope_strategy: ScopeStrategy
  created_at: string
}

export interface CreateTableIn {
  table_name: string
  table_label: string
  description?: string | null
  is_period?: boolean
  period_col?: string
  period_source?: string
  is_result_table?: boolean
  icon?: string
  display_order?: number
  scope_strategy?: ScopeStrategy
  create_datasource?: boolean
  datasource_source_type?: string
}

export const adminTablesApi = {
  list: () =>
    api.get<RegisteredTableOut[]>('/admin/tables').then((r) => r.data),

  create: (body: CreateTableIn) =>
    api.post<RegisteredTableOut>('/admin/tables', body).then((r) => r.data),

  update: (table_name: string, body: { table_label?: string; description?: string; display_order?: number; scope_strategy?: ScopeStrategy }) =>
    api.patch<RegisteredTableOut>(`/admin/tables/${table_name}`, body).then((r) => r.data),

  remove: (table_name: string) =>
    api.delete<{ ok: boolean }>(`/admin/tables/${table_name}`).then((r) => r.data),
}
