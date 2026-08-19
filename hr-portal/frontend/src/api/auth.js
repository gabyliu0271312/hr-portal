import { api } from './client';
export const authApi = {
    login: (login_name, password) => api.post('/auth/login', { login_name, password }).then((r) => r.data),
    me: () => api.get('/auth/me').then((r) => r.data),
    logout: () => api.post('/auth/logout').then((r) => r.data),
    changePassword: (old_password, new_password) => api
        .post('/auth/change-password', { old_password, new_password })
        .then((r) => r.data),
    feishuUrl: () => api.get('/auth/feishu/url').then((r) => r.data),
    feishuCallback: (code) => api
        .get('/auth/feishu/callback', { params: { code } })
        .then((r) => r.data),
};
