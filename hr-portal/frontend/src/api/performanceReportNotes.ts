import { api } from './client'
import type { PerformanceManagementScope } from './performance'

export type ReportNoteScope = PerformanceManagementScope & { result_kind?: 'team' | 'focus' }
export interface ReportNote { content: string; version: number }
export const reportNotesApi = {
  async read(cycleId: number, section: string, scope: ReportNoteScope): Promise<ReportNote> {
    const { data } = await api.get<ReportNote>('/performance/project-management/report-note', { params: { cycle_id: cycleId, section, ...scope } })
    return data
  },
  async save(cycleId: number, section: string, scope: ReportNoteScope, note: ReportNote): Promise<ReportNote> {
    const { data } = await api.put<ReportNote>('/performance/project-management/report-note', note, { params: { cycle_id: cycleId, section, ...scope } })
    return data
  },
}
