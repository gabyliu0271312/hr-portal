import { api } from './client';
export const codegenApi = {
    suggest: (body) => api.post('/codegen/suggest', body).then((r) => r.data),
};
