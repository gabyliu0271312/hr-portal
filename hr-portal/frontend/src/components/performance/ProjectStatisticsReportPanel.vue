<template>
  <section ref="root" class="project-report-root" aria-label="统计报表" :aria-busy="reportLoading">
    <PerformanceSurfaceCard class="report-surface" :embedded="embedded">
      <div class="report-wrapper" :class="{ 'directory-collapsed': collapsed }">
        <div class="report-top-spacer" aria-hidden="true" />
        <div class="report-filter-overlay">
          <div class="report-sticky-filter">
            <button type="button" class="report-filter-button" @click="requestFilter"><FilterOutlinedIcon />筛选</button>
            <p v-if="feedback" class="report-feedback" role="status">{{ feedback }}</p>
          </div>
        </div>
        <div class="report-layout">
          <div class="report-contents">
            <template v-for="group in reportGroups" :key="group.key">
              <h2 class="report-primary-heading"><span>{{ group.label }}</span></h2>
              <section v-for="section in group.sections" :key="section.key" :data-report-section="section.key" class="report-section" :aria-label="section.label">
                <PerformanceReportSectionTitle :label="section.label" :info="reportSectionInfo[section.key]" />
                <template v-if="section.key === 'overview'">
                  <p v-if="loadingDimensions.department && !reports.department" class="report-state" role="status">正在加载统计报表…</p>
                  <div v-else-if="errors.department" class="report-state" role="alert"><p>{{ errors.department }}</p><button type="button" @click="loadDimension('department')">重新加载</button></div>
                  <ProjectReportDistribution v-else-if="reports.department" :report="reports.department" :comparison-reports="reports" @compare="loadComparisonDimension" @people="selection => openStatisticsPeople(selection.dimension, selection)" @indicator-change="changeIndicator('department', $event)" />
                  <p v-if="comparisonDimensionLoading" class="report-state" role="status">正在加载对比数据…</p>
                  <p v-if="comparisonDimensionError" class="report-state" role="alert">{{ comparisonDimensionError }}</p>
                </template>
                <template v-else-if="isDimension(section.key)">
                  <p v-if="loadingDimensions[section.key]" class="report-placeholder" role="status">正在加载{{ section.label }}…</p>
                  <div v-else-if="errors[section.key]" class="report-state" role="alert"><p>{{ errors[section.key] }}</p><button type="button" @click="loadDimension(section.key)">重新加载</button></div>
                  <template v-else-if="reports[section.key]">
                    <p v-if="section.key === 'tenure'" class="report-source-notice">数据来源：统计 API（入职日期，按当前日期计算）</p>
                    <ProjectReportMatrix :report="reports[section.key]!" @people="openStatisticsPeople(section.key, $event)" @indicator-change="changeIndicator(section.key, $event)" />
                  </template>
                  <p v-else class="report-placeholder">统计数据尚未加载</p>
                </template>
                <template v-else-if="isComparison(section.key)">
                  <p v-if="comparisonLoading[section.key]" class="report-placeholder" role="status">正在加载{{ section.label }}…</p>
                  <div v-else-if="comparisonErrors[section.key]" class="report-state" role="alert"><p>{{ comparisonErrors[section.key] }}</p><button type="button" @click="loadComparison(section.key)">重新加载</button></div>
                  <ProjectReportComparison v-else-if="comparisons[section.key]" :kind="section.key" :cycle-name="cycleName" :comparison="comparisons[section.key]!" :load-history="loadHistoryOptions" :allow-examples="allowExamples" @cell="openComparisonPeople(section.key, $event)" @change="changeComparison(section.key, $event)" />
                  <p v-else class="report-placeholder">{{ section.label }}数据尚未加载</p>
                </template>
                <PerformanceReportCommentButton :cycle-id="cycleId" :section="section.key" :scope="noteScope" :identity-key="String(reportStore.cacheVersion)" />
              </section>
            </template>
          </div>
          <ProjectReportNavigation v-model:collapsed="collapsed" :active-key="activeKey" :menu-height="menuHeight" @select="select" />
        </div>
      </div>
    </PerformanceSurfaceCard>
    <MatrixPeopleDialog v-if="peopleSelection" v-model="peopleOpen" :project-id="0" :cycle-name="cycleName || '当前周期'" :description="peopleSelection.description" :provider="peopleProvider" @select-member="selectPerson" />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import PerformanceSurfaceCard from './PerformanceSurfaceCard.vue'
