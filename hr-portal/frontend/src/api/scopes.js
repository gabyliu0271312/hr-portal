import { api } from './client';
export const scopesApi = {
    list: (params = {}) => api.get('/scopes', { params }).then((r) => r.data),
    get: (id) => api.get(`/scopes/${id}`).then((r) => r.data),
    create: (body) => api.post('/scopes', body).then((r) => r.data),
    update: (id, body) => api.put(`/scopes/${id}`, body).then((r) => r.data),
    remove: (id) => api.delete(`/scopes/${id}`).then((r) => r.data),
    userTags: (user_id) => api.get(`/scopes/_user/${user_id}`).then((r) => r.data),
    assignUserTags: (user_id, tag_ids) => api
        .put(`/scopes/_user/${user_id}`, { tag_ids })
        .then((r) => r.data),
};
