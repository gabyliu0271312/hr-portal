import { api } from './client'

export interface CodeSuggestPayload {
  label: string
  scope?: string
  prefix?: string
  context?: string | null
  existing_codes?: string[]
  dataset_id?: number | null
}

export interface CodeSuggestResult {
  code: string
  base_code: string
  source: 'ai' | 'rule' | string
  rule: string
  candidates: string[]
  explanation?: string | null
}

export const codegenApi = {
  suggest: (body: CodeSuggestPayload) =>
    api.post<CodeSuggestResult>('/codegen/suggest', body).then((r) => r.data),
}
