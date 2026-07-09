import { api } from './client'

export interface SubscriptionOut {
  id: number
  name: string
  description: string | null
  source_type: string
  source_id: string
  source_label: string | null
  source_layer: string | null
  field_scope: { field: string; alias?: string }[]
  recipients: { type: string; id: string | number; target?: string }[]
  delivery_target: string
  frequency: string
  cron_expr: string | null
  push_format: string
  status: string
  last_sent_at: string | null
  last_status: string
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface SubscriptionIn {
  name: string
  description?: string | null
  source_type: string
  source_id: string
  source_label?: string | null
  source_layer?: string | null
  field_scope?: { field: string; alias?: string }[]
  recipients: { type: string; id: string | number; target?: string }[]
  delivery_target?: string
  frequency?: string
  cron_expr?: string | null
  push_format?: string
  is_active?: boolean
}

export const subscriptionsApi = {
  list: (params?: { source_type?: string; status?: string }) =>
    api.get<SubscriptionOut[]>('/subscriptions', { params }).then(r => r.data),

  get: (id: number) =>
    api.get<SubscriptionOut>(`/subscriptions/${id}`).then(r => r.data),

  create: (data: SubscriptionIn) =>
    api.post<SubscriptionOut>('/subscriptions', data).then(r => r.data),

  update: (id: number, data: Partial<SubscriptionIn>) =>
    api.put<SubscriptionOut>(`/subscriptions/${id}`, data).then(r => r.data),

  remove: (id: number) =>
    api.delete(`/subscriptions/${id}`).then(r => r.data),

  toggle: (id: number) =>
    api.post<SubscriptionOut>(`/subscriptions/${id}/toggle`).then(r => r.data),

  run: (id: number) =>
    api.post(`/subscriptions/${id}/run`).then(r => r.data),
}
