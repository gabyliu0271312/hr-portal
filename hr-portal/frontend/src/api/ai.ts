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
  route: string
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
