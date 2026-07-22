import { api } from './client'

export interface EmployeeProfileFieldConfig {
  column_name: string
  field_code: string
  display_name: string
  is_queryable: boolean
  is_default_card: boolean
  default_display_order: number | null
  append_display_order: number
  version: number | null
  sensitive_category_names: string[]
}

export interface EmployeeProfileGovernanceIssue {
  code: string
  level: string
  message: string
  column_name: string | null
  category_name: string | null
}

export interface EmployeeProfileGovernanceCheck {
  issues: EmployeeProfileGovernanceIssue[]
  warning_count: number
}

export const employeeProfileFieldsApi = {
  list: () => api.get<EmployeeProfileFieldConfig[]>('/admin/employee-profile-fields').then((response) => response.data),
  governanceCheck: () => api.get<EmployeeProfileGovernanceCheck>('/admin/employee-profile-fields/governance-check').then((response) => response.data),
  update: (fields: EmployeeProfileFieldConfig[]) => api.put<EmployeeProfileFieldConfig[]>('/admin/employee-profile-fields', {
    fields: fields.map(({ sensitive_category_names: _sensitiveCategoryNames, ...field }) => field),
  }).then((response) => response.data),
}
