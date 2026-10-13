import { api } from './client'

export type ScopeClassification = 'controlled_fact' | 'sensitive_fact' | 'person_bridge' | 'public_reference'
export const scopeClassificationLabels: Record<ScopeClassification, string> = {
  controlled_fact: '受控事实', sensitive_fact: '敏感事实', person_bridge: '人员桥接', public_reference: '公共参考（仅登记）',
}

export interface ScopeHealth {
  table_name: string
  warehouse_layer: string | null
  asset_status: string | null
  scope_strategy: string | null
  roster_join_configured: boolean
  role_columns: string[]
  dataset_count: number
  report_count: number
  issues: { code: string; severity: 'error' | 'warning'; message: string }[]
}

export interface ScopeClassificationRecord {
  table_name: string
  security_classification: ScopeClassification
  version: number
  approved_by: number | null
  approved_at: string | null
  reason: string | null
  runtime_filter_exemption: false
}

export interface ScopeApprovalDraft {
  security_classification: ScopeClassification
  reason: string
}

export async function listScopeHealth(): Promise<ScopeHealth[]> {
  return (await api.get('/warehouse/scope-health')).data
}

export async function getScopeClassification(tableName: string): Promise<ScopeClassificationRecord> {
  return (await api.get(`/warehouse/scope-classifications/${encodeURIComponent(tableName)}`)).data
}

export async function approveScopeClassification(tableName: string, draft: ScopeApprovalDraft, version: number): Promise<ScopeClassificationRecord> {
  return (await api.put(`/warehouse/scope-classifications/${encodeURIComponent(tableName)}`, {
    security_classification: draft.security_classification, reason: draft.reason.trim(), expected_version: version,
  })).data
}
