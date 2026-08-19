import { api } from './client';
export const subscriptionsApi = {
    list: (params) => api.get('/subscriptions', { params }).then(r => r.data),
    get: (id) => api.get(`/subscriptions/${id}`).then(r => r.data),
    create: (data) => api.post('/subscriptions', data).then(r => r.data),
    update: (id, data) => api.put(`/subscriptions/${id}`, data).then(r => r.data),
    remove: (id) => api.delete(`/subscriptions/${id}`).then(r => r.data),
    toggle: (id) => api.post(`/subscriptions/${id}/toggle`).then(r => r.data),
    run: (id) => api.post(`/subscriptions/${id}/run`).then(r => r.data),
};
