<template>
  <ProjectPerformanceMatrix v-if="tab === 'matrix'" :key="scopeKey" embedded readonly :project-id="projectId" :cycle-id="cycleId" :provider="matrixProvider" @open-member="openMember" />
  <ProjectStatisticsReportPanel v-else :key="scopeKey" embedded :cycle-id="cycleId" :provider="statisticsProvider" :comparison-provider="comparisonProvider" :people-provider="peopleProvider" :allow-examples="false" :allow-comments="false" @open-member="openMember" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceWorkbenchApi, type PeoplePageQuery, type PerformanceReviewMemberContext, type PerformanceReviewNode, type ReportPeopleQuery } from '@/api/performance'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import ProjectPerformanceMatrix from './ProjectPerformanceMatrix.vue'
import ProjectStatisticsReportPanel from './ProjectStatisticsReportPanel.vue'
import type { ProjectReportComparisonProvider, ProjectReportProvider } from './projectStatisticsReport'

const props = defineProps<{ projectId: number; cycleId: number; node: PerformanceReviewNode; tab: 'matrix' | 'reports' }>()
const emit = defineEmits<{ 'open-member': [member: PerformanceReviewMemberContext] }>()
const scopeKey = computed(() => JSON.stringify([props.projectId, props.cycleId, props.node.node_id, props.node.phase_id, employeeSwitchEpoch.value]))
const scope = computed(() => {
  const key = scopeKey.value
  const projectId = props.projectId, nodeId = props.node.node_id, phaseId = props.node.phase_id
  return { key, projectId, nodeId, phaseId }
})
const matrixProvider = computed(() => {
  const { projectId, nodeId, phaseId } = scope.value
  return () => performanceWorkbenchApi.taskAnalysisMatrix(projectId, nodeId, phaseId)
})
const statisticsProvider = computed<ProjectReportProvider>(() => {
  const { projectId, nodeId, phaseId } = scope.value
  return async ({ dimension, indicatorKey }) => {
    const report = await performanceWorkbenchApi.taskAnalysisStatistics(projectId, nodeId, dimension, indicatorKey, phaseId)
    return { ...report, ratings: report.ratings.map(rating => ({ ...rating, color: rating.color ?? undefined })) }
  }
})
const comparisonProvider = computed<ProjectReportComparisonProvider>(() => {
  const { projectId, nodeId, phaseId } = scope.value
  return async query => {
    const report = await performanceWorkbenchApi.taskAnalysisComparison(projectId, nodeId, query, phaseId)
    const normalize = (ratings: typeof report.ratings) => ratings.map(rating => ({ ...rating, color: rating.color ?? undefined }))
    return { ...report, ratings: normalize(report.ratings), xRatings: report.xRatings ? normalize(report.xRatings) : undefined, yRatings: report.yRatings ? normalize(report.yRatings) : undefined }
  }
})
const peopleProvider = computed(() => {
  const { projectId, nodeId, phaseId } = scope.value
  return (selection: ReportPeopleQuery, query: PeoplePageQuery) => performanceWorkbenchApi.taskAnalysisPeople(projectId, nodeId, selection, query, phaseId)
})
let memberRequest = 0
onBeforeUnmount(() => { memberRequest++ })
async function openMember(member: { employee_no: string; project_id?: number; can_view_detail?: boolean }) {
  if (!member.can_view_detail || member.project_id !== props.projectId) return
  const { key, projectId, nodeId, phaseId } = scope.value
  const request = ++memberRequest
  const current = () => request === memberRequest && key === scopeKey.value
  try {
    for (let page = 1; ; page++) {
      const result = await performanceWorkbenchApi.taskPeople(projectId, nodeId, 'all', member.employee_no, phaseId, page, 50)
      if (!current()) return
      const person = result.items.find(person => person.employee_no === member.employee_no)
      if (person?.task_id) {
        emit('open-member', { ...person, project_id: projectId, phase_id: phaseId, task_id: person.task_id })
        return
      }
      if (!result.items.length || page * 50 >= result.total) break
    }
    ElMessage.warning('当前成员暂无可查看的评估任务')
  } catch {
    if (current()) ElMessage.error('评估任务加载失败，请重试')
  }
}
</script>
