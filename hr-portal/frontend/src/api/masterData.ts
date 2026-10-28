import { api } from './client'

export interface EntityDefinition {
  id: number
  entity_code: string
  name: string
  description: string
  revision: number
  is_active: boolean
}
export interface EntityDefinitionPayload { name: string; description: string }
export const masterDataApi = {
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
}
