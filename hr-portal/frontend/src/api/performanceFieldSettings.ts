import { api } from './client'
import type { PerformanceManagerStandard } from '@/components/performance/performanceFieldSettings'

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
