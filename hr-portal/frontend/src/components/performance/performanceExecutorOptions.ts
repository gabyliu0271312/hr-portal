export interface PerformanceExecutorOption {
  type: string
  label: string
  roleCode?: string
}

// Mirrors backend assessment_roles.ASSESSMENT_ROLES: the stable identity for every executor.
export const ASSESSMENT_ROLE_CODES = {
  REVIEWEE: 'assessment.reviewee',
  REVIEWER_360: 'assessment.reviewer_360',
  LINE_MANAGER: 'assessment.line_manager',
  DOTTED_MANAGER: 'assessment.dotted_manager',
  PROJECT_MANAGER: 'assessment.project_manager',
  METRIC_EVALUATOR: 'assessment.metric_evaluator',
  CALIBRATOR: 'assessment.calibrator',
} as const

export function isReviewer360Node(node: { executor_role_code?: string | null }): boolean {
  return node.executor_role_code === ASSESSMENT_ROLE_CODES.REVIEWER_360
}

const FIXED_ROLE_BY_NODE_TYPE: Record<string, string> = {
  work_summary: ASSESSMENT_ROLE_CODES.REVIEWEE,
  reviewer_360_invite: ASSESSMENT_ROLE_CODES.REVIEWEE,
  result_view: ASSESSMENT_ROLE_CODES.REVIEWEE,
  calibration: ASSESSMENT_ROLE_CODES.CALIBRATOR,
}

export function nodeRoleCode(node: { node_type?: string; executor_role_code?: string | null }): string | null {
  if (node.executor_role_code) return node.executor_role_code
  return (node.node_type && FIXED_ROLE_BY_NODE_TYPE[node.node_type]) || null
}

export function isSelfEvaluationNode(node: { node_type?: string; executor_role_code?: string | null }): boolean {
  return node.node_type === 'evaluation' && nodeRoleCode(node) === ASSESSMENT_ROLE_CODES.REVIEWEE
}

export const SUBJECT_EXECUTOR_OPTION: PerformanceExecutorOption = {
  type: 'SUBJECT',
  roleCode: ASSESSMENT_ROLE_CODES.REVIEWEE,
  label: '被评估人',
}

export const CALIBRATION_EXECUTOR_OPTION: PerformanceExecutorOption = {
  type: 'PROJECT_CONFIGURED',
  roleCode: ASSESSMENT_ROLE_CODES.CALIBRATOR,
  label: '在项目配置时指定',
}

export const PERFORMANCE_EXECUTOR_OPTIONS: readonly PerformanceExecutorOption[] = [
  SUBJECT_EXECUTOR_OPTION,
  { type: 'REVIEWER_360', roleCode: ASSESSMENT_ROLE_CODES.REVIEWER_360, label: '360°评估人' },
  { type: 'REAL_LINE_MANAGER', roleCode: ASSESSMENT_ROLE_CODES.LINE_MANAGER, label: '实线上级' },
  { type: 'VIRTUAL_LINE_MANAGER', roleCode: ASSESSMENT_ROLE_CODES.DOTTED_MANAGER, label: '虚线上级' },
  { type: 'INDICATOR_EVALUATOR', roleCode: ASSESSMENT_ROLE_CODES.METRIC_EVALUATOR, label: '指标评价人' },
]

export const RESULT_COMMUNICATION_EXECUTOR_OPTIONS = PERFORMANCE_EXECUTOR_OPTIONS.filter(
  (option) => option.type === 'REAL_LINE_MANAGER' || option.type === 'VIRTUAL_LINE_MANAGER',
)

export const REAL_LINE_MANAGER_LEVEL_OPTIONS: readonly PerformanceExecutorOption[] = [
  { type: 'DIRECT_MANAGER', label: '直属上级' },
  { type: 'LEVEL_1_MANAGER', label: '隔 1 级上级' },
  { type: 'LEVEL_2_MANAGER', label: '隔 2 级上级' },
  { type: 'LEVEL_3_MANAGER_PLUS', label: '隔 3 级上级及以上' },
]

export const REVIEWER_360_CONFIRM_MANAGER_LEVEL_OPTIONS = REAL_LINE_MANAGER_LEVEL_OPTIONS.slice(0, 3)

export type PerformanceExecutorDisplayNode = {
  node_type?: string
  executor_label?: string | null
  executor_types?: string[]
  executor_role_code?: string | null
}

/** 所有模板流程展示入口共用的执行人文案，不改变 executor_config 等业务配置。 */
export function performanceExecutorDisplayLabel(node: PerformanceExecutorDisplayNode): string {
  if (node.node_type === 'result_reconsideration') return '复议处理人'
  if (node.executor_role_code === ASSESSMENT_ROLE_CODES.LINE_MANAGER) {
    const levels = REAL_LINE_MANAGER_LEVEL_OPTIONS.filter(option => node.executor_types?.includes(option.type))
    if (levels.length) return levels.map(option => option.label).join('、')
    return '--'
  }
  return node.executor_label || '--'
}
