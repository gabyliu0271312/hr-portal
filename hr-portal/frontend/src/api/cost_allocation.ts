import { api } from './client'

export interface ArchiveIn {
  report_id: number
  period_ym: string
}

export interface ArchiveOut {
  archived: number
  period_ym: string
  archived_at: string
}

export const costAllocationApi = {
  archive: (body: ArchiveIn) =>
    api.post<ArchiveOut>('/cost-allocation/archive', body).then((r) => r.data),
}