import FilterOutlinedIcon from './FilterOutlinedIcon.vue'
import PerformanceReportSectionTitle from './PerformanceReportSectionTitle.vue'
import ProjectReportNavigation from './ProjectReportNavigation.vue'
import ProjectReportDistribution from './ProjectReportDistribution.vue'
import ProjectReportComparison from './ProjectReportComparison.vue'
import ProjectReportMatrix from './ProjectReportMatrix.vue'
import PerformanceReportCommentButton from './PerformanceReportCommentButton.vue'
import type { ReportNoteScope } from '@/api/performanceReportNotes'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import { projectManagementApi, type ReportPeopleQuery, type PerformancePeopleProvider, type PeoplePageQuery, type ProjectMember } from '@/api/performance'
import MatrixPeopleDialog from './MatrixPeopleDialog.vue'
import { reportGroups, reportSectionInfo, type ProjectReportComparisonData, type ProjectReportComparisonKind, type ProjectReportComparisonProvider, type ProjectReportComparisonQuery, type ProjectReportDimension, type ProjectReportProvider, type ProjectStatisticsReport } from './projectStatisticsReport'
import { useProjectReportNavigation } from './useProjectReportNavigation'

const props = withDefaults(defineProps<{ cycleId: number; cycleName?: string; provider?: ProjectReportProvider; selfFinalProvider?: () => Promise<ProjectReportComparisonData>; comparisonProvider?: ProjectReportComparisonProvider; allowExamples?: boolean; embedded?: boolean; noteScope?: ReportNoteScope; peopleProvider?: (selection: ReportPeopleQuery, query: PeoplePageQuery) => ReturnType<PerformancePeopleProvider> }>(), { allowExamples: true, noteScope: () => ({}) })
const reportStore = usePerformanceProjectContextStore()
const emit = defineEmits<{ filter: []; compare: []; 'open-member': [member: ProjectMember] }>()
const peopleOpen = ref(false)
const peopleSelection = ref<{ query: ReportPeopleQuery; description: string } | null>(null)
const peopleScopeKey = computed(() => JSON.stringify(props.noteScope))
const peopleProvider = computed<PerformancePeopleProvider>(() => {
  const cycleId = props.cycleId
  const selection = peopleSelection.value?.query
  const scope = JSON.parse(peopleScopeKey.value) as ReportNoteScope
  const provider = props.peopleProvider
  return query => selection ? provider ? provider(selection, query) : projectManagementApi.reportPeople(cycleId, selection, query, scope) : Promise.reject(new Error('REPORT_SELECTION_REQUIRED'))
})
function openStatisticsPeople(dimension: ProjectReportDimension, selection: { rowKey?: string; rowLabel: string; ratingKey?: string; ratingLabel?: string; count?: number }) {
  const report = reports.value[dimension]
  if (report?.source !== 'api' || selection.count === 0) return
  peopleSelection.value = { query: { type: 'statistics', dimension, indicatorKey: report.indicatorKey, rowKey: selection.rowKey, ratingKey: selection.ratingKey }, description: `符合「${props.cycleName || '当前周期'}，${report.indicatorLabel || '绩效评级'}，${selection.rowLabel}${selection.ratingLabel ? `，${selection.ratingLabel}` : ''}」的员工` }
  peopleOpen.value = true
}
function openComparisonPeople(kind: ProjectReportComparisonKind, cell: { rowKey: string; columnKey: string; count: number }) {
  const report = comparisons.value[kind]
  if (report?.source !== 'api' || cell.count <= 0) return
  const xRatings = report.xRatings || report.ratings
  const yRatings = report.yRatings || report.ratings
  peopleSelection.value = { query: { type: 'comparison', kind, xKey: report.xKey, yKey: report.yKey, ...(report.historyCycleId ? { historyCycleId: report.historyCycleId } : {}), xRatingKey: cell.columnKey, yRatingKey: cell.rowKey }, description: `符合「${props.cycleName || '当前周期'}，${report.xLabel || 'X轴'}：${xRatings.find(r => r.key === cell.columnKey)?.label || cell.columnKey}，${report.yLabel || 'Y轴'}：${yRatings.find(r => r.key === cell.rowKey)?.label || cell.rowKey}」的员工` }
  peopleOpen.value = true
}
function selectPerson(member: ProjectMember) { if (member.can_view_detail) emit('open-member', member) }
const root = ref<HTMLElement | null>(null)
const collapsed = ref(false)
const reports = ref<Partial<Record<ProjectReportDimension, ProjectStatisticsReport>>>({})
const indicators = ref<Partial<Record<ProjectReportDimension, string>>>({})
const loadingDimensions = ref<Partial<Record<ProjectReportDimension, boolean>>>({})
const errors = ref<Partial<Record<ProjectReportDimension, string>>>({})
const comparisons = ref<Partial<Record<ProjectReportComparisonKind, ProjectReportComparisonData>>>({})
const comparisonQueries = ref<Partial<Record<ProjectReportComparisonKind, ProjectReportComparisonQuery>>>({})
const comparisonLoading = ref<Partial<Record<ProjectReportComparisonKind, boolean>>>({})
const comparisonErrors = ref<Partial<Record<ProjectReportComparisonKind, string>>>({})
const comparisonDimensionLoading = ref(false)
const comparisonDimensionError = ref('')
const feedback = ref('')
const { activeKey, visibleKeys, menuHeight, select, refresh } = useProjectReportNavigation(root)
const comparisonDimensions = ref<Array<'team' | 'department' | 'sequence'>>([])
const requestIds: Record<ProjectReportDimension, number> = { department: 0, team: 0, sequence: 0, level: 0, tenure: 0 }
const comparisonIds: Record<ProjectReportComparisonKind, number> = { 'self-final': 0, dimension: 0, history: 0 }
let generation = 0
const reportLoading = computed(() => Object.values(loadingDimensions.value).some(Boolean) || Object.values(comparisonLoading.value).some(Boolean))
function isDimension(key: string): key is ProjectReportDimension { return key in requestIds }
function isComparison(key: string): key is ProjectReportComparisonKind { return key in comparisonIds }
function failureMessage(cause: unknown, label: string) {
  const failure = cause as { response?: { status?: number; data?: { detail?: string } } }
  if (failure.response?.status === 403) return `无权查看当前周期的${label}`
  const detail = failure.response?.data?.detail
  if (detail === 'RATING_SCALE_CONFLICT' || detail === 'INDICATOR_CONFLICT') return '项目评级体系不一致，无法合并统计'
  if (detail === 'CYCLE_MEMBER_OVERLAP_UNRESOLVED') return '多个项目存在重复成员，尚未配置跨项目评级合成规则'
  return `${label}加载失败，请稍后重试`
}

