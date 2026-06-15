import { api } from './client'

export interface TableColumn {
  id: number
  table_name: string
  column_code: string
  column_label: string
  data_type: string
  is_pk_part: boolean
  is_sensitive: boolean
  is_visible: boolean
  display_order: number
  auto_discovered: boolean
  description: string | null
  scope_role: string | null
  copy_from_last_month: boolean
  enum_options: string[] | null
  agg_role: string
  is_computed: boolean
  formula_expr: string | null
  global_field_id: number | null
  created_at: string
  updated_at: string
}

export interface TableMeta {
  table_name: string
  label: string
}

export interface ColumnUpdatePayload {
  column_code: string
  column_label: string
  data_type: string
  is_pk_part: boolean
  is_sensitive: boolean
  is_visible: boolean
  display_order: number
  description?: string | null
  scope_role?: string | null
  copy_from_last_month?: boolean
  enum_options?: string[] | null
  agg_role?: string
  is_computed?: boolean
  formula_expr?: string | null
  confirm_type_change?: boolean
}

export const tableColumnsApi = {
  tables: () => api.get<TableMeta[]>('/table-columns/tables').then((r) => r.data),
  list: (table: string) =>
    api.get<TableColumn[]>(`/table-columns/${table}`).then((r) => r.data),
  create: (table: string, body: ColumnUpdatePayload) =>
    api.post<TableColumn>(`/table-columns/${table}`, body).then((r) => r.data),
  update: (table: string, id: number, body: ColumnUpdatePayload) =>
    api.put<TableColumn>(`/table-columns/${table}/${id}`, body).then((r) => r.data),
  remove: (table: string, id: number) =>
    api.delete(`/table-columns/${table}/${id}`).then((r) => r.data),
  bulkUpdate: (table: string, columns: Array<Partial<TableColumn> & { id: number }>) =>
    api.put<{ updated: number }>(`/table-columns/${table}/bulk`, { columns }).then((r) => r.data),
  recompute: (table: string) =>
    api
      .post<{ ok: boolean; updated_rows: number; computed_columns: number }>(
        `/table-columns/${table}/recompute`
      )
      .then((r) => r.data),
}
