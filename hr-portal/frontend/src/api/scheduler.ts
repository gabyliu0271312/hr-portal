import { api } from './client'

export interface JobRunItem {
  id: number
  job_id: number | null
  kind: string
  business_id: number | null
  started_at: string
  finished_at: string | null
  status: string
  rows: number | null
  message: string | null
  triggered_by: string
}

export interface ScheduledJobItem {
  id: number
  kind: string
  business_id: number
  cron: string
  payload: Record<string, any>
  enabled: boolean
  last_run_at: string | null
  last_status: string | null
  last_message: string | null
}

export interface ScheduledJobCreatePayload {
  kind: string
  business_id: number
  cron?: string
  payload?: Record<string, any>
  enabled?: boolean
}

export interface ScheduledJobUpdatePayload {
  cron?: string
  payload?: Record<string, any>
  enabled?: boolean
}

export const schedulerApi = {
  runs: (params: { kind?: string; business_id?: number; status?: string; limit?: number } = {}) =>
    api.get<JobRunItem[]>('/job-runs', { params }).then((r) => r.data),

  jobs: (params: { kind?: string } = {}) =>
    api.get<ScheduledJobItem[]>('/scheduled-jobs', { params }).then((r) => r.data),

  createJob: (payload: ScheduledJobCreatePayload) =>
    api.post<ScheduledJobItem>('/scheduled-jobs', payload).then((r) => r.data),

  updateJob: (job_id: number, payload: ScheduledJobUpdatePayload) =>
    api.patch<ScheduledJobItem>(`/scheduled-jobs/${job_id}`, payload).then((r) => r.data),

  deleteJob: (job_id: number) =>
    api.delete(`/scheduled-jobs/${job_id}`).then((r) => r.data),

  runNow: (job_id: number) =>
    api
      .post<{ ok: boolean; run_id: number; status: string; rows: number | null; message: string }>(
        `/scheduled-jobs/${job_id}/run-now`
      )
      .then((r) => r.data),

  retryRun: (run_id: number, reason = '') =>
    api
      .post<{ ok: boolean; run_id: number; status: string; rows: number | null; message: string }>(
        `/job-runs/${run_id}/retry`,
        { reason }
      )
      .then((r) => r.data),
}
