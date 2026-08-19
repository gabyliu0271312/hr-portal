import { api } from './client';
export const toolsApi = {
    listCompensationCaps: (params = {}) => api.get('/tools/compensation-caps', { params }).then((r) => r.data),
    createCompensationCap: (body) => api.post('/tools/compensation-caps', body).then((r) => r.data),
    updateCompensationCap: (id, body) => api.put(`/tools/compensation-caps/${id}`, body).then((r) => r.data),
    removeCompensationCap: (id) => api.delete(`/tools/compensation-caps/${id}`).then((r) => r.data),
    listDocumentTemplates: (params = {}) => api.get('/tools/document-templates', { params }).then((r) => r.data),
    getDocumentTemplate: (id) => api.get(`/tools/document-templates/${id}`).then((r) => r.data),
    createDocumentTemplate: (body) => api.post('/tools/document-templates', body).then((r) => r.data),
    updateDocumentTemplate: (id, body) => api.put(`/tools/document-templates/${id}`, body).then((r) => r.data),
    removeDocumentTemplate: (id) => api.delete(`/tools/document-templates/${id}`).then((r) => r.data),
    uploadDocumentTemplateWord: (id, file) => {
        const formData = new FormData();
        formData.append('file', file);
        return api
            .post(`/tools/document-templates/${id}/word`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
            .then((r) => r.data);
    },
    downloadDocumentTemplateWord: (id) => api.get(`/tools/document-templates/${id}/word`, { responseType: 'blob' }).then((r) => r),
    previewDocumentTemplate: (id, sample_data = {}) => api
        .post(`/tools/document-templates/${id}/preview`, { sample_data })
        .then((r) => r.data),
    saveDocumentTemplatePreview: (id, html) => api.post(`/tools/document-templates/${id}/preview/save`, { html }).then((r) => r.data),
    searchCompensationEmployees: (params) => api.get('/tools/compensation/employees', { params }).then((r) => r.data),
    calculateCompensation: (body) => api.post('/tools/compensation/calculate', body).then((r) => r.data),
    listInstallmentRules: () => api.get('/tools/installment-rules').then((r) => r.data),
    saveInstallmentRules: (rules) => api.put('/tools/installment-rules', { rules }).then((r) => r.data),
    prepareAgreement: (body) => api.post('/tools/agreement/prepare', body).then((r) => r.data),
    previewAgreement: (data) => api.post('/tools/agreement/preview', data).then((r) => r.data.html),
    downloadAgreement: (data, draft) => api.post('/tools/agreement/docx', { data, draft }, { responseType: 'blob' }).then((r) => r),
    downloadAgreementPdf: (data, draft) => api.post('/tools/agreement/pdf', { data, draft }, { responseType: 'blob' }).then((r) => r),
    logAgreementPrint: (data, draft) => api.post('/tools/agreement/print-log', { data, draft }).then((r) => r.data),
    listIncomeCertificateTemplates: () => api.get('/tools/income-certificate/templates').then((r) => r.data),
    searchIncomeCertificateEmployees: (params) => api.get('/tools/income-certificate/employees', { params }).then((r) => r.data),
    prepareIncomeCertificate: (body) => api.post('/tools/income-certificate/prepare', body).then((r) => r.data),
    previewIncomeCertificate: (data) => api.post('/tools/income-certificate/preview', data).then((r) => r.data.html),
    downloadIncomeCertificate: (data, draft) => api.post('/tools/income-certificate/docx', { data, draft }, { responseType: 'blob' }).then((r) => r),
    downloadIncomeCertificatePdf: (data, draft) => api.post('/tools/income-certificate/pdf', { data, draft }, { responseType: 'blob' }).then((r) => r),
    logIncomeCertificatePrint: (data, draft) => api.post('/tools/income-certificate/print-log', { data, draft }).then((r) => r.data),
};
