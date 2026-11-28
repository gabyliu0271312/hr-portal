import { api } from './client'
import type { PerformanceFilterCondition, PerformanceManagerStandard } from '@/components/performance/performanceFieldSettings'

const path = '/performance/system-settings/fields'

export async function getPerformanceManagerStandard(): Promise<PerformanceManagerStandard> {
  return (await api.get(`${path}/manager-standard`)).data
}

export async function savePerformanceManagerStandard(value: PerformanceManagerStandard): Promise<PerformanceManagerStandard> {
  return (await api.put(`${path}/manager-standard`, value)).data
}

export async function getPerformanceEmployeeTypes(): Promise<{ value: string; label: string }[]> {
  return (await api.get(`${path}/employee-types`)).data
}

export type PerformanceFilterConditionUpdate = Pick<PerformanceFilterCondition, 'filter_key' | 'default'>

export async function getPerformanceFilterConditions(): Promise<PerformanceFilterCondition[]> {
  return (await api.get(`${path}/filter-conditions`)).data.filter_conditions
}

export async function savePerformanceFilterConditions(items: PerformanceFilterConditionUpdate[]): Promise<PerformanceFilterCondition[]> {
  return (await api.put(`${path}/filter-conditions`, { filter_conditions: items })).data.filter_conditions
}

export interface PerformanceDetailFieldOptionDto {
  id: string
  name: string
  preview_name: string
  disabled: boolean
}

export async function getPerformanceDetailFieldOptions(): Promise<PerformanceDetailFieldOptionDto[]> {
  return (await api.get(`${path}/detail-field-options`)).data.options
}

export async function getPerformanceDetailVisibleFields(): Promise<string[]> {
  return (await api.get(`${path}/detail-visible-fields`)).data.field
}

export async function savePerformanceDetailVisibleFields(field: string[]): Promise<string[]> {
  return (await api.put(`${path}/detail-visible-fields`, { field })).data.field
}
