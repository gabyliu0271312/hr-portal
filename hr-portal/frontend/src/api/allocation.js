import { api } from './client';
export const allocationApi = {
    listSchemes: () => api.get('/allocation/schemes').then((r) => r.data),
    getScheme: (id) => api.get(`/allocation/schemes/${id}`).then((r) => r.data),
    createScheme: (body) => api.post('/allocation/schemes', body).then((r) => r.data),
    updateScheme: (id, body) => api.put(`/allocation/schemes/${id}`, body).then((r) => r.data),
    deleteScheme: (id) => api.delete(`/allocation/schemes/${id}`).then((r) => r.data),
    runScheme: (id, extra_filters) => api.post(`/allocation/schemes/${id}/run`, { extra_filters }).then((r) => r.data),
    listRuns: (id) => api.get(`/allocation/schemes/${id}/runs`).then((r) => r.data),
    listResultTables: () => api.get('/allocation/result-tables').then((r) => r.data),
};
