import { api } from './client';
export const costAllocationApi = {
    archive: (body) => api.post('/cost-allocation/archive', body).then((r) => r.data),
};