async function loadDimension(dimension: ProjectReportDimension, preserve = false) {
  const id = ++requestIds[dimension]
  const indicatorKey = indicators.value[dimension]
  if (!preserve) delete reports.value[dimension]
  loadingDimensions.value = { ...loadingDimensions.value, [dimension]: true }
  errors.value = { ...errors.value, [dimension]: '' }
  try {
    const query = { cycleId: props.cycleId, dimension, ...(indicatorKey ? { indicatorKey } : {}) }
    const value = props.provider ? await props.provider(query)
      : await reportStore.loadReport(`statistics:${props.cycleId}:${dimension}:${indicatorKey || ''}`, () => projectManagementApi.levelStatistics(props.cycleId, dimension, undefined, indicatorKey))
    const report = { ...value, ratings: value.ratings.map(rating => ({ ...rating, color: rating.color ?? undefined })) }
    if (report.source !== 'api' || report.dimension !== dimension || !report.showSummary) throw new Error('INVALID_REPORT')
    if (id === requestIds[dimension]) reports.value = { ...reports.value, [dimension]: report }
  } catch (cause) {
    if (id === requestIds[dimension]) errors.value = { ...errors.value, [dimension]: failureMessage(cause, '统计报表') }
  } finally {
    if (id === requestIds[dimension]) {
      loadingDimensions.value = { ...loadingDimensions.value, [dimension]: false }
      void refresh()
    }
  }
}

