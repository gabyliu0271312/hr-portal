import { PERFORMANCE_LEVEL_COLORS } from './performanceColorOptions'

export type ReportHeatLevel = 1 | 2 | 3
export type ProjectReportDimension = 'department' | 'team' | 'sequence' | 'level' | 'tenure'
export interface ProjectReportMatrixConfig {
  allowTree: boolean
  showSummary: boolean
}

export const PROJECT_REPORT_MATRIX_CONFIGS: Record<ProjectReportDimension, ProjectReportMatrixConfig> = {
  department: { allowTree: true, showSummary: true },
  team: { allowTree: true, showSummary: true },
  sequence: { allowTree: true, showSummary: true },
  level: { allowTree: false, showSummary: true },
  tenure: { allowTree: false, showSummary: true },
}

export function getProjectReportMatrixConfig(dimension: ProjectReportDimension): ProjectReportMatrixConfig {
  return PROJECT_REPORT_MATRIX_CONFIGS[dimension]
}
export interface ReportRating { key: string; label: string; color?: string }
export interface ProjectReportComparison {
  source: 'mock'
  total: number
  ratings: ReportRating[]
  counts: number[][]
  heatLevels: number[][]
}
export interface ReportDepartment {
  id: string
  name: string
  counts: Record<string, number>
  heatLevels?: Record<string, ReportHeatLevel>
  children?: ReportDepartment[]
}
export interface ProjectStatisticsReport {
  source: 'mock' | 'api'
  dimension: ProjectReportDimension
  rowLabel: string
  showSummary: boolean
  totalParticipants: number
  ratings: ReportRating[]
  distribution: Record<string, number>
  heatLevels?: Record<string, ReportHeatLevel>
  departments: ReportDepartment[]
}
export type ProjectReportProvider = (query: { cycleId: number; dimension?: ProjectReportDimension }) => Promise<ProjectStatisticsReport>

export const reportGroups = [
  { key: 'results', label: '结果总览', sections: [{ key: 'overview', label: '绩效总览' }] },
  { key: 'details', label: '统计详情', sections: [
    { key: 'department', label: '部门统计' }, { key: 'team', label: '团队统计' },
    { key: 'sequence', label: '序列统计' }, { key: 'level', label: '级别统计' },
    { key: 'tenure', label: '司龄统计' },
  ] },
  { key: 'comparison', label: '差异分析', sections: [
    { key: 'self-final', label: '自评 / 终评对比' },
    { key: 'dimension', label: '绩效维度对比' }, { key: 'history', label: '历史绩效对比' },
  ] },
]

export function reportTotal(counts: Record<string, number>) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0)
}
export function reportPercent(count: number, total: number) {
  return total > 0 ? (count / total * 100).toFixed(1) : '0.0'
}

export function mockProjectReportComparison(): ProjectReportComparison {
  const ratings: ReportRating[] = [
    { key: 'rating-0', label: '1星', color: PERFORMANCE_LEVEL_COLORS[0].value },
    { key: 'rating-1', label: '2星', color: PERFORMANCE_LEVEL_COLORS[2].value },
    { key: 'rating-2', label: '3星-', color: PERFORMANCE_LEVEL_COLORS[5].value },
    { key: 'rating-3', label: '3星', color: PERFORMANCE_LEVEL_COLORS[6].value },
    { key: 'rating-4', label: '3星+', color: PERFORMANCE_LEVEL_COLORS[4].value },
    { key: 'rating-5', label: '4星', color: PERFORMANCE_LEVEL_COLORS[3].value },
    { key: 'rating-6', label: '5星', color: PERFORMANCE_LEVEL_COLORS[8].value },
  ]
  return {
    source: 'mock',
    total: 396,
    ratings,
    counts: [
      [0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 1, 0],
      [0, 0, 1, 4, 5, 1, 0],
      [0, 0, 1, 66, 76, 21, 2],
      [0, 0, 0, 23, 100, 42, 2],
      [0, 0, 0, 5, 15, 23, 7],
      [0, 0, 0, 0, 0, 0, 0],
    ],
    heatLevels: [
      [0, 0, 0, 0, 0, 0, 0],
      [0, 0, 0, 1, 0, 1, 0],
      [0, 0, 1, 1, 1, 1, 0],
      [0, 0, 1, 1, 1, 1, 1],
      [0, 0, 0, 1, 2, 1, 1],
      [0, 0, 0, 1, 1, 1, 1],
      [0, 0, 0, 0, 0, 0, 0],
    ],
  }
}

