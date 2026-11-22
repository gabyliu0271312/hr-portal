import type { PerformanceWorkbenchTaskPeoplePage, PerformanceWorkbenchTaskPerson, ProjectMatrix, ProjectMatrixRow } from '@/api/performance'
import type { ProjectReportComparisonData, ProjectReportComparisonQuery, ProjectReportDimension, ProjectStatisticsReport, ReportIndicator, ReportRating } from '../projectStatisticsReport'

export interface CalibrationAnalysisScope {
  scope_key: string
  project_id: number
  node_id: string
  phase_id: string | null
  cycle_id?: number
}
export type CalibrationAnalysisMember = PerformanceWorkbenchTaskPerson & { project_id?: number; root_review_id?: number; can_view_detail?: boolean }
export interface CalibrationScopeAnalysisData {
  items: CalibrationAnalysisMember[]
  rating_columns: ReportIndicator[]
}
export type CalibrationPeoplePageLoader = (page: number, pageSize: number) => Promise<PerformanceWorkbenchTaskPeoplePage>

export async function loadCalibrationScopeAnalysis(loader: CalibrationPeoplePageLoader, signal?: AbortSignal): Promise<CalibrationScopeAnalysisData> {
  const items: CalibrationAnalysisMember[] = []
  const columns = new Map<string, ReportIndicator>()
  let total: number | undefined
  for (let page = 1; ; page++) {
    signal?.throwIfAborted()
    const result = await loader(page, 100)
    signal?.throwIfAborted()
    if (!Number.isInteger(result.total) || result.total < 0 || !Array.isArray(result.items) || result.items.length > 100) throw new Error('INVALID_SCOPE_PAGE')
    if (total !== undefined && result.total !== total) throw new Error('SCOPE_CHANGED_DURING_PAGINATION')
    total = result.total
    for (const column of result.rating_columns || []) columns.set(column.key, column)
    items.push(...result.items)
    if (items.length > total || (!result.items.length && items.length < total)) throw new Error('INCOMPLETE_SCOPE_PAGE')
    if (items.length === total) break
  }
  for (const member of items) {
    for (const column of member.rating_columns || []) if (!columns.has(column.key)) columns.set(column.key, column)
  }
  return { items, rating_columns: [...columns.values()] }
}