async function loadComparison(kind: ProjectReportComparisonKind) {
  const id = ++comparisonIds[kind]
  const query = comparisonQueries.value[kind] || { kind }
  comparisonLoading.value = { ...comparisonLoading.value, [kind]: true }
  comparisonErrors.value = { ...comparisonErrors.value, [kind]: '' }
  try {
    const value = props.comparisonProvider ? await props.comparisonProvider(query)
      : kind === 'self-final' && props.selfFinalProvider ? await props.selfFinalProvider()
      : await reportStore.loadReport(`comparison:${props.cycleId}:${JSON.stringify(query)}`, () => projectManagementApi.comparison(props.cycleId, query))
    const normalize = (ratings: typeof value.ratings) => ratings.map(rating => ({ ...rating, color: rating.color ?? undefined }))
    const report = { ...value, ratings: normalize(value.ratings), xRatings: value.xRatings ? normalize(value.xRatings) : undefined, yRatings: value.yRatings ? normalize(value.yRatings) : undefined }
    if (id === comparisonIds[kind]) comparisons.value = { ...comparisons.value, [kind]: report }
  } catch (cause) {
    if (id === comparisonIds[kind]) comparisonErrors.value = { ...comparisonErrors.value, [kind]: failureMessage(cause, '差异分析') }
  } finally {
    if (id === comparisonIds[kind]) {
      comparisonLoading.value = { ...comparisonLoading.value, [kind]: false }
      void refresh()
    }
  }
}
async function loadHistoryOptions(cycleId: number) {
  const query: ProjectReportComparisonQuery = { kind: 'history', historyCycleId: cycleId }
  const report = props.comparisonProvider ? await props.comparisonProvider(query) : await projectManagementApi.comparison(props.cycleId, query)
  return report.xOptions || []
}
function changeComparison(kind: ProjectReportComparisonKind, change: Omit<Partial<ProjectReportComparisonQuery>, 'kind'>) {
  peopleOpen.value = false
  peopleSelection.value = null
  const current = comparisons.value[kind]
  comparisonQueries.value[kind] = { kind, xKey: current?.xKey, yKey: current?.yKey, ...(current?.historyCycleId ? { historyCycleId: current.historyCycleId } : {}), ...change, ...(change.historyCycleId && change.xKey === undefined ? { xKey: undefined } : {}) }
  void loadComparison(kind)
}
async function changeIndicator(dimension: ProjectReportDimension, key: string) {
  peopleOpen.value = false
  peopleSelection.value = null
  indicators.value[dimension] = key
  const currentGeneration = generation
  if (dimension === 'department') {
    for (const comparisonDimension of comparisonDimensions.value) {
      if (comparisonDimension === 'department') continue
      requestIds[comparisonDimension]++
      delete reports.value[comparisonDimension]
      loadingDimensions.value[comparisonDimension] = false
    }
  }
  await loadDimension(dimension, true)
  if (dimension !== 'department' || currentGeneration !== generation || reports.value.department?.indicatorKey !== key) return
  await Promise.all(comparisonDimensions.value.filter(value => value !== 'department').map(loadComparisonDimension))
}
async function loadComparisonDimension(dimension: 'team' | 'department' | 'sequence') {
  emit('compare')
  if (!comparisonDimensions.value.includes(dimension)) comparisonDimensions.value.push(dimension)
  comparisonDimensionError.value = ''
  if (reports.value[dimension] && reports.value[dimension]?.indicatorKey === reports.value.department?.indicatorKey) return
  const currentGeneration = generation
  comparisonDimensionLoading.value = true
  indicators.value[dimension] = reports.value.department?.indicatorKey
  await loadDimension(dimension)
  if (currentGeneration !== generation) return
  comparisonDimensionLoading.value = false
  comparisonDimensionError.value = errors.value[dimension] || ''
}
function requestFilter() {
  feedback.value = '筛选入口已预留，筛选条件尚未接入。'
  emit('filter')
}
watch([() => props.cycleId, () => props.provider, () => props.selfFinalProvider, () => props.comparisonProvider, () => props.peopleProvider, peopleScopeKey, () => reportStore.cacheVersion], () => {
  generation++
  peopleOpen.value = false
  peopleSelection.value = null
  for (const dimension of Object.keys(requestIds) as ProjectReportDimension[]) requestIds[dimension]++
  for (const kind of Object.keys(comparisonIds) as ProjectReportComparisonKind[]) comparisonIds[kind]++
  reports.value = {}
  indicators.value = {}
  loadingDimensions.value = {}
  errors.value = {}
  comparisons.value = {}
  comparisonDimensions.value = []
  comparisonQueries.value = {}
  comparisonLoading.value = {}
  comparisonErrors.value = {}
  comparisonDimensionLoading.value = false
  comparisonDimensionError.value = ''
  feedback.value = ''
  collapsed.value = false
  activeKey.value = 'overview'
  void loadDimension('department')
}, { immediate: true })
function ensureSection(key: string) {
  if (isDimension(key) && !reports.value[key] && !loadingDimensions.value[key] && !errors.value[key]) void loadDimension(key)
  if (isComparison(key) && !comparisons.value[key] && !comparisonLoading.value[key] && !comparisonErrors.value[key]) void loadComparison(key)
}
watch(activeKey, ensureSection)
watch(visibleKeys, keys => keys.forEach(ensureSection))
watch(collapsed, () => void refresh())
onBeforeUnmount(() => {
  generation++
  peopleOpen.value = false
  peopleSelection.value = null
  for (const dimension of Object.keys(requestIds) as ProjectReportDimension[]) requestIds[dimension]++
  for (const kind of Object.keys(comparisonIds) as ProjectReportComparisonKind[]) comparisonIds[kind]++
})
</script>

