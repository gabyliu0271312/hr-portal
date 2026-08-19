import { api } from './client';
// ──────────────────────────────────────────────
// API
// ──────────────────────────────────────────────
export const dataCompareApi = {
    // 技能 CRUD
    listSkills: (params) => api.get('/data-compare/skills', { params }).then(r => r.data),
    getSkill: (id) => api.get(`/data-compare/skills/${id}`).then(r => r.data),
    createSkill: (data) => api.post('/data-compare/skills', data).then(r => r.data),
    generateSkill: (data) => api.post('/data-compare/skills/generate', data).then(r => r.data),
    updateSkill: (id, data) => api.patch(`/data-compare/skills/${id}`, data).then(r => r.data),
    deleteSkill: (id) => api.delete(`/data-compare/skills/${id}`).then(r => r.data),
    // 执行
    invokeSkill: (id) => api.post(`/data-compare/skills/${id}/invoke`).then(r => r.data),
    invokeAdhoc: (spec) => api.post('/data-compare/invoke', spec).then(r => r.data),
    // Phase 2: 任务 CRUD
    listTasks: (params) => api.get('/data-compare/tasks', { params }).then(r => r.data),
    getTask: (id) => api.get(`/data-compare/tasks/${id}`).then(r => r.data),
    createTask: (data) => api.post('/data-compare/tasks', data).then(r => r.data),
    updateTask: (id, data) => api.patch(`/data-compare/tasks/${id}`, data).then(r => r.data),
    deleteTask: (id) => api.delete(`/data-compare/tasks/${id}`).then(r => r.data),
    // Phase 2: 任务执行
    runTask: (id) => api.post(`/data-compare/tasks/${id}/run`).then(r => r.data),
    // Phase 2: 执行记录
    listRuns: (taskId, params) => api.get(`/data-compare/tasks/${taskId}/runs`, { params }).then(r => r.data),
    getRun: (runId) => api.get(`/data-compare/runs/${runId}`).then(r => r.data),
};
