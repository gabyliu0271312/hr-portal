import { api } from './client';
export const dataApi = {
    query: (table, params = {}) => {
        const p = { ...params };
        if (params.filters)
            p.filters = JSON.stringify(params.filters);
        return api.get(`/data/${table}`, { params: p }).then((r) => r.data);
    },
    columns: (table) => api.get(`/data/${table}/columns`).then((r) => r.data),
    distinct: (table, column, labelExtra, limit = 500) => api
        .get(`/data/${table}/distinct`, {
        params: { column, label_extra: labelExtra, limit },
    })
        .then((r) => r.data),
    updateRow: (table, rowId, values) => api.patch(`/data/${table}/${rowId}`, { values }).then((r) => r.data),
    createRow: (table, values) => api.post(`/data/${table}`, { values }).then((r) => r.data),
    bulkUpdate: (table, rowIds, values) => api
        .patch(`/data/${table}/bulk`, {
        row_ids: rowIds,
        values,
    })
        .then((r) => r.data),
    bulkDelete: (table, rowIds) => api
        .delete(`/data/${table}/bulk`, {
        data: { row_ids: rowIds },
    })
        .then((r) => r.data),
};
export const treesApi = {
    costCenter: (include_inactive = false) => api
        .get('/trees/cost-center', { params: { include_inactive } })
        .then((r) => r.data),
    org: (include_inactive = false) => api.get('/trees/org', { params: { include_inactive } }).then((r) => r.data),
};
export const distinctApi = {
    employmentTypes: (include_inactive = false) => api
        .get('/trees/employment-type', { params: { include_inactive } })
        .then((r) => r.data),
    employmentEntities: (include_inactive = false) => api
        .get('/trees/employment-entity', { params: { include_inactive } })
        .then((r) => r.data),
    persons: (params = {}) => api.get('/trees/persons', { params }).then((r) => r.data),
};
