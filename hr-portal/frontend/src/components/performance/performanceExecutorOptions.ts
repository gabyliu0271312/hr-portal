export interface PerformanceExecutorOption {
  type: string
  label: string
  roleCode?: string
}

export const SUBJECT_EXECUTOR_OPTION: PerformanceExecutorOption = {
  type: 'SUBJECT',
  roleCode: 'assessment.reviewee',
  label: '被评估人',
}

export const CALIBRATION_EXECUTOR_OPTION: PerformanceExecutorOption = {
  type: 'PROJECT_CONFIGURED',
  roleCode: 'assessment.calibrator',
  label: '在项目配置时指定',
}

export const PERFORMANCE_EXECUTOR_OPTIONS: readonly PerformanceExecutorOption[] = [
  SUBJECT_EXECUTOR_OPTION,
  { type: 'REVIEWER_360', roleCode: 'assessment.reviewer_360', label: '360°评估人' },
  { type: 'REAL_LINE_MANAGER', roleCode: 'assessment.line_manager', label: '实线上级' },
  { type: 'VIRTUAL_LINE_MANAGER', roleCode: 'assessment.dotted_manager', label: '虚线上级' },
  { type: 'INDICATOR_EVALUATOR', roleCode: 'assessment.metric_evaluator', label: '指标评价人' },
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
