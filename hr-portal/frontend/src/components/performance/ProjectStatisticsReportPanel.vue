<template>
  <section ref="root" class="project-report-root" aria-label="统计报表" :aria-busy="reportLoading">
    <PerformanceSurfaceCard class="report-surface">
      <div class="report-wrapper" :class="{ 'directory-collapsed': collapsed }">
        <div class="report-top-spacer" aria-hidden="true" />
        <div class="report-filter-overlay">
          <div class="report-sticky-filter">
            <button type="button" class="report-filter-button" @click="requestAction('filter')"><FilterOutlinedIcon />筛选</button>
            <p v-if="feedback" class="report-feedback" role="status">{{ feedback }}</p>
          </div>
        </div>
        <div class="report-layout">
          <div class="report-contents">
            <template v-for="(group, groupIndex) in reportGroups" :key="group.key">
              <h2 class="report-primary-heading"><span>{{ group.label }}</span></h2>
              <section v-for="(section, sectionIndex) in group.sections" :key="section.key" :data-report-section="section.key" class="report-section" :aria-label="section.label">
                <PerformanceReportSectionTitle :label="section.label" />
                <template v-if="groupIndex === 0 && sectionIndex === 0">
                  <p v-if="data?.source === 'mock'" class="report-source-notice" role="note"><strong>模拟数据</strong> · 总览、部门、团队、序列仅供布局预览，不代表{{ cycleName || '当前周期' }}的真实绩效结果；级别统计单独接入真实数据。</p>
                  <p v-else-if="data?.source === 'api'" class="report-source-notice">数据来源：统计 API</p>
                </template>
                <div v-if="section.key === 'overview'">
                  <p v-if="loading" class="report-state" role="status">正在加载统计报表…</p>
                  <div v-else-if="error" class="report-state" role="alert"><p>{{ error }}</p><button type="button" @click="load">重新加载</button></div>
                  <ProjectReportDistribution v-else-if="data" :report="data" @compare="requestAction('compare')" />
                </div>
                <ProjectReportMatrix v-else-if="section.key === 'department' && reports.department" :report="reports.department" />
                <div v-else-if="section.key === 'department' && errors.department" class="report-state" role="alert"><p>{{ errors.department }}</p><button type="button" @click="load">重新加载</button></div>
                <p v-else-if="section.key === 'department'" class="report-placeholder">{{ loading ? '正在加载部门统计…' : '统计数据尚未加载' }}</p>
                <ProjectReportMatrix v-else-if="section.key === 'team' && reports.team" :report="reports.team" />
                <div v-else-if="section.key === 'team' && errors.team" class="report-state" role="alert"><p>{{ errors.team }}</p><button type="button" @click="loadDimension('team')">重新加载</button></div>
                <p v-else-if="section.key === 'team'" class="report-placeholder">{{ loadingDimensions.team ? '正在加载团队统计…' : '统计数据尚未加载' }}</p>
                <ProjectReportMatrix v-else-if="section.key === 'sequence' && reports.sequence" :report="reports.sequence" />
                <div v-else-if="section.key === 'sequence' && errors.sequence" class="report-state" role="alert"><p>{{ errors.sequence }}</p><button type="button" @click="loadDimension('sequence')">重新加载</button></div>
                <p v-else-if="section.key === 'sequence'" class="report-placeholder">{{ loadingDimensions.sequence ? '正在加载序列统计…' : '统计数据尚未加载' }}</p>
                <template v-else-if="section.key === 'tenure'">
                  <p v-if="loadingDimensions.tenure" class="report-placeholder" role="status">正在加载司龄统计…</p>
                  <div v-else-if="errors.tenure" class="report-state" role="alert"><p>{{ errors.tenure }}</p><button type="button" @click="loadDimension('tenure')">重新加载</button></div>
                  <template v-else-if="reports.tenure">
                    <p class="report-source-notice">数据来源：统计 API（入职日期，按当前日期计算）</p>
                    <ProjectReportMatrix :report="reports.tenure" />
                  </template>
                  <p v-else class="report-placeholder">统计数据尚未加载</p>
                </template>
                <template v-else-if="section.key === 'level'">
                  <p v-if="loadingDimensions.level" class="report-placeholder" role="status">正在加载级别统计…</p>
                  <div v-else-if="errors.level" class="report-state" role="alert"><p>{{ errors.level }}</p><button type="button" @click="loadDimension('level')">重新加载</button></div>
                  <template v-else-if="reports.level">
                    <p class="report-source-notice">数据来源：统计 API（实时岗位职级，项目快照人员）</p>
                    <ProjectReportMatrix :report="reports.level" />
                  </template>
                  <p v-else class="report-placeholder">统计数据尚未加载</p>
                </template>
                <ProjectReportComparison v-else-if="section.key === 'self-final' && data" :comparison="selfFinalComparison" />
                <div v-else class="report-placeholder"><span>{{ section.label }}报表内容预留</span><small>当前仅搭建章节框架，具体统计内容待后续接入。</small></div>
              </section>
            </template>
          </div>
          <ProjectReportNavigation v-model:collapsed="collapsed" :active-key="activeKey" :menu-height="menuHeight" @select="select" />
        </div>
      </div>
    </PerformanceSurfaceCard>
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
import { projectManagementApi } from '@/api/performance'
import { mockProjectReportComparison, mockProjectReportProvider, reportGroups, type ProjectReportDimension, type ProjectReportProvider, type ProjectStatisticsReport } from './projectStatisticsReport'
import { useProjectReportNavigation } from './useProjectReportNavigation'

