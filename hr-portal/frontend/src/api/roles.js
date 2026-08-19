import { api } from './client';
export const rolesApi = {
    list: () => api.get('/roles').then((r) => r.data),
    get: (id) => api.get(`/roles/${id}`).then((r) => r.data),
    create: (body) => api.post('/roles', body).then((r) => r.data),
    update: (id, body) => api.put(`/roles/${id}`, body).then((r) => r.data),
    activate: (id) => api.post(`/roles/${id}/activate`).then((r) => r.data),
    deactivate: (id) => api.post(`/roles/${id}/deactivate`).then((r) => r.data),
};
export const menusApi = {
    list: () => api.get('/menus').then((r) => r.data),
};
