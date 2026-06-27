import { api } from './client'

export interface AutomationRuleAction {
  type: string
  name?: string
  enabled?: boolean
  run_on_error?: boolean
  config: Record<string, any>
}

export interface AutomationRuleCreate {
  name: string
  description?: string | null
  biz_type?: string | null
  trigger_type: string
  trigger_config: Record<string, any>
  condition_config?: any[]
  actions_config: AutomationRuleAction[]
  enabled: boolean
  source: 'manual' | 'ai_generated' | 'system'
  source_artifact_id?: number | null
}

export interface AutomationRuleOut {
  id: number
  name: string
  description: string | null
  biz_type: string | null
  trigger_type: string
  trigger_config: Record<string, any>
  condition_config: any[]
  actions_config: AutomationRuleAction[]
  enabled: boolean
  source: string
  source_artifact_id: number | null
  created_by: number | null
  created_at: string
  updated_at: string
}

export interface AutomationActionExecutionOut {
  id: number
  execution_id: number
  action_index: number
  action_type: string
  status: string
  error_message: string | null
  started_at: string
  finished_at: string | null
}

export interface AutomationExecutionOut {
  id: number
  rule_id: number
  event_id: string | null
  trigger_type: string
  biz_type: string | null
  biz_id: string | null
  status: string
  started_at: string
  finished_at: string | null
  error_message: string | null
  action_executions?: AutomationActionExecutionOut[]
}

export const automationApi = {
  createRule: (data: AutomationRuleCreate) =>
    api.post<AutomationRuleOut>('/automation/rules', data).then((r) => r.data),

  listRules: (params?: { enabled?: boolean; trigger_type?: string }) =>
    api.get<AutomationRuleOut[]>('/automation/rules', { params }).then((r) => r.data),

  getRule: (id: number) =>
    api.get<AutomationRuleOut>(`/automation/rules/${id}`).then((r) => r.data),

  updateRule: (id: number, data: Partial<AutomationRuleCreate>) =>
    api.patch<AutomationRuleOut>(`/automation/rules/${id}`, data).then((r) => r.data),

  enableRule: (id: number) =>
    api.post(`/automation/rules/${id}/enable`).then((r) => r.data),

  disableRule: (id: number) =>
    api.post(`/automation/rules/${id}/disable`).then((r) => r.data),

  deleteRule: (id: number) =>
    api.delete(`/automation/rules/${id}`).then((r) => r.data),

  listExecutions: (params?: { rule_id?: number; limit?: number }) =>
    api.get<AutomationExecutionOut[]>('/automation/executions', { params }).then((r) => r.data),
}
