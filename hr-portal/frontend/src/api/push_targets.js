import { api } from './client';
export const pushTargetsApi = {
    list: (source_table) => api.get('/push-targets', { params: source_table ? { source_table } : {} })
        .then((r) => r.data),
    get: (id) => api.get(`/push-targets/${id}`).then((r) => r.data),
    create: (body) => api.post('/push-targets', body).then((r) => r.data),
    update: (id, body) => api.put(`/push-targets/${id}`, body).then((r) => r.data),
    remove: (id) => api.delete(`/push-targets/${id}`).then((r) => r.data),
    run: (id, period_ym = '') => api.post(`/push-targets/${id}/run`, { period_ym }).then((r) => r.data),
    runs: (id) => api.get(`/push-targets/${id}/runs`).then((r) => r.data),
    reveal: (id) => api.get(`/push-targets/${id}/reveal`).then((r) => r.data),
    sourceCapabilities: (source_type, source_id) => api.get('/push-targets/source-capabilities', { params: { source_type, source_id } }).then((r) => r.data),
    queryParameterMetadata: (sourceTable) => api.get('/push-targets/query-parameter-metadata', { params: { source_table: sourceTable } }).then((r) => r.data),
    schemaOrphans: () => api.get('/push-targets/schema-orphans').then((r) => r.data),
    integrationDocumentation: (id) => api.get(`/push-targets/${id}/integration-documentation`, { responseType: 'blob' }).then((r) => r.data),
};
