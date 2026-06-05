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
  }) => api.post<AgreementData>('/tools/agreement/prepare', body).then((r) => r.data),

  previewAgreement: (data: AgreementData) =>
    api.post<{ html: string }>('/tools/agreement/preview', data).then((r) => r.data.html),

  downloadAgreement: (data: AgreementData) =>
    api.post('/tools/agreement/docx', data, { responseType: 'blob' }).then((r) => r),

  listIncomeCertificateTemplates: () =>
    api.get<IncomeCertificateTemplate[]>('/tools/income-certificate/templates').then((r) => r.data),

  searchIncomeCertificateEmployees: (params: { keyword: string; limit?: number }) =>
    api.get<EmployeeCandidate[]>('/tools/income-certificate/employees', { params }).then((r) => r.data),

  prepareIncomeCertificate: (body: { employee_id: number; leave_date?: string | null; template_code: string }) =>
    api.post<IncomeCertificateData>('/tools/income-certificate/prepare', body).then((r) => r.data),

  previewIncomeCertificate: (data: IncomeCertificateData) =>
    api.post<{ html: string }>('/tools/income-certificate/preview', data).then((r) => r.data.html),

  downloadIncomeCertificate: (data: IncomeCertificateData) =>
    api.post('/tools/income-certificate/docx', data, { responseType: 'blob' }).then((r) => r),
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
}
