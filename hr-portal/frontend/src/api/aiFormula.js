import { api } from './client';
const AI_DRAFT_TIMEOUT_MS = 130_000;
export const aiFormulaApi = {
    configs: () => api.get('/ai/config').then((r) => r.data),
    saveConfig: (body) => api.post('/ai/config', body).then((r) => r.data),
    testConfig: (body) => api
        .post('/ai/config/test', body, {
        timeout: ((body.timeout_seconds || 30) + 10) * 1000,
    })
        .then((r) => r.data),
    draft: (body) => api
        .post('/ai/capabilities/formula.generate/draft', body, { timeout: AI_DRAFT_TIMEOUT_MS })
        .then((r) => r.data),
    validate: (body) => api.post('/ai/capabilities/formula.validate/diagnose', body).then((r) => r.data),
    saveCalculatedField: (datasetId, body) => api
        .post('/ai/capabilities/calculated_field.save/write', body, {
        params: { dataset_id: datasetId, confirmed: true },
    })
        .then((r) => r.data),
};
