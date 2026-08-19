import { api } from './client';
export const functionLibraryApi = {
    list: (enabledOnly = false, includeBase = true) => api
        .get('/function-library/functions', {
        params: { enabled_only: enabledOnly, include_base: includeBase },
    })
        .then((r) => r.data),
    create: (body) => api.post('/function-library/functions', body).then((r) => r.data),
    update: (id, body) => api.put(`/function-library/functions/${id}`, body).then((r) => r.data),
    updateCatalog: (code, body) => api.patch(`/function-library/catalog/${code}`, body).then((r) => r.data),
};
