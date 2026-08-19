import { api } from './client';
export const adminTablesApi = {
    list: () => api.get('/admin/tables').then((r) => r.data),
    create: (body) => api.post('/admin/tables', body).then((r) => r.data),
    update: (table_name, body) => api.patch(`/admin/tables/${table_name}`, body).then((r) => r.data),
    remove: (table_name) => api.delete(`/admin/tables/${table_name}`).then((r) => r.data),
};
