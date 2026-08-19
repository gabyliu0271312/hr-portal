import { api } from './client';
export const automationApi = {
    createRule: (data) => api.post('/automation/rules', data).then((r) => r.data),
    listRules: (params) => api.get('/automation/rules', { params }).then((r) => r.data),
    getRule: (id) => api.get(`/automation/rules/${id}`).then((r) => r.data),
    updateRule: (id, data) => api.patch(`/automation/rules/${id}`, data).then((r) => r.data),
    enableRule: (id) => api.post(`/automation/rules/${id}/enable`).then((r) => r.data),
    disableRule: (id) => api.post(`/automation/rules/${id}/disable`).then((r) => r.data),
    deleteRule: (id) => api.delete(`/automation/rules/${id}`).then((r) => r.data),
    listExecutions: (params) => api.get('/automation/executions', { params }).then((r) => r.data),
};
