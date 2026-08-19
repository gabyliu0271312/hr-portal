import { api } from './client';
export const performanceApi = {
    async getAccessContext() {
        const { data } = await api.get('/performance/auth/context');
        return data;
    },
};
export const performanceTemplateApi = {
    async list() {
        const { data } = await api.get('/performance/templates');
        return data;
    },
    async create(payload) {
        const { data } = await api.post('/performance/templates', payload);
        return data;
    },
    async getWorkflow(id) {
        const { data } = await api.get(`/performance/templates/${id}/workflow`);
        return data;
    },
    async updateWorkflow(id, payload) {
        const { data } = await api.patch(`/performance/templates/${id}/workflow`, payload);
        return data;
    },
};
export const performanceCycleApi = {
    async list(keyword, page = 1, pageSize = 20) {
        const { data } = await api.get('/performance/cycles', { params: { ...(keyword ? { keyword } : {}), page, page_size: pageSize } });
        return data;
    },
    async get(id) {
        const { data } = await api.get(`/performance/cycles/${id}`);
        return data;
    },
    async create(payload) {
        const { data } = await api.post('/performance/cycles', payload);
        return data;
    },
    async update(id, payload) {
        const { data } = await api.patch(`/performance/cycles/${id}`, payload);
        return data;
    },
    async listPeople(id) {
        const { data } = await api.get(`/performance/cycles/${id}/people`);
        return data;
    },
    async refreshPeople(id, reason) {
        const { data } = await api.patch(`/performance/cycles/${id}/people`, { reason });
        return data;
    },
    async updatePerson(id, person, reason) {
        const { data } = await api.patch(`/performance/cycles/${id}/people/manual`, { reason, people: [person] });
        return data;
    },
    async remove(id) {
        await api.delete(`/performance/cycles/${id}`);
    },
};
