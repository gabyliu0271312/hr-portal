import { api } from './client'

export interface CompensationCap {
  id: number
  region: string
  effective_start: string
  effective_end: string
  cap_amount: number
  note: string | null
  created_at: string
  updated_at: string
}

export interface CompensationCapPayload {
  region: string
  effective_start: string
  effective_end: string
  cap_amount: number
  note?: string | null
}

export type DocumentTemplateBusinessType = 'agreement' | 'income_certificate'
export type DocumentTemplateBlockType = 'header' | 'title' | 'head' | 'paragraph' | 'body' | 'line' | 'sign' | 'footer'
export type DocumentTemplateVariableSourceType = 'employee_field' | 'computed' | 'manual' | 'fixed' | 'system'

export interface DocumentTemplateBlock {
  id?: number
  block_type: DocumentTemplateBlockType
  content: string
  display_order: number
  style_config: Record<string, unknown>
}

export interface DocumentTemplateVariable {
  id?: number
  variable_code: string
  variable_name: string
  source_type: DocumentTemplateVariableSourceType
  source_key: string | null
  default_value: string | null
  required: boolean
  formatter: string | null
}

export interface DocumentTemplate {
  id: number
  code: string
  name: string
  business_type: DocumentTemplateBusinessType
  description: string | null
  is_active: boolean
  version: string
  effective_start: string | null
  effective_end: string | null
  layout_config: Record<string, unknown>
  template_file_name: string | null
  template_file_size: number | null
  parsed_variables: string[]
  uploaded_at: string | null
  created_at: string
  updated_at: string
  blocks: DocumentTemplateBlock[]
  variables: DocumentTemplateVariable[]
}

export interface DocumentTemplatePayload {
  code: string
  name: string
  business_type: DocumentTemplateBusinessType
  description?: string | null
  is_active: boolean
  version: string
  effective_start?: string | null
  effective_end?: string | null
  layout_config: Record<string, unknown>
  blocks: DocumentTemplateBlock[]
  variables: DocumentTemplateVariable[]
}

export interface DocumentTemplateUploadResult {
  id: number
  file_name: string
  file_size: number
  parsed_variables: string[]
}

export interface EditableDraft {
  draft_html?: string | null
  manually_adjusted: boolean
}

export interface EmployeeCandidate {
  id: number
  employee_no: string | null
  name: string | null
  chinese_name: string | null
  english_name: string | null
  company: string | null
  department: string | null
  work_region: string | null
  employment_status: string | null
  hire_date: string | null
  leave_date: string | null
}

export interface CompensationResult {
  employee: EmployeeCandidate
  hire_date: string
  leave_date: string
  work_region: string
  basic_salary: number
  cap_amount: number
  compensation_base: number
  service_years_n: number
  plan: 'N' | 'N+1'
  n_amount: number
  extra_amount: number
  total_amount: number
  cap_rule_id: number
}

