import { api } from './client';
export const tableToolsApi = {
    listTemplates: () => api.get('/table-tools/templates').then((r) => r.data),
    getTemplate: (id) => api.get(`/table-tools/templates/${id}`).then((r) => r.data),
    createTemplate: (payload) => api.post('/table-tools/templates', payload).then((r) => r.data),
    updateTemplate: (id, payload) => api.put(`/table-tools/templates/${id}`, payload).then((r) => r.data),
    deleteTemplate: (id) => api.delete(`/table-tools/templates/${id}`).then(() => undefined),
    mappingDraft: (templateId, file, sheetName) => {
        const fd = new FormData();
        fd.append('file', file);
        if (sheetName)
            fd.append('sheet_name', sheetName);
        return api.post(`/table-tools/templates/${templateId}/mapping-draft`, fd).then((r) => r.data);
    },
    mappingDrafts: (templateId, files, businessContext) => {
        const fd = new FormData();
        files.forEach((file) => fd.append('files', file));
        fd.append('business_context', businessContext);
        return api.post(`/table-tools/templates/${templateId}/mapping-drafts`, fd, { timeout: 300000 }).then((r) => r.data);
    },
    createMappings: (templateId, mappings) => api.post(`/table-tools/templates/${templateId}/mappings/batch`, { mappings }).then((r) => r.data),
    createMapping: (templateId, payload) => api.post(`/table-tools/templates/${templateId}/mappings`, payload).then((r) => r.data),
    updateMapping: (templateId, mappingId, payload) => api.put(`/table-tools/templates/${templateId}/mappings/${mappingId}`, payload).then((r) => r.data),
    deleteMapping: (templateId, mappingId) => api.delete(`/table-tools/templates/${templateId}/mappings/${mappingId}`).then(() => undefined),
    listKeyMappings: (templateId) => api.get(`/table-tools/templates/${templateId}/key-mappings`).then((r) => r.data),
    createKeyMapping: (templateId, payload) => api.post(`/table-tools/templates/${templateId}/key-mappings`, payload).then((r) => r.data),
    updateKeyMapping: (templateId, mappingId, payload) => api.put(`/table-tools/templates/${templateId}/key-mappings/${mappingId}`, payload).then((r) => r.data),
    deleteKeyMapping: (templateId, mappingId) => api.delete(`/table-tools/templates/${templateId}/key-mappings/${mappingId}`).then(() => undefined),
    listDwdSources: () => api.get('/table-tools/dwd-relation-sources').then((r) => r.data),
    listDwdFields: (reportId) => api.get(`/table-tools/reports/${reportId}/dwd-fields`).then((r) => r.data),
    listDwdRelations: (templateId) => api.get(`/table-tools/templates/${templateId}/dwd-relations`).then((r) => r.data),
    createDwdRelation: (templateId, payload) => api.post(`/table-tools/templates/${templateId}/dwd-relations`, payload).then((r) => r.data),
    updateDwdRelation: (templateId, relationId, payload) => api.put(`/table-tools/templates/${templateId}/dwd-relations/${relationId}`, payload).then((r) => r.data),
    deleteDwdRelation: (templateId, relationId) => api.delete(`/table-tools/templates/${templateId}/dwd-relations/${relationId}`).then(() => undefined),
    applyDwdRelation: (templateId, relationId, files) => {
        const fd = new FormData();
        files.forEach((file) => fd.append('files', file));
        return api.post(`/table-tools/templates/${templateId}/dwd-relations/${relationId}/apply`, fd, { timeout: 300000 }).then((r) => r.data);
    },
    runMerge: (templateId, files) => {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        return api.post(`/table-tools/templates/${templateId}/merge`, fd, {
            timeout: 300000,
        }).then((r) => r.data);
    },
    downloadMerge: async (templateId, files) => {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        const resp = await api.post(`/table-tools/templates/${templateId}/download`, fd, {
            responseType: 'blob',
            timeout: 300000,
        });
        const url = URL.createObjectURL(resp.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'merged_result.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    },
    aiDraft: (files, businessContext) => {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        fd.append('business_context', businessContext);
        return api.post('/table-tools/ai-draft', fd, { timeout: 300000 }).then((r) => r.data);
    },
};
