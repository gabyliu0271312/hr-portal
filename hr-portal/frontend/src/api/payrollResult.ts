import { api } from './client'

export interface PayrollField {
  id: number
  field_code: string
  field_name: string
  data_type: string
  display_order: number
  is_active: boolean
}

export interface PayrollFieldsResponse {
  items: PayrollField[]
  total: number
}

export interface PayrollRow {
  _id: number
  _synced_at?: string | null
  [key: string]: unknown
}

export interface PayrollRowsResponse {
  items: PayrollRow[]
  total: number
  page: number
  page_size: number
  hidden_columns: string[]
}

export const payrollResultApi = {
  fields() {
    return api.get<PayrollFieldsResponse>('/payroll-result/fields').then((r) => r.data)
  },
  rows(params: { page?: number; page_size?: number; keyword?: string } = {}) {
    return api
      .get<PayrollRowsResponse>('/payroll-result/rows', { params })
      .then((r) => r.data)
  },
}