export const toolsApi = {
  listCompensationCaps: (params: { region?: string; keyword?: string } = {}) =>
    api.get<CompensationCap[]>('/tools/compensation-caps', { params }).then((r) => r.data),

  createCompensationCap: (body: CompensationCapPayload) =>
    api.post<CompensationCap>('/tools/compensation-caps', body).then((r) => r.data),

  updateCompensationCap: (id: number, body: CompensationCapPayload) =>
    api.put<CompensationCap>(`/tools/compensation-caps/${id}`, body).then((r) => r.data),

  removeCompensationCap: (id: number) =>
    api.delete<{ ok: boolean }>(`/tools/compensation-caps/${id}`).then((r) => r.data),

  listDocumentTemplates: (params: { business_type?: string; keyword?: string } = {}) =>
    api.get<DocumentTemplate[]>('/tools/document-templates', { params }).then((r) => r.data),

  getDocumentTemplate: (id: number) =>
    api.get<DocumentTemplate>(`/tools/document-templates/${id}`).then((r) => r.data),

  createDocumentTemplate: (body: DocumentTemplatePayload) =>
    api.post<DocumentTemplate>('/tools/document-templates', body).then((r) => r.data),

  updateDocumentTemplate: (id: number, body: DocumentTemplatePayload) =>
    api.put<DocumentTemplate>(`/tools/document-templates/${id}`, body).then((r) => r.data),

  removeDocumentTemplate: (id: number) =>
    api.delete<{ ok: boolean }>(`/tools/document-templates/${id}`).then((r) => r.data),

  uploadDocumentTemplateWord: (id: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api
      .post<DocumentTemplateUploadResult>(`/tools/document-templates/${id}/word`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data)
  },

  downloadDocumentTemplateWord: (id: number) =>
    api.get(`/tools/document-templates/${id}/word`, { responseType: 'blob' }).then((r) => r),

  previewDocumentTemplate: (id: number, sample_data: Record<string, unknown> = {}) =>
    api
      .post<{ html: string; plain_text: string }>(`/tools/document-templates/${id}/preview`, { sample_data })
      .then((r) => r.data),

  saveDocumentTemplatePreview: (id: number, html: string) =>
    api.post<DocumentTemplate>(`/tools/document-templates/${id}/preview/save`, { html }).then((r) => r.data),

  searchCompensationEmployees: (params: { keyword: string; limit?: number }) =>
    api.get<EmployeeCandidate[]>('/tools/compensation/employees', { params }).then((r) => r.data),

  calculateCompensation: (body: {
    employee_id: number
    leave_date?: string | null
    plan: 'N' | 'N+1'
    region?: string | null
  }) => api.post<CompensationResult>('/tools/compensation/calculate', body).then((r) => r.data),

  listInstallmentRules: () =>
    api.get<InstallmentRuleItem[]>('/tools/installment-rules').then((r) => r.data),

  saveInstallmentRules: (rules: InstallmentRuleItem[]) =>
    api.put<InstallmentRuleItem[]>('/tools/installment-rules', { rules }).then((r) => r.data),

  prepareAgreement: (body: {
    employee_id: number
    leave_date?: string | null
    plan: 'N' | 'N+1'
    region?: string | null
    template_code?: string
  }) => api.post<AgreementData>('/tools/agreement/prepare', body).then((r) => r.data),

  previewAgreement: (data: AgreementData) =>
    api.post<{ html: string }>('/tools/agreement/preview', data).then((r) => r.data.html),

  downloadAgreement: (data: AgreementData, draft: EditableDraft) =>
    api.post('/tools/agreement/docx', { data, draft }, { responseType: 'blob' }).then((r) => r),

  downloadAgreementPdf: (data: AgreementData, draft: EditableDraft) =>
    api.post('/tools/agreement/pdf', { data, draft }, { responseType: 'blob' }).then((r) => r),

  logAgreementPrint: (data: AgreementData, draft: EditableDraft) =>
    api.post<{ ok: boolean }>('/tools/agreement/print-log', { data, draft }).then((r) => r.data),

  listIncomeCertificateTemplates: () =>
    api.get<IncomeCertificateTemplate[]>('/tools/income-certificate/templates').then((r) => r.data),

  searchIncomeCertificateEmployees: (params: { keyword: string; limit?: number }) =>
    api.get<EmployeeCandidate[]>('/tools/income-certificate/employees', { params }).then((r) => r.data),

  prepareIncomeCertificate: (body: { employee_id: number; leave_date?: string | null; template_code: string }) =>
    api.post<IncomeCertificateData>('/tools/income-certificate/prepare', body).then((r) => r.data),

  previewIncomeCertificate: (data: IncomeCertificateData) =>
    api.post<{ html: string }>('/tools/income-certificate/preview', data).then((r) => r.data.html),

  downloadIncomeCertificate: (data: IncomeCertificateData, draft: EditableDraft) =>
    api.post('/tools/income-certificate/docx', { data, draft }, { responseType: 'blob' }).then((r) => r),

  downloadIncomeCertificatePdf: (data: IncomeCertificateData, draft: EditableDraft) =>
    api.post('/tools/income-certificate/pdf', { data, draft }, { responseType: 'blob' }).then((r) => r),

  logIncomeCertificatePrint: (data: IncomeCertificateData, draft: EditableDraft) =>
    api.post<{ ok: boolean }>('/tools/income-certificate/print-log', { data, draft }).then((r) => r.data),
}

export interface InstallmentRuleItem {
  period_no: number
  ratio: number
  months_after: number
  pay_day: number
}

export interface AgreementInstallment {
  pay_date: string
  amount: number
}

export interface AgreementData {
  template_code: string
  template_name: string
  company: string
  name: string
  id_card: string
  dissolve_date: string
  last_work_date: string
  social_security_month: string
  salary_until: string
  base_amount: number
  total_amount: number
  installments: AgreementInstallment[]
}

export interface IncomeCertificateTemplate {
  code: string
  name: string
  manual_variables: DocumentTemplateVariable[]
}

export interface IncomeCertificateData {
  template_code: string
  template_name: string
  company: string
  name: string
  id_card: string
  position: string
  hire_date: string
  leave_date: string | null
  leave_date_text: string
  basic_salary: number
  target_bonus: number
  annual_package: number
  issue_date: string
  manual_values: Record<string, unknown>
}