export function calibrationMemberKey(member: CalibrationAnalysisMember, projectId: number) {
  return JSON.stringify([member.project_id ?? projectId, member.employee_no])
}
export function uniqueCalibrationMembers(data: CalibrationScopeAnalysisData, projectId: number) {
  return [...new Map(data.items.map(member => [calibrationMemberKey(member, projectId), member])).values()]
}
export function calibrationAnalysisIndicators(data: CalibrationScopeAnalysisData): ReportIndicator[] {
  const columns = new Map(data.rating_columns.map(column => [column.key, column]))
  for (const member of data.items) {
    for (const column of member.rating_columns || []) if (!columns.has(column.key)) columns.set(column.key, column)
    for (const key of Object.keys(member.ratings || {})) if (!columns.has(key)) columns.set(key, { key, label: key })
  }
  return [...columns.values()]
}
function ratingValue(member: CalibrationAnalysisMember, key: string | undefined) {
  return key ? member.ratings?.[key] : undefined
}
function visibleField(member: CalibrationAnalysisMember, key: keyof PerformanceWorkbenchTaskPerson) {
  if (member.visible_profile_fields && !member.visible_profile_fields.includes(key)) return undefined
  const value = member[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}
function ratingOptions(members: CalibrationAnalysisMember[], indicatorKey: string | undefined): ReportRating[] {
  const options = new Map<string, ReportRating>()
  for (const member of members) {
    const rating = ratingValue(member, indicatorKey)
    if (rating?.label && !options.has(rating.label)) options.set(rating.label, { key: rating.label, label: rating.label, ...(rating.color ? { color: rating.color } : {}) })
  }
  return [...options.values()]
}

export function calibrationScopeMatrix(data: CalibrationScopeAnalysisData, projectId: number, indicatorKey = calibrationAnalysisIndicators(data)[0]?.key): ProjectMatrix {
  const members = uniqueCalibrationMembers(data, projectId)
  const ratings = ratingOptions(members, indicatorKey).map(rating => ({ ...rating, color: rating.color ?? null }))
  const pending = new Map<string, ProjectMatrixRow>()
  const completed = new Map<string, ProjectMatrixRow>()
  let completedCount = 0
  for (const member of members) {
    const value = ratingValue(member, indicatorKey)
    const level = visibleField(member, 'position_level') || '职级未提供'
    const rows = value?.label ? completed : pending
    const key = value?.label || 'pending'
    let row = rows.get(level)
    if (!row) { row = { level, total: 0, cells: Object.create(null) }; rows.set(level, row) }
    row.total++
    if (!row.cells[key]) row.cells[key] = { count: 0, people: [] }
    row.cells[key].count++
    row.cells[key].people.push({ ...member, project_id: member.project_id ?? projectId, employment_status: visibleField(member, 'employment_status') ?? null, can_view_detail: member.can_view_detail !== false })
    if (value?.label) completedCount++
  }
  return { source: 'template_final_result', dimension: indicatorKey || 'rating', display_modes: ['name', 'count'], total: members.length, completed_count: completedCount, pending_count: members.length - completedCount, ratings, pending_rows: [...pending.values()], completed_rows: [...completed.values()] }
}

const dimensionFields = { department: 'department', team: 'direct_supervisor', sequence: 'job_sequence', level: 'position_level', tenure: 'hire_date' } as const
const dimensionLabels = { department: '部门', team: '上级', sequence: '序列', level: '岗位职级', tenure: '司龄' }
function tenureBucket(value: string, today: Date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return undefined
  const [, year, month, day] = match.map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date > today) return undefined
  const months = (today.getFullYear() - year) * 12 + today.getMonth() - month + 1 - (today.getDate() < day ? 1 : 0)
  return months >= 36 ? '3年以上' : months >= 12 ? '1-3年内（不含3年）' : months >= 6 ? '6个月-1年（不含1年）' : months >= 3 ? '3-6个月（不含6个月）' : '入职未满3个月'
}
export function calibrationScopeStatistics(data: CalibrationScopeAnalysisData, projectId: number, dimension: ProjectReportDimension = 'department', indicatorKey = calibrationAnalysisIndicators(data)[0]?.key, today = new Date()): ProjectStatisticsReport {
  const members = uniqueCalibrationMembers(data, projectId)
  const indicators = calibrationAnalysisIndicators(data)
  if (indicatorKey && !indicators.some(indicator => indicator.key === indicatorKey)) throw new Error('UNKNOWN_SCOPE_INDICATOR')
  const ratings = ratingOptions(members, indicatorKey)
  const distribution: Record<string, number> = Object.create(null)
  for (const rating of ratings) distribution[rating.key] = 0
  const groups = new Map<string, Record<string, number>>()
  for (const member of members) {
    const rating = ratingValue(member, indicatorKey)?.label
    if (!rating) continue
    distribution[rating]++
    const value = visibleField(member, dimensionFields[dimension])
    const label = (dimension === 'tenure' && value ? tenureBucket(value, today) : value) || `${dimensionLabels[dimension]}未提供`
    if (!groups.has(label)) groups.set(label, Object.create(null))
    const counts = groups.get(label)!
    counts[rating] = (counts[rating] || 0) + 1
  }
  return { source: 'api', dimension, rowLabel: dimensionLabels[dimension], showSummary: true, totalParticipants: members.length, ratings, distribution, departments: [...groups].map(([name, counts]) => ({ id: JSON.stringify([dimension, name]), name, counts })), indicators, indicatorKey, indicatorLabel: indicators.find(indicator => indicator.key === indicatorKey)?.label }
}

export function calibrationScopeComparison(data: CalibrationScopeAnalysisData, projectId: number, query: ProjectReportComparisonQuery): ProjectReportComparisonData {
  const members = uniqueCalibrationMembers(data, projectId)
  const indicators = calibrationAnalysisIndicators(data)
  const unavailable = (emptyReason: string): ProjectReportComparisonData => ({ source: 'api', total: 0, ratings: [], counts: [], heatLevels: [], emptyReason })
  if (query.kind === 'self-final') return unavailable('当前任务成员接口未提供自评数据，无法进行自评与终评对比')
  if (query.kind === 'history') return unavailable('当前任务成员接口未提供历史绩效数据，无法进行历史对比')
  if (indicators.length < 2) return unavailable('当前合法范围可用评估维度不足两个，无法进行维度对比')
  const xKey = query.xKey || indicators[0].key
  const yKey = query.yKey || indicators.find(indicator => indicator.key !== xKey)?.key
  if (!indicators.some(indicator => indicator.key === xKey) || !indicators.some(indicator => indicator.key === yKey) || xKey === yKey) return unavailable('请选择当前合法范围内两个不同的评估维度')
  const xRatings = ratingOptions(members, xKey)
  const yRatings = ratingOptions(members, yKey)
  const counts = yRatings.map(() => xRatings.map(() => 0))
  let total = 0
  for (const member of members) {
    const x = xRatings.findIndex(rating => rating.key === ratingValue(member, xKey)?.label)
    const y = yRatings.findIndex(rating => rating.key === ratingValue(member, yKey)?.label)
    if (x >= 0 && y >= 0) { counts[y][x]++; total++ }
  }
  return { source: 'api', total, ratings: [], xRatings, yRatings, counts, heatLevels: counts.map(row => row.map(() => 0)), xOptions: indicators, yOptions: indicators, xKey, yKey, xLabel: indicators.find(indicator => indicator.key === xKey)?.label, yLabel: indicators.find(indicator => indicator.key === yKey)?.label, emptyReason: total ? null : '当前合法范围没有同时具备所选两个维度评级的成员' }
}
