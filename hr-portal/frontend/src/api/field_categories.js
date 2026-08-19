import { api } from './client';
export const fieldCategoriesApi = {
    list: () => api.get('/field-categories').then((r) => r.data),
    create: (body) => api.post('/field-categories', body).then((r) => r.data),
    update: (id, body) => api.put(`/field-categories/${id}`, body).then((r) => r.data),
    remove: (id) => api.delete(`/field-categories/${id}`).then((r) => r.data),
    getAssignments: (id) => api
        .get(`/field-categories/${id}/assignments`)
        .then((r) => r.data),
    setAssignments: (id, items) => api
        .put(`/field-categories/${id}/assignments`, { items })
        .then((r) => r.data),
    // 角色 ↔ 可见分类
    getRoleVisible: (role_id) => api.get(`/field-categories/_role/${role_id}`).then((r) => r.data),
    setRoleVisible: (role_id, category_ids) => api
        .put(`/field-categories/_role/${role_id}`, { category_ids })
        .then((r) => r.data),
    // 用户 ↔ 可见分类（额外授权）
    getUserVisible: (user_id) => api.get(`/field-categories/_user/${user_id}`).then((r) => r.data),
    setUserVisible: (user_id, category_ids) => api
        .put(`/field-categories/_user/${user_id}`, { category_ids })
        .then((r) => r.data),
    // 授权工具白名单（分类 → 工具）
    tools: () => api.get('/field-categories/_tools').then((r) => r.data),
    getWhitelist: (cat_id) => api
        .get(`/field-categories/${cat_id}/whitelist`)
        .then((r) => r.data),
    setWhitelist: (cat_id, tool_keys) => api
        .put(`/field-categories/${cat_id}/whitelist`, { tool_keys })
        .then((r) => r.data),
};
