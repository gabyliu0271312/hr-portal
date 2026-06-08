import { api } from './client'

export interface AiConfigPayload {
  provider?: string
  name: string
  base_url?: string | null
  api_key?: string | null
  model_fast_json?: string | null
  model_reasoning?: string | null
  timeout_seconds?: number
  is_enabled?: boolean
  extra_config?: Record<string, any>
}

export interface AiConfigItem {
  id: number
  provider: string
  name: string
  base_url: string | null
  has_api_key: boolean
  model_fast_json: string | null
  model_reasoning: string | null
  timeout_seconds: number
  is_enabled: boolean
  extra_config: Record<string, any>
  created_at: string
  updated_at: string
}

export interface AiConfigTestPayload {
  provider?: string
  base_url?: string | null
  api_key?: string | null
  model: string
  timeout_seconds?: number
}

export interface AiConfigTestResult {
  ok: boolean
  provider: string
  base_url: string
  model: string
  latency_ms: number
  message: string
  response: Record<string, any>
  token_usage?: Record<string, any> | null
}

export interface FormulaDraft {
  intent?: 'formula_draft' | 'formula_question' | string
  should_update_formula?: boolean
  field_label: string
  formula_display: string
  formula: string
  data_type: string
  agg_role: 'dimension' | 'measure'
  explanation: string
  change_summary?: string | null
  depends_on: string[]
  used_functions: string[]
  warnings: string[]
  validation_status?: 'valid' | 'invalid'
  validation_errors?: string[]
  standard_excel_formula?: string | null
  platform_limitation?: string | null
}

export interface FormulaValidation {
  valid: boolean
  formula: string
  depends_on: string[]
  used_functions: string[]
  is_sensitive: boolean
  warnings: string[]
  errors: string[]
  preview_value?: any
}

const AI_DRAFT_TIMEOUT_MS = 130_000

export const aiFormulaApi = {
  configs: () => api.get<AiConfigItem[]>('/ai/config').then((r) => r.data),
  saveConfig: (body: AiConfigPayload) => api.post<AiConfigItem>('/ai/config', body).then((r) => r.data),
  testConfig: (body: AiConfigTestPayload) =>
    api
      .post<AiConfigTestResult>('/ai/config/test', body, {
        timeout: ((body.timeout_seconds || 30) + 10) * 1000,
      })
      .then((r) => r.data),
  draft: (body: {
    dataset_id: number
    message: string
    current_formula?: string | null
    current_field_label?: string | null
    history?: { role: string; content: string; formula?: string | null }[]
  }) =>
    api.post<FormulaDraft>('/ai-formula/draft', body, { timeout: AI_DRAFT_TIMEOUT_MS }).then((r) => r.data),
  validate: (body: { dataset_id: number; formula: string }) =>
    api.post<FormulaValidation>('/ai-formula/validate', body).then((r) => r.data),
}
