import { api } from './client';
export const tableColumnsApi = {
    tables: () => api.get('/table-columns/tables').then((r) => r.data),
    list: (table) => api.get(`/table-columns/${table}`).then((r) => r.data),
    create: (table, body) => api.post(`/table-columns/${table}`, body).then((r) => r.data),
    update: (table, id, body) => api.put(`/table-columns/${table}/${id}`, body).then((r) => r.data),
    enableLocalMaintenance: (table, id) => api
        .patch(`/table-columns/${table}/${id}/local-maintenance`, { confirm: true })
        .then((r) => r.data),
    remove: (table, id) => api.delete(`/table-columns/${table}/${id}`).then((r) => r.data),
    bulkUpdate: (table, columns) => api.put(`/table-columns/${table}/bulk`, { columns }).then((r) => r.data),
    recompute: (table) => api
        .post(`/table-columns/${table}/recompute`)
        .then((r) => r.data),
};