<style scoped>
.project-report-root { --report-sticky-offset: 68px; --report-sticky-top: calc(var(--report-sticky-offset) - var(--report-scroll-padding, 0px)); min-width: 0; margin-bottom: 20px; }
.report-surface { padding: 0 20px 20px; }
.report-surface.surface-card--embedded { padding: 0; border-radius: 0; box-shadow: none; }
.report-wrapper { position: relative; min-width: 0; }
.report-top-spacer { position: sticky; top: calc(56px - var(--report-scroll-padding, 0px)); z-index: 10; height: 20px; background: #fff; }
.report-layout { display: flex; align-items: flex-start; min-width: 0; }
.report-contents { display: flex; flex: 1 1 0%; min-width: 0; flex-direction: column; margin-right: 36px; }
.directory-collapsed .report-contents { margin-right: 0; }
.report-primary-heading { position: sticky; top: var(--report-sticky-top); z-index: 10; box-sizing: border-box; height: 48px; flex: 0 0 48px; margin: 0; padding: 0 0 16px; background: #fff; font-size: 18px; font-weight: 600; line-height: 32px; }
.project-report-root:not([data-report-scroll]) .report-top-spacer, .project-report-root:not([data-report-scroll]) .report-primary-heading { position: relative; top: auto; }
.report-primary-heading span { display: block; max-width: calc(100% - 120px); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.report-section { margin-bottom: 40px; min-width: 0; }
.report-section:last-child { margin-bottom: 0; }
.report-filter-overlay { position: absolute; inset: 20px 235px 0 120px; z-index: 19; padding-right: 1px; pointer-events: none; }
.directory-collapsed .report-filter-overlay { right: 20px; }
.report-sticky-filter { position: sticky; top: var(--report-sticky-top); display: flex; justify-content: flex-end; height: 32px; pointer-events: none; }
.report-filter-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: 0 0 80px; width: 80px; height: 32px; box-sizing: border-box; padding: 4px 11px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; font: inherit; line-height: 22px; cursor: pointer; pointer-events: auto; }
.report-filter-button :deep(svg), .report-filter-button :deep(.filter-outlined-icon) { width: 14px; height: 14px; }
.report-filter-button:hover { background: #f2f3f5; }
.report-filter-button:focus-visible { outline: 2px solid #3370ff; outline-offset: 2px; }
.report-source-notice { margin: 0 0 20px; color: #646a73; font-size: 12px; }
.report-feedback { position: absolute; top: 36px; right: 0; width: max-content; max-width: 100%; box-sizing: border-box; padding: 10px 12px; margin: 0; background: #f5f7fa; border: 1px solid #dee0e3; border-radius: 6px; color: #646a73; font-size: 13px; }
.report-state { padding: 24px 0; color: #646a73; text-align: center; }
.report-state button { padding: 6px 12px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: var(--color-primary); cursor: pointer; }
.report-placeholder { display: flex; flex-direction: column; justify-content: center; gap: 8px; margin: 0; padding: 32px 20px; background: #f8f9fa; border-radius: 6px; color: #646a73; font-size: 14px; }
</style>
