import { api } from './client'
import type { CompareResult } from './data-compare'
import type { CompensationResult, EmployeeCandidate } from './tools'

const AI_CHAT_TIMEOUT_MS = 130_000

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export type AiExecutionStatus =
  | 'pending'
  | 'requires_input'
  | 'requires_confirmation'
  | 'running'
  | 'succeeded'
  | 'partial_success'
  | 'failed'
  | 'cancelled'

export interface AiAction {
  type: string
  label: string
  route?: string
  query: Record<string, any>
}

export interface CapabilityArtifact {
  type: string
  name: string
  url?: string | null
}

export interface PermissionResult {
  filtered: boolean
  note: string
}

export interface MaskingResult {
  applied: boolean
}

export type EmployeeProfileFieldCode = string

export interface EmployeeProfileField {
  code: EmployeeProfileFieldCode
  label: string
  value: string
}

export interface EmployeeProfileResultData {
  employee_no: string | null
  full_name: string | null
  fields: EmployeeProfileField[]
}

export type EmployeeProfileCandidateDisplayFieldCode =
  | 'full_name'
  | 'organization_name'
  | 'employment_status'

export interface EmployeeProfileCandidateDisplayField {
  code: EmployeeProfileCandidateDisplayFieldCode
  label: string
  value: string
}

export interface EmployeeProfileCandidate {
  selection_handle: string
  display_fields: EmployeeProfileCandidateDisplayField[]
}

export interface EmployeeProfileCandidatesData {
  candidates: EmployeeProfileCandidate[]
}

export interface EmployeeProfileInputData {
  missing_fields: Array<'lookup_value'>
}

export interface AutomationRuleDraftData {
  artifact_type: 'automation_rule'
  status: 'draft'
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

export type AutomationRuleArtifact = AutomationRuleDraftData

export interface CompensationComparisonSnapshot {
  employee_id: number
  employee_name: string | null
  employee_no: string | null
  leave_date: string
  plan: string
  service_years_n: number
  compensation_base: number
  n_amount: number
  extra_amount: number
  total_amount: number
}

export interface CompensationComparisonData {
  previous: CompensationComparisonSnapshot
  current: CompensationComparisonSnapshot
  compensation?: CompensationResult | null
}

export type CapabilityResult =
  | {
      type: 'message'
      data: { reason_code?: string | null }
      artifacts: CapabilityArtifact[]
      actions: AiAction[]
    }
  | {
      type: 'compensation_input'
      data: { candidates: EmployeeCandidate[]; missing_fields: string[] }
      artifacts: CapabilityArtifact[]
      actions: AiAction[]
    }
  | {
      type: 'compensation_preview'
      data: { compensation: CompensationResult; candidates: EmployeeCandidate[]; missing_fields: string[] }
      artifacts: CapabilityArtifact[]
      actions: AiAction[]
    }
  | {
      type: 'compensation_comparison'
      data: CompensationComparisonData
      artifacts: CapabilityArtifact[]
      actions: AiAction[]
    }
  | {
      type: 'automation_rule_draft'
      data: AutomationRuleDraftData
      artifacts: CapabilityArtifact[]
      actions: AiAction[]
    }
  | {
      type: 'data_compare_result'
      data: CompareResult
      artifacts: CapabilityArtifact[]
      actions: AiAction[]
    }
  | {
      type: 'employee_profile_input'
      data: EmployeeProfileInputData
      artifacts: CapabilityArtifact[]
      actions: AiAction[]
    }
  | {
      type: 'employee_profile_result'
      data: EmployeeProfileResultData
      artifacts: CapabilityArtifact[]
      actions: AiAction[]
    }
  | {
      type: 'employee_profile_candidates'
      data: EmployeeProfileCandidatesData
      artifacts: CapabilityArtifact[]
      actions: AiAction[]
    }

export interface CapabilityResultEnvelope {
  intent: string
  answer: string
  status: AiExecutionStatus
  capability_id: string
  result: CapabilityResult
  permission: PermissionResult
  masking: MaskingResult
  trace_id?: string | null
  conversation_id?: number | null
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
      .post<CapabilityResultEnvelope>('/ai/chat', body, { timeout: AI_CHAT_TIMEOUT_MS })
      .then((r) => r.data),
  consumeControlledAction: (conversationId: number, body: { action_type: string; selection_handle: string }) =>
    api
      .post<CapabilityResultEnvelope>(`/ai/conversations/${conversationId}/actions`, body, { timeout: AI_CHAT_TIMEOUT_MS })
      .then((r) => r.data),
}
