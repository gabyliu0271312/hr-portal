import { api } from './client';
export const employeeProfileFieldsApi = {
    list: () => api.get('/admin/employee-profile-fields').then((response) => response.data),
    governanceCheck: () => api.get('/admin/employee-profile-fields/governance-check').then((response) => response.data),
    update: (fields) => api.put('/admin/employee-profile-fields', {
        fields: fields.map(({ sensitive_category_names: _sensitiveCategoryNames, ...field }) => field),
    }).then((response) => response.data),
};
