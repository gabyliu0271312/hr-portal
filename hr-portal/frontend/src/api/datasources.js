import { api } from './client';
export const datasourcesApi = {
    types: (consumer) => api.get('/datasources/types', { params: consumer ? { consumer } : undefined }).then((r) => r.data.items),
    list: () => api.get('/datasources').then((r) => r.data),
    get: (id) => api.get(`/datasources/${id}`).then((r) => r.data),
    create: (body) => api.post('/datasources', body).then((r) => r.data),
    update: (id, body) => api.put(`/datasources/${id}`, body).then((r) => r.data),
    remove: (id) => api.delete(`/datasources/${id}`).then((r) => r.data),
    test: (id, body) => api.post(`/datasources/${id}/test`, body ?? null).then((r) => r.data),
    discoverFields: (id) => api.post(`/datasources/${id}/discover-fields`).then((r) => r.data),
    sync: (id) => api
        .post(`/datasources/${id}/sync`, null, { timeout: 300_000 })
        .then((r) => r.data),
    runs: (id, limit = 20) => api.get(`/datasources/${id}/runs`, { params: { limit } }).then((r) => r.data),
};
