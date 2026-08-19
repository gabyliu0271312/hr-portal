import { api } from './client';
export const usersApi = {
    list: (params = {}) => api.get('/users', { params }).then((r) => r.data),
    get: (id) => api.get(`/users/${id}`).then((r) => r.data),
    create: (body) => api.post('/users', body).then((r) => r.data),
    update: (id, body) => api.put(`/users/${id}`, body).then((r) => r.data),
    activate: (id) => api.post(`/users/${id}/activate`).then((r) => r.data),
    deactivate: (id) => api.post(`/users/${id}/deactivate`).then((r) => r.data),
    resetPassword: (id, new_password) => api
        .post(`/users/${id}/reset-password`, { new_password })
        .then((r) => r.data),
    setRoles: (id, role_ids) => api.put(`/users/${id}/roles`, { role_ids }).then((r) => r.data),
};
