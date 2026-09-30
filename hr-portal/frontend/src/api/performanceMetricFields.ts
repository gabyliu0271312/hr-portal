import { api } from './client'

export type MetricFieldType = 'text' | 'number' | 'percentage'
export interface MetricFieldDraft {
  name: string
  field_type: MetricFieldType
}
export interface MetricField {
  id: number
  display_id: number
  name: string
  field_type: MetricFieldType | 'person'
  is_system: boolean
  in_use: boolean
  updated_by: string
  updated_at: string
}
export interface MetricFieldList {
  items: MetricField[]
  total: number
  offset: number
  limit: number
}
export const metricFieldTypeLabels = { text: '文本', number: '数字', percentage: '百分比', person: '人员单选' }

export const performanceMetricFieldsApi = {
  async list(params: { offset: number; limit: number; keyword: string }): Promise<MetricFieldList> {
    const { data } = await api.get<MetricFieldList>('/performance/metric-fields', { params })
    return data
  },
  async get(id: number): Promise<MetricField> {
    const { data } = await api.get<MetricField>(`/performance/metric-fields/${id}`)
    return data
  },
  async update(id: number, payload: MetricFieldDraft): Promise<MetricField> {
    const { data } = await api.patch<MetricField>(`/performance/metric-fields/${id}`, payload)
    return data
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/performance/metric-fields/${id}`)
  },
  async create(payload: MetricFieldDraft): Promise<MetricField> {
    const { data } = await api.post<MetricField>('/performance/metric-fields', payload)
    return data
  },
}
