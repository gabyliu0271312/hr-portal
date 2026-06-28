import { api } from './client'
import type { CompensationResult, EmployeeCandidate } from './tools'

const AI_CHAT_TIMEOUT_MS = 130_000

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface CompensationChatContext {
  employee_id?: number | null
  employee_keyword?: string | null
  employee_name?: string | null
  leave_date?: string | null
  plan?: string | null
  region?: string | null
}

export interface AiAction {
  type: string
  label: string
  route?: string
  query: Record<string, any>
}

export interface AiChatResult {
  intent: string
  answer: string
  status: string
  trace_id?: string | null
  conversation_id?: number | null
  actions: AiAction[]
  candidates: EmployeeCandidate[]
  compensation?: CompensationResult | null
  missing_fields: string[]
  extracted: Record<string, any>
  artifact?: AutomationRuleArtifact | Record<string, any> | null
}

export interface AutomationRuleArtifact {
  artifact_type: string
  rule_draft: {
    name: string
    description: string | null
    biz_type: string | null
    trigger_type: string
    trigger_config: Record<string, any>
    condition_config: any[]
    actions_config: Array<{
      type: string
      name: string
      enabled: boolean
      run_on_error?: boolean
      config: Record<string, any>
    }>
    enabled: boolean
    source: string
    receiver_query?: string | null
  } | null
  validation_errors: string[]
  missing_slots: string[]
  needs_config: string[]
  follow_up_question: string | null
}

export const aiApi = {
  chat: (body: {
    message: string
    page_path?: string | null
    conversation_id?: number | null
    history?: AiChatMessage[]
    selected_employee_id?: number | null
  }) =>
    api
      .post<AiChatResult>('/ai/chat', body, { timeout: AI_CHAT_TIMEOUT_MS })
      .then((r) => r.data),
}
