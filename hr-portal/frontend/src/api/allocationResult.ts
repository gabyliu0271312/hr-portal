import { api } from './client'

export interface AllocationField {
  id: number
  field_code: string
  field_name: string
  data_type: string
  display_order: number
  is_active: boolean
}

export interface AllocationFieldsResponse {
  items: AllocationField[]
  total: number
}

export interface AllocationRow {
  _id: number
  _synced_at?: string | null
  _cc_valid: boolean
  _employee_name_source?: 'roster' | 'snapshot' | null
  cost_period?: string | null
  employee_no?: string | null
  employee_name?: string | null
  code?: string | null
  cc_name?: string | null
  allocation_percentage?: number | null
  headcount?: number | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface AllocationRowsResponse {
  items: AllocationRow[]
  total: number
  page: number
  page_size: number
  hidden_columns: string[]
}

export const allocationResultApi = {
  fields() {
    return api.get<AllocationFieldsResponse>('/allocation-result/fields').then((r) => r.data)
  },
  rows(params: { page?: number; page_size?: number; keyword?: string } = {}) {
    return api
      .get<AllocationRowsResponse>('/allocation-result/rows', { params })
      .then((r) => r.data)
  },
}