export const mockProjectReportProvider: ProjectReportProvider = async ({ dimension = 'department' }) => {
  if (dimension === 'level') throw new Error('级别统计必须使用真实 API')
  if (dimension === 'tenure') throw new Error('司龄统计必须使用真实 API')
  const ratings = [
    { label: '1星', color: PERFORMANCE_LEVEL_COLORS[0].value },
    { label: '2星', color: PERFORMANCE_LEVEL_COLORS[2].value },
    { label: '3星-', color: PERFORMANCE_LEVEL_COLORS[5].value },
    { label: '3星', color: PERFORMANCE_LEVEL_COLORS[6].value },
    { label: '3星+', color: PERFORMANCE_LEVEL_COLORS[4].value },
    { label: '4星', color: PERFORMANCE_LEVEL_COLORS[3].value },
    { label: '5星', color: PERFORMANCE_LEVEL_COLORS[8].value },
  ].map((level, i) => ({ key: `rating-${i}`, ...level }))
  const counts = (values: number[]) => Object.fromEntries(ratings.map((rating, i) => [rating.key, values[i] ?? 0]))
  const heatLevels = (values: ReportHeatLevel[]) => Object.fromEntries(ratings.map((rating, i) => [rating.key, values[i]]))

  const departments: ReportDepartment[] = [
    { id: 'demo-product', name: '示例产品部', counts: counts([0, 1, 3, 20, 19, 6, 1]), heatLevels: heatLevels([1, 1, 1, 2, 2, 1, 1]), children: [
      { id: 'demo-product-a', name: '示例产品一组', counts: counts([0, 1, 1, 9, 10, 3, 1]), heatLevels: heatLevels([1, 1, 1, 2, 2, 1, 1]) },
      { id: 'demo-product-b', name: '示例产品二组', counts: counts([0, 0, 2, 11, 9, 3, 0]), heatLevels: heatLevels([1, 1, 1, 3, 2, 1, 1]) },
    ] },
    { id: 'demo-engineering', name: '示例研发部', counts: counts([0, 0, 2, 15, 16, 6, 1]), heatLevels: heatLevels([1, 1, 1, 2, 2, 1, 1]) },
    { id: 'demo-operations', name: '示例运营部', counts: counts([0, 1, 1, 12, 10, 5, 1]), heatLevels: heatLevels([1, 1, 1, 2, 2, 1, 1]) },
  ]
  const teamRows: ReportDepartment[] = [
    { id: 'demo-leader-a', name: '示例上级A', counts: counts([0, 0, 4, 60, 52, 13, 0]), heatLevels: heatLevels([1, 1, 1, 3, 3, 2, 1]) },
    { id: 'demo-leader-b', name: '示例上级B', counts: counts([0, 2, 7, 39, 38, 22, 6]), heatLevels: heatLevels([1, 1, 1, 2, 2, 2, 1]), children: [
      { id: 'demo-leader-b-1', name: '示例上级B-1', counts: counts([0, 0, 4, 20, 22, 12, 3]), heatLevels: heatLevels([1, 1, 1, 2, 2, 2, 1]) },
      { id: 'demo-leader-b-2', name: '示例上级B-2', counts: counts([0, 1, 2, 10, 9, 5, 2]), heatLevels: heatLevels([1, 1, 1, 2, 2, 2, 1]) },
      { id: 'demo-leader-b-3', name: '示例上级B-3', counts: counts([0, 1, 1, 4, 3, 4, 1]), heatLevels: heatLevels([1, 1, 1, 2, 2, 2, 1]) },
      { id: 'demo-leader-b-4', name: '示例上级B-4', counts: counts([0, 0, 0, 3, 3, 1, 0]), heatLevels: heatLevels([1, 1, 1, 2, 2, 1, 1]) },
      { id: 'demo-leader-b-5', name: '示例上级B-5', counts: counts([0, 0, 0, 2, 1, 0, 0]), heatLevels: heatLevels([1, 1, 1, 1, 1, 1, 1]) },
    ] },
  ]
  const sequenceRows: ReportDepartment[] = [
    { id: 'demo-sequence-root', name: '示例序列集', counts: counts([0, 2, 14, 161, 162, 49, 0]), heatLevels: heatLevels([1, 1, 1, 3, 3, 2, 1]), children: [
      { id: 'demo-sequence-tech', name: '技术族', counts: counts([0, 0, 4, 54, 48, 11, 0]), heatLevels: heatLevels([1, 1, 1, 3, 3, 2, 1]) },
      { id: 'demo-sequence-design', name: '设计族', counts: counts([0, 2, 7, 50, 33, 11, 0]), heatLevels: heatLevels([1, 1, 1, 3, 2, 2, 1]) },
      { id: 'demo-sequence-product', name: '产品/项目族', counts: counts([0, 0, 1, 35, 39, 16, 0]), heatLevels: heatLevels([1, 1, 1, 2, 3, 2, 1]) },
      { id: 'demo-sequence-specialist', name: '专业族', counts: counts([0, 0, 0, 10, 26, 10, 0]), heatLevels: heatLevels([1, 1, 1, 2, 3, 2, 1]) },
      { id: 'demo-sequence-market', name: '市场族', counts: counts([0, 0, 2, 12, 16, 1, 0]), heatLevels: heatLevels([1, 1, 1, 2, 2, 1, 1]) },
    ] },
    { id: 'demo-sequence-empty', name: '--', counts: counts([0, 0, 0, 8, 6, 1, 0]), heatLevels: heatLevels([1, 1, 1, 2, 2, 1, 1]) },
  ]

  const rows = dimension === 'team' ? teamRows : dimension === 'sequence' ? sequenceRows : departments
  const matrixConfig = getProjectReportMatrixConfig(dimension)
  const distribution = Object.fromEntries(ratings.map(rating => [
    rating.key, rows.reduce((sum, row) => sum + row.counts[rating.key], 0),
  ]))
  return {
    source: 'mock',
    dimension,
    rowLabel: dimension === 'team' ? '上级' : dimension === 'sequence' ? '序列（筛选结果含子序列）' : '部门',
    showSummary: matrixConfig.showSummary,
    totalParticipants: dimension === 'team' ? 250 : dimension === 'sequence' ? 406 : 124,
    ratings,
    distribution,
    heatLevels: heatLevels(dimension === 'sequence' ? [1, 1, 1, 3, 3, 2, 1] : [1, 1, 1, 2, 2, 1, 1]),
    departments: rows,
  }
}
