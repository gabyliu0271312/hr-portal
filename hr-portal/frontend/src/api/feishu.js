import { api } from './client';
export const feishuApi = {
    // 获取飞书群列表
    listChatTargets: () => api.get('/feishu/chat-targets').then((r) => r.data),
    // 解析接收人（预览）
    resolveReceivers: (data) => api
        .post('/feishu/notifications/resolve', data)
        .then((r) => r.data),
    // 预览消息
    previewMessage: (data) => api
        .post('/feishu/notifications/message-preview', data)
        .then((r) => r.data),
    // 测试发送
    testSend: (data) => api
        .post('/feishu/notifications/test', data)
        .then((r) => r.data),
    // 获取发送日志
    getLogs: (params) => api.get('/feishu/notifications/logs', { params }).then((r) => r.data),
    // 获取标记完成记录
    getCompletions: (params) => api.get('/feishu/notifications/completions', { params }).then((r) => r.data),
};
