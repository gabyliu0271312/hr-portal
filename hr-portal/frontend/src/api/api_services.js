import { api } from './client';
export const apiServicesApi = {
    list: (params) => api.get('/api-services', { params }).then(r => r.data),
    get: (id) => api.get(`/api-services/${id}`).then(r => r.data),
    create: (data) => api.post('/api-services', data).then(r => r.data),
    update: (id, data) => api.put(`/api-services/${id}`, data).then(r => r.data),
    remove: (id) => api.delete(`/api-services/${id}`).then(r => r.data),
    toggle: (id) => api.post(`/api-services/${id}/toggle`).then(r => r.data),
};
