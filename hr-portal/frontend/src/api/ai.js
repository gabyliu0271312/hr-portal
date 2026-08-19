import { api } from './client';
const AI_CHAT_TIMEOUT_MS = 130_000;
export const aiApi = {
    chat: (body) => api
        .post('/ai/chat', body, { timeout: AI_CHAT_TIMEOUT_MS })
        .then((r) => r.data),
    consumeControlledAction: (conversationId, body) => api
        .post(`/ai/conversations/${conversationId}/actions`, body, { timeout: AI_CHAT_TIMEOUT_MS })
        .then((r) => r.data),
    registry: () => api.get('/ai/capabilities/registry').then((r) => r.data),
};
