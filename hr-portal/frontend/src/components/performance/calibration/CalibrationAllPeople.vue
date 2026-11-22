<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import type { PerformanceMemberColumnSchema, PerformanceReviewMemberContext, PerformanceReviewNode } from '@/api/performance'
import { calibrationReviewNode, performanceCalibrationApi, type CalibrationMember, type CalibrationPeopleQuery, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
import { sortPerformanceRows } from '../performanceTableSort'
import ProjectMemberListPanel from '../ProjectMemberListPanel.vue'
import CalibrationScopeAnalysis from './CalibrationScopeAnalysis.vue'
import { loadCalibrationScopeAnalysis } from './calibrationScopeAnalysis'

const props = withDefaults(defineProps<{ tasks: PerformanceCalibrationTaskScope[]; cycleId: number; tab?: 'members' | 'matrix' | 'report' }>(), { tab: 'members' })
const emit = defineEmits<{ 'open-member': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext }] }>()
let generation = 0
onBeforeUnmount(() => { generation++ })
const taskKey = computed(() => JSON.stringify([props.cycleId, employeeSwitchEpoch.value, props.tasks.map(task => [task.project_id, task.scope_key, task.node_id, task.phase_id])]))
watch([taskKey, () => props.tab], () => { generation++ }, { flush: 'sync' })
const identity = (member: CalibrationMember) => JSON.stringify([member.project_id, member.employee_no])
const provider = computed(() => {
  const tasks = [...props.tasks]
  return async (query: CalibrationPeopleQuery) => {
    const request = ++generation
    const members = new Map<string, CalibrationMember>()
    const schemas: Partial<PerformanceMemberColumnSchema>[] = []
    for (const scope of tasks) {
      try {
        await loadCalibrationScopeAnalysis(async (page, pageSize) => {
          const result = await performanceCalibrationApi.members(scope, { keyword: query.keyword, page, pageSize })
          if (request !== generation) throw new Error('CALIBRATION_SCOPE_CHANGED')
          for (const member of result.items) {
            const key = identity(member)
            const row = { ...member, root_review_id: member.root_review_id || member.task_id || member.id }
            const existing = members.get(key)
            if (!existing || existing.status === 'completed' && member.status !== 'completed') members.set(key, row)
          }
          schemas.push(result)
          return { ...result, items: result.items.map(member => ({ ...member, task_id: member.task_id ?? member.id })) }
        })
      } catch (cause) {
        if (cause instanceof Error && ['INVALID_SCOPE_PAGE', 'SCOPE_CHANGED_DURING_PAGINATION', 'INCOMPLETE_SCOPE_PAGE'].includes(cause.message)) throw new Error('CALIBRATION_PEOPLE_INCOMPLETE')
        throw cause
      }
    }
    const columns = new Map(schemas.flatMap(schema => schema.columns || []).map(column => [column.key, column]))
    const allowed = new Set(['name', ...schemas.flatMap(schema => schema.allowed_column_keys || [])])
    const ratings = new Map(schemas.flatMap(schema => ('rating_columns' in schema ? schema.rating_columns as Array<{ key: string; label: string }> : []) || []).map(column => [column.key, column]))
    const rows = sortPerformanceRows([...members.values()], query.sortBy || 'name', query.sortOrder || 'asc', (member, sort) => {
      if (sort === 'name') return member.display_name
      if (sort === 'completion') {
        const [completed, count] = (member.completion || '0/0').split('/').map(Number)
        return count ? completed / count : 0
      }
      return member.column_values?.[sort] ?? member.ratings?.[sort]?.label ?? member[sort as keyof CalibrationMember]
    })
    return {
      columns: [...columns.values()],
      allowed_column_keys: [...allowed],
      locked_column_keys: ['name'],
      default_column_keys: [...new Set(schemas.flatMap(schema => schema.default_column_keys || []))],
      sort_keys: [...allowed],
      rating_columns: [...ratings.values()],
      items: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
      total: rows.length,
    }
  }
})
function openMember(member: CalibrationMember) {
  const scope = props.tasks.find(task => task.project_id === member.project_id && task.scope_key === member.scope_key && task.node_id === member.node_id && task.phase_id === member.phase_id)
  if (scope && member.can_view_detail !== false) emit('open-member', { node: calibrationReviewNode(scope), member })
}
</script>

<template>
  <section class="calibration-all-people" aria-label="全部被校准人">
    <ProjectMemberListPanel v-if="tab === 'members'" :key="taskKey" :project-id="0" :cycle-id="cycleId" readonly :show-export="false" :provider="provider" @select-member="openMember($event as CalibrationMember)" />
    <CalibrationScopeAnalysis v-else :scopes="tasks" :cycle-id="cycleId" :tab="tab" @open-member="emit('open-member', $event)" />
  </section>
</template>

<style scoped>
.calibration-all-people { min-width: 0; }
</style>
