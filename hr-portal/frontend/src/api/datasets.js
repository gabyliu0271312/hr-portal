import { api } from './client';
export const datasetsApi = {
    list: () => api.get('/datasets').then((r) => r.data),
    aclOptions: () => api.get('/datasets/_acl-options').then((r) => r.data),
    get: (id) => api.get(`/datasets/${id}`).then((r) => r.data),
    create: (body) => api.post('/datasets', body).then((r) => r.data),
    update: (id, body) => api.put(`/datasets/${id}`, body).then((r) => r.data),
    updateAcl: (id, acl) => api.patch(`/datasets/${id}/acl`, { acl }).then((r) => r.data),
    remove: (id) => api.delete(`/datasets/${id}`).then((r) => r.data),
    integrity: (id) => api.get(`/datasets/${id}/integrity`).then((r) => r.data),
    visibleTables: () => api.get('/datasets/_visible-tables').then((r) => r.data),
    ensureSingleTableDataset: (tableName) => api.post('/datasets/_single-table', { table_name: tableName }).then((r) => r.data),
    calculatedFields: (id) => api.get(`/datasets/${id}/calculated-fields`).then((r) => r.data),
    createCalculatedField: (id, body) => api.post(`/datasets/${id}/calculated-fields`, body).then((r) => r.data),
    updateCalculatedField: (datasetId, fieldId, body) => api.put(`/datasets/${datasetId}/calculated-fields/${fieldId}`, body).then((r) => r.data),
    removeCalculatedField: (datasetId, fieldId) => api.delete(`/datasets/${datasetId}/calculated-fields/${fieldId}`).then((r) => r.data),
    // P4-03: 数据集输出字段配置
    outputFields: (id) => api.get(`/datasets/${id}/output-fields`).then((r) => r.data),
    updateOutputField: (datasetId, fieldId, body) => api.put(`/datasets/${datasetId}/output-fields/${fieldId}`, body).then((r) => r.data),
};
