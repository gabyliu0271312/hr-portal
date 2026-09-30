import { api } from './client'
import type { MetricField } from './performanceMetricFields'

export interface PerformanceMetricType {
  id: number
  name: string
  field_ids: number[]
  fields: string
  updated_by: string
  updated_at: string
}

export interface PerformanceMetricTypeDraft {
  id?: number
  name: string
  field_ids: number[]
}

export interface PerformanceMetricTypeList {
  items: PerformanceMetricType[]
  total: number
  offset: number
  limit: number
}

export type PerformanceMetricTypeFieldOption = Pick<MetricField, 'id' | 'name' | 'field_type' | 'is_system'>

export const performanceMetricTypesApi = {
  async list(params: { offset: number; limit: number; keyword: string }): Promise<PerformanceMetricTypeList> {
    const { data } = await api.get<PerformanceMetricTypeList>('/performance/metric-types', { params })
    return data
  },
  async create(payload: Omit<PerformanceMetricTypeDraft, 'id'>): Promise<PerformanceMetricType> {
    const { data } = await api.post<PerformanceMetricType>('/performance/metric-types', payload)
    return data
  },
  async update(id: number, payload: Omit<PerformanceMetricTypeDraft, 'id'>): Promise<PerformanceMetricType> {
    const { data } = await api.patch<PerformanceMetricType>(`/performance/metric-types/${id}`, payload)
    return data
  },
}
