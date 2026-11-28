export interface PerformanceFieldOption {
  id: string
  label: string
  disabled?: boolean
}

export interface PerformanceFilterCondition {
  filter_key: string
  label: string
  default: boolean
  disable_set_default: boolean
}

export interface PerformanceManagerStandard {
  manager_standard: 'inservice_direct_underling' | 'specific_employee_type_underling'
  specific_employee_types: string[]
}

export interface PerformanceFieldSettings {
  review_detail_visible_fields: { field: string[] }
  default_filter_condition: { filter_conditions: PerformanceFilterCondition[] }
  department_tree_view_all: { enabled: boolean }
  definition_of_manager: PerformanceManagerStandard
}

export type PerformanceFieldSettingsSection = keyof PerformanceFieldSettings

export interface PerformanceFieldSettingsAdapter {
  get(): Promise<PerformanceFieldSettings>
  update(settings: Partial<PerformanceFieldSettings>): Promise<PerformanceFieldSettings>
}

export const detailFieldOptions: PerformanceFieldOption[] = [
  { id: 'department', label: '部门', disabled: true },
  { id: 'level', label: '职级' },
  { id: 'category', label: '序列' },
  { id: 'directLeader', label: '直属上级' },
  { id: 'dottedLeaders', label: '虚线上级' },
  { id: 'joinDate', label: '入职日期' },
  { id: 'jobTitle', label: '职务' },
  { id: 'employeeType', label: '人员类型' },
]

const filterLabels: [string, string, boolean][] = [
  ['directLeader', '直属上级', true],
  ['dottedLeaders', '虚线上级', false],
  ['leaders', '上级', true],
  ['pdtManagerKey', '项目上级', false],
  ['hrbp', 'HRBP', false],
  ['departments', '部门', true],
  ['directDepartment', '直属部门', true],
  ['pdtProjectKey', '参与的业务项目', false],
  ['pdtCoProjectKey', '合作的业务项目', false],
  ['level', '职级', true],
  ['allCategories', '序列（筛选结果含子序列）', true],
  ['directCategory', '序列（筛选结果不含子序列）', false],
  ['jobTitle', '职务', false],
  ['pdtRoleKey', '项目角色', false],
  ['isManager', '是否管理者', false],
  ['userId', '人员', true],
  ['followGroup', '人员组', false],
  ['followedUser', '我标记为关注的人', false],
  ['joinDate', '入职日期', false],
  ['realTimeDimissionStatus', '当前雇佣状态', false],
  ['employeeType', '人员类型', false],
  ['finalReviewScoreFilterKey', '当前周期绩效结果', false],
  ['currentSemesterAssessmentItemComparisonFilterKey', '当前周期评估项间对比', false],
  ['inviteReviewScoreFilterKey', '当前周期 360° 评估结果', false],
  ['inviteReviewRelation', '360° 评估关系', false],
  ['inviteReviewerTagUnderLimitGroup', '360° 标签标记人数低于建议人数', false],
  ['otherStageScoreFilterKey', '当前周期其他环节评估结果', false],
  ['historySemesterFinalScore', '历史周期绩效结果', false],
  ['stageReviewDataChangedGroup', '校准环节是否有结果变更', false],
  ['activity', '所属项目', false],
  ['stageStatusFilterKey', '环节状态', false],
  ['finalReviewModifiedAt', '绩效结果最近变更时间', false],
]

const disableSetDefaultKeys = new Set([
  'finalReviewScoreFilterKey',
  'currentSemesterAssessmentItemComparisonFilterKey',
  'inviteReviewScoreFilterKey',
  'otherStageScoreFilterKey',
  'historySemesterFinalScore',
  'stageStatusFilterKey',
])

export function createFieldSettingsPreview(): PerformanceFieldSettings {
  return {
    review_detail_visible_fields: { field: ['department', 'level', 'category', 'directLeader', 'joinDate'] },
    default_filter_condition: {
      filter_conditions: filterLabels.map(([filter_key, label, isDefault]) => ({
        filter_key,
        label,
        default: isDefault && !disableSetDefaultKeys.has(filter_key),
        disable_set_default: disableSetDefaultKeys.has(filter_key),
      })),
    },
    department_tree_view_all: { enabled: true },
    definition_of_manager: { manager_standard: 'inservice_direct_underling', specific_employee_types: [] },
  }
}
