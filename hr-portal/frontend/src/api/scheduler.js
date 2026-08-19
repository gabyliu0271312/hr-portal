import { api } from './client';
export const schedulerApi = {
    runs: (params = {}) => api.get('/job-runs', { params }).then((r) => r.data),
    jobs: (params = {}) => api.get('/scheduled-jobs', { params }).then((r) => r.data),
    createJob: (payload) => api.post('/scheduled-jobs', payload).then((r) => r.data),
    updateJob: (job_id, payload) => api.patch(`/scheduled-jobs/${job_id}`, payload).then((r) => r.data),
    deleteJob: (job_id) => api.delete(`/scheduled-jobs/${job_id}`).then((r) => r.data),
    runNow: (job_id) => api
        .post(`/scheduled-jobs/${job_id}/run-now`)
        .then((r) => r.data),
    retryRun: (run_id, reason = '') => api
        .post(`/job-runs/${run_id}/retry`, { reason })
        .then((r) => r.data),
};
