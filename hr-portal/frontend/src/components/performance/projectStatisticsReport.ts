import { PERFORMANCE_LEVEL_COLORS } from './performanceColorOptions'

export type ReportHeatLevel = 1 | 2 | 3
export interface ReportRating { key: string; label: string; color?: string }
export interface ReportDepartment {
  id: string
  name: string
  counts: Record<string, number>
  heatLevels?: Record<string, ReportHeatLevel>
  children?: ReportDepartment[]
}
export interface ProjectStatisticsReport {
  source: 'mock' | 'api'
  totalParticipants: number
  ratings: ReportRating[]
  distribution: Record<string, number>
  heatLevels?: Record<string, ReportHeatLevel>
  departments: ReportDepartment[]
}
export type ProjectReportProvider = (query: { cycleId: number }) => Promise<ProjectStatisticsReport>

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

export const mockProjectReportProvider: ProjectReportProvider = async () => {
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
  const distribution = Object.fromEntries(ratings.map(rating => [
    rating.key, departments.reduce((sum, department) => sum + department.counts[rating.key], 0),
  ]))
  return { source: 'mock', totalParticipants: 124, ratings, distribution, heatLevels: heatLevels([1, 1, 1, 2, 2, 1, 1]), departments }
}