const defaultProvider: ProjectReportProvider = async ({ cycleId, dimension = 'department' }) => {
  if (dimension === 'level' || dimension === 'tenure') {
    const report = await projectManagementApi.levelStatistics(cycleId, dimension)
    return { ...report, ratings: report.ratings.map(rating => ({ ...rating, color: rating.color ?? undefined })) }
  }
  return mockProjectReportProvider({ cycleId, dimension })
}

const props = defineProps<{ cycleId: number; cycleName?: string; provider?: ProjectReportProvider }>()
const emit = defineEmits<{ filter: []; compare: [] }>()
const root = ref<HTMLElement | null>(null)
const collapsed = ref(false)
const reports = ref<Partial<Record<ProjectReportDimension, ProjectStatisticsReport>>>({})
const loadingDimensions = ref<Partial<Record<ProjectReportDimension, boolean>>>({})
const errors = ref<Partial<Record<ProjectReportDimension, string>>>({})
const feedback = ref('')
const { activeKey, menuHeight, select, refresh } = useProjectReportNavigation(root)
const requestIds: Record<ProjectReportDimension, number> = { department: 0, team: 0, sequence: 0, level: 0, tenure: 0 }
const data = computed(() => reports.value.department ?? null)
const loading = computed(() => Boolean(loadingDimensions.value.department))
const error = computed(() => errors.value.department || '')
const reportLoading = computed(() => Object.values(loadingDimensions.value).some(Boolean))
const selfFinalComparison = mockProjectReportComparison()

async function loadDimension(dimension: ProjectReportDimension) {
  const id = ++requestIds[dimension]
  delete reports.value[dimension]
  loadingDimensions.value = { ...loadingDimensions.value, [dimension]: true }
  errors.value = { ...errors.value, [dimension]: '' }
  try {
    const query = dimension === 'department' ? { cycleId: props.cycleId } : { cycleId: props.cycleId, dimension }
    const report = await (props.provider ?? defaultProvider)(query)
    if ((dimension === 'level' || dimension === 'tenure') && (report.source !== 'api' || report.dimension !== dimension || !report.showSummary || report.departments.some(row => row.children?.length))) {
      throw new Error(`INVALID_${dimension.toUpperCase()}_REPORT`)
    }
    if (id === requestIds[dimension]) reports.value = { ...reports.value, [dimension]: report }
  } catch (cause) {
    const failure = cause as { response?: { status?: number; data?: { detail?: string } } }
    const detail = failure.response?.data?.detail
    const message = failure.response?.status === 403 ? '无权查看当前周期的级别统计' :
      detail === 'RATING_SCALE_CONFLICT' ? '项目评级体系不一致，无法合并级别统计' :
      detail === 'CYCLE_MEMBER_OVERLAP_UNRESOLVED' ? '多个项目存在重复成员，尚未配置跨项目评级合成规则' :
      dimension === 'level' ? '级别统计加载失败，请稍后重试' : dimension === 'tenure' ? '司龄统计加载失败，请稍后重试' :
      dimension === 'department' ? '统计报表加载失败，请稍后重试' : `${dimension === 'team' ? '团队' : '序列'}统计加载失败，请稍后重试`
    if (id === requestIds[dimension]) errors.value = { ...errors.value, [dimension]: message }
  } finally {
    if (id === requestIds[dimension]) {
      loadingDimensions.value = { ...loadingDimensions.value, [dimension]: false }
      void refresh()
    }
  }
}

