import { api } from './client'

export interface FormulaFunctionPayload {
  code: string
  name: string
  description?: string | null
  function_type: 'base_excel' | 'system_builtin' | 'expression' | 'data_action'
  parameters: { name: string; type?: string; description?: string }[]
  return_type: string
  formula_body?: string | null
  is_enabled: boolean
  is_sensitive_output: boolean
}

export interface FormulaFunction extends FormulaFunctionPayload {
  id: number | null
  created_by: number | null
  created_at: string | null
  updated_at: string | null
  source?: 'base_excel' | 'managed'
  is_readonly?: boolean
  category?: string | null
  category_label?: string | null
  support_status?: 'executable' | 'catalog_only' | 'blocked'
  is_executable?: boolean
  is_visible?: boolean
  is_ai_enabled?: boolean
}

export const functionLibraryApi = {
  list: (enabledOnly = false, includeBase = true) =>
    api
      .get<FormulaFunction[]>('/function-library/functions', {
        params: { enabled_only: enabledOnly, include_base: includeBase },
      })
      .then((r) => r.data),
  create: (body: FormulaFunctionPayload) =>
    api.post<FormulaFunction>('/function-library/functions', body).then((r) => r.data),
  update: (id: number, body: FormulaFunctionPayload) =>
    api.put<FormulaFunction>(`/function-library/functions/${id}`, body).then((r) => r.data),
  updateCatalog: (
    code: string,
    body: { is_visible?: boolean; is_enabled?: boolean; is_ai_enabled?: boolean }
  ) => api.patch<FormulaFunction>(`/function-library/catalog/${code}`, body).then((r) => r.data),
}
