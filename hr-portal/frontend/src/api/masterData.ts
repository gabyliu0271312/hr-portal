import { api } from './client'

export interface EntityDefinition {
  id: number
  entity_code: string
  name: string
  description: string
  revision: number
  is_active: boolean
  published_at?: string | null
}
export interface RecordEntity { id: number; name: string; entity_code: string }
export interface EntityRecordField { id: number; name: string; code: string }
export interface EntityRecord { id: number; revision: number; created_at: string; values: Record<string, string> }
export interface EntityRecordPage { total: number; fields: EntityRecordField[]; items: EntityRecord[] }
export interface EntityDefinitionPayload { name: string; description: string }
export interface MasterDataOverviewItem {
  id: number
  entity_code: string
  name: string
  published: boolean
  published_at: string | null
  field_count: number
  source_count: number
  record_count: number
  last_record_at: string | null
}
export const masterDataApi = {
  overview() {
    return api.get<{ total: number; items: MasterDataOverviewItem[] }>('/master-data/overview').then(r => r.data)
  },
  list(params: { keyword?: string; offset?: number; limit?: number } = {}) {
    return api.get<{ total: number; items: EntityDefinition[] }>('/master-data/entities', { params }).then(r => r.data)
  },
  get(id: number) { return api.get<EntityDefinition>(`/master-data/entities/${id}`).then(r => r.data) },
  create(payload: EntityDefinitionPayload & { entity_code: string }) {
    return api.post<EntityDefinition>('/master-data/entities', payload).then(r => r.data)
  },
  update(id: number, payload: EntityDefinitionPayload & { expected_revision: number }) {
    return api.put<EntityDefinition>(`/master-data/entities/${id}`, payload).then(r => r.data)
  },
  publish(id: number, expected_revision: number) {
    return api.post<EntityDefinition>(`/master-data/entities/${id}/publish`, { expected_revision }).then(r => r.data)
  },
  recordAccess(entityId: number) {
    return api.get<{ user_ids: number[]; role_ids: number[] }>(`/master-data/entities/${entityId}/record-access`).then(r => r.data)
  },
  setUserRecordAccess(entityId: number, userId: number, allowed: boolean) {
    return api.put<{ ok: boolean }>(`/master-data/entities/${entityId}/record-access/users/${userId}`, { allowed }).then(r => r.data)
  },
  recordEntities() {
    return api.get<{ total: number; items: RecordEntity[] }>('/master-data/record-entities').then(r => r.data)
  },
  records(entityId: number, params: { offset?: number; limit?: number } = {}) {
    return api.get<EntityRecordPage>(`/master-data/entities/${entityId}/records`, { params }).then(r => r.data)
  },
  record(entityId: number, recordId: number) {
    return api.get<EntityRecordPage>(`/master-data/entities/${entityId}/records/${recordId}`).then(r => r.data)
  },
}