function load() {
  return loadDimension('department')
}

function requestAction(action: 'filter' | 'compare') {
  feedback.value = action === 'filter' ? '筛选入口已预留，筛选条件尚未接入。' : '添加对比入口已预留，对比条件与计算尚未接入。'
  if (action === 'filter') emit('filter')
  else emit('compare')
}

watch(() => [props.cycleId, props.provider], () => {
  for (const dimension of Object.keys(requestIds) as ProjectReportDimension[]) requestIds[dimension]++
  feedback.value = ''
  collapsed.value = false
  reports.value = {}
  loadingDimensions.value = {}
  errors.value = {}
  activeKey.value = 'overview'
  void load()
}, { immediate: true })
watch(activeKey, (key) => {
  if (key === 'team' || key === 'sequence' || key === 'level' || key === 'tenure') {
    const dimension = key as ProjectReportDimension
    if (!reports.value[dimension] && !loadingDimensions.value[dimension]) void loadDimension(dimension)
  }
})
watch(collapsed, () => void refresh())
onBeforeUnmount(() => { requestIds.department++; requestIds.team++; requestIds.sequence++; requestIds.level++; requestIds.tenure++ })
</script>

<style scoped>
.project-report-root { --report-sticky-offset: 68px; --report-sticky-top: calc(var(--report-sticky-offset) - var(--report-scroll-padding, 0px)); min-width: 0; margin-bottom: 20px; }
.report-surface { padding: 0 20px 20px; }
.report-wrapper { position: relative; min-width: 0; }
.report-top-spacer { position: sticky; top: calc(56px - var(--report-scroll-padding, 0px)); z-index: 10; height: 20px; background: #fff; }
.report-layout { display: flex; align-items: flex-start; min-width: 0; }
.report-contents { display: flex; flex: 1 1 0%; min-width: 0; flex-direction: column; margin-right: 36px; }
.directory-collapsed .report-contents { margin-right: 0; }
.report-primary-heading { position: sticky; top: var(--report-sticky-top); z-index: 10; box-sizing: border-box; height: 48px; flex: 0 0 48px; margin: 0; padding: 0 0 16px; background: #fff; font-size: 18px; font-weight: 600; line-height: 32px; }
.report-primary-heading span { display: block; max-width: calc(100% - 120px); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.report-section { margin-bottom: 40px; min-width: 0; }
.report-section:last-child { margin-bottom: 0; }
.report-filter-overlay { position: absolute; inset: 20px 235px 0 120px; z-index: 19; padding-right: 1px; pointer-events: none; }
.directory-collapsed .report-filter-overlay { right: 20px; }
.report-sticky-filter { position: sticky; top: var(--report-sticky-top); display: flex; justify-content: flex-end; height: 32px; pointer-events: none; }
.report-filter-button { display: inline-flex; align-items: center; justify-content: center; gap: 4px; flex: 0 0 80px; width: 80px; height: 32px; box-sizing: border-box; padding: 4px 11px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; font: inherit; line-height: 22px; cursor: pointer; pointer-events: auto; }
.report-filter-button :deep(svg), .report-filter-button :deep(.filter-outlined-icon) { width: 14px; height: 14px; }
.report-filter-button:hover { background: #eff0f1; }
.report-filter-button:focus-visible { outline: 2px solid #3370ff; outline-offset: 2px; }
.report-source-notice { margin: 0 0 20px; color: #646a73; font-size: 12px; }
.report-source-notice strong { padding: 2px 6px; border-radius: 4px; background: #eff3ff; color: #1456f0; font-weight: 500; }
.report-feedback { position: absolute; top: 36px; right: 0; width: max-content; max-width: 100%; box-sizing: border-box; padding: 10px 12px; margin: 0; background: #f5f7fa; border: 1px solid #dee0e3; border-radius: 6px; color: #646a73; font-size: 13px; }
.report-state { padding: 24px 0; color: #646a73; text-align: center; }
.report-state button { padding: 6px 12px; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1456f0; cursor: pointer; }
.report-placeholder { display: flex; flex-direction: column; justify-content: center; gap: 8px; margin: 0; padding: 32px 20px; background: #f8f9fa; border-radius: 6px; color: #646a73; font-size: 14px; }
.report-placeholder small { font-size: 12px; color: #8f959e; }
</style>
